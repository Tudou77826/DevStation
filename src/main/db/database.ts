// Thin adapter over Node's built-in `node:sqlite` (DatabaseSync), mirroring the
// pattern Orca uses but adapted to the native node:sqlite API (which has NO
// `.pragma()` method — PRAGMAs run via exec()). Centralizes connection setup
// and the open/close lifecycle.
//
// DB file lives in Electron's userData dir; tests inject ':memory:' or a tmpfile.
import { DatabaseSync, type StatementSync } from 'node:sqlite'

export type SqlValue = number | string | bigint | Uint8Array | null

/**
 * Synchronous database wrapper. All DevStation DB access is synchronous (main
 * process is single-writer); the renderer never touches SQLite directly.
 */
export class Database {
  private readonly db: DatabaseSync
  private closed = false

  constructor(dbPath: string | ':memory:') {
    this.db = new DatabaseSync(dbPath)
    this.applyPragmas()
  }

  private applyPragmas(): void {
    // Enforce FK constraints (not persistent — must be set per connection).
    // node:sqlite exposes no .pragma(); run them via exec.
    this.db.exec('PRAGMA foreign_keys = ON')
    // WAL: better concurrency + crash durability; safe for single-writer main.
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
    // Wait briefly instead of SQLITE_BUSY if another connection holds the lock.
    this.db.exec('PRAGMA busy_timeout = 5000')
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  prepare(sql: string): StatementSync {
    return this.db.prepare(sql)
  }

  /** Read a PRAGMA value (e.g. user_version). Returns the first column of row 0. */
  pragmaValue(name: string): unknown {
    const row = this.db.prepare(`PRAGMA ${name}`).get() as
      Record<string, unknown> | undefined
    if (row === undefined) return undefined
    // PRAGMA results are a single-column object; return its value.
    const values = Object.values(row)
    return values[0]
  }

  /** Run within a single transaction; rolls back on throw. */
  transaction<T>(fn: () => T): T {
    this.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      this.exec('COMMIT')
      return result
    } catch (err) {
      try {
        this.exec('ROLLBACK')
      } catch {
        // ignore rollback errors during failure path
      }
      throw err
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    try {
      this.db.close()
    } catch {
      // best-effort close during shutdown
    }
  }

  get isClosed(): boolean {
    return this.closed
  }
}
