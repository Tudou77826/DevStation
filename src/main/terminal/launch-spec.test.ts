import { describe, expect, it } from 'vitest'
import { resolveTerminalLaunch } from './launch-spec'

describe('resolveTerminalLaunch', () => {
  it('launches a Windows shell without accepting a renderer-provided command', () => {
    expect(resolveTerminalLaunch('shell', 'win32', { COMSPEC: 'cmd.exe' })).toEqual({
      file: 'cmd.exe',
      args: ['/d']
    })
  })

  it('launches Codex through the known Windows shell adapter', () => {
    expect(resolveTerminalLaunch('codex', 'win32', { COMSPEC: 'cmd.exe' })).toEqual({
      file: 'cmd.exe',
      args: ['/d', '/k', 'codex']
    })
  })

  it('uses a login shell on Unix', () => {
    expect(resolveTerminalLaunch('shell', 'linux', { SHELL: '/bin/zsh' })).toEqual({
      file: '/bin/zsh',
      args: ['-l']
    })
  })
})
