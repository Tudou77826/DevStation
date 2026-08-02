import type {
  AgentAvailability,
  AgentDescriptor,
  AgentLaunchSpec,
  AgentSessionRef
} from '@shared/agent'
import type {
  AgentLaunchContext,
  AgentSessionLocator,
  CodingAgentAdapter,
  ManagedAgentIntegration
} from './adapter'
import { probeCli } from './cli-probe'
import type { OpenCodeSessionLocator } from './opencode-session-locator'

const SESSION_ID = /^ses_[A-Za-z0-9_-]{1,120}$/

export const OPEN_CODE_DESCRIPTOR: AgentDescriptor = {
  id: 'opencode',
  label: 'OpenCode',
  description: 'OpenCode 本地 Coding Agent',
  capabilities: {
    resume: true,
    sessionIdentity: true,
    activityEvents: true,
    transcript: false
  },
  settings: {
    version: 2,
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
      title: '检测 OpenCode CLI',
      description: '确认本机可以运行 opencode。',
      actionId: 'probe'
    }
  ]
}

export class OpenCodeAdapter implements CodingAgentAdapter {
  readonly descriptor = OPEN_CODE_DESCRIPTOR
  readonly sessionLocator: AgentSessionLocator
  readonly managedIntegration?: ManagedAgentIntegration

  constructor(
    locator: Pick<OpenCodeSessionLocator, 'snapshot' | 'findCreatedSession'>,
    managedIntegration?: ManagedAgentIntegration
  ) {
    this.managedIntegration = managedIntegration
    this.sessionLocator = {
      snapshot: (cwd) => locator.snapshot(cwd),
      findCreatedSession: (cwd, createdAfter, excludedIds) => {
        const value = locator.findCreatedSession(cwd, createdAfter, excludedIds)
        return value === null ? null : { kind: 'session-id', value }
      }
    }
  }

  probe(): Promise<AgentAvailability> {
    return probeCli({ executable: 'opencode', args: ['--version'], env: {} })
  }

  buildLaunch(_context: AgentLaunchContext): AgentLaunchSpec {
    return { executable: 'opencode', args: [], env: {} }
  }

  buildResume(
    _context: AgentLaunchContext,
    ref: AgentSessionRef
  ): AgentLaunchSpec | null {
    const valid = this.validateSessionRef(ref)
    if (valid === null) return null
    return {
      executable: 'opencode',
      args: ['--session', valid.value],
      env: { DEVSTATION_OPENCODE_SESSION_ID: valid.value }
    }
  }

  validateSessionRef(raw: unknown): AgentSessionRef | null {
    if (raw === null || typeof raw !== 'object') return null
    const record = raw as Record<string, unknown>
    if (
      record['kind'] !== 'session-id' ||
      typeof record['value'] !== 'string' ||
      !SESSION_ID.test(record['value'])
    ) {
      return null
    }
    return { kind: 'session-id', value: record['value'] }
  }
}
