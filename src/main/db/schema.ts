// Schema definition + migration runner.
//
// Versioning uses SQLite's PRAGMA user_version. Each release bumps
// SCHEMA_VERSION; migrate() runs only the steps newer than the stored version,
// all inside one BEGIN IMMEDIATE transaction so it is atomic (all-or-nothing).
// Downgrades (stored version > code version) are rejected, not silently applied.
import type { Database } from './database'

/** Current schema version. Bump when adding migrations. */
export const SCHEMA_VERSION = 3

const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  path        TEXT NOT NULL,
  path_key    TEXT NOT NULL UNIQUE,
  repo_url    TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id             TEXT PRIMARY KEY,
  title          TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'todo'
                 CHECK(status IN ('todo','in-progress','done')),
  project_id     TEXT REFERENCES projects(id) ON DELETE RESTRICT,
  branch         TEXT NOT NULL DEFAULT '',
  sort_order     INTEGER NOT NULL DEFAULT 0,
  pinned         INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0, 1)),
  last_opened_at INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status  ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);

CREATE TABLE IF NOT EXISTS sessions (
  id             TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id     TEXT REFERENCES projects(id) ON DELETE RESTRICT,
  title          TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'idle'
                 CHECK(status IN ('idle','running','waiting','done','failed')),
  agent_type     TEXT NOT NULL DEFAULT 'opencode'
                 CHECK(agent_type IN ('opencode')),
  agent_session_id TEXT,
  last_opened_at INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_task    ON sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
`

const PINNED_GUARD_SQL = `
CREATE TRIGGER IF NOT EXISTS tasks_pinned_insert_guard
BEFORE INSERT ON tasks
WHEN NEW.pinned NOT IN (0, 1)
BEGIN
  SELECT RAISE(ABORT, 'tasks.pinned must be 0 or 1');
END;

CREATE TRIGGER IF NOT EXISTS tasks_pinned_update_guard
BEFORE UPDATE OF pinned ON tasks
WHEN NEW.pinned NOT IN (0, 1)
BEGIN
  SELECT RAISE(ABORT, 'tasks.pinned must be 0 or 1');
END;
`

const SESSION_AGENT_SQL = `
ALTER TABLE sessions ADD COLUMN agent_type TEXT NOT NULL DEFAULT 'opencode'
  CHECK(agent_type IN ('opencode'));
ALTER TABLE sessions ADD COLUMN agent_session_id TEXT;
`

/** Create the initial tables/indexes. Called only from the migration transaction. */
export function createTables(db: Database): void {
  db.exec(CREATE_SQL)
}

/**
 * Run pending migrations. Atomic; bumps user_version only on success.
 * @throws if the on-disk DB is newer than the code (refuses downgrade).
 */
export function migrate(db: Database): void {
  const storedVersion = db.pragmaValue('user_version') as number

  if (storedVersion > SCHEMA_VERSION) {
    throw new Error(
      `database schema version ${storedVersion} is newer than this build ` +
        `(${SCHEMA_VERSION}); refusing to downgrade. ` +
        `Please update DevStation.`
    )
  }
  if (storedVersion >= SCHEMA_VERSION) return

  db.transaction(() => {
    if (storedVersion < 1) createTables(db)
    // v2 also protects databases created by the pre-release v1 schema, which
    // did not yet have the pinned CHECK constraint.
    if (storedVersion < 2) db.exec(PINNED_GUARD_SQL)
    if (storedVersion < 3 && storedVersion >= 1) db.exec(SESSION_AGENT_SQL)
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  })
}

/** Initialize a Database through the atomic migration path. */
export function initializeDatabase(db: Database): void {
  migrate(db)
}
