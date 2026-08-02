import { describe, it, expect } from 'vitest'
import { Database } from '../database'
import { SCHEMA_VERSION, initializeDatabase, migrate } from '../schema'
import { tmpDbPath, withDb } from './helpers'

describe('schema + migrations', () => {
  it('creates all tables on a fresh database', () => {
    withDb((db) => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as { name: string }[]
      const names = tables.map((t) => t.name)
      expect(names).toContain('projects')
      expect(names).toContain('tasks')
      expect(names).toContain('sessions')
    })
  })

  it('sets user_version to SCHEMA_VERSION after init', () => {
    withDb((db) => {
      expect(db.pragmaValue('user_version')).toBe(SCHEMA_VERSION)
    })
  })

  it('migrates legacy sessions to the open Coding Agent binding schema', () => {
    const db = new Database(':memory:')
    createLegacyV1Schema(db)
    migrate(db)
    expect(db.pragmaValue('user_version')).toBe(SCHEMA_VERSION)
    const columns = db.prepare('PRAGMA table_info(sessions)').all() as {
      name: string
    }[]
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        'agent_id',
        'agent_session_ref',
        'agent_run_id',
        'agent_status_source',
        'agent_status_updated_at'
      ])
    )
    expect(() =>
      db
        .prepare(
          `INSERT INTO tasks
           (id, title, description, status, branch, sort_order, pinned, created_at, updated_at)
           VALUES ('legacy-bad-pin', 'Bad', '', 'todo', '', 0, 2, 1, 1)`
        )
        .run()
    ).toThrow()
    db.close()
  })

  it('preserves a v3 OpenCode binding as a structured reference', () => {
    const db = new Database(':memory:')
    createLegacyV1Schema(db)
    db.exec(`
      ALTER TABLE sessions ADD COLUMN agent_type TEXT NOT NULL DEFAULT 'opencode'
        CHECK(agent_type IN ('opencode'));
      ALTER TABLE sessions ADD COLUMN agent_session_id TEXT;
      INSERT INTO tasks
        (id, title, description, status, branch, sort_order, pinned, created_at, updated_at)
      VALUES ('task-1', 'Legacy', '', 'todo', '', 0, 0, 1, 1);
      INSERT INTO sessions
        (id, task_id, title, status, agent_type, agent_session_id, created_at, updated_at)
      VALUES ('session-1', 'task-1', 'Legacy', 'running', 'opencode', 'ses_legacy', 1, 1);
      PRAGMA user_version = 3;
    `)

    migrate(db)
    const row = db
      .prepare(
        `SELECT status, agent_id, agent_session_ref, agent_run_id,
                agent_status_source
         FROM sessions WHERE id = 'session-1'`
      )
      .get() as Record<string, unknown>
    expect(row).toEqual({
      status: 'unknown',
      agent_id: 'opencode',
      agent_session_ref: '{"kind":"session-id","value":"ses_legacy"}',
      agent_run_id: null,
      agent_status_source: 'none'
    })
    db.close()
  })

  it('rolls back the initial schema when any DDL statement fails', () => {
    const db = new Database(':memory:')
    // Force CREATE INDEX idx_tasks_status to fail after the tables were created.
    db.exec('CREATE TABLE idx_tasks_status (id INTEGER)')
    expect(() => migrate(db)).toThrow()
    expect(db.pragmaValue('user_version')).toBe(0)
    const projectTable = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'projects'")
      .get()
    expect(projectTable).toBeUndefined()
    db.close()
  })

  it('is idempotent (re-running init does not error or change version)', () => {
    withDb((db) => {
      initializeDatabase(db) // second time
      expect(db.pragmaValue('user_version')).toBe(SCHEMA_VERSION)
    })
  })

  it('rejects a downgrade when on-disk version is newer than code', () => {
    const path = tmpDbPath()
    {
      const db = new Database(path)
      initializeDatabase(db)
      db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 5}`) // pretend newer
      db.close()
    }
    {
      const db = new Database(path)
      expect(() => migrate(db)).toThrow(/newer than this build|refusing to downgrade/i)
      db.close()
    }
  })

  it('persists schema across reopen (file DB survives close)', () => {
    const path = tmpDbPath()
    {
      const db = new Database(path)
      initializeDatabase(db)
      db.close()
    }
    {
      const db = new Database(path)
      migrate(db) // reopening a fresh handle re-runs migrate; should be a no-op
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[]
      expect(tables.length).toBeGreaterThanOrEqual(3)
      db.close()
    }
  })
})

function createLegacyV1Schema(db: Database): void {
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      path_key TEXT NOT NULL UNIQUE,
      repo_url TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'todo',
      project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
      branch TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      pinned INTEGER NOT NULL DEFAULT 0,
      last_opened_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      project_id TEXT REFERENCES projects(id) ON DELETE RESTRICT,
      title TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'idle',
      last_opened_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    PRAGMA user_version = 1;
  `)
}
