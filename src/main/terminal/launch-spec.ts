export interface TerminalLaunchSpec {
  file: string
  args: string[]
}

export function resolvePowerShellLaunch(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): TerminalLaunchSpec {
  if (platform === 'win32') {
    return {
      file: env['DEVSTATION_POWERSHELL']?.trim() || 'powershell.exe',
      args: ['-NoLogo']
    }
  }

  const shell = env['SHELL']?.trim() || '/bin/bash'
  return { file: shell, args: ['-l'] }
}
