import type { AgentAvailability, AgentCatalogEntry, AgentDescriptor } from '@shared/agent'
import type { CodingAgentAdapter } from './adapter'
import { validateSettingValue } from './settings-service'

const SAFE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/
const CAPABILITIES = [
  'resume',
  'sessionIdentity',
  'activityEvents',
  'transcript'
] as const
const FIELD_KINDS = new Set(['boolean', 'path', 'select'])
const ACTION_KINDS = new Set([
  'probe',
  'open-login',
  'integration-enable',
  'integration-repair',
  'integration-disable'
])
const INTEGRATION_ACTION_KINDS = [
  'integration-enable',
  'integration-repair',
  'integration-disable'
] as const

export class AgentRegistry {
  private readonly adapters = new Map<string, CodingAgentAdapter>()

  constructor(adapters: readonly CodingAgentAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter)
  }

  register(adapter: CodingAgentAdapter): void {
    validateAdapterContract(adapter)
    const id = adapter.descriptor.id
    if (this.adapters.has(id)) throw new Error(`Coding Agent already registered: ${id}`)
    this.adapters.set(id, adapter)
  }

  get(id: string): CodingAgentAdapter | null {
    return this.adapters.get(id) ?? null
  }

  require(id: string): CodingAgentAdapter {
    const adapter = this.get(id)
    if (adapter === null) throw new Error(`Coding Agent is not installed: ${id}`)
    return adapter
  }

  descriptors(): AgentDescriptor[] {
    return [...this.adapters.values()].map((adapter) => adapter.descriptor)
  }

  async probe(id: string, executablePath?: string): Promise<AgentAvailability> {
    return this.require(id).probe(executablePath)
  }

  catalog(): AgentCatalogEntry[] {
    return [...this.adapters.values()].map((adapter) => ({
      descriptor: adapter.descriptor
    }))
  }
}

function validateAdapterContract(adapter: CodingAgentAdapter): void {
  const descriptor = adapter.descriptor
  if (descriptor === null || typeof descriptor !== 'object') {
    throw new Error('Invalid Coding Agent descriptor')
  }
  if (!SAFE_ID.test(descriptor.id)) {
    throw new Error(`Invalid Coding Agent id: ${descriptor.id}`)
  }
  requireText(descriptor.label, 'label')
  if (typeof descriptor.description !== 'string') {
    throw new Error(`Invalid Coding Agent description: ${descriptor.id}`)
  }
  if (descriptor.capabilities === null || typeof descriptor.capabilities !== 'object') {
    throw new Error(`Invalid Coding Agent capabilities: ${descriptor.id}`)
  }
  for (const capability of CAPABILITIES) {
    if (typeof descriptor.capabilities[capability] !== 'boolean') {
      throw new Error(`Invalid Coding Agent capability: ${descriptor.id}.${capability}`)
    }
  }
  if (descriptor.capabilities.resume && !descriptor.capabilities.sessionIdentity) {
    throw new Error(`Coding Agent resume has no session identity: ${descriptor.id}`)
  }
  if (
    descriptor.settings === null ||
    typeof descriptor.settings !== 'object' ||
    !Array.isArray(descriptor.settings.fields) ||
    !Array.isArray(descriptor.settings.actions) ||
    !Number.isSafeInteger(descriptor.settings.version) ||
    descriptor.settings.version < 1
  ) {
    throw new Error(`Invalid Coding Agent settings version: ${descriptor.id}`)
  }

  const fieldIds = new Set<string>()
  for (const field of descriptor.settings.fields) {
    requireUniqueId(field.key, fieldIds, `settings field for ${descriptor.id}`)
    requireText(field.label, `settings field label for ${descriptor.id}`)
    if (!FIELD_KINDS.has(field.kind) || typeof field.required !== 'boolean') {
      throw new Error(
        `Invalid Coding Agent settings field: ${descriptor.id}.${field.key}`
      )
    }
    if (field.kind === 'select') {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        throw new Error(
          `Missing Coding Agent setting options: ${descriptor.id}.${field.key}`
        )
      }
      const optionValues = new Set<string>()
      for (const option of field.options) {
        requireText(option.value, `setting option for ${descriptor.id}.${field.key}`)
        requireText(
          option.label,
          `setting option label for ${descriptor.id}.${field.key}`
        )
        if (optionValues.has(option.value)) {
          throw new Error(
            `Duplicate Coding Agent setting option: ${descriptor.id}.${field.key}`
          )
        }
        optionValues.add(option.value)
      }
    } else if (field.options !== undefined) {
      throw new Error(
        `Unexpected Coding Agent setting options: ${descriptor.id}.${field.key}`
      )
    }
    if (field.defaultValue !== undefined) {
      validateSettingValue(field, field.defaultValue)
    }
  }

  const actionIds = new Set<string>()
  for (const action of descriptor.settings.actions) {
    requireUniqueId(action.id, actionIds, `settings action for ${descriptor.id}`)
    requireText(action.label, `settings action label for ${descriptor.id}`)
    if (!ACTION_KINDS.has(action.kind)) {
      throw new Error(
        `Invalid Coding Agent settings action: ${descriptor.id}.${action.id}`
      )
    }
    if (action.kind === 'open-login' && adapter.buildLogin === undefined) {
      throw new Error(`Coding Agent login action has no implementation: ${descriptor.id}`)
    }
  }
  const integrationActions = new Set<string>(
    descriptor.settings.actions
      .map(({ kind }) => kind)
      .filter((kind) => (INTEGRATION_ACTION_KINDS as readonly string[]).includes(kind))
  )
  if (integrationActions.size > 0 && adapter.managedIntegration === undefined) {
    throw new Error(
      `Coding Agent integration actions have no implementation: ${descriptor.id}`
    )
  }
  if (adapter.managedIntegration !== undefined) {
    if (!descriptor.capabilities.activityEvents) {
      throw new Error(
        `Coding Agent event integration has no event capability: ${descriptor.id}`
      )
    }
    for (const kind of INTEGRATION_ACTION_KINDS) {
      if (!integrationActions.has(kind)) {
        throw new Error(
          `Coding Agent event integration action is missing: ${descriptor.id}.${kind}`
        )
      }
    }
  }
  if (adapter.sessionLocator !== undefined && !descriptor.capabilities.sessionIdentity) {
    throw new Error(
      `Coding Agent session locator has no identity capability: ${descriptor.id}`
    )
  }

  if (!Array.isArray(descriptor.setupSteps)) {
    throw new Error(`Invalid Coding Agent setup steps: ${descriptor.id}`)
  }
  const stepIds = new Set<string>()
  for (const step of descriptor.setupSteps) {
    requireUniqueId(step.id, stepIds, `setup step for ${descriptor.id}`)
    requireText(step.title, `setup step title for ${descriptor.id}`)
    requireText(step.description, `setup step description for ${descriptor.id}`)
    if (step.actionId !== undefined && !actionIds.has(step.actionId)) {
      throw new Error(
        `Coding Agent setup step references an unknown action: ${descriptor.id}.${step.id}`
      )
    }
  }
}

function requireUniqueId(value: string, seen: Set<string>, label: string): void {
  if (!SAFE_ID.test(value) || seen.has(value))
    throw new Error(`Invalid or duplicate ${label}: ${value}`)
  seen.add(value)
}

function requireText(value: string, label: string): void {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`Invalid ${label}`)
}
