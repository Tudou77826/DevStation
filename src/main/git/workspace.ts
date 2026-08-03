import { spawn } from 'node:child_process'
import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { ProjectRepo, SessionRepo } from '../db/repositories'
import { RpcError, invalidPath, notFound } from '../rpc/errors'
import type {
  GitArea,
  GitChange,
  GitFileDiff,
  GitFilePreview,
  GitFileStatus,
  GitRepositorySnapshot,
  GitWorkspaceFileList
} from '@shared/git'

const GIT_TIMEOUT_MS = 8_000
const STATUS_LIMIT = 2 * 1024 * 1024
const DIFF_LIMIT = 2 * 1024 * 1024
const PREVIEW_LIMIT = 512 * 1024
const CHANGE_LIMIT = 2_000

interface GitResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
  exceeded: boolean
}

export interface WorkspaceDirectoryEntry {
  name: string
  isDirectory(): boolean
  isSymbolicLink(): boolean
}

export type WorkspaceDirectoryReader = (
  path: string
) => Promise<WorkspaceDirectoryEntry[]>

const readWorkspaceDirectory: WorkspaceDirectoryReader = async (path) =>
  readdir(path, { withFileTypes: true })

export class GitWorkspaceService {
  constructor(
    private readonly sessions: SessionRepo,
    private readonly projects: ProjectRepo,
    private readonly readDirectory: WorkspaceDirectoryReader = readWorkspaceDirectory
  ) {}

  async status(sessionId: string): Promise<GitRepositorySnapshot> {
    const root = this.rootForSession(sessionId)
    const result = await runGit(
      root,
      ['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all'],
      STATUS_LIMIT
    )
    assertGitSuccess(result)
    return parseStatus(result.stdout, Date.now())
  }

  async diff(sessionId: string, path: string, area: GitArea): Promise<GitFileDiff> {
    const root = this.rootForSession(sessionId)
    const safePath = validateRelativePath(path)
    const status = await this.status(sessionId)
    const change = status.changes.find((candidate) => candidate.path === safePath)
    if (area === 'worktree' && change?.worktreeStatus === 'untracked') {
      return this.untrackedDiff(root, safePath)
    }

    const args = ['diff', '--no-ext-diff', '--no-textconv', '--unified=3']
    if (area === 'staged') args.push('--cached')
    args.push('--', safePath)
    const result = await runGit(root, args, DIFF_LIMIT)
    if (result.exceeded) return emptyDiff(safePath, area, 'too-large')
    assertGitSuccess(result)
    if (
      result.stdout.includes('Binary files ') ||
      result.stdout.includes('GIT binary patch')
    ) {
      return emptyDiff(safePath, area, 'binary')
    }
    if (result.stdout.trim() === '') return emptyDiff(safePath, area, 'empty')
    return parseUnifiedDiff(safePath, area, result.stdout)
  }

  async files(sessionId: string, directory: string): Promise<GitWorkspaceFileList> {
    const root = this.rootForSession(sessionId)
    const safeDirectory = directory === '' ? '' : validateRelativePath(directory)
    const absoluteDirectory = await containedPath(root, safeDirectory)
    const directoryStat = await stat(absoluteDirectory)
    if (!directoryStat.isDirectory()) throw invalidPath('只能读取项目目录')
    const children = await this.readDirectory(absoluteDirectory)
    const entries = children.map((entry) => ({
      path: safeDirectory === '' ? entry.name : `${safeDirectory}/${entry.name}`,
      kind: entry.isDirectory()
        ? ('directory' as const)
        : entry.isSymbolicLink()
          ? ('symlink' as const)
          : ('file' as const)
    }))
    entries.sort((left, right) => {
      if (left.kind !== right.kind) {
        if (left.kind === 'directory') return -1
        if (right.kind === 'directory') return 1
      }
      return left.path.localeCompare(right.path)
    })
    return {
      directory: safeDirectory,
      entries
    }
  }

  async preview(sessionId: string, path: string): Promise<GitFilePreview> {
    const root = this.rootForSession(sessionId)
    const safePath = validateRelativePath(path)
    const absolutePath = await containedFile(root, safePath)
    const fileStat = await stat(absolutePath)
    if (!fileStat.isFile()) throw invalidPath('只能预览普通文件')
    if (fileStat.size > PREVIEW_LIMIT) {
      return { path: safePath, kind: 'too-large', content: '', size: fileStat.size }
    }
    const content = await readFile(absolutePath)
    if (content.includes(0)) {
      return { path: safePath, kind: 'binary', content: '', size: fileStat.size }
    }
    return {
      path: safePath,
      kind: 'text',
      content: content.toString('utf8'),
      size: fileStat.size
    }
  }

  private rootForSession(sessionId: string): string {
    const session = this.sessions.get(sessionId)
    if (session === null) throw notFound('会话')
    if (session.projectId === null) throw new RpcError('CONFLICT', '该会话未关联项目')
    const project = this.projects.get(session.projectId)
    if (project === null) throw notFound('项目')
    return project.path
  }

  private async untrackedDiff(root: string, path: string): Promise<GitFileDiff> {
    let preview: GitFilePreview
    try {
      const absolutePath = await containedFile(root, path)
      const fileStat = await stat(absolutePath)
      if (fileStat.size > DIFF_LIMIT) return emptyDiff(path, 'worktree', 'too-large')
      const buffer = await readFile(absolutePath)
      if (buffer.includes(0)) return emptyDiff(path, 'worktree', 'binary')
      preview = {
        path,
        kind: 'text',
        content: buffer.toString('utf8'),
        size: buffer.length
      }
    } catch (error) {
      if (error instanceof RpcError) throw error
      return emptyDiff(path, 'worktree', 'empty')
    }
    const lines = preview.content.split(/\r?\n/)
    if (lines.at(-1) === '') lines.pop()
    if (lines.length === 0) return emptyDiff(path, 'worktree', 'empty')
    return {
      path,
      area: 'worktree',
      kind: 'text',
      oldPath: null,
      hunks: [
        {
          header: `@@ -0,0 +1,${lines.length} @@`,
          lines: lines.map((text, index) => ({
            kind: 'addition',
            oldLine: null,
            newLine: index + 1,
            text
          }))
        }
      ]
    }
  }
}

export function parseStatus(stdout: string, refreshedAt: number): GitRepositorySnapshot {
  let branch: string | null = null
  let head: string | null = null
  const changes: GitChange[] = []
  const records = stdout.split('\0')

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    if (record === '') continue
    if (record.startsWith('# branch.oid ')) {
      const oid = record.slice(13)
      head = oid === '(initial)' ? null : oid
      continue
    }
    if (record.startsWith('# branch.head ')) {
      const name = record.slice(14)
      branch = name === '(detached)' ? null : name
      continue
    }
    if (record.startsWith('? ')) {
      changes.push(change(record.slice(2), null, null, 'untracked', false))
      continue
    }
    if (record.startsWith('! ')) continue
    if (record.startsWith('1 ')) {
      const match = record.match(/^1 ([^ ]+) [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ (.*)$/s)
      if (match !== null) changes.push(fromXY(match[2], match[1], null, false))
      continue
    }
    if (record.startsWith('2 ')) {
      const match = record.match(
        /^2 ([^ ]+) [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ (.*)$/s
      )
      const previousPath = records[index + 1] ?? null
      index += 1
      if (match !== null) changes.push(fromXY(match[2], match[1], previousPath, false))
      continue
    }
    if (record.startsWith('u ')) {
      const match = record.match(
        /^u ([^ ]+) [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ [^ ]+ (.*)$/s
      )
      if (match !== null) changes.push(fromXY(match[2], match[1], null, true))
    }
  }

  return {
    branch,
    head,
    detached: branch === null && head !== null,
    changes: changes.slice(0, CHANGE_LIMIT),
    refreshedAt,
    truncated: changes.length > CHANGE_LIMIT
  }
}

function fromXY(
  path: string,
  xy: string,
  previousPath: string | null,
  conflict: boolean
): GitChange {
  return change(
    path,
    previousPath,
    statusCode(xy[0], conflict),
    statusCode(xy[1], conflict),
    conflict
  )
}

function change(
  path: string,
  previousPath: string | null,
  stagedStatus: GitFileStatus | null,
  worktreeStatus: GitFileStatus | null,
  conflicted: boolean
): GitChange {
  return { path, previousPath, stagedStatus, worktreeStatus, conflicted }
}

function statusCode(code: string | undefined, conflict: boolean): GitFileStatus | null {
  if (conflict) return 'unmerged'
  return (
    (
      {
        A: 'added',
        M: 'modified',
        D: 'deleted',
        R: 'renamed',
        C: 'copied',
        '?': 'untracked'
      } as const
    )[code ?? ''] ?? null
  )
}

export function parseUnifiedDiff(
  path: string,
  area: GitArea,
  patch: string
): GitFileDiff {
  const hunks: GitFileDiff['hunks'] = []
  let current: GitFileDiff['hunks'][number] | null = null
  let oldLine = 0
  let newLine = 0
  let oldPath: string | null = null

  for (const raw of patch.split(/\r?\n/)) {
    if (raw.startsWith('--- ')) {
      oldPath = raw.slice(4) === '/dev/null' ? null : stripDiffPrefix(raw.slice(4))
      continue
    }
    if (raw.startsWith('+++ ')) continue
    const header = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (header !== null) {
      oldLine = Number(header[1])
      newLine = Number(header[2])
      current = { header: raw, lines: [] }
      hunks.push(current)
      continue
    }
    if (current === null) continue
    if (raw.startsWith('+')) {
      current.lines.push({ kind: 'addition', oldLine: null, newLine, text: raw.slice(1) })
      newLine += 1
    } else if (raw.startsWith('-')) {
      current.lines.push({ kind: 'deletion', oldLine, newLine: null, text: raw.slice(1) })
      oldLine += 1
    } else if (raw.startsWith(' ')) {
      current.lines.push({ kind: 'context', oldLine, newLine, text: raw.slice(1) })
      oldLine += 1
      newLine += 1
    } else if (raw !== '') {
      current.lines.push({ kind: 'meta', oldLine: null, newLine: null, text: raw })
    }
  }
  return { path, area, kind: hunks.length === 0 ? 'empty' : 'text', oldPath, hunks }
}

function emptyDiff(path: string, area: GitArea, kind: GitFileDiff['kind']): GitFileDiff {
  return { path, area, kind, oldPath: null, hunks: [] }
}

function stripDiffPrefix(path: string): string {
  return path.startsWith('a/') ? path.slice(2) : path
}

export function validateRelativePath(path: string): string {
  if (path === '' || path.includes('\0') || isAbsolute(path)) throw invalidPath()
  const normalized = path.replace(/\\/g, '/')
  if (
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized.includes('/../')
  ) {
    throw invalidPath()
  }
  return normalized.replace(/^\.\//, '')
}

async function containedFile(root: string, path: string): Promise<string> {
  return containedPath(root, path)
}

async function containedPath(root: string, path: string): Promise<string> {
  const canonicalRoot = await realpath(root)
  const candidate =
    path === ''
      ? canonicalRoot
      : await realpath(resolve(canonicalRoot, ...path.split('/')))
  const relation = relative(canonicalRoot, candidate)
  if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw invalidPath('文件不在项目目录内')
  }
  return candidate
}

function assertGitSuccess(result: GitResult): void {
  if (result.timedOut) throw new RpcError('INTERNAL', 'Git 操作超时，请重试')
  if (result.exceeded) throw new RpcError('INTERNAL', 'Git 输出超过安全上限')
  if (result.code !== 0) throw new RpcError('INTERNAL', '无法读取 Git 仓库状态')
}

function runGit(root: string, args: string[], limit: number): Promise<GitResult> {
  return new Promise((resolveResult) => {
    const child = spawn('git', ['-C', root, ...args], {
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let stdoutLength = 0
    let stderrLength = 0
    let timedOut = false
    let exceeded = false
    let settled = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill()
    }, GIT_TIMEOUT_MS)
    const finish = (code: number | null): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolveResult({
        code,
        stdout: Buffer.concat(stdoutChunks, stdoutLength).toString('utf8'),
        stderr: Buffer.concat(stderrChunks, stderrLength).toString('utf8'),
        timedOut,
        exceeded
      })
    }
    child.stdout.on('data', (chunk: Buffer) => {
      stdoutChunks.push(chunk)
      stdoutLength += chunk.length
      if (stdoutLength > limit) {
        exceeded = true
        child.kill()
      }
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderrChunks.push(chunk)
      stderrLength += chunk.length
      if (stderrLength > 64 * 1024) child.kill()
    })
    child.on('error', () => finish(null))
    child.on('close', finish)
  })
}
