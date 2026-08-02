import { isAbsolute } from 'node:path'
import type {
  AgentSettingField,
  AgentSettingValue,
  AgentUserSettings
} from '@shared/agent'
import type { AgentSettingsRepo } from '../db/repositories'
import type { AgentRegistry } from './registry'

const MAX_SETTING_LENGTH = 1_024

/** Applies a registered Adapter's versioned setting schema at the Main boundary. */
export class AgentSettingsService {
  constructor(
    private readonly registry: AgentRegistry,
    private readonly repository: AgentSettingsRepo
  ) {}

  effective(agentId: string): AgentUserSettings {
    const descriptor = this.registry.require(agentId).descriptor
    const stored = this.repository.effective(agentId)
    const values: Record<string, AgentSettingValue> = {}
    for (const field of descriptor.settings.fields) {
      const storedValue = stored.values[field.key]
      const candidate = storedValue ?? field.defaultValue
      if (candidate === undefined) continue
      try {
        values[field.key] = validateSettingValue(field, candidate)
      } catch {
        // Keep incompatible historical values in SQLite, but never expose them
        // to the Adapter after a schema upgrade.
        if (storedValue !== undefined && field.defaultValue !== undefined) {
          values[field.key] = validateSettingValue(field, field.defaultValue)
        }
      }
    }
    return {
      ...stored,
      schemaVersion: descriptor.settings.version,
      values
    }
  }

  setValue(
    agentId: string,
    key: string,
    value: AgentSettingValue | null
  ): AgentUserSettings {
    const descriptor = this.registry.require(agentId).descriptor
    const field = descriptor.settings.fields.find((candidate) => candidate.key === key)
    if (field === undefined) throw new Error(`Unknown Coding Agent setting: ${key}`)
    const stored = this.repository.effective(agentId)
    const values = { ...stored.values }
    if (value === null || (value === '' && !field.required)) delete values[key]
    else values[key] = validateSettingValue(field, value)
    this.repository.setValues(agentId, descriptor.settings.version, values)
    return this.effective(agentId)
  }
}

export function validateSettingValue(
  field: AgentSettingField,
  value: AgentSettingValue
): AgentSettingValue {
  if (field.kind === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`Invalid setting: ${field.key}`)
    return value
  }
  if (
    typeof value !== 'string' ||
    value.length > MAX_SETTING_LENGTH ||
    [...value].some((character) => {
      const code = character.charCodeAt(0)
      return code <= 31 || code === 127
    })
  ) {
    throw new Error(`Invalid setting: ${field.key}`)
  }
  if (field.required && value.trim() === '') {
    throw new Error(`Required setting is empty: ${field.key}`)
  }
  if (field.kind === 'path' && value !== '' && !isAbsolute(value)) {
    throw new Error(`Setting path must be absolute: ${field.key}`)
  }
  if (
    field.kind === 'select' &&
    !field.options?.some((option) => option.value === value)
  ) {
    throw new Error(`Unsupported setting option: ${field.key}`)
  }
  return value
}
