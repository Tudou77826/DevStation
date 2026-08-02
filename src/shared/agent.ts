// Platform-neutral Coding Agent contracts shared across Main and Renderer.

export type AgentCapability =
  'resume' | 'sessionIdentity' | 'activityEvents' | 'transcript'

export interface AgentSettingField {
  key: string
  label: string
  kind: 'boolean' | 'path' | 'select'
  required: boolean
}

export interface AgentSettingAction {
  id: string
  label: string
  kind:
    | 'probe'
    | 'open-login'
    | 'integration-enable'
    | 'integration-repair'
    | 'integration-disable'
}

export interface AgentSettingsSchema {
  version: number
  fields: readonly AgentSettingField[]
  actions: readonly AgentSettingAction[]
}

export interface AgentSetupStep {
  id: string
  title: string
  description: string
  actionId?: string
}

export interface AgentDescriptor {
  id: string
  label: string
  description: string
  capabilities: Readonly<Record<AgentCapability, boolean>>
  settings: AgentSettingsSchema
  setupSteps: readonly AgentSetupStep[]
}

export interface AgentAvailability {
  status: 'available' | 'unavailable' | 'error'
  executable: string
  version: string | null
  message: string | null
}

export interface AgentCatalogEntry {
  descriptor: AgentDescriptor
}

export interface AgentUserSettings {
  agentId: string
  enabled: boolean
  integrationEnabled: boolean
  executablePath: string | null
  isDefault: boolean
  updatedAt: number | null
}

export interface AgentDiagnosticEntry {
  descriptor: AgentDescriptor
  settings: AgentUserSettings
  availability: AgentAvailability
  integration: {
    state: 'missing' | 'current' | 'outdated' | 'conflict' | 'unavailable'
    message: string
  } | null
}

export interface AgentSessionRef {
  kind: string
  value: string
  transcriptPath?: string
}

export interface AgentLaunchSpec {
  executable: string
  args: readonly string[]
  env: Readonly<Record<string, string>>
}

/** Versioned, provider-neutral events accepted by DevStation's offline inbox. */
export const AGENT_EVENT_VERSION = 1 as const

export type AgentEventKind =
  'session-bound' | 'started' | 'working' | 'waiting' | 'done' | 'failed' | 'ended'

export interface AgentEvent {
  version: typeof AGENT_EVENT_VERSION
  eventId: string
  agentId: string
  devStationSessionId: string
  agentRunId: string
  kind: AgentEventKind
  occurredAt: number
  sessionRef?: AgentSessionRef
}
