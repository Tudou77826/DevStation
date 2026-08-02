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
