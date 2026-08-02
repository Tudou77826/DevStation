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
    status: 'idle' as const,
    agentType: 'opencode' as const,
    agentSessionId: null,
    lastOpenedAt: null,
    createdAt: 1,
    updatedAt: 1
  }
  return {
    data: {
      tasks: [],
      projects: [project],
      sessionsByProject: { [project.id]: [session] },
      loadSessionsByProject: vi.fn(async () => [session]),
      touchSession: vi.fn(async () => undefined),
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

vi.mock('@/store/data', () => ({
  useDataStore: (selector: (state: typeof mocks.data) => unknown) => selector(mocks.data)
}))

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
})
