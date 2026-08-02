import { EventEmitter } from 'node:events'
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
    now: () => number = Date.now
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
      env: this.environment()
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
    if (request.startupCommand !== undefined) {
      setTimeout(() => {
        if (this.sessions.get(request.sessionId) === hosted) {
          terminalProcess.write(`${request.startupCommand}\r`)
        }
      }, 150)
    }
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
    hosted.process.kill()
  }

  closeAll(): void {
    for (const session of this.sessions.values()) {
      session.stopRequested = true
      session.process.kill()
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

  private environment(): Record<string, string> {
    return Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] => entry[1] !== undefined
      )
    )
  }
}
