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

export interface CodingAgentAdapter {
  readonly descriptor: AgentDescriptor
  readonly sessionLocator?: AgentSessionLocator
  probe(): Promise<AgentAvailability>
  buildLaunch(context: AgentLaunchContext): AgentLaunchSpec
  buildResume(context: AgentLaunchContext, ref: AgentSessionRef): AgentLaunchSpec | null
  validateSessionRef(raw: unknown): AgentSessionRef | null
}
