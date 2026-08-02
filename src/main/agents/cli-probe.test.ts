import { describe, expect, it, vi } from 'vitest'
import { probeCli } from './cli-probe'

const SPEC = { executable: 'opencode', args: ['--version'], env: {} }

describe('probeCli', () => {
  it('uses the safe PowerShell encoder on Windows and returns a bounded version', async () => {
    const runner = vi.fn(async () => ({ stdout: `opencode 1.2.3\nignored`, stderr: '' }))
    await expect(probeCli(SPEC, { platform: 'win32', env: {}, runner })).resolves.toEqual(
      {
        status: 'available',
        executable: 'opencode',
        version: 'opencode 1.2.3',
        message: null
      }
    )
    expect(runner).toHaveBeenCalledWith('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      "& 'opencode' '--version'"
    ])
  })

  it('executes argv directly outside Windows', async () => {
    const runner = vi.fn(async () => ({ stdout: '', stderr: '1.0.0' }))
    await probeCli(SPEC, { platform: 'linux', runner })
    expect(runner).toHaveBeenCalledWith('opencode', ['--version'])
  })

  it('distinguishes a missing CLI from a probe failure without leaking errors', async () => {
    const missing = vi.fn(async () => {
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    })
    await expect(probeCli(SPEC, { platform: 'linux', runner: missing })).resolves.toEqual(
      expect.objectContaining({ status: 'unavailable', message: 'CLI not found' })
    )

    const failed = vi.fn(async () => {
      throw new Error('secret path and token')
    })
    await expect(probeCli(SPEC, { platform: 'linux', runner: failed })).resolves.toEqual(
      expect.objectContaining({ status: 'error', message: 'CLI probe failed' })
    )
  })
})
