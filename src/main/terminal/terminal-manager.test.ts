import { beforeEach, describe, expect, it, vi } from 'vitest'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Project, Session } from '@shared/domain'
import type {
  HostCreateOrAttachRequest,
  HostSessionResult
} from './terminal-host-protocol'

type InvokeHandler = (event: FakeEvent, ...args: never[]) => unknown
type HostData = { sessionId: string; data: string }
type HostExit = {
  sessionId: string
  exitCode: number
  signal?: number
  reason: 'exited' | 'stopped'
}
type HostState = { state: 'connected' | 'disconnected'; message?: string }

interface FakeSender {
  id: number
  isDestroyed: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
}

interface FakeEvent {
  sender: FakeSender
}

const ipc = vi.hoisted(() => ({
  handlers: new Map<string, InvokeHandler>(),
  handle: vi.fn((channel: string, handler: InvokeHandler) =>
    ipc.handlers.set(channel, handler)
  )
}))

vi.mock('electron', () => ({ ipcMain: { handle: ipc.handle } }))

import { TerminalManager } from './terminal-manager'

function project(id = 'project-1'): Project {
  return {
    id,
    name: 'DevStation',
    path: process.cwd(),
    pathKey: process.cwd().toLowerCase(),
    repoUrl: '',
    createdAt: 1,
    updatedAt: 1
  }
}

function session(agentSessionId: string | null = null): Session {
  return {
    id: 'session-1',
    taskId: 'task-1',
    projectId: 'project-1',
    title: 'Agent work',
    status: 'idle',
    agentType: 'opencode',
    agentSessionId,
    lastOpenedAt: null,
    createdAt: 1,
    updatedAt: 1
  }
}

function sender(id: number): FakeEvent {
  return { sender: { id, isDestroyed: vi.fn(() => false), send: vi.fn() } }
}

function result(id: string, isNew = true): HostSessionResult {
  return {
    id,
    pid: 321,
    cwd: process.cwd(),
    shell: 'powershell.exe',
    createdAt: 10_000,
    isNew,
    snapshot: 'existing output'
  }
}

function createHarness(options?: {
  projectValue?: Project | null
  sessionValue?: Session | null
  hostResult?: HostSessionResult
}) {
  let dataListener: ((payload: HostData) => void) | undefined
  let exitListener: ((payload: HostExit) => void) | undefined
  let stateListener: ((payload: HostState) => void) | undefined
  const host = {
    createOrAttach: vi.fn(
      async (request: HostCreateOrAttachRequest) =>
        options?.hostResult ?? result(request.sessionId)
    ),
    write: vi.fn(async () => undefined),
    resize: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    shutdown: vi.fn(async () => undefined),
    diagnostics: vi.fn(async () => ({
      protocolVersion: 1,
      processId: 9001,
      startedAt: 5_000,
      sessions: []
    })),
    dispose: vi.fn(),
    on: vi.fn((name: string, listener: (payload: never) => void) => {
      if (name === 'data') dataListener = listener as (payload: HostData) => void
      else if (name === 'exit') exitListener = listener as (payload: HostExit) => void
      else stateListener = listener as (payload: HostState) => void
    })
  }
  const repositories = {
    projects: {
      get: vi.fn(() =>
        options !== undefined && 'projectValue' in options
          ? (options.projectValue ?? null)
          : project()
      )
    },
    sessions: {
      get: vi.fn(() =>
        options !== undefined && 'sessionValue' in options
          ? (options.sessionValue ?? null)
          : session()
      ),
      setAgentSession: vi.fn(() => session('ses_discovered'))
    }
  }
  const openCodeSessions = {
    snapshot: vi.fn(() => new Set(['ses_before'])),
    findCreatedSession: vi.fn((): string | null => null)
  }
  const manager = new TerminalManager({ host, repositories, openCodeSessions })
  manager.registerIpc()
  return {
    manager,
    host,
    repositories,
    openCodeSessions,
    emitData: (payload: HostData) => dataListener?.(payload),
    emitExit: (payload: HostExit) => exitListener?.(payload),
    emitState: (payload: HostState) => stateListener?.(payload)
  }
}

async function invoke(
  channel: string,
  event: FakeEvent,
  ...args: unknown[]
): Promise<unknown> {
  const handler = ipc.handlers.get(channel)
  if (handler === undefined) throw new Error(`handler not registered: ${channel}`)
  return await handler(event, ...(args as never[]))
}

describe('TerminalManager', () => {
  beforeEach(() => {
    ipc.handlers.clear()
    ipc.handle.mockClear()
  })

  it('resolves a project workspace in Main and forwards owned I/O', async () => {
    const harness = createHarness()
    const owner = sender(7)
    const connected = (await invoke('terminal:connect', owner, {
      context: { type: 'workspace', projectId: 'project-1' },
      cols: 100,
      rows: 30
    })) as HostSessionResult

    expect(connected).toMatchObject({ id: 'project:project-1:shell', pid: 321 })
    expect(harness.host.createOrAttach).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'project:project-1:shell',
        cwd: process.cwd(),
        cols: 100,
        rows: 30
      })
    )
    await invoke('terminal:write', owner, connected.id, 'Get-Location\r')
    await invoke('terminal:resize', owner, connected.id, 120, 40)
    expect(harness.host.write).toHaveBeenCalledWith(connected.id, 'Get-Location\r')
    expect(harness.host.resize).toHaveBeenCalledWith(connected.id, 120, 40)

    harness.emitData({ sessionId: connected.id, data: 'output' })
    expect(owner.sender.send).toHaveBeenCalledWith('terminal:data', {
      sessionId: connected.id,
      data: 'output'
    })
  })

  it('starts the default workspace in the user home directory', async () => {
    const harness = createHarness()

    await invoke('terminal:connect', sender(7), {
      context: { type: 'workspace', projectId: null },
      cols: 80,
      rows: 24
    })

    expect(harness.host.createOrAttach).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'workspace:default',
        cwd: homedir()
      })
    )
  })

  it('starts OpenCode for a new DevStation session and records its native id', async () => {
    vi.useFakeTimers()
    const harness = createHarness()
    harness.openCodeSessions.findCreatedSession.mockReturnValue('ses_created')
    const owner = sender(1)
    const connected = (await invoke('terminal:connect', owner, {
      context: { type: 'session', sessionId: 'session-1' },
      cols: 80,
      rows: 24
    })) as HostSessionResult

    expect(harness.host.createOrAttach).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session:session-1',
        startupCommand: 'opencode'
      })
    )
    expect(connected).toMatchObject({ agentType: 'opencode', agentResumed: false })
    harness.emitData({ sessionId: connected.id, data: 'OpenCode' })
    await vi.advanceTimersByTimeAsync(250)
    expect(harness.openCodeSessions.findCreatedSession).toHaveBeenCalledWith(
      process.cwd(),
      10_000,
      new Set(['ses_before'])
    )
    expect(harness.repositories.sessions.setAgentSession).toHaveBeenCalledWith(
      'session-1',
      'ses_created'
    )
    vi.useRealTimers()
  })

  it('uses OpenCode native resume only when a dead PTY must be recreated', async () => {
    const harness = createHarness({ sessionValue: session('ses_native-1') })
    const connected = await invoke('terminal:connect', sender(1), {
      context: { type: 'session', sessionId: 'session-1' },
      cols: 80,
      rows: 24
    })

    expect(harness.host.createOrAttach).toHaveBeenCalledWith(
      expect.objectContaining({ startupCommand: 'opencode --session ses_native-1' })
    )
    expect(connected).toMatchObject({ agentResumed: true })

    const attachedHarness = createHarness({
      sessionValue: session('ses_native-1'),
      hostResult: result('session:session-1', false)
    })
    const attached = await invoke('terminal:connect', sender(2), {
      context: { type: 'session', sessionId: 'session-1' },
      cols: 80,
      rows: 24
    })
    expect(attached).toMatchObject({ isNew: false, agentResumed: false })
    expect(attachedHarness.host.close).not.toHaveBeenCalled()
  })

  it('detach and window destruction preserve the hosted PTY; explicit close stops it', async () => {
    const harness = createHarness()
    const owner = sender(1)
    const destroyed: Array<() => void> = []
    harness.manager.watch({
      id: 1,
      once: (_event: string, listener: () => void) => destroyed.push(listener)
    } as never)
    const connected = (await invoke('terminal:connect', owner, {
      context: { type: 'workspace', projectId: null },
      cols: 80,
      rows: 24
    })) as HostSessionResult

    await invoke('terminal:disconnect', owner, connected.id)
    expect(harness.host.close).not.toHaveBeenCalled()
    await expect(invoke('terminal:write', owner, connected.id, 'late')).rejects.toThrow(
      'Terminal session not found'
    )

    await invoke('terminal:connect', owner, {
      context: { type: 'workspace', projectId: null },
      cols: 80,
      rows: 24
    })
    destroyed[0]()
    expect(harness.host.close).not.toHaveBeenCalled()

    const newOwner = sender(2)
    await invoke('terminal:connect', newOwner, {
      context: { type: 'workspace', projectId: null },
      cols: 80,
      rows: 24
    })
    await invoke('terminal:close', newOwner, connected.id)
    expect(harness.host.close).toHaveBeenCalledWith(connected.id)
    harness.emitExit({ sessionId: connected.id, exitCode: 0, reason: 'stopped' })
    expect(newOwner.sender.send).toHaveBeenCalledWith('terminal:exit', {
      sessionId: connected.id,
      exitCode: 0,
      reason: 'stopped'
    })
    await expect(
      invoke('terminal:write', newOwner, connected.id, 'after exit')
    ).rejects.toThrow('Terminal session not found')
  })

  it('rejects invalid contexts, missing domain records and cross-window access', async () => {
    const owner = sender(1)
    createHarness()
    await expect(invoke('terminal:connect', owner, null)).rejects.toThrow(
      'Invalid terminal request'
    )
    await expect(
      invoke('terminal:connect', owner, {
        context: { type: 'other' },
        cols: 80,
        rows: 24
      })
    ).rejects.toThrow('Unsupported terminal context')
    await expect(
      invoke('terminal:connect', owner, {
        context: { type: 'workspace', projectId: 'project-1' },
        cols: 1,
        rows: 24
      })
    ).rejects.toThrow(/cols must be an integer/)

    const connected = (await invoke('terminal:connect', owner, {
      context: { type: 'workspace', projectId: null },
      cols: 80,
      rows: 24
    })) as HostSessionResult
    await expect(
      invoke('terminal:write', sender(2), connected.id, 'steal')
    ).rejects.toThrow('Terminal session not found')
    await expect(invoke('terminal:write', owner, connected.id, 123)).rejects.toThrow(
      'Invalid terminal input'
    )

    const noProject = createHarness({ projectValue: null })
    await expect(
      invoke('terminal:connect', owner, {
        context: { type: 'workspace', projectId: 'missing' },
        cols: 80,
        rows: 24
      })
    ).rejects.toThrow('Project not found')
    noProject.manager.dispose()
  })

  it('routes exit only to live owners and disconnects from the host on dispose', async () => {
    const harness = createHarness()
    const owner = sender(1)
    const connected = (await invoke('terminal:connect', owner, {
      context: { type: 'workspace', projectId: null },
      cols: 80,
      rows: 24
    })) as HostSessionResult
    owner.sender.isDestroyed.mockReturnValue(true)
    harness.emitExit({ sessionId: connected.id, exitCode: 0, reason: 'exited' })
    expect(owner.sender.send).not.toHaveBeenCalled()
    await harness.manager.shutdownHost()
    expect(harness.host.shutdown).toHaveBeenCalledOnce()
    harness.manager.dispose()
    expect(harness.host.dispose).toHaveBeenCalledOnce()
    expect(harness.host.close).not.toHaveBeenCalled()
  })

  it('invalidates renderer ownership and reports a detached host connection', async () => {
    const harness = createHarness()
    const owner = sender(1)
    const connected = (await invoke('terminal:connect', owner, {
      context: { type: 'session', sessionId: 'session-1' },
      cols: 80,
      rows: 24
    })) as HostSessionResult

    harness.emitState({ state: 'connected' })
    expect(owner.sender.send).not.toHaveBeenCalledWith(
      'terminal:host-state',
      expect.anything()
    )
    harness.emitState({
      state: 'disconnected',
      message: 'Terminal host connection was lost'
    })
    expect(owner.sender.send).toHaveBeenCalledWith('terminal:host-state', {
      state: 'disconnected',
      message: 'Terminal host connection was lost'
    })
    await expect(
      invoke('terminal:write', owner, connected.id, 'stale owner')
    ).rejects.toThrow('Terminal session not found')
  })

  it('keeps ownership and discovery consistent across host and vendor failures', async () => {
    vi.useFakeTimers()
    const harness = createHarness()
    harness.openCodeSessions.snapshot.mockImplementation(() => {
      throw new Error('OpenCode DB is starting')
    })
    const owner = sender(1)
    const connected = (await invoke('terminal:connect', owner, {
      context: { type: 'session', sessionId: 'session-1' },
      cols: 80,
      rows: 24
    })) as HostSessionResult
    expect(harness.host.createOrAttach).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: connected.id })
    )
    harness.openCodeSessions.findCreatedSession.mockImplementation(() => {
      throw new Error('row not committed yet')
    })
    await vi.advanceTimersByTimeAsync(250)
    expect(harness.repositories.sessions.setAgentSession).not.toHaveBeenCalled()
    harness.emitExit({ sessionId: connected.id, exitCode: 1, reason: 'exited' })
    harness.manager.dispose()

    const failed = createHarness()
    failed.host.createOrAttach.mockRejectedValue(new Error('host unavailable'))
    await expect(
      invoke('terminal:connect', owner, {
        context: { type: 'workspace', projectId: null },
        cols: 80,
        rows: 24
      })
    ).rejects.toThrow('host unavailable')
    await expect(
      invoke('terminal:write', owner, 'workspace:default', 'no owner')
    ).rejects.toThrow('Terminal session not found')
    vi.useRealTimers()
  })

  it('rejects invalid session bindings and unavailable project directories', async () => {
    const owner = sender(1)
    const missingSession = createHarness({ sessionValue: null })
    await expect(
      invoke('terminal:connect', owner, {
        context: { type: 'session', sessionId: 'missing' },
        cols: 80,
        rows: 24
      })
    ).rejects.toThrow('Session not found')
    missingSession.manager.dispose()

    const unboundSession = createHarness({
      sessionValue: { ...session(), projectId: null }
    })
    await expect(
      invoke('terminal:connect', owner, {
        context: { type: 'session', sessionId: 'session-1' },
        cols: 80,
        rows: 24
      })
    ).rejects.toThrow('Session has no project directory')
    unboundSession.manager.dispose()

    const missingProject = createHarness({ sessionValue: session(), projectValue: null })
    await expect(
      invoke('terminal:connect', owner, {
        context: { type: 'session', sessionId: 'session-1' },
        cols: 80,
        rows: 24
      })
    ).rejects.toThrow('Session project not found')
    missingProject.manager.dispose()

    const fileProject = createHarness({
      projectValue: { ...project(), path: join(process.cwd(), 'package.json') }
    })
    await expect(
      invoke('terminal:connect', owner, {
        context: { type: 'workspace', projectId: 'project-1' },
        cols: 80,
        rows: 24
      })
    ).rejects.toThrow('Terminal working directory is unavailable')
    fileProject.manager.dispose()
  })

  it('validates context ids, dimensions and input size at the process boundary', async () => {
    const owner = sender(1)
    createHarness()
    await expect(
      invoke('terminal:connect', owner, { context: null, cols: 80, rows: 24 })
    ).rejects.toThrow('Invalid terminal context')
    await expect(
      invoke('terminal:connect', owner, {
        context: { type: 'session', sessionId: '' },
        cols: 80,
        rows: 24
      })
    ).rejects.toThrow('Invalid session id')
    await expect(
      invoke('terminal:connect', owner, {
        context: { type: 'workspace', projectId: null },
        cols: 80.5,
        rows: 24
      })
    ).rejects.toThrow(/cols must be an integer/)

    const connected = (await invoke('terminal:connect', owner, {
      context: { type: 'workspace', projectId: null },
      cols: 80,
      rows: 24
    })) as HostSessionResult
    await expect(
      invoke('terminal:write', owner, connected.id, 'x'.repeat(1024 * 1024 + 1))
    ).rejects.toThrow('Invalid terminal input')
  })

  it('preserves other attachments while one owner detaches or fails to attach', async () => {
    vi.useFakeTimers()
    const harness = createHarness({
      sessionValue: session(),
      hostResult: result('session:session-1', false)
    })
    harness.openCodeSessions.findCreatedSession.mockReturnValue(null)
    const first = sender(1)
    const second = sender(2)
    const destroyed: Array<() => void> = []
    harness.manager.watch({
      id: 1,
      once: (_event: string, listener: () => void) => destroyed.push(listener)
    } as never)
    await invoke('terminal:connect', first, {
      context: { type: 'session', sessionId: 'session-1' },
      cols: 80,
      rows: 24
    })
    await invoke('terminal:connect', second, {
      context: { type: 'session', sessionId: 'session-1' },
      cols: 80,
      rows: 24
    })
    await invoke('terminal:disconnect', first, 'session:session-1')
    harness.emitData({ sessionId: 'session:session-1', data: 'still live' })
    expect(second.sender.send).toHaveBeenCalledWith('terminal:data', {
      sessionId: 'session:session-1',
      data: 'still live'
    })
    destroyed[0]()
    await vi.advanceTimersByTimeAsync(250)
    expect(harness.repositories.sessions.setAgentSession).not.toHaveBeenCalled()
    harness.emitData({ sessionId: 'not-attached', data: 'ignored' })

    // A pending discovery timer is cancelled on app shutdown; the host PTY is not.
    harness.manager.dispose()
    expect(harness.host.close).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('reference-counts concurrent attaches from the same renderer', async () => {
    const harness = createHarness()
    const owner = sender(1)
    const request = {
      context: { type: 'workspace' as const, projectId: null },
      cols: 80,
      rows: 24
    }
    const connected = (await invoke(
      'terminal:connect',
      owner,
      request
    )) as HostSessionResult
    await invoke('terminal:connect', owner, request)

    await invoke('terminal:disconnect', owner, connected.id)
    await expect(
      invoke('terminal:write', owner, connected.id, 'still owned')
    ).resolves.toBe(undefined)
    await invoke('terminal:disconnect', owner, connected.id)
    await expect(
      invoke('terminal:write', owner, connected.id, 'detached')
    ).rejects.toThrow('Terminal session not found')
    await expect(
      invoke('terminal:disconnect', owner, connected.id)
    ).resolves.toBeUndefined()
    expect(harness.host.close).not.toHaveBeenCalled()
  })

  it('discovers a lazily created OpenCode session after later terminal activity', async () => {
    vi.useFakeTimers()
    const harness = createHarness()
    harness.openCodeSessions.findCreatedSession.mockReturnValue(null)
    const connected = (await invoke('terminal:connect', sender(1), {
      context: { type: 'session', sessionId: 'session-1' },
      cols: 80,
      rows: 24
    })) as HostSessionResult

    vi.setSystemTime(Date.now() + 31_000)
    await vi.advanceTimersByTimeAsync(250)
    harness.openCodeSessions.findCreatedSession.mockReturnValue('ses_after_prompt')
    harness.emitData({ sessionId: connected.id, data: 'first prompt rendered' })
    await vi.advanceTimersByTimeAsync(250)

    expect(harness.repositories.sessions.setAgentSession).toHaveBeenCalledWith(
      'session-1',
      'ses_after_prompt'
    )
    vi.useRealTimers()
  })
})
