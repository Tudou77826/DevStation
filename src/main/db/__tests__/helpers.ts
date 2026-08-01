import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Database } from '../database'
import { initializeDatabase } from '../schema'

let counter = 0

/** A unique temp file path for a throwaway DB. */
export function tmpDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), `devstation-test-${Date.now()}-${counter++}-`))
  return join(dir, 'test.db')
}

/** Run a callback with a freshly-initialized in-memory DB. */
export function withDb(fn: (db: Database) => void): void {
  const db = new Database(':memory:')
  initializeDatabase(db)
  try {
    fn(db)
  } finally {
    db.close()
  }
}

/** Run a callback with a file-backed DB (for persistence tests); cleans up. */
export function withFileDb(fn: (path: string, db: Database) => void): void {
  const path = tmpDbPath()
  const db = new Database(path)
  initializeDatabase(db)
  try {
    fn(path, db)
  } finally {
    db.close()
    rmSync(path, { force: true })
    rmSync(path + '-wal', { force: true })
    rmSync(path + '-shm', { force: true })
  }
}

/** Create a project row directly for FK tests. */
export function seedProject(db: Database, id = 'proj-1', pathKey = '/repo'): void {
  const now = Date.now()
  db.prepare(
    `INSERT INTO projects (id, name, path, path_key, repo_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, '', ?, ?)`
  ).run(id, 'Repo', pathKey, pathKey, now, now)
}
