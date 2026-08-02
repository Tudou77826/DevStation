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
