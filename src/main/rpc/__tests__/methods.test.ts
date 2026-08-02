import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RpcError } from '../errors'
import type { RpcContext, RpcMethod } from '../core'

const mocks = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
  resolveGitRepo: vi.fn(),
  app: { isPackaged: true }
}))

vi.mock('electron', () => ({
  app: mocks.app,
  dialog: { showOpenDialog: mocks.showOpenDialog }
}))
vi.mock('../../git/validate', () => ({ resolveGitRepo: mocks.resolveGitRepo }))

import { buildRegistry } from '../methods'

function repositories() {
  return {
    tasks: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      setPinned: vi.fn(),
      touch: vi.fn(),
      delete: vi.fn(),
      setProject: vi.fn(),
      get: vi.fn()
    },
    projects: {
      list: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      getByPathKey: vi.fn()
    },
    sessions: {
      createFromTask: vi.fn(),
      listByTask: vi.fn(),
      listByProject: vi.fn(),
      touch: vi.fn()
    }
  }
}

function context(
  repos = repositories(),
  sender: RpcContext['sender'] = null
): RpcContext {
  return {
    repositories: repos as unknown as RpcContext['repositories'],
    agentRegistry: {
      catalog: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockReturnValue({})
    } as unknown as RpcContext['agentRegistry'],
    sender
  }
}

async function call(name: string, params: unknown, ctx: RpcContext): Promise<unknown> {
  const registered = buildRegistry().get(name) as RpcMethod | undefined
  if (registered === undefined) throw new Error(`missing method ${name}`)
  return registered.handler(registered.params.parse(params), ctx)
}

describe('RPC method registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.app.isPackaged = true
    delete process.env['DEVSTATION_E2E']
    delete process.env['DEVSTATION_E2E_PROJECT_PATH']
  })

  afterEach(() => {
    delete process.env['DEVSTATION_E2E']
    delete process.env['DEVSTATION_E2E_PROJECT_PATH']
  })

  it('registers the complete public RPC whitelist', () => {
    const registry = buildRegistry()
    const names = [
      'agents.list',
      'tasks.list',
      'tasks.create',
      'tasks.update',
      'tasks.setPinned',
      'tasks.touch',
      'tasks.delete',
      'tasks.setProject',
      'projects.pickDirectory',
      'projects.list',
      'projects.create',
      'projects.delete',
      'sessions.createFromTask',
      'sessions.listByTask',
      'sessions.listByProject',
      'sessions.touch'
    ]
    expect(names.every((name) => registry.has(name))).toBe(true)
  })

  it('validates strict schemas and field limits before repository access', async () => {
    const ctx = context()
    await expect(call('tasks.create', { title: '', extra: true }, ctx)).rejects.toThrow()
    await expect(call('tasks.create', { title: 'x'.repeat(201) }, ctx)).rejects.toThrow()
    await expect(
      call('tasks.update', { id: '1', status: 'invalid' }, ctx)
    ).rejects.toThrow()
    await expect(
      call('projects.create', { name: 'p', path: 'x'.repeat(1025) }, ctx)
    ).rejects.toThrow()
    await expect(
      call('sessions.createFromTask', { taskId: 't1', agentId: 'Bad Agent' }, ctx)
    ).rejects.toThrow()
  })

  it('returns the provider-neutral Agent catalog', async () => {
    const ctx = context()
    const catalog = [{ descriptor: { id: 'chrys' } }]
    vi.mocked(ctx.agentRegistry.catalog).mockReturnValue(
      catalog as ReturnType<RpcContext['agentRegistry']['catalog']>
    )

    await expect(call('agents.list', {}, ctx)).resolves.toEqual(catalog)
    expect(ctx.agentRegistry.catalog).toHaveBeenCalledOnce()
  })

  it('delegates every task operation with normalized parameters', async () => {
    const repos = repositories()
    const ctx = context(repos)
    repos.tasks.list.mockReturnValue(['listed'])
    repos.tasks.create.mockReturnValue('created')
    repos.tasks.update.mockReturnValue('updated')
    repos.tasks.setPinned.mockReturnValue('pinned')
    repos.tasks.touch.mockReturnValue('touched')
    repos.tasks.setProject.mockReturnValue('linked')

    await expect(call('tasks.list', { keyword: 'bug' }, ctx)).resolves.toEqual(['listed'])
    await expect(call('tasks.create', { title: 'T' }, ctx)).resolves.toBe('created')
    await expect(call('tasks.update', { id: 't1', status: 'done' }, ctx)).resolves.toBe(
      'updated'
    )
    await expect(call('tasks.setPinned', { id: 't1', pinned: true }, ctx)).resolves.toBe(
      'pinned'
    )
    await expect(call('tasks.touch', { id: 't1' }, ctx)).resolves.toBe('touched')
    await expect(call('tasks.delete', { id: 't1' }, ctx)).resolves.toEqual({ ok: true })
    await expect(call('tasks.setProject', { id: 't1' }, ctx)).resolves.toBe('linked')

    expect(repos.tasks.list).toHaveBeenCalledWith({ keyword: 'bug' })
    expect(repos.tasks.create).toHaveBeenCalledWith({ title: 'T', description: '' })
    expect(repos.tasks.setPinned).toHaveBeenCalledWith('t1', true)
    expect(repos.tasks.delete).toHaveBeenCalledWith('t1')
    expect(repos.tasks.setProject).toHaveBeenCalledWith('t1', null)
  })

  it('handles directory selection cancellation, missing sender and success', async () => {
    const sender = {} as RpcContext['sender']
    await expect(
      call('projects.pickDirectory', {}, context(repositories()))
    ).resolves.toBeNull()

    mocks.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    await expect(
      call('projects.pickDirectory', {}, context(repositories(), sender))
    ).resolves.toBeNull()

    mocks.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['D:\\repo']
    })
    await expect(
      call('projects.pickDirectory', {}, context(repositories(), sender))
    ).resolves.toEqual({ path: 'D:\\repo' })
  })

  it('uses the isolated E2E project path only in unpackaged test mode', async () => {
    mocks.app.isPackaged = false
    process.env['DEVSTATION_E2E'] = '1'
    process.env['DEVSTATION_E2E_PROJECT_PATH'] = 'D:\\fixture'
    await expect(call('projects.pickDirectory', {}, context())).resolves.toEqual({
      path: 'D:\\fixture'
    })
    expect(mocks.showOpenDialog).not.toHaveBeenCalled()
  })

  it('creates canonical projects and rejects duplicate paths', async () => {
    const repos = repositories()
    const ctx = context(repos)
    mocks.resolveGitRepo.mockResolvedValue({
      path: 'D:\\code\\real-name',
      pathKey: 'key'
    })
    repos.projects.getByPathKey.mockReturnValue(null)
    repos.projects.create.mockReturnValue('project')

    await expect(
      call('projects.create', { name: 'chosen-name', path: 'D:\\code\\real-name' }, ctx)
    ).resolves.toBe('project')
    expect(repos.projects.create).toHaveBeenCalledWith({
      name: 'real-name',
      path: 'D:\\code\\real-name',
      pathKey: 'key'
    })

    repos.projects.getByPathKey.mockReturnValue({ id: 'existing' })
    await expect(
      call('projects.create', { name: 'p', path: 'D:\\code\\real-name' }, ctx)
    ).rejects.toMatchObject({ code: 'CONFLICT' })
  })

  it('preserves safe Git errors and masks unexpected validator failures', async () => {
    const ctx = context()
    mocks.resolveGitRepo.mockRejectedValueOnce(
      new RpcError('NOT_GIT_REPOSITORY', '不是仓库')
    )
    await expect(
      call('projects.create', { name: 'p', path: 'D:\\x' }, ctx)
    ).rejects.toMatchObject({ code: 'NOT_GIT_REPOSITORY' })

    mocks.resolveGitRepo.mockRejectedValueOnce(new Error('secret path'))
    await expect(
      call('projects.create', { name: 'p', path: 'D:\\x' }, ctx)
    ).rejects.toMatchObject({ code: 'INVALID_PATH', message: '无法校验该路径' })
  })

  it('delegates project lists/deletes and all session operations', async () => {
    const repos = repositories()
    const ctx = context(repos)
    repos.projects.list.mockReturnValue(['project'])
    repos.sessions.createFromTask.mockReturnValue('session')
    repos.sessions.listByTask.mockReturnValue(['task-session'])
    repos.sessions.listByProject.mockReturnValue(['project-session'])
    repos.sessions.touch.mockReturnValue('touched')
    repos.tasks.get.mockReturnValue({ id: 't1' })

    await expect(call('projects.list', {}, ctx)).resolves.toEqual(['project'])
    await expect(call('projects.delete', { id: 'p1' }, ctx)).resolves.toEqual({
      ok: true
    })
    await expect(call('sessions.createFromTask', { taskId: 't1' }, ctx)).resolves.toBe(
      'session'
    )
    await expect(
      call('sessions.createFromTask', { taskId: 't1', agentId: 'chrys' }, ctx)
    ).resolves.toBe('session')
    await expect(call('sessions.listByTask', { taskId: 't1' }, ctx)).resolves.toEqual([
      'task-session'
    ])
    await expect(
      call('sessions.listByProject', { projectId: 'p1' }, ctx)
    ).resolves.toEqual(['project-session'])
    await expect(call('sessions.touch', { id: 's1' }, ctx)).resolves.toBe('touched')
    expect(repos.projects.delete).toHaveBeenCalledWith('p1')
    expect(repos.sessions.createFromTask).toHaveBeenNthCalledWith(1, 't1', 'opencode')
    expect(repos.sessions.createFromTask).toHaveBeenNthCalledWith(2, 't1', 'chrys')
  })

  it('rejects session creation when its task no longer exists', async () => {
    const repos = repositories()
    repos.tasks.get.mockReturnValue(null)
    await expect(
      call('sessions.createFromTask', { taskId: 'missing' }, context(repos))
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(repos.sessions.createFromTask).not.toHaveBeenCalled()
  })

  it('rejects session creation for an unregistered Agent', async () => {
    const repos = repositories()
    const ctx = context(repos)
    repos.tasks.get.mockReturnValue({ id: 't1' })
    vi.mocked(ctx.agentRegistry.get).mockReturnValue(null)

    await expect(
      call('sessions.createFromTask', { taskId: 't1', agentId: 'missing' }, ctx)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    expect(repos.sessions.createFromTask).not.toHaveBeenCalled()
  })
})
