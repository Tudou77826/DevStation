// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NavTree } from './NavTree'

const mocks = vi.hoisted(() => {
  const project = {
    id: 'project-1',
    name: 'DevStation',
    path: 'D:/dev/DevStation',
    pathKey: 'd:/dev/devstation',
    repoUrl: '',
    createdAt: 1,
    updatedAt: 1
  }
  const session = {
    id: 'session-1',
    taskId: 'task-1',
    projectId: project.id,
    title: 'Agent 验收会话',
    status: 'unknown' as const,
    agentId: 'opencode',
    agentSessionRef: null,
    agentRunId: null,
    statusSource: 'none' as const,
    statusUpdatedAt: null,
    lastOpenedAt: null,
    createdAt: 1,
    updatedAt: 1
  }
  const createdSession = { ...session, id: 'session-2' }
  const task = {
    id: 'task-1',
    title: '项目任务',
    description: '',
    status: 'todo' as const,
    projectId: project.id,
    branch: '',
    sortOrder: 0,
    pinned: false,
    lastOpenedAt: null,
    createdAt: 1,
    updatedAt: 1
  }
  return {
    data: {
      tasks: [task],
      projects: [project],
      agents: [{ descriptor: { id: 'opencode', label: 'OpenCode' } }],
      sessionsByProject: { [project.id]: [session] },
      loadSessionsByProject: vi.fn(async () => [session]),
      loadAgents: vi.fn(async () => []),
      touchSession: vi.fn(async () => undefined),
      createTask: vi.fn(async () => task),
      setTaskProject: vi.fn(async () => task),
      deleteTask: vi.fn(async () => true),
      createSessionFromTask: vi.fn(async () => createdSession),
      errorMessage: vi.fn(() => '创建失败'),
      pickDirectory: vi.fn(async () => null),
      createProject: vi.fn(async () => null)
    },
    nav: {
      activeSection: 'ai-space' as const,
      activeSecondaryId: { tasks: 'all', 'ai-space': 'workspace', workflow: 'overview' },
      selectedProjectId: project.id,
      selectedSessionId: null as string | null,
      expandedProjectIds: [project.id],
      setSecondary: vi.fn(),
      selectProject: vi.fn(),
      selectSession: vi.fn(),
      toggleProjectExpanded: vi.fn()
    }
  }
})

vi.mock('@/store/data', () => {
  const useDataStore = Object.assign(
    (selector: (state: typeof mocks.data) => unknown) => selector(mocks.data),
    { getState: () => mocks.data }
  )
  return { useDataStore }
})

vi.mock('@/store/nav', async () => {
  const actual = await vi.importActual<typeof import('@/store/nav')>('@/store/nav')
  return {
    ...actual,
    useNavStore: (selector: (state: typeof mocks.nav) => unknown) => selector(mocks.nav)
  }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AI Space navigation tree', () => {
  it('groups sessions under project directories and selects the Agent session', async () => {
    render(<NavTree />)

    await waitFor(() =>
      expect(mocks.data.loadSessionsByProject).toHaveBeenCalledWith('project-1')
    )
    expect(screen.getByRole('button', { name: 'DevStation' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /Agent 验收会话/ }))
    expect(mocks.nav.selectSession).toHaveBeenCalledWith('session-1', 'project-1')
    expect(mocks.data.touchSession).toHaveBeenCalledWith('session-1')
  })

  it('starts an Agent session from the project context menu', async () => {
    render(<NavTree />)

    fireEvent.contextMenu(screen.getByRole('button', { name: 'DevStation' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '在此项目中新建会话' }))
    expect(screen.getByRole('dialog', { name: '在 DevStation 中启动会话' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '创建并打开' }))

    await waitFor(() =>
      expect(mocks.data.createSessionFromTask).toHaveBeenCalledWith('task-1', 'opencode')
    )
    expect(mocks.nav.selectSession).toHaveBeenCalledWith('session-2', 'project-1')
    expect(mocks.data.touchSession).toHaveBeenCalledWith('session-2')
  })
})
