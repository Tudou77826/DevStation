import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { connect, type Socket } from 'node:net'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { EventEmitter } from 'node:events'
import {
  encodeHostMessage,
  TERMINAL_HOST_PROTOCOL_VERSION,
  type HostCreateOrAttachRequest,
  type HostDiagnostics,
  type HostExitReason,
  type HostMessage,
  type HostRequest,
  type HostSessionResult
} from './terminal-host-protocol'

const CONNECT_RETRIES = 30
const CONNECT_RETRY_MS = 100
const REQUEST_TIMEOUT_MS = 5_000

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export interface TerminalHostClientEvents {
  data: [{ sessionId: string; data: string }]
  exit: [
    {
      sessionId: string
      exitCode: number
      signal?: number
      reason: HostExitReason
    }
  ]
  state: [
    {
      state: 'connected' | 'disconnected'
      message?: string
    }
  ]
}

export interface TerminalHostClientOptions {
  userDataPath: string
  hostEntryPath: string
}

/**
 * Authenticated client for the detached terminal host. Disconnecting this
 * client never stops PTYs: renderer/window lifetime is intentionally separate
 * from terminal lifetime.
 */
export class TerminalHostClient extends EventEmitter<TerminalHostClientEvents> {
  private readonly endpoint: string
  private readonly token: string
  private socket: Socket | null = null
  private connectPromise: Promise<void> | null = null
  private buffered = ''
  private readonly pending = new Map<string, PendingRequest>()
  private lastDiagnostics: HostDiagnostics | null = null
  private disposed = false

  constructor(private readonly options: TerminalHostClientOptions) {
    super()
    this.endpoint = terminalHostEndpoint(options.userDataPath)
    this.token = loadOrCreateToken(options.userDataPath)
  }

  async createOrAttach(request: HostCreateOrAttachRequest): Promise<HostSessionResult> {
    return (await this.request({
      method: 'createOrAttach',
      payload: request
    })) as HostSessionResult
  }

  async write(sessionId: string, data: string): Promise<void> {
    await this.request({ method: 'write', payload: { sessionId, data } })
  }

  async resize(sessionId: string, cols: number, rows: number): Promise<void> {
    await this.request({ method: 'resize', payload: { sessionId, cols, rows } })
  }

  async close(sessionId: string): Promise<void> {
    await this.request({ method: 'close', payload: { sessionId } })
  }

  async shutdown(): Promise<void> {
    await this.request({ method: 'shutdown', payload: {} })
  }

  async diagnostics(): Promise<HostDiagnostics> {
    await this.ensureConnected()
    if (this.lastDiagnostics === null)
      throw new Error('Terminal host diagnostics unavailable')
    return this.lastDiagnostics
  }

  dispose(): void {
    this.disposed = true
    this.socket?.destroy()
    this.socket = null
    this.connectPromise = null
    this.rejectPending(new Error('Terminal host client disconnected'))
  }

  private async request(request: HostRequest): Promise<unknown> {
    await this.ensureConnected()
    return await this.requestConnected(request)
  }

  private async requestConnected(request: HostRequest): Promise<unknown> {
    const socket = this.socket
    if (socket === null || socket.destroyed)
      throw new Error('Terminal host is unavailable')
    const id = randomUUID()
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Terminal host request timed out: ${request.method}`))
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer })
      socket.write(encodeHostMessage({ type: 'request', id, token: this.token, request }))
    })
  }

  private async ensureConnected(): Promise<void> {
    if (this.disposed) throw new Error('Terminal host client is disposed')
    if (this.connectPromise !== null) return await this.connectPromise
    if (this.socket !== null && !this.socket.destroyed) return
    this.connectPromise = this.connectOrStart().finally(() => {
      this.connectPromise = null
    })
    return await this.connectPromise
  }

  private async connectOrStart(): Promise<void> {
    if (await this.tryConnect()) return
    const child = spawn(process.execPath, [this.options.hostEntryPath], {
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        DEVSTATION_TERMINAL_HOST_ENDPOINT: this.endpoint,
        DEVSTATION_TERMINAL_HOST_TOKEN: this.token
      }
    })
    child.unref()
    for (let attempt = 0; attempt < CONNECT_RETRIES; attempt += 1) {
      await delay(CONNECT_RETRY_MS)
      if (await this.tryConnect()) return
    }
    throw new Error('Unable to start terminal host')
  }

  private async tryConnect(): Promise<boolean> {
    const candidate = await new Promise<Socket | null>((resolve) => {
      const candidate = connect(this.endpoint)
      let settled = false
      const finish = (connected: boolean): void => {
        if (settled) return
        settled = true
        candidate.removeAllListeners('connect')
        candidate.removeAllListeners('error')
        if (!connected) candidate.destroy()
        resolve(connected ? candidate : null)
      }
      candidate.once('connect', () => {
        finish(true)
      })
      candidate.once('error', () => finish(false))
    })
    if (candidate === null) return false
    this.bindSocket(candidate)
    try {
      const diagnostics = (await this.requestConnected({
        method: 'diagnostics',
        payload: {}
      })) as HostDiagnostics
      if (diagnostics.protocolVersion !== TERMINAL_HOST_PROTOCOL_VERSION) {
        throw new Error(
          `Terminal host protocol mismatch: expected ${TERMINAL_HOST_PROTOCOL_VERSION}, received ${diagnostics.protocolVersion}`
        )
      }
      this.lastDiagnostics = diagnostics
      this.emit('state', { state: 'connected' })
      return true
    } catch {
      if (this.socket === candidate) this.socket = null
      candidate.destroy()
      return false
    }
  }

  private bindSocket(socket: Socket): void {
    this.socket?.destroy()
    this.socket = socket
    this.buffered = ''
    socket.setEncoding('utf8')
    socket.on('data', (data) => this.handleData(String(data)))
    socket.once('close', () => {
      const wasCurrent = this.socket === socket
      if (wasCurrent) {
        this.socket = null
        this.lastDiagnostics = null
        this.rejectPending(new Error('Terminal host disconnected'))
      }
      if (wasCurrent && !this.disposed) {
        this.emit('state', {
          state: 'disconnected',
          message: 'Terminal host connection was lost'
        })
      }
    })
  }

  private handleData(data: string): void {
    this.buffered += data
    let newline = this.buffered.indexOf('\n')
    while (newline >= 0) {
      const line = this.buffered.slice(0, newline)
      this.buffered = this.buffered.slice(newline + 1)
      if (line.trim()) {
        try {
          this.handleMessage(JSON.parse(line) as HostMessage)
        } catch {
          this.socket?.destroy(new Error('Invalid terminal host response'))
          return
        }
      }
      newline = this.buffered.indexOf('\n')
    }
  }

  private handleMessage(message: HostMessage): void {
    if (message.type === 'event') {
      if (message.event === 'data') {
        this.emit('data', { sessionId: message.sessionId, data: message.data })
      } else {
        this.emit('exit', {
          sessionId: message.sessionId,
          exitCode: message.exitCode,
          reason: message.reason,
          ...(message.signal === undefined ? {} : { signal: message.signal })
        })
      }
      return
    }
    const pending = this.pending.get(message.id)
    if (pending === undefined) return
    this.pending.delete(message.id)
    clearTimeout(pending.timer)
    if (message.ok) pending.resolve(message.result)
    else pending.reject(new Error(message.error))
  }

  private rejectPending(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer)
      request.reject(error)
    }
    this.pending.clear()
  }
}

export function terminalHostEndpoint(userDataPath: string): string {
  const id = createHash('sha256').update(userDataPath).digest('hex').slice(0, 20)
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\devstation-terminal-v${TERMINAL_HOST_PROTOCOL_VERSION}-${id}`
    : join(tmpdir(), `devstation-terminal-v${TERMINAL_HOST_PROTOCOL_VERSION}-${id}.sock`)
}

function loadOrCreateToken(userDataPath: string): string {
  mkdirSync(userDataPath, { recursive: true })
  const tokenPath = join(userDataPath, 'terminal-host.token')
  if (existsSync(tokenPath)) return readFileSync(tokenPath, 'utf8').trim()
  const token = randomBytes(32).toString('hex')
  writeFileSync(tokenPath, token, { encoding: 'utf8', mode: 0o600 })
  return token
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
