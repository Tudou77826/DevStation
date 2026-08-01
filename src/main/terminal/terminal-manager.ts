import { randomUUID } from 'node:crypto'
import { statSync } from 'node:fs'
import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { spawn, type IPty } from 'node-pty'
import type {
  TerminalCreateRequest,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalSession
} from '../../shared/types'
import { resolveTerminalLaunch } from './launch-spec'

const MAX_DIMENSION = 500
const MAX_INPUT_LENGTH = 1024 * 1024

interface OwnedTerminal {
  ownerId: number
  process: IPty
  metadata: TerminalSession
}

function validateDimension(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 2 || value > MAX_DIMENSION) {
    throw new Error(`${name} must be an integer between 2 and ${MAX_DIMENSION}`)
  }
  return value
}

function resolveWorkingDirectory(cwd: string | undefined): string {
  const resolved = cwd?.trim() || process.cwd()
  try {
    if (!statSync(resolved).isDirectory()) throw new Error('not a directory')
  } catch {
    throw new Error(`Terminal working directory is unavailable: ${resolved}`)
  }
  return resolved
}

function terminalEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  )
}

export class TerminalManager {
  private readonly sessions = new Map<string, OwnedTerminal>()

  registerIpc(): void {
    ipcMain.handle('terminal:create', (event, request: TerminalCreateRequest) =>
      this.create(event, request)
    )
    ipcMain.handle('terminal:write', (event, sessionId: string, data: string) => {
      this.ownedSession(event, sessionId).process.write(this.validateInput(data))
    })
    ipcMain.handle(
      'terminal:resize',
      (event, sessionId: string, cols: number, rows: number) => {
        this.ownedSession(event, sessionId).process.resize(
          validateDimension(cols, 'cols'),
          validateDimension(rows, 'rows')
        )
      }
    )
    ipcMain.handle('terminal:close', (event, sessionId: string) => {
      this.closeOwned(event, sessionId)
    })
  }

  watch(webContents: WebContents): void {
    webContents.once('destroyed', () => this.closeAllForOwner(webContents.id))
  }

  dispose(): void {
    for (const session of this.sessions.values()) {
      session.process.kill()
    }
    this.sessions.clear()
  }

  private create(
    event: IpcMainInvokeEvent,
    request: TerminalCreateRequest
  ): TerminalSession {
    if (request === null || typeof request !== 'object')
      throw new Error('Invalid terminal request')
    if (request.kind !== 'shell' && request.kind !== 'codex') {
      throw new Error('Unsupported terminal launch kind')
    }

    const cwd = resolveWorkingDirectory(request.cwd)
    const cols = validateDimension(request.cols, 'cols')
    const rows = validateDimension(request.rows, 'rows')
    const launch = resolveTerminalLaunch(request.kind)
    const terminalProcess = spawn(launch.file, launch.args, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: terminalEnvironment()
    })
    const metadata: TerminalSession = {
      id: randomUUID(),
      pid: terminalProcess.pid,
      kind: request.kind,
      cwd,
      shell: launch.file
    }
    this.sessions.set(metadata.id, {
      ownerId: event.sender.id,
      process: terminalProcess,
      metadata
    })

    terminalProcess.onData((data) => {
      if (!event.sender.isDestroyed()) {
        const payload: TerminalDataEvent = { sessionId: metadata.id, data }
        event.sender.send('terminal:data', payload)
      }
    })
    terminalProcess.onExit(({ exitCode, signal }) => {
      this.sessions.delete(metadata.id)
      if (!event.sender.isDestroyed()) {
        const payload: TerminalExitEvent = { sessionId: metadata.id, exitCode, signal }
        event.sender.send('terminal:exit', payload)
      }
    })

    return metadata
  }

  private ownedSession(event: IpcMainInvokeEvent, sessionId: string): OwnedTerminal {
    if (typeof sessionId !== 'string') throw new Error('Invalid terminal session id')
    const session = this.sessions.get(sessionId)
    if (session === undefined || session.ownerId !== event.sender.id) {
      throw new Error('Terminal session not found')
    }
    return session
  }

  private validateInput(data: string): string {
    if (typeof data !== 'string' || data.length > MAX_INPUT_LENGTH) {
      throw new Error('Invalid terminal input')
    }
    return data
  }

  private closeOwned(event: IpcMainInvokeEvent, sessionId: string): void {
    const session = this.ownedSession(event, sessionId)
    this.sessions.delete(sessionId)
    session.process.kill()
  }

  private closeAllForOwner(ownerId: number): void {
    for (const [id, session] of this.sessions) {
      if (session.ownerId === ownerId) {
        this.sessions.delete(id)
        session.process.kill()
      }
    }
  }
}
