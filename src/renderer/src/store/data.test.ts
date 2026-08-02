// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project, Session, Task } from '@shared/domain'
import type { AgentCatalogEntry } from '@shared/agent'
import type { RpcResponse } from '@shared/rpc'

const invoke = vi.fn()
Object.defineProperty(window, 'devstation', {
  configurable: true,
  value: { rpc: { invoke } }
})

const { useDataStore } = await import('./data')

const task = (id: string, patch: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  description: '',
  status: 'todo',
  projectId: null,
  branch: '',
  sortOrder: 0,
  pinned: false,
  lastOpenedAt: null,
  createdAt: 1,
  updatedAt: 1,
  ...patch
})

const project = (id: string): Project => ({
  id,
  name: `Project ${id}`,
  path: `D:\\${id}`,
  pathKey: `d:/${id}`,
  repoUrl: '',
  createdAt: 1,
  updatedAt: 1
})

const agent = (id: string): AgentCatalogEntry => ({
  descriptor: {
    id,
    label: id === 'chrys' ? 'Chrys' : 'OpenCode',
    description: '',
    capabilities: {
      resume: true,
      sessionIdentity: true,
      activityEvents: true,
      transcript: false
    },
    settings: { version: 1, fields: [], actions: [] },
    setupSteps: []
  }
})

const session = (id: string, patch: Partial<Session> = {}): Session => ({
  id,
  taskId: 't1',
  projectId: null,
  title: `Session ${id}`,
  status: 'unknown',
  agentId: 'opencode',
  agentSessionRef: null,
  agentRunId: null,
  statusSource: 'none',
  statusUpdatedAt: null,
  lastOpenedAt: null,
  createdAt: 1,
  updatedAt: 1,
  ...patch
})

const ok = <T>(result: T): RpcResponse<T> => ({ ok: true, result })
const fail = (code = 'INTERNAL', message = '失败'): RpcResponse<never> => ({
  ok: false,
  error: { code: code as 'INTERNAL', message }
})

function resetStore(): void {
  useDataStore.setState({
    agents: [],
    tasks: [],
    projects: [],
    sessionsByTask: {},
    sessionsByProject: {},
    loading: false,
    error: null
  })
}

describe('renderer data store', () => {
  beforeEach(() => {
    invoke.mockReset()
    resetStore()
  })

  it('loads tasks and projects together and clears loading', async () => {
    invoke.mockImplementation(async (method: string) => {
      if (method === 'tasks.list') return ok([task('t1')])
      if (method === 'projects.list') return ok([project('p1')])
      return ok([agent('chrys')])
    })
    await useDataStore.getState().loadAll()
    expect(useDataStore.getState()).toMatchObject({
      tasks: [task('t1')],
      projects: [project('p1')],
      agents: [agent('chrys')],
      loading: false,
      error: null
    })
  })

  it('does not let a slow Agent probe replay an older project snapshot over a user mutation', async () => {
    let finishAgentProbe!: (value: RpcResponse<AgentCatalogEntry[]>) => void
    const slowAgentProbe = new Promise<RpcResponse<AgentCatalogEntry[]>>((resolve) => {
      finishAgentProbe = resolve
    })
    const created = project('new')
    let projectReads = 0
    invoke.mockImplementation(async (method: string) => {
      if (method === 'tasks.list') return ok([])
      if (method === 'agents.list') return slowAgentProbe
      if (method === 'projects.create') return ok(created)
      if (method === 'projects.list') {
        projectReads += 1
        return ok(projectReads === 1 ? [] : [created])
      }
      return ok(null)
    })

    const initialLoad = useDataStore.getState().loadAll()
    await vi.waitFor(() => expect(projectReads).toBe(1))
    await expect(
      useDataStore.getState().createProject(created.name, created.path)
    ).resolves.toEqual(created)
    finishAgentProbe(ok([agent('opencode')]))
    await initialLoad

    expect(useDataStore.getState().projects).toEqual([created])
  })

  it('loads the Agent catalog and preserves the last usable catalog on failure', async () => {
    invoke.mockResolvedValueOnce(ok([agent('opencode'), agent('chrys')]))
    await expect(useDataStore.getState().loadAgents()).resolves.toEqual([
      agent('opencode'),
      agent('chrys')
    ])
    expect(invoke).toHaveBeenCalledWith('agents.list', {})

    invoke.mockResolvedValueOnce(fail('INTERNAL', 'Agent 检测失败'))
    await expect(useDataStore.getState().loadAgents()).resolves.toEqual([
      agent('opencode'),
      agent('chrys')
    ])
    expect(useDataStore.getState().error).toBe('Agent 检测失败')
  })

  it('surfaces load failures without leaving the spinner active', async () => {
    invoke.mockResolvedValue(fail('INTERNAL', '数据库不可用'))
    await useDataStore.getState().loadAll()
    expect(useDataStore.getState()).toMatchObject({
      loading: false,
      error: '数据库不可用'
    })
  })

  it('loads filtered tasks and preserves the previous list on failure', async () => {
    invoke.mockResolvedValueOnce(ok([task('done', { status: 'done' })]))
    await expect(
      useDataStore.getState().loadTasks({ status: 'done' })
    ).resolves.toHaveLength(1)
    expect(invoke).toHaveBeenCalledWith('tasks.list', { status: 'done' })

    invoke.mockResolvedValueOnce(fail('INTERNAL', '读取失败'))
    await expect(useDataStore.getState().loadTasks()).resolves.toHaveLength(1)
    expect(useDataStore.getState().error).toBe('读取失败')
  })

  it('creates, updates, pins, deletes and associates tasks then refreshes the list', async () => {
    const created = task('t1')
    const updated = task('t1', { title: 'Updated' })
    const pinned = task('t1', { pinned: true })
    const linked = task('t1', { projectId: 'p1' })
    const results: Record<string, unknown> = {
      'tasks.create': created,
      'tasks.update': updated,
      'tasks.setPinned': pinned,
      'tasks.delete': { ok: true },
      'tasks.setProject': linked,
      'tasks.list': [linked]
    }
    invoke.mockImplementation(async (method: string) => ok(results[method]))

    await expect(useDataStore.getState().createTask('Task t1')).resolves.toEqual(created)
    await expect(
      useDataStore.getState().updateTask('t1', { title: 'Updated' })
    ).resolves.toEqual(updated)
    await expect(useDataStore.getState().setTaskPinned('t1', true)).resolves.toEqual(
      pinned
    )
    await expect(useDataStore.getState().setTaskProject('t1', 'p1')).resolves.toEqual(
      linked
    )
    await expect(useDataStore.getState().deleteTask('t1')).resolves.toBe(true)
    expect(invoke).toHaveBeenCalledWith('tasks.setProject', { id: 't1', projectId: 'p1' })
    expect(invoke.mock.calls.filter(([method]) => method === 'tasks.list')).toHaveLength(
      5
    )
  })

  it('returns safe failure values for every task mutation', async () => {
    invoke.mockResolvedValue(fail('INTERNAL', '写入失败'))
    await expect(useDataStore.getState().createTask('x')).resolves.toBeNull()
    await expect(useDataStore.getState().updateTask('t1', {})).resolves.toBeNull()
    await expect(useDataStore.getState().setTaskPinned('t1', true)).resolves.toBeNull()
    await expect(useDataStore.getState().setTaskProject('t1', null)).resolves.toBeNull()
    await expect(useDataStore.getState().deleteTask('t1')).resolves.toBe(false)
    expect(useDataStore.getState().error).toBe('写入失败')
  })

  it('touches a task locally and restores canonical ordering', async () => {
    const pinned = task('pinned', { pinned: true })
    const recent = task('recent', { lastOpenedAt: 40 })
    const ordered = task('ordered', { sortOrder: 1, updatedAt: 1 })
    const older = task('old', { sortOrder: 2, updatedAt: 10 })
    const touched = task('new', { lastOpenedAt: 50, updatedAt: 1 })
    useDataStore.setState({ tasks: [older, ordered, recent, pinned, task('new')] })
    invoke.mockResolvedValue(ok(touched))
    await useDataStore.getState().touchTask('new')
    expect(useDataStore.getState().tasks.map(({ id }) => id)).toEqual([
      'pinned',
      'new',
      'recent',
      'ordered',
      'old'
    ])

    invoke.mockResolvedValue(fail('INTERNAL', 'touch 失败'))
    await useDataStore.getState().touchTask('new')
    expect(useDataStore.getState().error).toBe('touch 失败')
  })

  it('loads, chooses, creates and deletes projects with error recovery', async () => {
    invoke.mockResolvedValueOnce(ok([project('p1')]))
    await expect(useDataStore.getState().loadProjects()).resolves.toHaveLength(1)
    invoke.mockResolvedValueOnce(ok({ path: 'D:\\repo' }))
    await expect(useDataStore.getState().pickDirectory()).resolves.toBe('D:\\repo')
    invoke.mockResolvedValueOnce(ok(null))
    await expect(useDataStore.getState().pickDirectory()).resolves.toBeNull()

    invoke
      .mockResolvedValueOnce(ok(project('p2')))
      .mockResolvedValueOnce(ok([project('p1'), project('p2')]))
    await expect(useDataStore.getState().createProject('P2', 'D:\\p2')).resolves.toEqual(
      project('p2')
    )
    invoke.mockResolvedValueOnce(ok({ ok: true })).mockResolvedValueOnce(ok([]))
    await expect(useDataStore.getState().deleteProject('p1')).resolves.toBe(true)

    invoke.mockResolvedValue(fail('INTERNAL', '项目失败'))
    await expect(useDataStore.getState().loadProjects()).resolves.toEqual([])
    await expect(useDataStore.getState().pickDirectory()).resolves.toBeNull()
    await expect(useDataStore.getState().createProject('P', 'D:\\p')).resolves.toBeNull()
    await expect(useDataStore.getState().deleteProject('p')).resolves.toBe(false)
  })

  it('loads sessions into task and project caches', async () => {
    invoke
      .mockResolvedValueOnce(ok([session('s1')]))
      .mockResolvedValueOnce(ok([session('s2', { projectId: 'p1' })]))
    await useDataStore.getState().loadSessionsByTask('t1')
    await useDataStore.getState().loadSessionsByProject('p1')
    expect(useDataStore.getState().sessionsByTask.t1).toHaveLength(1)
    expect(useDataStore.getState().sessionsByProject.p1).toHaveLength(1)
  })

  it('creates a session and refreshes all already-loaded relevant caches', async () => {
    const created = session('s1', { projectId: 'p1' })
    useDataStore.setState({ sessionsByProject: { p1: [] } })
    invoke
      .mockResolvedValueOnce(ok(created))
      .mockResolvedValueOnce(ok([created]))
      .mockResolvedValueOnce(ok([created]))
    await expect(
      useDataStore.getState().createSessionFromTask('t1', 'chrys')
    ).resolves.toEqual(created)
    expect(invoke).toHaveBeenCalledWith('sessions.createFromTask', {
      taskId: 't1',
      agentId: 'chrys'
    })
    expect(useDataStore.getState().sessionsByTask.t1).toEqual([created])
    expect(useDataStore.getState().sessionsByProject.p1).toEqual([created])

    invoke.mockResolvedValue(fail('INTERNAL', '会话失败'))
    await expect(useDataStore.getState().createSessionFromTask('t1')).resolves.toBeNull()
    expect(useDataStore.getState().error).toBe('会话失败')
  })

  it('touches and sorts a session in every cache, and reports failures', async () => {
    const first = session('s1', { createdAt: 10 })
    const touched = session('s2', { lastOpenedAt: 100 })
    useDataStore.setState({
      sessionsByTask: { t1: [first, session('s2')] },
      sessionsByProject: { p1: [first, session('s2')] }
    })
    invoke.mockResolvedValueOnce(ok(touched))
    await useDataStore.getState().touchSession('s2')
    expect(useDataStore.getState().sessionsByTask.t1[0]).toEqual(touched)
    expect(useDataStore.getState().sessionsByProject.p1[0]).toEqual(touched)

    invoke.mockResolvedValueOnce(fail('INTERNAL', '打开失败'))
    await useDataStore.getState().touchSession('s2')
    expect(useDataStore.getState().error).toBe('打开失败')
  })

  it('applies an Agent session snapshot to every loaded cache', () => {
    const untouched = session('s1')
    const original = session('s2', { projectId: 'p1' })
    const updated = session('s2', {
      projectId: 'p1',
      status: 'waiting',
      statusSource: 'provider-event',
      statusUpdatedAt: 100
    })
    useDataStore.setState({
      sessionsByTask: { t1: [untouched, original] },
      sessionsByProject: { p1: [original] }
    })

    useDataStore.getState().applySessionUpdate(updated)

    expect(useDataStore.getState().sessionsByTask.t1).toEqual([untouched, updated])
    expect(useDataStore.getState().sessionsByProject.p1).toEqual([updated])
  })

  it('maps RPC errors and unknown exceptions to safe user messages', () => {
    expect(
      useDataStore.getState().errorMessage({ code: 'CONFLICT', message: '重复' })
    ).toBe('重复')
    expect(useDataStore.getState().errorMessage(new Error('secret'))).toBe(
      '操作失败，请重试'
    )
  })
})
