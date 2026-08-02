import { describe, expect, it } from 'vitest'
import { resolvePowerShellLaunch } from './launch-spec'

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
