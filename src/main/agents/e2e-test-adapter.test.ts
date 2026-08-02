import { describe, expect, it } from 'vitest'
import { E2ETestAgentAdapter } from './e2e-test-adapter'

describe('E2ETestAgentAdapter', () => {
  it('is deterministic, account-free and cannot claim unsupported resume state', async () => {
    const adapter = new E2ETestAgentAdapter()
    await expect(adapter.probe()).resolves.toMatchObject({
      status: 'available',
      executable: 'powershell.exe'
    })
    expect(
      adapter.buildLaunch({
        cwd: 'C:\\repo',
        devStationSessionId: 'session-1',
        agentRunId: 'run-1'
      })
    ).toEqual({
      executable: 'powershell.exe',
      args: ['-NoProfile', '-Command', "Write-Output 'DEVSTATION_TEST_AGENT_READY'"],
      env: {}
    })
    expect(adapter.descriptor.capabilities).toEqual({
      resume: false,
      sessionIdentity: false,
      activityEvents: false,
      transcript: false
    })
    expect(adapter.validateSessionRef({ kind: 'fake', value: 'x' })).toBeNull()
    expect(
      adapter.buildResume(
        { cwd: 'C:\\repo', devStationSessionId: 'session-1', agentRunId: 'run-1' },
        { kind: 'fake', value: 'x' }
      )
    ).toBeNull()
  })
})
