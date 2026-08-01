// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskPanel } from './TaskPanel'

const mocks = vi.hoisted(() => {
  const task = {
    id: 'task-1',
    title: '阶段 2 验收任务',
    description: '',
    status: 'todo' as const,
    projectId: null,
    branch: '',
    sortOrder: 0,
    pinned: false,
    lastOpenedAt: null,
    createdAt: 1,
    updatedAt: 1
  }
  const data = {
    tasks: [task],
    projects: [],
    loading: false,
    error: null,
    loadTasks: vi.fn(async () => [task]),
    createTask: vi.fn(async () => task),
    touchTask: vi.fn(async () => undefined),
    updateTask: vi.fn(async () => task),
    setTaskPinned: vi.fn(async () => task),
    setTaskProject: vi.fn(async () => task),
    deleteTask: vi.fn(async () => true)
  }
  const nav = {
    activeSecondaryId: { tasks: 'all' },
    selectedTaskId: task.id,
    selectTask: vi.fn()
  }
  return { data, nav }
})

vi.mock('@/store/data', () => {
  const useDataStore = Object.assign(
    (selector: (state: typeof mocks.data) => unknown) => selector(mocks.data),
    { getState: () => mocks.data }
  )
  return { useDataStore }
})

vi.mock('@/store/nav', () => ({
  useNavStore: (selector: (state: typeof mocks.nav) => unknown) => selector(mocks.nav)
}))

vi.mock('@/components/ai-space/SessionList', () => ({
  SessionList: () => <div>会话列表</div>
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TaskPanel', () => {
  it('does not touch a selected task from a render effect', async () => {
    const view = render(<TaskPanel />)
    await waitFor(() => expect(mocks.data.loadTasks).toHaveBeenCalled())
    expect(mocks.data.touchTask).not.toHaveBeenCalled()

    view.rerender(<TaskPanel />)
    expect(mocks.data.touchTask).not.toHaveBeenCalled()
  })

  it('touches a task once from the explicit selection event', () => {
    render(<TaskPanel />)
    fireEvent.click(screen.getByRole('button', { name: /阶段 2 验收任务/ }))
    expect(mocks.nav.selectTask).toHaveBeenCalledWith('task-1')
    expect(mocks.data.touchTask).toHaveBeenCalledTimes(1)
  })

  it('requires confirmation before deleting a task and its sessions', async () => {
    render(<TaskPanel />)
    fireEvent.click(screen.getByRole('button', { name: '删除任务' }))

    expect(screen.getByRole('alertdialog', { name: '确认删除任务' })).toBeTruthy()
    expect(mocks.data.deleteTask).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(mocks.data.deleteTask).toHaveBeenCalledWith('task-1'))
    expect(mocks.nav.selectTask).toHaveBeenCalledWith(null)
  })
})
