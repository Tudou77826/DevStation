// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskDetailView } from './TaskDetailView'

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
    projects: [],
    updateTask: vi.fn(async () => task),
    setTaskPinned: vi.fn(async () => task),
    setTaskProject: vi.fn(async () => task),
    deleteTask: vi.fn(async () => true)
  }
  const onBack = vi.fn()
  return { task, data, onBack }
})

vi.mock('@/store/data', () => ({
  useDataStore: (selector: (state: typeof mocks.data) => unknown) => selector(mocks.data)
}))

vi.mock('@/components/ai-space/SessionList', () => ({
  SessionList: () => <div>会话列表</div>
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TaskDetailView', () => {
  it('requires confirmation before deleting a task and its sessions', async () => {
    render(<TaskDetailView task={mocks.task} onBack={mocks.onBack} />)
    fireEvent.click(screen.getByRole('button', { name: '删除任务' }))

    expect(screen.getByRole('alertdialog', { name: '确认删除任务' })).toBeTruthy()
    expect(mocks.data.deleteTask).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(mocks.data.deleteTask).toHaveBeenCalledWith('task-1'))
    expect(mocks.onBack).toHaveBeenCalledOnce()
  })
})
