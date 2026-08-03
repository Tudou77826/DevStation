import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ProjectRepo, SessionRepo } from '../db/repositories'
import { RpcError } from '../rpc/errors'
import {
  GitWorkspaceService,
  parseStatus,
  parseUnifiedDiff,
  type WorkspaceDirectoryReader,
  validateRelativePath
} from './workspace'

let root: string

function git(...args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
}

function write(path: string, content: string | Buffer): void {
  writeFileSync(join(root, path), content)
}

function service(readDirectory?: WorkspaceDirectoryReader): GitWorkspaceService {
  return new GitWorkspaceService(
    { get: () => ({ id: 'session', projectId: 'project' }) } as unknown as SessionRepo,
    { get: () => ({ id: 'project', path: root }) } as unknown as ProjectRepo,
    readDirectory
  )
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'devstation-git-'))
  execFileSync('git', ['init', root])
  git('config', 'user.email', 'devstation@example.test')
  git('config', 'user.name', 'DevStation Test')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('GitWorkspaceService', () => {
  it('reads mixed staged, worktree, untracked and renamed states with special paths', async () => {
    write('both.txt', 'base\n')
    write('old name.txt', 'rename me\n')
    write('binary.bin', Buffer.from([0, 1, 2]))
    git('add', '.')
    git('commit', '-m', 'base')

    write('both.txt', 'staged\n')
    git('add', 'both.txt')
    write('both.txt', 'worktree\n')
    git('mv', 'old name.txt', '中文 name.txt')
    write('未跟踪 file.ts', 'export const value = 1\n')

    const snapshot = await service().status('session')
    expect(snapshot.branch).not.toBeNull()
    expect(snapshot.head).toMatch(/^[0-9a-f]{40}$/)
    expect(snapshot.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'both.txt',
          stagedStatus: 'modified',
          worktreeStatus: 'modified'
        }),
        expect.objectContaining({
          path: '中文 name.txt',
          previousPath: 'old name.txt',
          stagedStatus: 'renamed'
        }),
        expect.objectContaining({ path: '未跟踪 file.ts', worktreeStatus: 'untracked' })
      ])
    )

    const staged = await service().diff('session', 'both.txt', 'staged')
    const worktree = await service().diff('session', 'both.txt', 'worktree')
    expect(
      staged.hunks.flatMap((hunk) => hunk.lines).some((line) => line.text === 'staged')
    ).toBe(true)
    expect(
      worktree.hunks
        .flatMap((hunk) => hunk.lines)
        .some((line) => line.text === 'worktree')
    ).toBe(true)

    const untracked = await service().diff('session', '未跟踪 file.ts', 'worktree')
    expect(untracked.kind).toBe('text')
    expect(untracked.hunks[0].lines[0]).toMatchObject({ kind: 'addition', newLine: 1 })
  })

  it('reports detached HEAD and unmerged conflicts without guessing a branch', async () => {
    write('conflict.txt', 'base\n')
    git('add', '.')
    git('commit', '-m', 'base')
    const baseBranch = git('branch', '--show-current')
    git('checkout', '-b', 'other')
    write('conflict.txt', 'other\n')
    git('commit', '-am', 'other')
    git('checkout', baseBranch)
    write('conflict.txt', 'main\n')
    git('commit', '-am', 'main')
    expect(() => git('merge', 'other')).toThrow()

    const conflict = await service().status('session')
    expect(conflict.changes).toContainEqual(
      expect.objectContaining({
        path: 'conflict.txt',
        conflicted: true,
        worktreeStatus: 'unmerged'
      })
    )
    git('merge', '--abort')
    git('checkout', '--detach', 'HEAD')
    const detached = await service().status('session')
    expect(detached).toMatchObject({ branch: null, detached: true })
  })

  it('lists the real filesystem regardless of Git ignore rules and applies bounded previews', async () => {
    write('.gitignore', 'ignored.txt\nignored-dir/\n')
    write('text.txt', 'hello\n')
    write('binary.bin', Buffer.from([1, 0, 2]))
    write('ignored.txt', 'ignore')
    mkdirSync(join(root, 'ignored-dir'))
    write('ignored-dir/inside.txt', 'visible')
    write('large.txt', Buffer.alloc(512 * 1024 + 1, 65))
    git('add', '.gitignore', 'text.txt', 'binary.bin')
    git('commit', '-m', 'files')

    const result = await service().files('session', '')
    expect(result.entries).toEqual(
      expect.arrayContaining([
        { path: '.git', kind: 'directory' },
        { path: 'ignored-dir', kind: 'directory' },
        { path: '.gitignore', kind: 'file' },
        { path: 'ignored.txt', kind: 'file' },
        { path: 'text.txt', kind: 'file' },
        { path: 'binary.bin', kind: 'file' },
        { path: 'large.txt', kind: 'file' }
      ])
    )
    await expect(service().files('session', 'ignored-dir')).resolves.toEqual({
      directory: 'ignored-dir',
      entries: [{ path: 'ignored-dir/inside.txt', kind: 'file' }]
    })
    await expect(service().preview('session', 'text.txt')).resolves.toMatchObject({
      kind: 'text',
      content: 'hello\n'
    })
    await expect(service().preview('session', 'binary.bin')).resolves.toMatchObject({
      kind: 'binary',
      content: ''
    })
    await expect(service().preview('session', 'large.txt')).resolves.toMatchObject({
      kind: 'too-large',
      content: ''
    })
  })

  it('returns every repository file after the former 2000-item boundary', async () => {
    const readDirectory: WorkspaceDirectoryReader = async () =>
      Array.from({ length: 2_001 }, (_, index) => ({
        name: `bulk-${index.toString().padStart(4, '0')}.txt`,
        isDirectory: () => false,
        isSymbolicLink: () => false
      }))

    const result = await service(readDirectory).files('session', '')
    const files = result.entries.filter((entry) => entry.kind === 'file')
    expect(files).toHaveLength(2_001)
    expect(files.at(-1)).toEqual({ path: 'bulk-2000.txt', kind: 'file' })
  })

  it('rejects traversal and sessions without a valid saved project', async () => {
    expect(() => validateRelativePath('../secret.txt')).toThrowError(RpcError)
    expect(() => validateRelativePath('C:\\secret.txt')).toThrowError(RpcError)
    const missingSession = new GitWorkspaceService(
      { get: () => null } as unknown as SessionRepo,
      {} as ProjectRepo
    )
    await expect(missingSession.status('missing')).rejects.toMatchObject({
      code: 'NOT_FOUND'
    })
    const noProject = new GitWorkspaceService(
      { get: () => ({ projectId: null }) } as unknown as SessionRepo,
      {} as ProjectRepo
    )
    await expect(noProject.status('session')).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('returns explicit binary and oversized diff states', async () => {
    write('binary.bin', Buffer.from([0, 1, 2]))
    git('add', '.')
    git('commit', '-m', 'binary')
    write('binary.bin', Buffer.from([0, 3, 4]))
    write('huge.txt', Buffer.alloc(2 * 1024 * 1024 + 1, 65))
    await expect(
      service().diff('session', 'binary.bin', 'worktree')
    ).resolves.toMatchObject({ kind: 'binary' })
    await expect(
      service().diff('session', 'huge.txt', 'worktree')
    ).resolves.toMatchObject({ kind: 'too-large' })
  })
})

describe('Git parsers', () => {
  it('parses machine status records without losing spaces', () => {
    const output = [
      '# branch.oid abc',
      '# branch.head main',
      '2 R. N... 100644 100644 100644 aaaaaaa bbbbbbb R100 new name.ts',
      'old name.ts',
      ''
    ].join('\0')
    expect(parseStatus(output, 123)).toMatchObject({
      branch: 'main',
      head: 'abc',
      changes: [
        { path: 'new name.ts', previousPath: 'old name.ts', stagedStatus: 'renamed' }
      ],
      refreshedAt: 123
    })
  })

  it('parses unified hunks into stable old/new line anchors', () => {
    const parsed = parseUnifiedDiff(
      'a.ts',
      'worktree',
      '--- a/a.ts\n+++ b/a.ts\n@@ -2,2 +2,2 @@\n-old\n+new\n same\n\\ No newline at end of file\n'
    )
    expect(parsed.hunks[0].lines).toEqual([
      { kind: 'deletion', oldLine: 2, newLine: null, text: 'old' },
      { kind: 'addition', oldLine: null, newLine: 2, text: 'new' },
      { kind: 'context', oldLine: 3, newLine: 3, text: 'same' },
      { kind: 'meta', oldLine: null, newLine: null, text: '\\ No newline at end of file' }
    ])
  })
})
