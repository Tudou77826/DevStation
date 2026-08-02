import { describe, expect, it } from 'vitest'
import { openCodeStartupCommand, resolvePowerShellLaunch } from './launch-spec'

describe('resolvePowerShellLaunch', () => {
  it('uses PowerShell on Windows without accepting renderer commands', () => {
    expect(resolvePowerShellLaunch('win32', {})).toEqual({
      file: 'powershell.exe',
      args: ['-NoLogo']
    })
  })

  it('allows a controlled deployment override for PowerShell', () => {
    expect(
      resolvePowerShellLaunch('win32', { DEVSTATION_POWERSHELL: 'pwsh.exe' })
    ).toEqual({
      file: 'pwsh.exe',
      args: ['-NoLogo']
    })
  })

  it('uses a login shell outside Windows', () => {
    expect(resolvePowerShellLaunch('linux', { SHELL: '/bin/zsh' })).toEqual({
      file: '/bin/zsh',
      args: ['-l']
    })
  })
})

describe('openCodeStartupCommand', () => {
  it('starts a new OpenCode session when no native id is known', () => {
    expect(openCodeStartupCommand(null)).toBe('opencode')
  })

  it('uses OpenCode native resume for a known session', () => {
    expect(openCodeStartupCommand('ses_abc-123')).toBe('opencode --session ses_abc-123')
  })

  it('rejects unsafe vendor session ids instead of composing a shell command', () => {
    expect(() => openCodeStartupCommand('ses_ok; Remove-Item *')).toThrow(
      'Invalid OpenCode session id'
    )
  })
})
