import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { AgentAvailability, AgentLaunchSpec } from '@shared/agent'
import { encodePowerShellInvocation } from './agent-launch'

const execFileAsync = promisify(execFile)

export type CliProbeRunner = (
  file: string,
  args: readonly string[]
) => Promise<{ stdout: string; stderr: string }>

export interface CliProbeOptions {
  platform?: NodeJS.Platform
  env?: NodeJS.ProcessEnv
  runner?: CliProbeRunner
}

export async function probeCli(
  spec: AgentLaunchSpec,
  options: CliProbeOptions = {}
): Promise<AgentAvailability> {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const runner = options.runner ?? defaultRunner(env)
  const command =
    platform === 'win32'
      ? {
          file: env['DEVSTATION_POWERSHELL']?.trim() || 'powershell.exe',
          args: [
            '-NoLogo',
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            encodePowerShellInvocation(spec)
          ]
        }
      : { file: spec.executable, args: [...spec.args] }

  try {
    const result = await runner(command.file, command.args)
    const version = firstLine(result.stdout) ?? firstLine(result.stderr)
    return {
      status: 'available',
      executable: spec.executable,
      version,
      message: null
    }
  } catch (error) {
    const unavailable = isMissingExecutable(error)
    return {
      status: unavailable ? 'unavailable' : 'error',
      executable: spec.executable,
      version: null,
      message: unavailable ? 'CLI not found' : 'CLI probe failed'
    }
  }
}

function defaultRunner(env: NodeJS.ProcessEnv): CliProbeRunner {
  return async (file, args) => {
    const result = await execFileAsync(file, [...args], {
      encoding: 'utf8',
      env,
      timeout: 5_000,
      windowsHide: true,
      maxBuffer: 256 * 1024
    })
    return { stdout: result.stdout, stderr: result.stderr }
  }
}

function firstLine(value: string): string | null {
  const line = value
    .split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .find(Boolean)
  return line?.slice(0, 512) ?? null
}

function isMissingExecutable(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false
  const record = error as { code?: unknown; message?: unknown }
  return (
    record.code === 'ENOENT' ||
    (typeof record.message === 'string' &&
      /not recognized|command not found|not found/i.test(record.message))
  )
}
