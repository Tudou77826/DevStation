import { describe, expect, it, vi } from 'vitest'
import { OpenCodeAdapter, OPEN_CODE_DESCRIPTOR } from './opencode-adapter'

describe('OpenCodeAdapter', () => {
  it('declares its first-version capabilities and builds structured launch argv', () => {
    const adapter = new OpenCodeAdapter({
      snapshot: vi.fn(() => new Set<string>()),
      findCreatedSession: vi.fn(() => null)
    })
    const context = { cwd: 'C:\\repo', devStationSessionId: 's1', agentRunId: 'r1' }
    expect(OPEN_CODE_DESCRIPTOR.settings.version).toBe(1)
    expect(adapter.buildLaunch(context)).toEqual({
      executable: 'opencode',
      args: [],
      env: {}
    })
    expect(
      adapter.buildResume(context, { kind: 'session-id', value: 'ses_native-1' })
    ).toEqual({
      executable: 'opencode',
      args: ['--session', 'ses_native-1'],
      env: {}
    })
  })

  it('rejects unsafe references before they become argv', () => {
    const adapter = new OpenCodeAdapter({
      snapshot: vi.fn(() => new Set<string>()),
      findCreatedSession: vi.fn(() => null)
    })
    expect(
      adapter.validateSessionRef({ kind: 'session-id', value: 'ses_ok; Remove-Item *' })
    ).toBeNull()
    expect(adapter.validateSessionRef({ kind: 'other', value: 'ses_valid' })).toBeNull()
    expect(
      adapter.buildResume(
        { cwd: '.', devStationSessionId: 's', agentRunId: 'r' },
        {
          kind: 'session-id',
          value: '--help'
        }
      )
    ).toBeNull()
  })

  it('normalizes the vendor locator result into a structured reference', () => {
    const locator = {
      snapshot: vi.fn(() => new Set(['ses_before'])),
      findCreatedSession: vi.fn(() => 'ses_created')
    }
    const adapter = new OpenCodeAdapter(locator)
    expect(adapter.sessionLocator?.snapshot('C:\\repo')).toEqual(new Set(['ses_before']))
    expect(
      adapter.sessionLocator?.findCreatedSession('C:\\repo', 100, new Set(['ses_before']))
    ).toEqual({ kind: 'session-id', value: 'ses_created' })
  })
})
