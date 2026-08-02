import type {
  AgentAvailability,
  AgentDescriptor,
  AgentLaunchSpec,
  AgentSessionRef
} from '@shared/agent'
import type {
  AgentLaunchContext,
  CodingAgentAdapter,
  ManagedAgentIntegration
} from './adapter'
import { probeCli } from './cli-probe'

const CANONICAL_SESSION_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LEGACY_SESSION_ID = /^[0-9a-f]{12}$/i

export const CHRYS_DESCRIPTOR: AgentDescriptor = {
  id: 'chrys',
  label: 'Chrys',
  description: 'Chrys 本地 Coding Agent',
  capabilities: {
    resume: true,
    sessionIdentity: true,
    activityEvents: true,
    transcript: false
  },
  settings: {
    version: 1,
    fields: [],
    actions: [
      { id: 'probe', label: '重新检测', kind: 'probe' },
      { id: 'events-enable', label: '启用事件集成', kind: 'integration-enable' },
      { id: 'events-repair', label: '修复事件集成', kind: 'integration-repair' },
      { id: 'events-disable', label: '停用事件集成', kind: 'integration-disable' }
    ]
  },
  setupSteps: [
    {
      id: 'cli',
      title: '检测 Chrys CLI',
      description: '确认本机可以运行 chrys。',
      actionId: 'probe'
    }
  ]
}

export class ChrysAdapter implements CodingAgentAdapter {
  readonly descriptor = CHRYS_DESCRIPTOR

  constructor(readonly managedIntegration?: ManagedAgentIntegration) {}

  probe(executablePath?: string): Promise<AgentAvailability> {
    return probeCli({
      executable: executablePath ?? 'chrys',
      args: ['--version'],
      env: {}
    })
  }

  buildLaunch(context: AgentLaunchContext): AgentLaunchSpec {
    return { executable: context.executablePath ?? 'chrys', args: [], env: {} }
  }

  buildResume(context: AgentLaunchContext, ref: AgentSessionRef): AgentLaunchSpec | null {
    const valid = this.validateSessionRef(ref)
    if (valid === null) return null
    return {
      executable: context.executablePath ?? 'chrys',
      args: ['-s', valid.value],
      env: {}
    }
  }

  validateSessionRef(raw: unknown): AgentSessionRef | null {
    if (raw === null || typeof raw !== 'object') return null
    const record = raw as Record<string, unknown>
    if (
      record['kind'] !== 'chrys-session-id' ||
      typeof record['value'] !== 'string' ||
      (!CANONICAL_SESSION_ID.test(record['value']) &&
        !LEGACY_SESSION_ID.test(record['value']))
    ) {
      return null
    }
    return { kind: 'chrys-session-id', value: record['value'] }
  }
}
