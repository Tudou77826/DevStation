// Git repository validation for the "add local project" flow.
//
// We do NOT rely on a `.git` directory existing (bare repos, worktrees, and
// submodules differ). Instead we run `git -C <path> rev-parse --show-toplevel`
// WITHOUT a shell (spawn directly, no /bin/sh), with a timeout, and treat its
// stdout as the canonical repo root. Paths are normalized via realpath + a
// platform-aware lowercase key for uniqueness.
import { spawn } from 'node:child_process'
import { realpath, stat } from 'node:fs/promises'
import { invalidPath, notGitRepo } from '../rpc/errors'

const GIT_TIMEOUT_MS = 5000

export interface ResolvedRepo {
  /** canonical repo root from git rev-parse --show-toplevel */
  path: string
  /** identity key: lowercased on Windows for case-insensitive uniqueness */
  pathKey: string
}

/**
 * Validate that `inputPath` is inside a git working tree and resolve the
 * canonical repo root. Throws RpcError(INVALID_PATH | NOT_GIT_REPOSITORY).
 */
export async function resolveGitRepo(inputPath: string): Promise<ResolvedRepo> {
  if (inputPath.trim() === '') throw invalidPath('路径不能为空')

  // 1. existence + directory check
  let st
  try {
    st = await stat(inputPath)
  } catch {
    throw invalidPath('路径不存在或无法访问')
  }
  if (!st.isDirectory()) throw invalidPath('路径不是目录')

  // 2. normalize via realpath (resolves .., symlinks, case on Windows)
  let normalized: string
  try {
    normalized = await realpath(inputPath)
  } catch {
    normalized = inputPath
  }

  // 3. ask git for the repo root (no shell; spawn git directly)
  const root = await gitRevParseToplevel(normalized)
  if (root === null) throw notGitRepo()

  return { path: root, pathKey: makePathKey(root) }
}

/** Run `git -C <cwd> rev-parse --show-toplevel` without a shell. Returns null on any git failure. */
async function gitRevParseToplevel(cwd: string): Promise<string | null> {
  const result = await runCommandWithTimeout(
    'git',
    ['-C', cwd, 'rev-parse', '--show-toplevel'],
    GIT_TIMEOUT_MS
  )
  return !result.timedOut && result.exitCode === 0 ? result.stdout.trim() : null
}

export interface CommandResult {
  exitCode: number | null
  stdout: string
  timedOut: boolean
}

/** Spawn a command without a shell and enforce a bounded runtime/output size. */
export function runCommandWithTimeout(
  file: string,
  args: string[],
  timeoutMs: number
): Promise<CommandResult> {
  return new Promise((resolve) => {
    let settled = false
    let stdout = ''
    let timer: NodeJS.Timeout | undefined
    const finish = (result: CommandResult): void => {
      if (settled) return
      settled = true
      if (timer !== undefined) clearTimeout(timer)
      resolve(result)
    }

    const child = spawn(file, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true
    })

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString()
      if (stdout.length > 1024 * 1024) child.kill()
    })
    child.on('error', () => finish({ exitCode: null, stdout: '', timedOut: false }))
    child.on('close', (code) => {
      finish({ exitCode: code, stdout, timedOut: false })
    })

    timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // ignore
      }
      finish({ exitCode: null, stdout, timedOut: true })
    }, timeoutMs)
  })
}

/** Uniqueness key: lowercase drive letters + path on Windows (case-insensitive fs). */
export function makePathKey(absPath: string): string {
  if (process.platform === 'win32') {
    return absPath.replace(/\\/g, '/').toLowerCase()
  }
  return absPath
}
