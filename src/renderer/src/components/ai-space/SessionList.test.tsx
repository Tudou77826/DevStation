// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionList } from './SessionList'

const mocks = vi.hoisted(() => {
  const state = {
    agents: [
      {
        descriptor: { id: 'opencode', label: 'OpenCode' }
      },
      {
        descriptor: { id: 'chrys', label: 'Chrys' }
      }
    ],
    loadAgents: vi.fn(async () => []),
    sessionsByTask: {} as Record<string, Array<Record<string, unknown>>>,
    sessionsByProject: {} as Record<string, Array<Record<string, unknown>>>,
    loadSessionsByTask: vi.fn(async () => []),
    loadSessionsByProject: vi.fn(async () => []),
    createSessionFromTask: vi.fn(async () => null),
    touchSession: vi.fn(async () => undefined),
    errorMessage: vi.fn(() => '加载失败')
  }
  const nav = {
    setSection: vi.fn(),
    selectSession: vi.fn()
  }
  return { state, nav }
})

vi.mock('@/store/data', () => {
  const useDataStore = Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    { getState: () => mocks.state }
  )
  return { useDataStore }
})

vi.mock('@/store/nav', () => ({
  useNavStore: (selector: (state: typeof mocks.nav) => unknown) => selector(mocks.nav)
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.state.sessionsByTask = {}
  mocks.state.sessionsByProject = {}
})

describe('SessionList', () => {
  it('renders an empty state before the asynchronous scope has loaded', async () => {
    render(<SessionList taskId="task-1" />)

    expect(screen.getAllByText(/加载中/).length).toBeGreaterThan(0)
    await waitFor(() => expect(mocks.state.loadSessionsByTask).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.getByText(/暂无会话/)).toBeTruthy())
  })

  it('creates a session only from task scope', async () => {
    render(<SessionList taskId="task-2" />)
    fireEvent.click(screen.getByRole('button', { name: '新建工作会话' }))
    await waitFor(() =>
      expect(mocks.state.createSessionFromTask).toHaveBeenCalledWith('task-2', 'opencode')
    )
  })

  it('creates a session with the selected Coding Agent', async () => {
    render(<SessionList taskId="task-chrys" />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Coding Agent' }), {
      target: { value: 'chrys' }
    })
    fireEvent.click(screen.getByRole('button', { name: '新建工作会话' }))

    await waitFor(() =>
      expect(mocks.state.createSessionFromTask).toHaveBeenCalledWith(
        'task-chrys',
        'chrys'
      )
    )
  })

  it('opens a task session in its AI workspace and records recent use', async () => {
    mocks.state.sessionsByTask = {
      'task-3': [
        {
          id: 'session-3',
          taskId: 'task-3',
          projectId: 'project-1',
          title: '修复登录会话',
          status: 'unknown',
          agentId: 'opencode',
          agentSessionRef: null,
          agentRunId: null,
          statusSource: 'none',
          statusUpdatedAt: null,
          lastOpenedAt: null,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ]
    }
    render(<SessionList taskId="task-3" />)
    await waitFor(() => expect(screen.getByText('修复登录会话')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /修复登录会话/ }))

    expect(mocks.nav.selectSession).toHaveBeenCalledWith('session-3', 'project-1')
    expect(mocks.nav.setSection).toHaveBeenCalledWith('ai-space')
    expect(mocks.state.touchSession).toHaveBeenCalledWith('session-3')
  })

  it('explains why a legacy session without a project cannot be opened', async () => {
    mocks.state.sessionsByTask = {
      'task-4': [
        {
          id: 'session-4',
          taskId: 'task-4',
          projectId: null,
          title: '未关联会话',
          status: 'unknown',
          agentId: 'opencode',
          agentSessionRef: null,
          agentRunId: null,
          statusSource: 'none',
          statusUpdatedAt: null,
          lastOpenedAt: null,
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
      ]
    }
    render(<SessionList taskId="task-4" />)
    await waitFor(() => expect(screen.getByText('未关联会话')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: /未关联会话/ }))

    expect(screen.getByText(/请先为任务关联本地项目/)).toBeTruthy()
    expect(mocks.nav.selectSession).not.toHaveBeenCalled()
  })
})
