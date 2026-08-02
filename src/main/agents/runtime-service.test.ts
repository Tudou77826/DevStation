import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AgentSessionRef } from '@shared/agent'
import type { Session } from '@shared/domain'
import type { CodingAgentAdapter } from './adapter'
import { AgentRegistry } from './registry'
import { AgentRuntimeService } from './runtime-service'

function session(ref: AgentSessionRef | null = null, agentId = 'test-agent'): Session {
  return {
    id: 'session-1',
    taskId: 'task-1',
    projectId: 'project-1',
    title: 'Work',
    status: 'unknown',
    agentId,
    agentSessionRef: ref,
    agentRunId: null,
    statusSource: 'none',
    statusUpdatedAt: null,
    lastOpenedAt: null,
    createdAt: 1,
    updatedAt: 1
  }
}

function harness(options: { ref?: AgentSessionRef | null; agentId?: string } = {}) {
  const sessionValue = session(options.ref ?? null, options.agentId ?? 'test-agent')
  const locator = {
    snapshot: vi.fn((): ReadonlySet<string> => new Set(['before'])),
    findCreatedSession: vi.fn((): AgentSessionRef | null => null)
  }
  const adapter: CodingAgentAdapter = {
    descriptor: {
      id: 'test-agent',
      label: 'Test Agent',
      description: '',
      capabilities: {
        resume: true,
        sessionIdentity: true,
        activityEvents: false,
        transcript: false
      },
      settings: { version: 1, fields: [], actions: [] },
      setupSteps: []
    },
    sessionLocator: locator,
    probe: vi.fn(async () => ({
      status: 'available' as const,
      executable: 'test-agent',
      version: '1',
      message: null
    })),
    buildLaunch: vi.fn(() => ({ executable: 'test-agent', args: [], env: {} })),
    buildResume: vi.fn((_context, ref) => ({
      executable: 'test-agent',
      args: ['resume', ref.value],
      env: {}
    })),
    validateSessionRef: vi.fn((raw) => {
      if (raw === null || typeof raw !== 'object') return null
      const record = raw as Record<string, unknown>
      return record['kind'] === 'session-id' && typeof record['value'] === 'string'
        ? { kind: 'session-id', value: record['value'] }
        : null
    })
  }
  const sessions = {
    get: vi.fn(() => sessionValue),
    setAgentSessionRef: vi.fn(() => sessionValue),
    startAgentRun: vi.fn(() => sessionValue)
  }
  let now = 1_000
  const runtime = new AgentRuntimeService({
    registry: new AgentRegistry([adapter]),
    sessions,
    createRunId: () => 'run-1',
    now: () => now
  })
  return { runtime, sessions, adapter, locator, setNow: (value: number) => (now = value) }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('AgentRuntimeService', () => {
  it('starts a new run and binds a lazily discovered native session', async () => {
    vi.useFakeTimers()
    const h = harness()
    const prepared = h.runtime.prepareSession('session-1', 'C:\\repo')
    expect(prepared).toMatchObject({
      agentId: 'test-agent',
      agentLabel: 'Test Agent',
      agentRunId: 'run-1',
      startupCommand: "& 'test-agent'",
      resumeRequested: false
    })
    expect(h.locator.snapshot).toHaveBeenCalledWith('C:\\repo')

    h.locator.findCreatedSession.mockReturnValue({
      kind: 'session-id',
      value: 'native-1'
    })
    h.runtime.onTerminalConnected({
      terminalId: 'terminal-1',
      cwd: 'C:\\repo',
      createdAt: 500,
      isNew: true,
      prepared
    })
    await vi.advanceTimersByTimeAsync(250)

    expect(h.sessions.startAgentRun).toHaveBeenCalledWith('session-1', 'run-1')
    expect(h.locator.findCreatedSession).toHaveBeenCalledWith(
      'C:\\repo',
      500,
      new Set(['before'])
    )
    expect(h.sessions.setAgentSessionRef).toHaveBeenCalledWith('session-1', {
      kind: 'session-id',
      value: 'native-1'
    })
  })

  it('resumes a validated reference and does not create a run generation on hot attach', () => {
    const h = harness({ ref: { kind: 'session-id', value: 'native-1' } })
    const prepared = h.runtime.prepareSession('session-1', 'C:\\repo')
    expect(prepared).toMatchObject({
      resumeRequested: true,
      startupCommand: "& 'test-agent' 'resume' 'native-1'"
    })
    expect(h.locator.snapshot).not.toHaveBeenCalled()
    h.runtime.onTerminalConnected({
      terminalId: 'terminal-1',
      cwd: 'C:\\repo',
      createdAt: 500,
      isNew: false,
      prepared
    })
    expect(h.sessions.startAgentRun).not.toHaveBeenCalled()
  })

  it('rejects unknown adapters and invalid stored references instead of starting fresh', () => {
    const unknown = harness({ agentId: 'removed-agent' })
    expect(() => unknown.runtime.prepareSession('session-1', 'C:\\repo')).toThrow(
      'not installed'
    )

    const invalid = harness({ ref: { kind: 'other', value: 'native-1' } })
    expect(() => invalid.runtime.prepareSession('session-1', 'C:\\repo')).toThrow(
      'Stored Agent session reference is invalid'
    )
    expect(invalid.adapter.buildLaunch).not.toHaveBeenCalled()
  })

  it('reopens discovery after the initial window when later terminal activity arrives', async () => {
    vi.useFakeTimers()
    const h = harness()
    const prepared = h.runtime.prepareSession('session-1', 'C:\\repo')
    h.runtime.onTerminalConnected({
      terminalId: 'terminal-1',
      cwd: 'C:\\repo',
      createdAt: 500,
      isNew: false,
      prepared
    })
    h.setNow(40_000)
    await vi.advanceTimersByTimeAsync(250)
    h.locator.findCreatedSession.mockReturnValue({
      kind: 'session-id',
      value: 'native-late'
    })
    h.runtime.onTerminalActivity('terminal-1')
    await vi.advanceTimersByTimeAsync(250)
    expect(h.sessions.setAgentSessionRef).toHaveBeenCalledWith('session-1', {
      kind: 'session-id',
      value: 'native-late'
    })
  })

  it('degrades when discovery is unavailable and clears pending work on disconnect', () => {
    vi.useFakeTimers()
    const h = harness()
    h.locator.snapshot.mockImplementation(() => {
      throw new Error('index unavailable')
    })
    const prepared = h.runtime.prepareSession('session-1', 'C:\\repo')
    expect(prepared.discoverySnapshot).toEqual(new Set())
    h.locator.findCreatedSession.mockImplementation(() => {
      throw new Error('not committed')
    })
    h.runtime.onTerminalConnected({
      terminalId: 'terminal-1',
      cwd: 'C:\\repo',
      createdAt: 500,
      isNew: true,
      prepared
    })
    expect(() => h.runtime.onHostDisconnected()).not.toThrow()
    h.runtime.onTerminalActivity('terminal-1')
    h.runtime.onTerminalExit('terminal-1')
    h.runtime.dispose()
    expect(h.sessions.setAgentSessionRef).not.toHaveBeenCalled()
  })
})
