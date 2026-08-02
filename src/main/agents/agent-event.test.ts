import { describe, expect, it } from 'vitest'
import { AGENT_EVENT_VERSION } from '@shared/agent'
import { parseAgentEvent } from './agent-event'

const valid = {
  version: AGENT_EVENT_VERSION,
  eventId: 'event-1',
  agentId: 'opencode',
  devStationSessionId: 'session-1',
  agentRunId: 'run-1',
  kind: 'working',
  occurredAt: 1_000
} as const

describe('Agent event contract', () => {
  it('accepts a bounded provider-neutral status event', () => {
    expect(parseAgentEvent(valid, 1_000)).toEqual(valid)
  })

  it('requires a valid native reference only for session binding', () => {
    expect(() => parseAgentEvent({ ...valid, kind: 'session-bound' }, 1_000)).toThrow(
      'requires sessionRef'
    )
    expect(
      parseAgentEvent(
        {
          ...valid,
          kind: 'session-bound',
          sessionRef: { kind: 'session-id', value: 'native-1' }
        },
        1_000
      ).sessionRef
    ).toEqual({ kind: 'session-id', value: 'native-1' })
    expect(() =>
      parseAgentEvent(
        { ...valid, sessionRef: { kind: 'session-id', value: 'native-1' } },
        1_000
      )
    ).toThrow('Only session-bound')
  })

  it('rejects unknown versions, unsafe identities and future timestamps', () => {
    expect(() => parseAgentEvent({ ...valid, version: 2 }, 1_000)).toThrow('Unsupported')
    expect(() => parseAgentEvent({ ...valid, eventId: '../escape' }, 1_000)).toThrow(
      'Invalid eventId'
    )
    expect(() =>
      parseAgentEvent({ ...valid, occurredAt: 1_000 + 5 * 60 * 1_000 + 1 }, 1_000)
    ).toThrow('future')
  })
})
