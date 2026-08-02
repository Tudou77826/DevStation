// Schema definition + migration runner.
//
// Versioning uses SQLite's PRAGMA user_version. Each release bumps
// SCHEMA_VERSION; migrate() runs only the steps newer than the stored version,
// all inside one BEGIN IMMEDIATE transaction so it is atomic (all-or-nothing).
// Downgrades (stored version > code version) are rejected, not silently applied.
import type { Database } from './database'

/** Current schema version. Bump when adding migrations. */
export const SCHEMA_VERSION = 7

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
  status         TEXT NOT NULL DEFAULT 'unknown'
                 CHECK(status IN ('unknown','starting','working','waiting','done','failed')),
  agent_id       TEXT NOT NULL DEFAULT 'opencode',
  agent_session_ref TEXT,
  agent_run_id   TEXT,
  agent_status_source TEXT NOT NULL DEFAULT 'none'
                 CHECK(agent_status_source IN ('none','provider-event')),
  agent_status_updated_at INTEGER,
  agent_status_event_id TEXT,
  last_opened_at INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_task    ON sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);

CREATE TABLE IF NOT EXISTS agent_event_receipts (
  event_id      TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  agent_run_id  TEXT NOT NULL,
  agent_id      TEXT NOT NULL,
  kind          TEXT NOT NULL,
  occurred_at   INTEGER NOT NULL,
  received_at   INTEGER NOT NULL,
  outcome       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_event_receipts_session
  ON agent_event_receipts(session_id, occurred_at);

CREATE TABLE IF NOT EXISTS agent_settings (
  agent_id        TEXT PRIMARY KEY,
  enabled         INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
  integration_enabled INTEGER NOT NULL DEFAULT 1 CHECK(integration_enabled IN (0, 1)),
  executable_path TEXT,
  is_default      INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0, 1)),
  settings_version INTEGER NOT NULL DEFAULT 1 CHECK(settings_version >= 1),
  settings_json   TEXT NOT NULL DEFAULT '{}',
  updated_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_settings_default
  ON agent_settings(is_default) WHERE is_default = 1;
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

const OPEN_AGENT_SCHEMA_SQL = `
DROP INDEX IF EXISTS idx_sessions_task;
DROP INDEX IF EXISTS idx_sessions_project;
ALTER TABLE sessions RENAME TO sessions_v3;

CREATE TABLE sessions (
  id             TEXT PRIMARY KEY,
  task_id        TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id     TEXT REFERENCES projects(id) ON DELETE RESTRICT,
  title          TEXT NOT NULL DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'unknown'
                 CHECK(status IN ('unknown','starting','working','waiting','done','failed')),
  agent_id       TEXT NOT NULL DEFAULT 'opencode',
  agent_session_ref TEXT,
  agent_run_id   TEXT,
  agent_status_source TEXT NOT NULL DEFAULT 'none'
                 CHECK(agent_status_source IN ('none','provider-event')),
  agent_status_updated_at INTEGER,
  last_opened_at INTEGER,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);

INSERT INTO sessions (
  id, task_id, project_id, title, status, agent_id, agent_session_ref,
  agent_run_id, agent_status_source, agent_status_updated_at,
  last_opened_at, created_at, updated_at
)
SELECT
  id, task_id, project_id, title, 'unknown',
  agent_type,
  CASE
    WHEN agent_session_id IS NULL THEN NULL
    ELSE json_object('kind', 'session-id', 'value', agent_session_id)
  END,
  NULL, 'none', NULL,
  last_opened_at, created_at, updated_at
FROM sessions_v3;

DROP TABLE sessions_v3;
CREATE INDEX idx_sessions_task    ON sessions(task_id);
CREATE INDEX idx_sessions_project ON sessions(project_id);
`

const AGENT_EVENT_INBOX_SQL = `
ALTER TABLE sessions ADD COLUMN agent_status_event_id TEXT;

CREATE TABLE agent_event_receipts (
  event_id      TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  agent_run_id  TEXT NOT NULL,
  agent_id      TEXT NOT NULL,
  kind          TEXT NOT NULL,
  occurred_at   INTEGER NOT NULL,
  received_at   INTEGER NOT NULL,
  outcome       TEXT NOT NULL
);
CREATE INDEX idx_agent_event_receipts_session
  ON agent_event_receipts(session_id, occurred_at);
`

const AGENT_SETTINGS_SQL = `
CREATE TABLE agent_settings (
  agent_id        TEXT PRIMARY KEY,
  enabled         INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
  integration_enabled INTEGER NOT NULL DEFAULT 1 CHECK(integration_enabled IN (0, 1)),
  executable_path TEXT,
  is_default      INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0, 1)),
  settings_version INTEGER NOT NULL DEFAULT 1 CHECK(settings_version >= 1),
  settings_json   TEXT NOT NULL DEFAULT '{}',
  updated_at      INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_agent_settings_default
  ON agent_settings(is_default) WHERE is_default = 1;
`

const VERSIONED_AGENT_SETTINGS_SQL = `
ALTER TABLE agent_settings ADD COLUMN settings_version INTEGER NOT NULL DEFAULT 1
  CHECK(settings_version >= 1);
ALTER TABLE agent_settings ADD COLUMN settings_json TEXT NOT NULL DEFAULT '{}';
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
    if (storedVersion < 4 && storedVersion >= 1) db.exec(OPEN_AGENT_SCHEMA_SQL)
    if (storedVersion < 5 && storedVersion >= 1) db.exec(AGENT_EVENT_INBOX_SQL)
    if (storedVersion < 6 && storedVersion >= 1) db.exec(AGENT_SETTINGS_SQL)
    if (storedVersion < 7 && storedVersion >= 6) db.exec(VERSIONED_AGENT_SETTINGS_SQL)
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  })
}

/** Initialize a Database through the atomic migration path. */
export function initializeDatabase(db: Database): void {
  migrate(db)
}
