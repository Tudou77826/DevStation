import type { TerminalLaunchKind } from '../../shared/types'

export interface TerminalLaunchSpec {
  file: string
  args: string[]
}

export function resolveTerminalLaunch(
  kind: TerminalLaunchKind,
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): TerminalLaunchSpec {
  if (platform === 'win32') {
    const shell = env['COMSPEC']?.trim() || 'powershell.exe'
    if (kind === 'codex') {
      if (shell.toLowerCase().endsWith('cmd.exe')) {
        return { file: shell, args: ['/d', '/k', 'codex'] }
      }
      return { file: shell, args: ['-NoLogo', '-NoExit', '-Command', 'codex'] }
    }
    return shell.toLowerCase().endsWith('cmd.exe')
      ? { file: shell, args: ['/d'] }
      : { file: shell, args: ['-NoLogo'] }
  }

  const shell = env['SHELL']?.trim() || '/bin/bash'
  return kind === 'codex'
    ? { file: shell, args: ['-l', '-i', '-c', 'codex; exec "$SHELL" -l'] }
    : { file: shell, args: ['-l'] }
}
