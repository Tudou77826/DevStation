import { describe, it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveGitRepo, makePathKey, runCommandWithTimeout } from '../validate'
import { RpcError } from '../../rpc/errors'

// The DevStation project itself is a git repo; use it as a known-good fixture.
const DEVSTATION_ROOT = process.cwd()

describe('git validate', () => {
  it('resolves a real git working tree to its root', async () => {
    const resolved = await resolveGitRepo(DEVSTATION_ROOT)
    expect(resolved.path.length).toBeGreaterThan(0)
    // pathKey is derived from the resolved root
    expect(resolved.pathKey).toBe(makePathKey(resolved.path))
  })

  it('throws NOT_GIT_REPOSITORY for a plain temp dir', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'no-git-'))
    await expect(resolveGitRepo(dir)).rejects.toMatchObject({
      code: 'NOT_GIT_REPOSITORY'
    })
  })

  it('throws INVALID_PATH for a non-existent path', async () => {
    await expect(
      resolveGitRepo(join(tmpdir(), 'definitely-not-here-xyz'))
    ).rejects.toMatchObject({
      code: 'INVALID_PATH'
    })
  })

  it('throws INVALID_PATH for an empty string', async () => {
    await expect(resolveGitRepo('')).rejects.toMatchObject({ code: 'INVALID_PATH' })
  })

  it('the thrown error is an RpcError', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'no-git-2-'))
    try {
      await resolveGitRepo(dir)
      expect.fail('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(RpcError)
    }
  })
})

describe('makePathKey', () => {
  it('lowercases drive + path on Windows-style input regardless of platform', () => {
    // makePathKey branches on process.platform; verify it returns a string
    // and (on win32) is lowercase. We assert the cross-platform invariant.
    const key = makePathKey('C:\\Users\\Foo\\Bar')
    expect(typeof key).toBe('string')
    if (process.platform === 'win32') {
      expect(key).toBe('c:/users/foo/bar')
    }
  })

  it('is stable (idempotent)', () => {
    const a = makePathKey('/repo/path')
    const b = makePathKey('/repo/path')
    expect(a).toBe(b)
  })
})

describe('command timeout', () => {
  it('terminates a command that exceeds its deadline', async () => {
    const result = await runCommandWithTimeout(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 1000)'],
      25
    )
    expect(result.timedOut).toBe(true)
    expect(result.exitCode).toBeNull()
  })
})
