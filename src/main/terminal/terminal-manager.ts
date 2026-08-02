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
import { openCodeStartupCommand, resolvePowerShellLaunch } from './launch-spec'
import type {
  HostCreateOrAttachRequest,
  HostDiagnostics,
  HostSessionResult
} from './terminal-host-protocol'
import type { TerminalHostClientEvents } from './terminal-host-client'
import type { OpenCodeSessionLocator } from './opencode-session-locator'

const MAX_DIMENSION = 500
const MAX_INPUT_LENGTH = 1024 * 1024
const MAX_ID_LENGTH = 200
const DISCOVERY_DEBOUNCE_MS = 250
const DISCOVERY_TIMEOUT_MS = 30_000

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
  sessions: Pick<SessionRepo, 'get' | 'setAgentSession'>
}

interface PendingAgentDiscovery {
  devStationSessionId: string
  cwd: string
  createdAt: number
  excludedIds: Set<string>
  deadline: number
  timer: ReturnType<typeof setTimeout> | null
}

interface TerminalOwner {
  webContents: WebContents
  connections: number
}

export interface TerminalManagerOptions {
  host: TerminalHostConnection
  repositories: TerminalRepositories
  openCodeSessions: Pick<OpenCodeSessionLocator, 'snapshot' | 'findCreatedSession'>
}

export class TerminalManager {
  private readonly owners = new Map<string, Map<number, TerminalOwner>>()
  private readonly discovery = new Map<string, PendingAgentDiscovery>()

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
    for (const terminalId of this.discovery.keys()) this.clearDiscovery(terminalId)
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
    const excludedIds = resolved.devStationSessionId
      ? this.safeOpenCodeSnapshot(resolved.cwd)
      : new Set<string>()
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
        shell,
        ...(resolved.startupCommand === undefined
          ? {}
          : { startupCommand: resolved.startupCommand })
      })
      diagnostics = await this.options.host.diagnostics()
    } catch (error) {
      this.detachOwner(resolved.terminalId, event.sender.id)
      throw error
    }

    if (resolved.devStationSessionId !== null && resolved.agentSessionId === null) {
      this.trackDiscovery(result.id, {
        devStationSessionId: resolved.devStationSessionId,
        cwd: resolved.cwd,
        createdAt: result.createdAt,
        excludedIds: result.isNew ? excludedIds : new Set(),
        deadline: Date.now() + DISCOVERY_TIMEOUT_MS,
        timer: null
      })
      this.scheduleDiscovery(result.id)
    }

    return {
      id: result.id,
      pid: result.pid,
      cwd: result.cwd,
      shell: result.shell,
      context: parsed.context,
      isNew: result.isNew,
      agentType: resolved.devStationSessionId === null ? null : 'opencode',
      agentResumed:
        result.isNew &&
        resolved.devStationSessionId !== null &&
        resolved.agentSessionId !== null,
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
    startupCommand?: string
    devStationSessionId: string | null
    agentSessionId: string | null
  } {
    if (context.type === 'workspace') {
      if (context.projectId === null) {
        return {
          terminalId: 'workspace:default',
          cwd: resolveWorkingDirectory(homedir()),
          devStationSessionId: null,
          agentSessionId: null
        }
      }
      const project = this.options.repositories.projects.get(context.projectId)
      if (project === null) throw new Error('Project not found')
      return {
        terminalId: `project:${project.id}:shell`,
        cwd: resolveWorkingDirectory(project.path),
        devStationSessionId: null,
        agentSessionId: null
      }
    }

    const session = this.options.repositories.sessions.get(context.sessionId)
    if (session === null) throw new Error('Session not found')
    if (session.projectId === null) throw new Error('Session has no project directory')
    const project = this.options.repositories.projects.get(session.projectId)
    if (project === null) throw new Error('Session project not found')
    return {
      terminalId: `session:${session.id}`,
      cwd: resolveWorkingDirectory(project.path),
      startupCommand: openCodeStartupCommand(session.agentSessionId),
      devStationSessionId: session.id,
      agentSessionId: session.agentSessionId
    }
  }

  private onHostData(payload: TerminalDataEvent): void {
    this.sendToOwners(payload.sessionId, 'terminal:data', payload)
    if (this.discovery.has(payload.sessionId))
      this.scheduleDiscovery(payload.sessionId, true)
  }

  private onHostExit(payload: TerminalExitEvent): void {
    this.attemptDiscovery(payload.sessionId)
    this.sendToOwners(payload.sessionId, 'terminal:exit', payload)
    this.owners.delete(payload.sessionId)
    this.clearDiscovery(payload.sessionId)
  }

  private onHostState(payload: TerminalHostStateEvent): void {
    if (payload.state !== 'disconnected') return
    for (const terminalId of this.owners.keys()) {
      this.sendToOwners(terminalId, 'terminal:host-state', payload)
    }
    this.owners.clear()
    for (const terminalId of this.discovery.keys()) {
      this.attemptDiscovery(terminalId)
      this.clearDiscovery(terminalId)
    }
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

  private trackDiscovery(terminalId: string, pending: PendingAgentDiscovery): void {
    this.clearDiscovery(terminalId)
    this.discovery.set(terminalId, pending)
  }

  private scheduleDiscovery(terminalId: string, fromTerminalActivity = false): void {
    const pending = this.discovery.get(terminalId)
    if (pending === undefined || pending.timer !== null) return
    if (Date.now() >= pending.deadline) {
      if (!fromTerminalActivity) return
      // OpenCode creates a native session lazily, commonly after the user's
      // first prompt. Keep the binding candidate for the PTY lifetime and open
      // a short discovery window whenever that terminal becomes active again.
      pending.deadline = Date.now() + 1_000
    }
    pending.timer = setTimeout(() => {
      pending.timer = null
      this.attemptDiscovery(terminalId)
    }, DISCOVERY_DEBOUNCE_MS)
  }

  private attemptDiscovery(terminalId: string): void {
    const pending = this.discovery.get(terminalId)
    if (pending === undefined) return
    try {
      const agentSessionId = this.options.openCodeSessions.findCreatedSession(
        pending.cwd,
        pending.createdAt,
        pending.excludedIds
      )
      if (agentSessionId === null) {
        this.scheduleDiscovery(terminalId)
        return
      }
      this.options.repositories.sessions.setAgentSession(
        pending.devStationSessionId,
        agentSessionId
      )
      this.clearDiscovery(terminalId)
    } catch {
      // OpenCode may not have created its DB/session row yet. The bounded poll
      // and later PTY activity retry without affecting terminal availability.
      this.scheduleDiscovery(terminalId)
    }
  }

  private safeOpenCodeSnapshot(cwd: string): Set<string> {
    try {
      return this.options.openCodeSessions.snapshot(cwd)
    } catch {
      return new Set()
    }
  }

  private clearDiscovery(terminalId: string): void {
    const pending = this.discovery.get(terminalId)
    if (pending?.timer !== null && pending?.timer !== undefined)
      clearTimeout(pending.timer)
    this.discovery.delete(terminalId)
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
