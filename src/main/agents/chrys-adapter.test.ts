import { describe, expect, it } from 'vitest'
import { CHRYS_DESCRIPTOR, ChrysAdapter } from './chrys-adapter'

describe('ChrysAdapter', () => {
  const context = {
    cwd: 'C:\\repo',
    devStationSessionId: 's1',
    agentRunId: 'r1',
    settings: {}
  }

  it('launches the native TUI and resumes a validated native session', () => {
    const adapter = new ChrysAdapter()

    expect(CHRYS_DESCRIPTOR.capabilities.activityEvents).toBe(true)
    expect(adapter.buildLaunch(context)).toEqual({
      executable: 'chrys',
      args: [],
      env: {}
    })
    expect(
      adapter.buildResume(context, {
        kind: 'chrys-session-id',
        value: 'aa72fa1e-801f-44a6-a902-f23bb85296cb'
      })
    ).toEqual({
      executable: 'chrys',
      args: ['-s', 'aa72fa1e-801f-44a6-a902-f23bb85296cb'],
      env: {}
    })
  })

  it('accepts canonical and legacy ids but rejects argv injection', () => {
    const adapter = new ChrysAdapter()

    expect(
      adapter.validateSessionRef({
        kind: 'chrys-session-id',
        value: 'aa72fa1e-801f-44a6-a902-f23bb85296cb'
      })
    ).not.toBeNull()
    expect(
      adapter.validateSessionRef({ kind: 'chrys-session-id', value: '0123abcdef89' })
    ).not.toBeNull()
    expect(
      adapter.validateSessionRef({
        kind: 'chrys-session-id',
        value: 'aa72fa1e-801f-44a6-a902-f23bb85296cb; Remove-Item *'
      })
    ).toBeNull()
    expect(
      adapter.validateSessionRef({ kind: 'session-id', value: '0123abcdef89' })
    ).toBeNull()
  })
})
