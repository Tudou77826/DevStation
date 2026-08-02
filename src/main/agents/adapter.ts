import type {
  AgentAvailability,
  AgentDescriptor,
  AgentLaunchSpec,
  AgentSessionRef
} from '@shared/agent'

export interface AgentLaunchContext {
  cwd: string
  devStationSessionId: string
  agentRunId: string
}

export interface AgentSessionLocator {
  snapshot(cwd: string): ReadonlySet<string>
  findCreatedSession(
    cwd: string,
    createdAfter: number,
    excludedIds: ReadonlySet<string>
  ): AgentSessionRef | null
}

export type ManagedIntegrationState =
  'missing' | 'current' | 'outdated' | 'conflict' | 'unavailable'

export interface ManagedIntegrationDiagnostic {
  state: ManagedIntegrationState
  path: string
  message: string
}

export interface ManagedAgentIntegration {
  diagnose(): ManagedIntegrationDiagnostic
  ensureInstalled(): ManagedIntegrationDiagnostic
  uninstall(): ManagedIntegrationDiagnostic
}

export interface CodingAgentAdapter {
  readonly descriptor: AgentDescriptor
  readonly sessionLocator?: AgentSessionLocator
  readonly managedIntegration?: ManagedAgentIntegration
  probe(): Promise<AgentAvailability>
  buildLaunch(context: AgentLaunchContext): AgentLaunchSpec
  buildResume(context: AgentLaunchContext, ref: AgentSessionRef): AgentLaunchSpec | null
  validateSessionRef(raw: unknown): AgentSessionRef | null
}
