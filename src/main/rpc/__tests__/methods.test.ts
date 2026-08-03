import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RpcError } from '../errors'
import type { RpcContext, RpcMethod } from '../core'
import type { AgentUserSettings } from '@shared/agent'

const mocks = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
  spawn: vi.fn(() => ({ unref: vi.fn() })),
  resolveGitRepo: vi.fn(),
  app: { isPackaged: true }
}))

vi.mock('electron', () => ({
  app: mocks.app,
  dialog: { showOpenDialog: mocks.showOpenDialog }
}))
vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
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
    },
    agentSettings: {
      effective: vi.fn((agentId: string): AgentUserSettings => ({
        agentId,
        enabled: true,
        integrationEnabled: true,
        executablePath: null,
        isDefault: agentId === 'opencode',
        schemaVersion: 1,
        values: {},
        updatedAt: null
      })),
      setExecutablePath: vi.fn(),
      setEnabled: vi.fn(),
      setIntegrationEnabled: vi.fn(),
      setDefault: vi.fn()
    },
    reviewComments: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
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
      probe: vi.fn().mockResolvedValue({ status: 'available' }),
      descriptors: vi.fn().mockReturnValue([
        { id: 'opencode', label: 'OpenCode' },
        { id: 'chrys', label: 'Chrys' }
      ]),
      get: vi.fn().mockReturnValue({}),
      require: vi.fn()
    } as unknown as RpcContext['agentRegistry'],
    agentSettings: {
      effective: vi.fn((agentId: string) => repos.agentSettings.effective(agentId)),
      setValue: vi.fn((agentId: string) => repos.agentSettings.effective(agentId))
    } as unknown as RpcContext['agentSettings'],
    gitWorkspace: {
      status: vi.fn(),
      diff: vi.fn(),
      files: vi.fn(),
      preview: vi.fn()
    } as unknown as RpcContext['gitWorkspace'],
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
      'agents.diagnostics',
      'agents.pickExecutable',
      'agents.clearExecutable',
      'agents.setEnabled',
      'agents.setDefault',
      'agents.setSetting',
      'agents.openLoginTerminal',
      'agents.integrationAction',
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
      'sessions.touch',
      'git.status',
      'git.diff',
      'git.files',
      'git.preview',
      'reviews.list',
      'reviews.create',
      'reviews.update',
      'reviews.delete'
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

  it('delegates read-only Git operations using session-scoped params', async () => {
    const ctx = context()
    vi.mocked(ctx.gitWorkspace.status).mockResolvedValue({ changes: [] } as never)
    vi.mocked(ctx.gitWorkspace.diff).mockResolvedValue({ kind: 'empty' } as never)
    vi.mocked(ctx.gitWorkspace.files).mockResolvedValue({
      directory: '',
      entries: [{ path: 'src', kind: 'directory' }]
    })
    vi.mocked(ctx.gitWorkspace.preview).mockResolvedValue({ kind: 'text' } as never)

    await expect(call('git.status', { sessionId: 's1' }, ctx)).resolves.toEqual({
      changes: []
    })
    await expect(
      call('git.diff', { sessionId: 's1', path: 'src/a.ts', area: 'staged' }, ctx)
    ).resolves.toEqual({ kind: 'empty' })
    await expect(call('git.files', { sessionId: 's1', path: '' }, ctx)).resolves.toEqual({
      directory: '',
      entries: [{ path: 'src', kind: 'directory' }]
    })
    await expect(
      call('git.preview', { sessionId: 's1', path: 'src/a.ts' }, ctx)
    ).resolves.toEqual({ kind: 'text' })
    expect(ctx.gitWorkspace.diff).toHaveBeenCalledWith('s1', 'src/a.ts', 'staged')
    expect(ctx.gitWorkspace.files).toHaveBeenCalledWith('s1', '')
    expect(ctx.gitWorkspace.preview).toHaveBeenCalledWith('s1', 'src/a.ts')
  })

  it('validates and owns local review comment CRUD by session', async () => {
    const repos = repositories()
    const ctx = context(repos)
    const comment = {
      id: 'r1',
      sessionId: 's1',
      path: 'src/a.ts',
      area: 'worktree',
      side: 'new',
      line: 3,
      lineContent: 'new line',
      body: 'review'
    }
    repos.reviewComments.list.mockReturnValue([comment])
    repos.reviewComments.create.mockReturnValue(comment)
    repos.reviewComments.get.mockReturnValue(comment)
    repos.reviewComments.update.mockReturnValue({ ...comment, body: 'updated' })

    await expect(
      call('reviews.list', { sessionId: 's1', path: 'src/a.ts', area: 'worktree' }, ctx)
    ).resolves.toEqual([comment])
    await expect(
      call(
        'reviews.create',
        {
          sessionId: 's1',
          path: 'src/a.ts',
          area: 'worktree',
          side: 'new',
          line: 3,
          lineContent: 'new line',
          body: ' review '
        },
        ctx
      )
    ).resolves.toEqual(comment)
    await expect(
      call('reviews.update', { sessionId: 's1', id: 'r1', body: 'updated' }, ctx)
    ).resolves.toMatchObject({ body: 'updated' })
    await expect(
      call('reviews.delete', { sessionId: 's1', id: 'r1' }, ctx)
    ).resolves.toEqual({ ok: true })

    repos.reviewComments.get.mockReturnValue({ ...comment, sessionId: 'other' })
    await expect(
      call('reviews.update', { sessionId: 's1', id: 'r1', body: 'updated' }, ctx)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    repos.reviewComments.get.mockReturnValue(null)
    await expect(
      call('reviews.delete', { sessionId: 's1', id: 'r1' }, ctx)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      call('reviews.create', { ...comment, path: '../secret', body: 'x' }, ctx)
    ).rejects.toBeTruthy()
  })

  it('lists only enabled and available Agents with the persisted default first', async () => {
    const repos = repositories()
    const ctx = context(repos)
    const catalog = ['opencode', 'chrys', 'offline', 'missing'].map((id) => ({
      descriptor: { id }
    }))
    vi.mocked(ctx.agentRegistry.catalog).mockReturnValue(catalog as never)
    repos.agentSettings.effective.mockImplementation(
      (agentId: string): AgentUserSettings => ({
        agentId,
        enabled: agentId !== 'missing',
        integrationEnabled: true,
        executablePath: agentId === 'chrys' ? 'D:\\chrys.exe' : null,
        isDefault: agentId === 'chrys',
        schemaVersion: 1,
        values: {},
        updatedAt: null
      })
    )
    vi.mocked(ctx.agentRegistry.probe).mockImplementation(async (agentId) => ({
      status: agentId === 'opencode' || agentId === 'chrys' ? 'available' : 'unavailable',
      executable: agentId,
      version: null,
      message: null
    }))

    await expect(call('agents.list', {}, ctx)).resolves.toEqual([
      { descriptor: { id: 'chrys' } },
      { descriptor: { id: 'opencode' } }
    ])
    expect(ctx.agentRegistry.probe).toHaveBeenCalledWith('chrys', 'D:\\chrys.exe')
    expect(ctx.agentRegistry.probe).not.toHaveBeenCalledWith('missing', undefined)
  })

  it('opens only an adapter-declared login command in a detached native terminal', async () => {
    const ctx = context()
    const adapter = {
      buildLogin: vi.fn(() => ({
        executable: 'D:\\tools\\opencode.exe',
        args: ['auth', 'login'],
        env: {}
      })),
      probe: vi.fn().mockResolvedValue({ status: 'available' })
    }
    vi.mocked(ctx.agentRegistry.get).mockReturnValue(adapter as never)

    await expect(
      call('agents.openLoginTerminal', { agentId: 'opencode' }, ctx)
    ).resolves.toEqual({ ok: true })
    expect(mocks.spawn).toHaveBeenCalledWith(
      'powershell.exe',
      ['-NoLogo', '-NoExit', '-Command', "& 'D:\\tools\\opencode.exe' 'auth' 'login'"],
      { detached: true, stdio: 'ignore', windowsHide: false }
    )
  })

  it('refuses login terminals for unknown, unsupported or unavailable adapters', async () => {
    const ctx = context()
    vi.mocked(ctx.agentRegistry.get).mockReturnValueOnce(null)
    await expect(
      call('agents.openLoginTerminal', { agentId: 'missing' }, ctx)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    vi.mocked(ctx.agentRegistry.get).mockReturnValueOnce({} as never)
    await expect(
      call('agents.openLoginTerminal', { agentId: 'plain' }, ctx)
    ).rejects.toMatchObject({ code: 'CONFLICT' })

    vi.mocked(ctx.agentRegistry.get).mockReturnValueOnce({
      buildLogin: vi.fn(() => ({ executable: 'tool', args: [], env: {} })),
      probe: vi.fn().mockResolvedValue({ status: 'unavailable' })
    } as never)
    await expect(
      call('agents.openLoginTerminal', { agentId: 'offline' }, ctx)
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('returns one diagnostic view from adapter truth and persisted user settings', async () => {
    const repos = repositories()
    const ctx = context(repos)
    const integration = {
      diagnose: vi.fn(() => ({
        state: 'current',
        path: 'C:\\Users\\alice\\.secret\\hooks.json',
        message: 'ready; token=private-value'
      }))
    }
    const adapter = {
      descriptor: {
        id: 'chrys',
        label: 'Chrys',
        description: 'Internal Agent',
        capabilities: {},
        settings: { version: 1, fields: [], actions: [] },
        setupSteps: []
      },
      managedIntegration: integration,
      probe: vi.fn().mockResolvedValue({
        status: 'available',
        executable: 'D:\\tools\\chrys.exe',
        version: '1.2.3',
        message: null
      })
    }
    vi.mocked(ctx.agentRegistry.descriptors).mockReturnValue([
      adapter.descriptor
    ] as never)
    vi.mocked(ctx.agentRegistry.require).mockReturnValue(adapter as never)
    repos.agentSettings.effective.mockReturnValue({
      agentId: 'chrys',
      enabled: true,
      integrationEnabled: true,
      executablePath: 'D:\\tools\\chrys.exe',
      isDefault: false,
      schemaVersion: 1,
      values: {},
      updatedAt: 1
    })

    await expect(call('agents.diagnostics', {}, ctx)).resolves.toMatchObject([
      {
        descriptor: { id: 'chrys' },
        availability: { status: 'available', version: '1.2.3' },
        integration: { state: 'current', message: '事件集成已就绪' }
      }
    ])
    const serialized = JSON.stringify(await call('agents.diagnostics', {}, ctx))
    expect(serialized).not.toContain('alice')
    expect(serialized).not.toContain('private-value')
    expect(adapter.probe).toHaveBeenCalledWith('D:\\tools\\chrys.exe')
  })

  it('diagnoses an adapter without managed event integration as a supported null state', async () => {
    const ctx = context()
    const descriptor = { id: 'plain', label: 'Plain' }
    const adapter = {
      descriptor,
      probe: vi.fn().mockResolvedValue({
        status: 'unavailable',
        executable: 'plain',
        version: null,
        message: 'missing'
      })
    }
    vi.mocked(ctx.agentRegistry.descriptors).mockReturnValue([descriptor] as never)
    vi.mocked(ctx.agentRegistry.require).mockReturnValue(adapter as never)

    await expect(call('agents.diagnostics', {}, ctx)).resolves.toMatchObject([
      { integration: null, availability: { status: 'unavailable' } }
    ])
    expect(adapter.probe).toHaveBeenCalledWith(undefined)
  })

  it('accepts an executable only through the native picker and persists its absolute file path', async () => {
    const repos = repositories()
    const sender = {} as RpcContext['sender']
    const ctx = context(repos, sender)
    const executablePath = __filename
    vi.mocked(ctx.agentRegistry.get).mockReturnValue({
      descriptor: { id: 'chrys', label: 'Chrys' }
    } as never)
    repos.agentSettings.setExecutablePath.mockReturnValue({ agentId: 'chrys' })
    mocks.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: [executablePath]
    })

    await expect(
      call('agents.pickExecutable', { agentId: 'chrys' }, ctx)
    ).resolves.toMatchObject({ agentId: 'chrys' })
    expect(repos.agentSettings.setExecutablePath).toHaveBeenCalledWith(
      'chrys',
      executablePath
    )
    expect(mocks.showOpenDialog).toHaveBeenCalledWith(
      sender,
      expect.objectContaining({ properties: ['openFile'] })
    )
  })

  it('rejects unknown or invalid executable selections without mutating settings', async () => {
    const repos = repositories()
    const sender = {} as RpcContext['sender']
    const ctx = context(repos, sender)
    vi.mocked(ctx.agentRegistry.get).mockReturnValueOnce(null)
    await expect(
      call('agents.pickExecutable', { agentId: 'missing' }, ctx)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    vi.mocked(ctx.agentRegistry.get).mockReturnValue({
      descriptor: { id: 'chrys', label: 'Chrys' }
    } as never)
    await expect(
      call('agents.pickExecutable', { agentId: 'chrys' }, context(repos))
    ).resolves.toBeNull()
    mocks.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [] })
    await expect(
      call('agents.pickExecutable', { agentId: 'chrys' }, ctx)
    ).resolves.toBeNull()
    mocks.showOpenDialog.mockResolvedValueOnce({
      canceled: false,
      filePaths: ['D:\\definitely-missing\\chrys.exe']
    })
    await expect(
      call('agents.pickExecutable', { agentId: 'chrys' }, ctx)
    ).rejects.toMatchObject({ code: 'INVALID_PATH' })
    expect(repos.agentSettings.setExecutablePath).not.toHaveBeenCalled()
  })

  it('persists generic Agent enablement, default and executable reset actions', async () => {
    const repos = repositories()
    const ctx = context(repos)
    await expect(
      call('agents.clearExecutable', { agentId: 'chrys' }, ctx)
    ).resolves.toMatchObject({ agentId: 'chrys', executablePath: null })
    await expect(
      call('agents.setEnabled', { agentId: 'chrys', enabled: false }, ctx)
    ).resolves.toMatchObject({ agentId: 'chrys' })
    await expect(
      call('agents.setDefault', { agentId: 'chrys' }, ctx)
    ).resolves.toMatchObject({ agentId: 'chrys' })
    expect(repos.agentSettings.setExecutablePath).toHaveBeenCalledWith('chrys', null)
    expect(repos.agentSettings.setEnabled).toHaveBeenCalledWith('chrys', false)
    expect(repos.agentSettings.setDefault).toHaveBeenCalledWith('chrys')

    vi.mocked(ctx.agentRegistry.get).mockReturnValue(null)
    await expect(
      call('agents.clearExecutable', { agentId: 'missing' }, ctx)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      call('agents.setEnabled', { agentId: 'missing', enabled: true }, ctx)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(
      call('agents.setDefault', { agentId: 'missing' }, ctx)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('delegates adapter-defined setting values to the validated settings service', async () => {
    const repos = repositories()
    const ctx = context(repos)
    vi.mocked(ctx.agentSettings.setValue).mockReturnValue({
      agentId: 'chrys',
      enabled: true,
      integrationEnabled: true,
      executablePath: null,
      isDefault: false,
      schemaVersion: 2,
      values: { 'response-mode': 'concise' },
      updatedAt: 1
    })

    await expect(
      call(
        'agents.setSetting',
        { agentId: 'chrys', key: 'response-mode', value: 'concise' },
        ctx
      )
    ).resolves.toMatchObject({ values: { 'response-mode': 'concise' } })
    expect(ctx.agentSettings.setValue).toHaveBeenCalledWith(
      'chrys',
      'response-mode',
      'concise'
    )

    vi.mocked(ctx.agentSettings.setValue).mockImplementationOnce(() => {
      throw new Error('Unsupported setting option: response-mode')
    })
    await expect(
      call(
        'agents.setSetting',
        { agentId: 'chrys', key: 'response-mode', value: 'unsafe' },
        ctx
      )
    ).rejects.toMatchObject({
      code: 'VALIDATION',
      message: 'Unsupported setting option: response-mode'
    })
  })

  it('keeps integration enablement independent and records disable even after uninstall', async () => {
    const repos = repositories()
    const ctx = context(repos)
    const uninstall = vi.fn(() => ({
      state: 'missing',
      path: 'C:\\Users\\alice\\hooks',
      message: 'removed token=private-value'
    }))
    vi.mocked(ctx.agentRegistry.get).mockReturnValue({
      managedIntegration: { uninstall, ensureInstalled: vi.fn(), diagnose: vi.fn() }
    } as never)

    const result = await call(
      'agents.integrationAction',
      { agentId: 'chrys', action: 'disable' },
      ctx
    )
    expect(result).toEqual({ state: 'missing', message: '事件集成未安装' })
    expect(JSON.stringify(result)).not.toMatch(/alice|private-value/)
    expect(uninstall).toHaveBeenCalledOnce()
    expect(repos.agentSettings.setIntegrationEnabled).toHaveBeenCalledWith('chrys', false)
  })

  it('repairs only an adapter-declared managed integration', async () => {
    const repos = repositories()
    const ctx = context(repos)
    const ensureInstalled = vi.fn(() => ({
      state: 'current',
      path: 'hooks',
      message: 'installed'
    }))
    vi.mocked(ctx.agentRegistry.get).mockReturnValue({
      managedIntegration: { uninstall: vi.fn(), ensureInstalled, diagnose: vi.fn() }
    } as never)

    await expect(
      call('agents.integrationAction', { agentId: 'chrys', action: 'repair' }, ctx)
    ).resolves.toEqual({ state: 'current', message: '事件集成已就绪' })
    expect(repos.agentSettings.setIntegrationEnabled).toHaveBeenCalledWith('chrys', true)

    vi.mocked(ctx.agentRegistry.get).mockReturnValue({} as never)
    await expect(
      call('agents.integrationAction', { agentId: 'plain', action: 'enable' }, ctx)
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
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

    repos.projects.getByPathKey.mockReturnValue(null)
    mocks.resolveGitRepo.mockResolvedValue({ path: 'D:\\', pathKey: 'd:/' })
    await call('projects.create', { name: 'drive-root', path: 'D:\\' }, ctx)
    expect(repos.projects.create).toHaveBeenLastCalledWith({
      name: 'drive-root',
      path: 'D:\\',
      pathKey: 'd:/'
    })
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

  it('uses the persisted default and blocks session creation for a disabled Agent', async () => {
    const repos = repositories()
    const ctx = context(repos)
    repos.tasks.get.mockReturnValue({ id: 't1' })
    repos.sessions.createFromTask.mockReturnValue('session')
    repos.agentSettings.effective.mockImplementation(
      (agentId: string): AgentUserSettings => ({
        agentId,
        enabled: agentId !== 'chrys',
        integrationEnabled: true,
        executablePath: null,
        isDefault: agentId === 'chrys',
        schemaVersion: 1,
        values: {},
        updatedAt: null
      })
    )

    await expect(
      call('sessions.createFromTask', { taskId: 't1' }, ctx)
    ).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(repos.sessions.createFromTask).not.toHaveBeenCalled()

    repos.agentSettings.effective.mockImplementation(
      (agentId: string): AgentUserSettings => ({
        agentId,
        enabled: true,
        integrationEnabled: true,
        executablePath: null,
        isDefault: false,
        schemaVersion: 1,
        values: {},
        updatedAt: null
      })
    )
    await expect(call('sessions.createFromTask', { taskId: 't1' }, ctx)).resolves.toBe(
      'session'
    )
    expect(repos.sessions.createFromTask).toHaveBeenCalledWith('t1', 'opencode')
  })
})
