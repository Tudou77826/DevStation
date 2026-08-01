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
    selectedTaskId: null as string | null,
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

vi.mock('./TaskDetailView', () => ({
  TaskDetailView: () => <div aria-label="主工作区任务详情" />
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.nav.selectedTaskId = null
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

  it('renders the selected task detail in the center workspace', () => {
    mocks.nav.selectedTaskId = 'task-1'
    render(<TaskPanel />)
    expect(screen.getByRole('region', { name: '任务工作区' })).toBeTruthy()
    expect(screen.getByLabelText('主工作区任务详情')).toBeTruthy()
  })
})
