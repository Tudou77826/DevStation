import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AGENT_EVENT_VERSION, type AgentEvent } from '@shared/agent'
import { Database } from '../db/database'
import { ProjectRepo, SessionRepo, TaskRepo } from '../db/repositories'
import { initializeDatabase } from '../db/schema'
import type { CodingAgentAdapter } from './adapter'
import { AgentEventInbox } from './agent-event-inbox'
import { ManagedEventBridge } from './managed-event-bridge'
import { AgentRegistry } from './registry'

const roots: string[] = []

function harness() {
  const root = mkdtempSync(join(tmpdir(), 'devstation-event-inbox-'))
  roots.push(root)
  const db = new Database(':memory:')
  initializeDatabase(db)
  const projects = new ProjectRepo(db)
  const tasks = new TaskRepo(db)
  const sessions = new SessionRepo(db)
  const project = projects.create({
    name: 'Repo',
    path: root,
    pathKey: root.toLowerCase()
  })
  const task = tasks.create({ title: 'Work' })
  tasks.setProject(task.id, project.id)
  const session = sessions.createFromTask(task.id, 'test-agent')
  sessions.startAgentRun(session.id, 'run-1')
  const adapter: CodingAgentAdapter = {
    descriptor: {
      id: 'test-agent',
      label: 'Test',
      description: '',
      capabilities: {
        resume: true,
        sessionIdentity: true,
        activityEvents: true,
        transcript: false
      },
      settings: { version: 1, fields: [], actions: [] },
      setupSteps: []
    },
    probe: vi.fn(async () => ({
      status: 'available' as const,
      executable: 'test',
      version: '1',
      message: null
    })),
    buildLaunch: vi.fn(() => ({ executable: 'test', args: [], env: {} })),
    buildResume: vi.fn(() => null),
    validateSessionRef: vi.fn((raw) => {
      const value = raw as { kind?: unknown; value?: unknown } | undefined
      return value?.kind === 'session-id' && typeof value.value === 'string'
        ? { kind: 'session-id', value: value.value }
        : null
    })
  }
  const bridge = new ManagedEventBridge(join(root, 'agent-events'))
  bridge.ensureInstalled()
  const logger = { warn: vi.fn(), error: vi.fn() }
  const inbox = new AgentEventInbox({
    inboxRoot: bridge.inboxRoot,
    registry: new AgentRegistry([adapter]),
    sessions,
    now: () => 10_000,
    logger
  })
  const token = 'a'.repeat(64)
  const event = (overrides: Partial<AgentEvent> = {}): AgentEvent => ({
    version: AGENT_EVENT_VERSION,
    eventId: 'event-1',
    agentId: 'test-agent',
    devStationSessionId: session.id,
    agentRunId: 'run-1',
    kind: 'working',
    occurredAt: 1_000,
    ...overrides
  })
  return { db, sessions, session, bridge, inbox, token, event, logger }
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('AgentEventInbox', () => {
  it('replays an event written before startup and ignores incomplete temp files', () => {
    const h = harness()
    h.bridge.writeEvent(h.token, h.event())
    writeFileSync(join(h.bridge.inboxRoot, h.token, 'incomplete.tmp'), '{', 'utf8')
    expect(h.inbox.consumeNow()).toEqual({ consumed: 1, quarantined: 0, retained: 0 })
    expect(h.sessions.get(h.session.id)).toMatchObject({
      status: 'working',
      statusSource: 'provider-event',
      statusUpdatedAt: 1_000
    })
    expect(readdirSync(join(h.bridge.inboxRoot, h.token))).toEqual(['incomplete.tmp'])
    h.db.close()
  })

  it('keeps duplicate, out-of-order and prior-run events from regressing state', () => {
    const h = harness()
    const current = h.event({ eventId: 'event-working', occurredAt: 2_000 })
    h.bridge.writeEvent(h.token, current)
    h.inbox.consumeNow()
    h.bridge.writeEvent(h.token, current)
    h.bridge.writeEvent(
      h.token,
      h.event({ eventId: 'event-started', kind: 'started', occurredAt: 1_000 })
    )
    expect(h.inbox.consumeNow()).toEqual({ consumed: 2, quarantined: 0, retained: 0 })
    expect(h.sessions.get(h.session.id)?.status).toBe('working')
    h.bridge.writeEvent(h.token, current)
    h.sessions.startAgentRun(h.session.id, 'run-2')
    h.bridge.writeEvent(
      h.token,
      h.event({ eventId: 'event-old-failed', kind: 'failed', occurredAt: 3_000 })
    )
    expect(h.inbox.consumeNow()).toEqual({ consumed: 2, quarantined: 0, retained: 0 })
    expect(h.sessions.get(h.session.id)).toMatchObject({
      status: 'unknown',
      agentRunId: 'run-2',
      statusSource: 'none'
    })
    h.db.close()
  })

  it('does not let a generic ended event erase a terminal provider outcome', () => {
    const h = harness()
    h.bridge.writeEvent(
      h.token,
      h.event({ eventId: 'event-done', kind: 'done', occurredAt: 2_000 })
    )
    h.inbox.consumeNow()
    h.bridge.writeEvent(
      h.token,
      h.event({ eventId: 'event-ended', kind: 'ended', occurredAt: 3_000 })
    )
    h.inbox.consumeNow()
    expect(h.sessions.get(h.session.id)).toMatchObject({
      status: 'done',
      statusUpdatedAt: 2_000
    })
    h.db.close()
  })

  it('quarantines corrupt input without blocking a valid event in the same scan', () => {
    const h = harness()
    const directory = join(h.bridge.inboxRoot, h.token)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'bad.json'), '{not-json', 'utf8')
    h.bridge.writeEvent(h.token, h.event())
    expect(h.inbox.consumeNow()).toEqual({ consumed: 1, quarantined: 1, retained: 0 })
    expect(h.sessions.get(h.session.id)?.status).toBe('working')
    expect(readdirSync(join(h.bridge.rootPath, 'quarantine'))).toHaveLength(1)
    h.db.close()
  })

  it('binds only adapter-validated native session references', () => {
    const h = harness()
    h.bridge.writeEvent(
      h.token,
      h.event({
        eventId: 'event-ref',
        kind: 'session-bound',
        sessionRef: { kind: 'session-id', value: 'native-1' }
      })
    )
    h.inbox.consumeNow()
    expect(h.sessions.get(h.session.id)?.agentSessionRef).toEqual({
      kind: 'session-id',
      value: 'native-1'
    })
    h.db.close()
  })
})
