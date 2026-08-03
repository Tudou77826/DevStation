import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OpenCodeSessionLocator } from './opencode-session-locator'

const tempDirectories: string[] = []

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function openCodeDb(): string {
  const directory = mkdtempSync(join(tmpdir(), 'devstation-opencode-'))
  tempDirectories.push(directory)
  const path = join(directory, 'opencode.db')
  const db = new DatabaseSync(path)
  db.exec(`
    CREATE TABLE session (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      directory TEXT NOT NULL,
      time_created INTEGER NOT NULL
    )
  `)
  db.close()
  return path
}

function insert(
  path: string,
  row: { id: string; parentId?: string; directory: string; createdAt: number }
): void {
  const db = new DatabaseSync(path)
  db.prepare(
    'INSERT INTO session (id, parent_id, directory, time_created) VALUES (?, ?, ?, ?)'
  ).run(row.id, row.parentId ?? null, row.directory, row.createdAt)
  db.close()
}

describe('OpenCodeSessionLocator', () => {
  it('binds only a new top-level session created for the selected project', () => {
    const path = openCodeDb()
    insert(path, { id: 'ses_before', directory: process.cwd(), createdAt: 1_000 })
    const locator = new OpenCodeSessionLocator({ databasePath: path })
    const before = locator.snapshot(process.cwd())
    insert(path, {
      id: 'ses_other',
      directory: join(process.cwd(), 'other'),
      createdAt: 2_000
    })
    insert(path, {
      id: 'ses_child',
      parentId: 'ses_created',
      directory: process.cwd(),
      createdAt: 3_000
    })
    insert(path, { id: 'ses_created', directory: process.cwd(), createdAt: 4_000 })

    expect(locator.findCreatedSession(process.cwd(), 2_500, before)).toBe('ses_created')
  }, 15_000)

  it('returns null when OpenCode has not persisted a matching new session', () => {
    const path = openCodeDb()
    insert(path, { id: 'ses_existing', directory: process.cwd(), createdAt: 5_000 })
    const locator = new OpenCodeSessionLocator({ databasePath: path })
    expect(
      locator.findCreatedSession(process.cwd(), 5_000, new Set(['ses_existing']))
    ).toBeNull()
  })

  it('resolves and caches the OpenCode database path behind the adapter', () => {
    const path = openCodeDb()
    const resolveDatabasePath = vi.fn(() => path)
    const locator = new OpenCodeSessionLocator({ resolveDatabasePath })
    expect(locator.snapshot(process.cwd())).toEqual(new Set())
    expect(locator.snapshot(process.cwd())).toEqual(new Set())
    expect(resolveDatabasePath).toHaveBeenCalledOnce()
  })
})
