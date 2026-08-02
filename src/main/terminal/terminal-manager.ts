import { statSync } from 'node:fs'
import { homedir } from 'node:os'
import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import type { ProjectRepo, SessionRepo } from '../db/repositories'
import type {
  TerminalConnectRequest,
  TerminalContext,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalHostStateEvent,
  TerminalSession
} from '../../shared/types'
import { resolvePowerShellLaunch } from './launch-spec'
import type {
  HostCreateOrAttachRequest,
  HostDiagnostics,
  HostSessionResult
} from './terminal-host-protocol'
import type { TerminalHostClientEvents } from './terminal-host-client'
import type {
  AgentRuntimeService,
  PreparedAgentTerminal
} from '../agents/runtime-service'

const MAX_DIMENSION = 500
const MAX_INPUT_LENGTH = 1024 * 1024
const MAX_ID_LENGTH = 200

interface TerminalHostConnection {
  createOrAttach(request: HostCreateOrAttachRequest): Promise<HostSessionResult>
  write(sessionId: string, data: string): Promise<void>
  resize(sessionId: string, cols: number, rows: number): Promise<void>
  close(sessionId: string): Promise<void>
  shutdown(): Promise<void>
  diagnostics(): Promise<HostDiagnostics>
  dispose(): void
  on<E extends keyof TerminalHostClientEvents>(
    event: E,
    listener: (...args: TerminalHostClientEvents[E]) => void
  ): unknown
}

interface TerminalRepositories {
  projects: Pick<ProjectRepo, 'get'>
  sessions: Pick<SessionRepo, 'get'>
}

interface TerminalOwner {
  webContents: WebContents
  connections: number
}

export interface TerminalManagerOptions {
  host: TerminalHostConnection
  repositories: TerminalRepositories
  agentRuntime: Pick<
    AgentRuntimeService,
    | 'prepareSession'
    | 'onTerminalConnected'
    | 'onTerminalActivity'
    | 'onTerminalExit'
    | 'onHostDisconnected'
    | 'dispose'
  >
}

export class TerminalManager {
  private readonly owners = new Map<string, Map<number, TerminalOwner>>()

  constructor(private readonly options: TerminalManagerOptions) {
    options.host.on('data', (payload) => this.onHostData(payload))
    options.host.on('exit', (payload) => this.onHostExit(payload))
    options.host.on('state', (payload) => this.onHostState(payload))
  }

  registerIpc(): void {
    ipcMain.handle('terminal:connect', (event, request: TerminalConnectRequest) =>
      this.connect(event, request)
    )
    ipcMain.handle('terminal:write', async (event, sessionId: string, data: string) => {
      this.assertOwned(event, sessionId)
      await this.options.host.write(sessionId, this.validateInput(data))
    })
    ipcMain.handle('terminal:disconnect', (event, sessionId: string) => {
      const id = validateId(sessionId, 'terminal session id')
      this.detachOwner(id, event.sender.id)
    })
    ipcMain.handle(
      'terminal:resize',
      async (event, sessionId: string, cols: number, rows: number) => {
        this.assertOwned(event, sessionId)
        await this.options.host.resize(
          sessionId,
          validateDimension(cols, 'cols'),
          validateDimension(rows, 'rows')
        )
      }
    )
    ipcMain.handle('terminal:close', async (event, sessionId: string) => {
      this.assertOwned(event, sessionId)
      await this.options.host.close(sessionId)
      // Keep the owner until node-pty confirms the actual process exit. This
      // guarantees the renderer receives the final reason/exit code instead
      // of showing a stale running state after an explicit stop.
    })
  }

  watch(webContents: WebContents): void {
    webContents.once('destroyed', () => {
      for (const [terminalId, owners] of this.owners) {
        owners.delete(webContents.id)
        if (owners.size === 0) this.owners.delete(terminalId)
      }
    })
  }

  dispose(): void {
    this.options.agentRuntime.dispose()
    this.owners.clear()
    this.options.host.dispose()
  }

  /** Test profiles must not leave detached hosts behind after Playwright exits. */
  async shutdownHost(): Promise<void> {
    await this.options.host.shutdown()
  }

  private async connect(
    event: IpcMainInvokeEvent,
    request: TerminalConnectRequest
  ): Promise<TerminalSession> {
    const parsed = validateConnectRequest(request)
    const resolved = this.resolveContext(parsed.context)
    const cols = validateDimension(parsed.cols, 'cols')
    const rows = validateDimension(parsed.rows, 'rows')
    const shell = resolvePowerShellLaunch(process.platform, process.env)
    const hostedShell =
      resolved.agent === null
        ? shell
        : {
            file: shell.file,
            args: [...shell.args, '-NoExit', '-Command', resolved.agent.startupCommand],
            env: { ...resolved.agent.launchSpec.env }
          }
    let owners = this.owners.get(resolved.terminalId)
    if (owners === undefined) {
      owners = new Map()
      this.owners.set(resolved.terminalId, owners)
    }
    const currentOwner = owners.get(event.sender.id)
    owners.set(event.sender.id, {
      webContents: event.sender,
      connections: (currentOwner?.connections ?? 0) + 1
    })
    let result: HostSessionResult
    let diagnostics: HostDiagnostics
    try {
      result = await this.options.host.createOrAttach({
        sessionId: resolved.terminalId,
        cols,
        rows,
        cwd: resolved.cwd,
        shell: hostedShell
      })
      diagnostics = await this.options.host.diagnostics()
    } catch (error) {
      this.detachOwner(resolved.terminalId, event.sender.id)
      throw error
    }

    if (resolved.agent !== null) {
      try {
        this.options.agentRuntime.onTerminalConnected({
          terminalId: result.id,
          cwd: resolved.cwd,
          createdAt: result.createdAt,
          isNew: result.isNew,
          prepared: resolved.agent
        })
      } catch (error) {
        this.detachOwner(resolved.terminalId, event.sender.id)
        if (result.isNew) {
          try {
            await this.options.host.close(result.id)
          } catch {
            // Preserve the persistence error; host diagnostics will report a
            // failed cleanup rather than hiding the root cause from the caller.
          }
        }
        throw error
      }
    }

    return {
      id: result.id,
      pid: result.pid,
      cwd: result.cwd,
      shell: result.shell,
      context: parsed.context,
      isNew: result.isNew,
      agentId: resolved.agent?.agentId ?? null,
      agentLabel: resolved.agent?.agentLabel ?? null,
      agentResumeRequested: result.isNew && resolved.agent?.resumeRequested === true,
      snapshot: result.snapshot,
      host: {
        protocolVersion: diagnostics.protocolVersion,
        processId: diagnostics.processId,
        startedAt: diagnostics.startedAt
      }
    }
  }

  private resolveContext(context: TerminalContext): {
    terminalId: string
    cwd: string
    agent: PreparedAgentTerminal | null
  } {
    if (context.type === 'workspace') {
      if (context.projectId === null) {
        return {
          terminalId: 'workspace:default',
          cwd: resolveWorkingDirectory(homedir()),
          agent: null
        }
      }
      const project = this.options.repositories.projects.get(context.projectId)
      if (project === null) throw new Error('Project not found')
      return {
        terminalId: `project:${project.id}:shell`,
        cwd: resolveWorkingDirectory(project.path),
        agent: null
      }
    }

    const session = this.options.repositories.sessions.get(context.sessionId)
    if (session === null) throw new Error('Session not found')
    if (session.projectId === null) throw new Error('Session has no project directory')
    const project = this.options.repositories.projects.get(session.projectId)
    if (project === null) throw new Error('Session project not found')
    const cwd = resolveWorkingDirectory(project.path)
    return {
      terminalId: `session:${session.id}`,
      cwd,
      agent: this.options.agentRuntime.prepareSession(session.id, cwd)
    }
  }

  private onHostData(payload: TerminalDataEvent): void {
    this.sendToOwners(payload.sessionId, 'terminal:data', payload)
    this.options.agentRuntime.onTerminalActivity(payload.sessionId)
  }

  private onHostExit(payload: TerminalExitEvent): void {
    this.options.agentRuntime.onTerminalExit(payload.sessionId)
    this.sendToOwners(payload.sessionId, 'terminal:exit', payload)
    this.owners.delete(payload.sessionId)
  }

  private onHostState(payload: TerminalHostStateEvent): void {
    if (payload.state !== 'disconnected') return
    for (const terminalId of this.owners.keys()) {
      this.sendToOwners(terminalId, 'terminal:host-state', payload)
    }
    this.owners.clear()
    this.options.agentRuntime.onHostDisconnected()
  }

  private sendToOwners(
    terminalId: string,
    channel: 'terminal:data' | 'terminal:exit' | 'terminal:host-state',
    payload: TerminalDataEvent | TerminalExitEvent | TerminalHostStateEvent
  ): void {
    for (const owner of this.owners.get(terminalId)?.values() ?? []) {
      if (!owner.webContents.isDestroyed()) owner.webContents.send(channel, payload)
    }
  }

  private detachOwner(terminalId: string, ownerId: number): void {
    const owners = this.owners.get(terminalId)
    const owner = owners?.get(ownerId)
    if (owners === undefined || owner === undefined) return
    if (owner.connections > 1) owner.connections -= 1
    else owners.delete(ownerId)
    if (owners.size === 0) this.owners.delete(terminalId)
  }

  private assertOwned(event: IpcMainInvokeEvent, sessionId: string): void {
    const id = validateId(sessionId, 'terminal session id')
    if (!this.owners.get(id)?.has(event.sender.id))
      throw new Error('Terminal session not found')
  }

  private validateInput(data: string): string {
    if (typeof data !== 'string' || data.length > MAX_INPUT_LENGTH) {
      throw new Error('Invalid terminal input')
    }
    return data
  }
}

function validateConnectRequest(request: TerminalConnectRequest): TerminalConnectRequest {
  if (request === null || typeof request !== 'object')
    throw new Error('Invalid terminal request')
  const context = request.context
  if (context === null || typeof context !== 'object')
    throw new Error('Invalid terminal context')
  if (context.type === 'workspace') {
    if (context.projectId !== null) validateId(context.projectId, 'project id')
  } else if (context.type === 'session') {
    validateId(context.sessionId, 'session id')
  } else {
    throw new Error('Unsupported terminal context')
  }
  return request
}

function validateId(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ID_LENGTH) {
    throw new Error(`Invalid ${name}`)
  }
  return value
}

function validateDimension(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 2 || value > MAX_DIMENSION) {
    throw new Error(`${name} must be an integer between 2 and ${MAX_DIMENSION}`)
  }
  return value
}

function resolveWorkingDirectory(cwd: string): string {
  try {
    if (!statSync(cwd).isDirectory()) throw new Error('not a directory')
  } catch {
    throw new Error(`Terminal working directory is unavailable: ${cwd}`)
  }
  return cwd
}
