import {
  AGENT_EVENT_VERSION,
  type AgentEvent,
  type AgentEventKind,
  type AgentSessionRef
} from '../../shared/agent'

export const MAX_AGENT_EVENT_BYTES = 64 * 1024
export const MAX_EVENT_CLOCK_SKEW_MS = 5 * 60 * 1000

const EVENT_KINDS = new Set<AgentEventKind>([
  'session-bound',
  'started',
  'working',
  'waiting',
  'done',
  'failed',
  'ended'
])
const SAFE_EVENT_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/
const SAFE_ENTITY_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/
const SAFE_AGENT_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/

export function parseAgentEvent(value: unknown, now = Date.now()): AgentEvent {
  const record = requireRecord(value, 'Agent event')
  if (record['version'] !== AGENT_EVENT_VERSION) {
    throw new Error('Unsupported Agent event version')
  }
  const eventId = requireSafeId(record['eventId'], 'eventId', SAFE_EVENT_ID)
  const agentId = requireString(record['agentId'], 'agentId')
  if (!SAFE_AGENT_ID.test(agentId)) throw new Error('Invalid agentId')
  const devStationSessionId = requireSafeId(
    record['devStationSessionId'],
    'devStationSessionId',
    SAFE_ENTITY_ID
  )
  const agentRunId = requireSafeId(record['agentRunId'], 'agentRunId', SAFE_ENTITY_ID)
  const kind = record['kind']
  if (typeof kind !== 'string' || !EVENT_KINDS.has(kind as AgentEventKind)) {
    throw new Error('Invalid Agent event kind')
  }
  const occurredAt = record['occurredAt']
  if (!Number.isSafeInteger(occurredAt) || (occurredAt as number) < 0) {
    throw new Error('Invalid occurredAt')
  }
  if ((occurredAt as number) > now + MAX_EVENT_CLOCK_SKEW_MS) {
    throw new Error('Agent event is too far in the future')
  }

  const sessionRef = parseSessionRef(record['sessionRef'])
  if (kind === 'session-bound' && sessionRef === null) {
    throw new Error('session-bound event requires sessionRef')
  }
  if (kind !== 'session-bound' && record['sessionRef'] !== undefined) {
    throw new Error('Only session-bound events may include sessionRef')
  }
  return {
    version: AGENT_EVENT_VERSION,
    eventId,
    agentId,
    devStationSessionId,
    agentRunId,
    kind: kind as AgentEventKind,
    occurredAt: occurredAt as number,
    ...(sessionRef === null ? {} : { sessionRef })
  }
}

export function parseAgentEventJson(json: string, now = Date.now()): AgentEvent {
  return parseAgentEvent(JSON.parse(json) as unknown, now)
}

function parseSessionRef(value: unknown): AgentSessionRef | null {
  if (value === undefined) return null
  const record = requireRecord(value, 'sessionRef')
  const kind = requireBoundedText(record['kind'], 'sessionRef.kind', 64)
  const refValue = requireBoundedText(record['value'], 'sessionRef.value', 4_096)
  const transcriptPath = record['transcriptPath']
  const safeTranscriptPath =
    transcriptPath === undefined
      ? undefined
      : requireBoundedText(transcriptPath, 'sessionRef.transcriptPath', 8_192)
  return {
    kind,
    value: refValue,
    ...(safeTranscriptPath === undefined ? {} : { transcriptPath: safeTranscriptPath })
  }
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`)
  return value
}

function requireSafeId(value: unknown, field: string, pattern: RegExp): string {
  const text = requireString(value, field)
  if (!pattern.test(text)) throw new Error(`Invalid ${field}`)
  return text
}

function requireBoundedText(value: unknown, field: string, limit: number): string {
  const text = requireString(value, field)
  if (
    text.length === 0 ||
    text.length > limit ||
    [...text].some((character) => {
      const code = character.charCodeAt(0)
      return code <= 31 || code === 127
    })
  ) {
    throw new Error(`Invalid ${field}`)
  }
  return text
}
