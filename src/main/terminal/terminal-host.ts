import { EventEmitter } from 'node:events'
import { execFileSync } from 'node:child_process'
import { spawn, type IPty } from 'node-pty'
import type {
  HostDiagnostics,
  HostCreateOrAttachRequest,
  HostExitReason,
  HostSessionResult
} from './terminal-host-protocol'
import { TERMINAL_HOST_PROTOCOL_VERSION } from './terminal-host-protocol'

const MAX_SNAPSHOT_CHARS = 2 * 1024 * 1024

interface HostedTerminal {
  process: IPty
  cwd: string
  shell: string
  createdAt: number
  chunks: string[]
  snapshotChars: number
  stopRequested: boolean
}

type PtyTerminator = (terminal: IPty) => void

/** Explicit stop owns the complete Windows console tree, not only the PTY shell wrapper. */
export function terminatePtyTree(
  terminal: Pick<IPty, 'pid' | 'kill'>,
  platform = process.platform,
  execute: typeof execFileSync = execFileSync
): void {
  if (platform !== 'win32') {
    terminal.kill()
    return
  }
  try {
    execute('taskkill.exe', ['/PID', String(terminal.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
      timeout: 3_000
    })
  } catch {
    // The shell may already have exited between lookup and taskkill. node-pty
    // remains the safe fallback and also covers unavailable taskkill binaries.
    terminal.kill()
  }
}

export interface TerminalHostEvents {
  data: [{ sessionId: string; data: string }]
  exit: [
    {
      sessionId: string
      exitCode: number
      signal?: number
      reason: HostExitReason
    }
  ]
}

export class TerminalHost extends EventEmitter<TerminalHostEvents> {
  private readonly sessions = new Map<string, HostedTerminal>()
  private readonly startedAt: number

  constructor(
    private readonly processId = process.pid,
    now: () => number = Date.now,
    private readonly terminate: PtyTerminator = terminatePtyTree
  ) {
    super()
    this.startedAt = now()
  }

  diagnostics(): HostDiagnostics {
    return {
      protocolVersion: TERMINAL_HOST_PROTOCOL_VERSION,
      processId: this.processId,
      startedAt: this.startedAt,
      sessions: [...this.sessions].map(([id, session]) => ({
        id,
        pid: session.process.pid,
        cwd: session.cwd,
        createdAt: session.createdAt
      }))
    }
  }

  get sessionCount(): number {
    return this.sessions.size
  }

  createOrAttach(request: HostCreateOrAttachRequest): HostSessionResult {
    const existing = this.sessions.get(request.sessionId)
    if (existing !== undefined) return this.result(request.sessionId, existing, false)

    const terminalProcess = spawn(request.shell.file, request.shell.args, {
      name: 'xterm-256color',
      cols: request.cols,
      rows: request.rows,
      cwd: request.cwd,
      env: this.environment(request.shell.env)
    })
    const hosted: HostedTerminal = {
      process: terminalProcess,
      cwd: request.cwd,
      shell: request.shell.file,
      createdAt: Date.now(),
      chunks: [],
      snapshotChars: 0,
      stopRequested: false
    }
    this.sessions.set(request.sessionId, hosted)
    terminalProcess.onData((data) => {
      this.appendSnapshot(hosted, data)
      this.emit('data', { sessionId: request.sessionId, data })
    })
    terminalProcess.onExit(({ exitCode, signal }) => {
      this.sessions.delete(request.sessionId)
      this.emit('exit', {
        sessionId: request.sessionId,
        exitCode,
        signal,
        reason: hosted.stopRequested ? 'stopped' : 'exited'
      })
    })
    return this.result(request.sessionId, hosted, true)
  }

  write(sessionId: string, data: string): void {
    this.get(sessionId).process.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    this.get(sessionId).process.resize(cols, rows)
  }

  close(sessionId: string): void {
    const hosted = this.get(sessionId)
    hosted.stopRequested = true
    this.sessions.delete(sessionId)
    this.terminate(hosted.process)
  }

  closeAll(): void {
    for (const session of this.sessions.values()) {
      session.stopRequested = true
      this.terminate(session.process)
    }
    this.sessions.clear()
  }

  private result(
    id: string,
    terminal: HostedTerminal,
    isNew: boolean
  ): HostSessionResult {
    return {
      id,
      pid: terminal.process.pid,
      cwd: terminal.cwd,
      shell: terminal.shell,
      createdAt: terminal.createdAt,
      isNew,
      snapshot: terminal.chunks.join('')
    }
  }

  private get(sessionId: string): HostedTerminal {
    const terminal = this.sessions.get(sessionId)
    if (terminal === undefined) throw new Error('Terminal session not found')
    return terminal
  }

  private appendSnapshot(terminal: HostedTerminal, data: string): void {
    if (data.length >= MAX_SNAPSHOT_CHARS) {
      terminal.chunks = [data.slice(-MAX_SNAPSHOT_CHARS)]
      terminal.snapshotChars = MAX_SNAPSHOT_CHARS
      return
    }
    terminal.chunks.push(data)
    terminal.snapshotChars += data.length
    while (terminal.snapshotChars > MAX_SNAPSHOT_CHARS && terminal.chunks.length > 1) {
      terminal.snapshotChars -= terminal.chunks.shift()?.length ?? 0
    }
  }

  private environment(overrides: Record<string, string> = {}): Record<string, string> {
    return {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          (entry): entry is [string, string] => entry[1] !== undefined
        )
      ),
      ...overrides
    }
  }
}
