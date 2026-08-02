import { execFileSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'

interface OpenCodeSessionRow {
  id: string
  directory: string
  time_created: number
}

export interface OpenCodeSessionLocatorOptions {
  databasePath?: string
  resolveDatabasePath?: () => string
}

/** Read-only boundary around OpenCode's local session index. */
export class OpenCodeSessionLocator {
  private databasePath: string | null

  constructor(private readonly options: OpenCodeSessionLocatorOptions = {}) {
    this.databasePath = options.databasePath ?? null
  }

  snapshot(directory: string): Set<string> {
    return new Set(this.candidates(directory, 0).map((session) => session.id))
  }

  findCreatedSession(
    directory: string,
    createdAfter: number,
    excludedIds: ReadonlySet<string>
  ): string | null {
    const candidate = this.candidates(directory, Math.max(0, createdAfter - 2_000)).find(
      (session) => !excludedIds.has(session.id)
    )
    return candidate?.id ?? null
  }

  private candidates(directory: string, createdAfter: number): OpenCodeSessionRow[] {
    const db = new DatabaseSync(this.resolvePath(), { readOnly: true })
    try {
      const rows = db
        .prepare(
          `SELECT id, directory, time_created
           FROM session
           WHERE parent_id IS NULL AND time_created >= ?
           ORDER BY time_created DESC`
        )
        .all(createdAfter) as unknown as OpenCodeSessionRow[]
      const expected = normalizePath(directory)
      return rows.filter((row) => normalizePath(row.directory) === expected)
    } finally {
      db.close()
    }
  }

  private resolvePath(): string {
    if (this.databasePath !== null) return this.databasePath
    const resolve =
      this.options.resolveDatabasePath ??
      (() => {
        const file =
          process.platform === 'win32'
            ? (process.env['DEVSTATION_POWERSHELL'] ?? 'powershell.exe')
            : 'opencode'
        const args =
          process.platform === 'win32'
            ? [
                '-NoLogo',
                '-NoProfile',
                '-NonInteractive',
                '-Command',
                '& opencode db path'
              ]
            : ['db', 'path']
        return execFileSync(file, args, {
          encoding: 'utf8',
          windowsHide: true,
          timeout: 5_000
        }).trim()
      })
    const path = resolve()
    if (!path) throw new Error('OpenCode database path is unavailable')
    this.databasePath = path
    return path
  }
}

function normalizePath(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/\/$/, '')
  return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized
}
