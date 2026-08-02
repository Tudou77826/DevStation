import type {
  AgentAvailability,
  AgentDescriptor,
  AgentLaunchSpec,
  AgentSessionRef
} from '@shared/agent'
import type { AgentLaunchContext, CodingAgentAdapter } from './adapter'

/** Deterministic, account-free adapter registered only when DEVSTATION_E2E=1. */
export class E2ETestAgentAdapter implements CodingAgentAdapter {
  readonly descriptor: AgentDescriptor = {
    id: 'test-agent',
    label: 'Test Agent',
    description: '仅用于确定性桌面验收的本地测试适配器',
    capabilities: {
      resume: false,
      sessionIdentity: false,
      activityEvents: false,
      transcript: false
    },
    settings: { version: 1, fields: [], actions: [] },
    setupSteps: []
  }

  async probe(): Promise<AgentAvailability> {
    return {
      status: 'available',
      executable: 'powershell.exe',
      version: 'e2e',
      message: null
    }
  }

  buildLaunch(_context: AgentLaunchContext): AgentLaunchSpec {
    return {
      executable: 'powershell.exe',
      args: ['-NoProfile', '-Command', "Write-Output 'DEVSTATION_TEST_AGENT_READY'"],
      env: {}
    }
  }

  buildResume(_context: AgentLaunchContext, _ref: AgentSessionRef): null {
    return null
  }

  validateSessionRef(_raw: unknown): null {
    return null
  }
}

/** Second deterministic adapter proving selection and Schema-driven settings in CI. */
export class E2EAlternateAgentAdapter implements CodingAgentAdapter {
  readonly descriptor: AgentDescriptor = {
    id: 'test-agent-alt',
    label: 'Test Agent Alternate',
    description: '仅用于多 Agent 确定性桌面验收。',
    capabilities: {
      resume: false,
      sessionIdentity: false,
      activityEvents: true,
      transcript: false
    },
    settings: {
      version: 1,
      fields: [
        {
          key: 'mode',
          label: '启动模式',
          description: '验证通用设置能够传入 Adapter。',
          kind: 'select',
          required: true,
          defaultValue: 'compact',
          options: [
            { value: 'compact', label: '精简' },
            { value: 'verbose', label: '详细' }
          ]
        }
      ],
      actions: [{ id: 'probe', label: '重新检测', kind: 'probe' }]
    },
    setupSteps: [
      {
        id: 'verify-cli',
        title: '检测测试 Agent',
        description: '确认确定性测试命令可以运行。',
        actionId: 'probe'
      }
    ]
  }

  async probe(): Promise<AgentAvailability> {
    return {
      status: 'available',
      executable: 'powershell.exe',
      version: 'e2e-alt',
      message: null
    }
  }

  buildLaunch(context: AgentLaunchContext): AgentLaunchSpec {
    const mode = context.settings['mode'] === 'verbose' ? 'VERBOSE' : 'COMPACT'
    const eventId = `e2e-${context.agentRunId}`
    return {
      executable: 'powershell.exe',
      args: [
        '-NoProfile',
        '-Command',
        `Write-Output 'DEVSTATION_TEST_AGENT_ALT_${mode}_READY'; & $env:DEVSTATION_AGENT_EVENT_BRIDGE -Kind 'done' -EventId '${eventId}' -OccurredAt ([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())`
      ],
      env: {}
    }
  }

  buildResume(_context: AgentLaunchContext, _ref: AgentSessionRef): null {
    return null
  }

  validateSessionRef(_raw: unknown): null {
    return null
  }
}
