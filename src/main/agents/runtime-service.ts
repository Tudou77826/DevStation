import { randomUUID } from 'node:crypto'
import type { AgentLaunchSpec, AgentSessionRef } from '@shared/agent'
import type { Session } from '@shared/domain'
import type { SessionRepo } from '../db/repositories'
import type { AgentSessionLocator, CodingAgentAdapter } from './adapter'
import { encodePowerShellInvocation } from './agent-launch'
import type { AgentRegistry } from './registry'
import type { ManagedEventBridge } from './managed-event-bridge'

const DISCOVERY_DEBOUNCE_MS = 250
const DISCOVERY_TIMEOUT_MS = 30_000

interface SessionRepository {
  get(id: string): Session | null
  setAgentSessionRef(id: string, ref: AgentSessionRef): Session
  startAgentRun(id: string, agentRunId: string): Session
}

interface PendingAgentDiscovery {
  devStationSessionId: string
  cwd: string
  createdAt: number
  excludedIds: ReadonlySet<string>
  deadline: number
  locator: AgentSessionLocator
  adapter: CodingAgentAdapter
  timer: ReturnType<typeof setTimeout> | null
}

export interface PreparedAgentTerminal {
  devStationSessionId: string
  agentId: string
  agentLabel: string
  agentRunId: string
  sessionRef: AgentSessionRef | null
  launchSpec: AgentLaunchSpec
  startupCommand: string
  resumeRequested: boolean
  discoverySnapshot: ReadonlySet<string>
}

export interface AgentTerminalConnected {
  terminalId: string
  cwd: string
  createdAt: number
  isNew: boolean
  prepared: PreparedAgentTerminal
}

export interface AgentRuntimeServiceOptions {
  registry: AgentRegistry
  sessions: Pick<SessionRepo, 'get' | 'setAgentSessionRef' | 'startAgentRun'>
  createRunId?: () => string
  now?: () => number
  eventBridge?: Pick<ManagedEventBridge, 'enrichLaunchSpec'>
}

export class AgentRuntimeService {
  private readonly discovery = new Map<string, PendingAgentDiscovery>()
  private readonly sessions: SessionRepository
  private readonly createRunId: () => string
  private readonly now: () => number

  constructor(private readonly options: AgentRuntimeServiceOptions) {
    this.sessions = options.sessions
    this.createRunId = options.createRunId ?? randomUUID
    this.now = options.now ?? Date.now
  }

  prepareSession(sessionId: string, cwd: string): PreparedAgentTerminal {
    const session = this.sessions.get(sessionId)
    if (session === null) throw new Error('Session not found')
    const adapter = this.options.registry.require(session.agentId)
    const ref = this.validateStoredRef(adapter, session.agentSessionRef)
    const context = {
      cwd,
      devStationSessionId: session.id,
      agentRunId: this.createRunId()
    }
    const resume = ref === null ? null : adapter.buildResume(context, ref)
    const adapterLaunchSpec = resume ?? adapter.buildLaunch(context)
    const launchSpec =
      this.options.eventBridge?.enrichLaunchSpec(adapterLaunchSpec, {
        agentId: adapter.descriptor.id,
        devStationSessionId: session.id,
        agentRunId: context.agentRunId
      }) ?? adapterLaunchSpec
    const discoverySnapshot =
      ref === null && adapter.sessionLocator !== undefined
        ? this.safeSnapshot(adapter.sessionLocator, cwd)
        : new Set<string>()
    return {
      devStationSessionId: session.id,
      agentId: adapter.descriptor.id,
      agentLabel: adapter.descriptor.label,
      agentRunId: context.agentRunId,
      sessionRef: ref,
      launchSpec,
      startupCommand: encodePowerShellInvocation(launchSpec),
      resumeRequested: resume !== null,
      discoverySnapshot
    }
  }

  onTerminalConnected(connection: AgentTerminalConnected): void {
    const { prepared } = connection
    if (connection.isNew) {
      this.sessions.startAgentRun(prepared.devStationSessionId, prepared.agentRunId)
    }
    if (prepared.sessionRef !== null) return
    const adapter = this.options.registry.require(prepared.agentId)
    if (adapter.sessionLocator === undefined) return
    this.trackDiscovery(connection.terminalId, {
      devStationSessionId: prepared.devStationSessionId,
      cwd: connection.cwd,
      createdAt: connection.createdAt,
      excludedIds: connection.isNew ? prepared.discoverySnapshot : new Set<string>(),
      deadline: this.now() + DISCOVERY_TIMEOUT_MS,
      locator: adapter.sessionLocator,
      adapter,
      timer: null
    })
    this.scheduleDiscovery(connection.terminalId)
  }

  onTerminalActivity(terminalId: string): void {
    if (this.discovery.has(terminalId)) this.scheduleDiscovery(terminalId, true)
  }

  onTerminalExit(terminalId: string): void {
    this.attemptDiscovery(terminalId)
    this.clearDiscovery(terminalId)
  }

  onHostDisconnected(): void {
    for (const terminalId of this.discovery.keys()) {
      this.attemptDiscovery(terminalId)
      this.clearDiscovery(terminalId)
    }
  }

  dispose(): void {
    for (const terminalId of this.discovery.keys()) this.clearDiscovery(terminalId)
  }

  private validateStoredRef(
    adapter: CodingAgentAdapter,
    ref: AgentSessionRef | null
  ): AgentSessionRef | null {
    if (ref === null) return null
    const valid = adapter.validateSessionRef(ref)
    if (valid === null) throw new Error('Stored Agent session reference is invalid')
    return valid
  }

  private safeSnapshot(locator: AgentSessionLocator, cwd: string): ReadonlySet<string> {
    try {
      return locator.snapshot(cwd)
    } catch {
      return new Set()
    }
  }

  private trackDiscovery(terminalId: string, pending: PendingAgentDiscovery): void {
    this.clearDiscovery(terminalId)
    this.discovery.set(terminalId, pending)
  }

  private scheduleDiscovery(terminalId: string, fromTerminalActivity = false): void {
    const pending = this.discovery.get(terminalId)
    if (pending === undefined || pending.timer !== null) return
    if (this.now() >= pending.deadline) {
      if (!fromTerminalActivity) return
      pending.deadline = this.now() + 1_000
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
      const ref = pending.locator.findCreatedSession(
        pending.cwd,
        pending.createdAt,
        pending.excludedIds
      )
      if (ref === null) {
        this.scheduleDiscovery(terminalId)
        return
      }
      const valid = pending.adapter.validateSessionRef(ref)
      if (valid === null) throw new Error('Agent returned an invalid session reference')
      this.sessions.setAgentSessionRef(pending.devStationSessionId, valid)
      this.clearDiscovery(terminalId)
    } catch {
      this.scheduleDiscovery(terminalId)
    }
  }

  private clearDiscovery(terminalId: string): void {
    const pending = this.discovery.get(terminalId)
    if (pending?.timer !== null && pending?.timer !== undefined) {
      clearTimeout(pending.timer)
    }
    this.discovery.delete(terminalId)
  }
}
