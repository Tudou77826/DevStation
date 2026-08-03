// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Task } from '@shared/domain'
import { TaskCreateView } from './TaskCreateView'

const mocks = vi.hoisted(() => {
  const task: Task = {
    id: 'task-new',
    title: '有意义的标题',
    description: '验收条件',
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
    projects: [
      {
        id: 'project-1',
        name: 'DevStation',
        path: 'D:/dev/DevStation',
        pathKey: 'd:/dev/devstation',
        repoUrl: '',
        createdAt: 1,
        updatedAt: 1
      }
    ],
    error: null,
    createTask: vi.fn(async () => task),
    setTaskProject: vi.fn(async (): Promise<Task | null> => ({
      ...task,
      projectId: 'project-1'
    })),
    deleteTask: vi.fn(async () => true)
  }
  return { data }
})

vi.mock('@/store/data', () => ({
  useDataStore: (selector: (state: typeof mocks.data) => unknown) => selector(mocks.data)
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TaskCreateView', () => {
  it('keeps the task transient until a valid title is explicitly confirmed', async () => {
    const onCreated = vi.fn()
    render(<TaskCreateView onCancel={vi.fn()} onCreated={onCreated} />)

    const title = screen.getByLabelText('任务标题')
    const confirm = screen.getByRole('button', { name: '创建任务' })
    expect((title as HTMLInputElement).value).toBe('')
    expect(title.getAttribute('placeholder')).toBe('输入任务标题（必填）')
    expect((confirm as HTMLButtonElement).disabled).toBe(true)
    expect(mocks.data.createTask).not.toHaveBeenCalled()

    fireEvent.change(title, { target: { value: '有意义的标题' } })
    fireEvent.change(screen.getByLabelText('任务描述'), {
      target: { value: '验收条件' }
    })
    fireEvent.change(screen.getByLabelText('关联项目'), {
      target: { value: 'project-1' }
    })
    fireEvent.click(confirm)

    await waitFor(() =>
      expect(mocks.data.createTask).toHaveBeenCalledWith('有意义的标题', '验收条件')
    )
    expect(mocks.data.setTaskProject).toHaveBeenCalledWith('task-new', 'project-1')
    expect(onCreated).toHaveBeenCalledWith('task-new')
  })

  it('removes a newly persisted task when project association fails', async () => {
    mocks.data.setTaskProject.mockResolvedValueOnce(null)
    const onCreated = vi.fn()
    render(<TaskCreateView onCancel={vi.fn()} onCreated={onCreated} />)

    fireEvent.change(screen.getByLabelText('任务标题'), {
      target: { value: '不应残留' }
    })
    fireEvent.change(screen.getByLabelText('关联项目'), {
      target: { value: 'project-1' }
    })
    fireEvent.click(screen.getByRole('button', { name: '创建任务' }))

    await waitFor(() => expect(mocks.data.deleteTask).toHaveBeenCalledWith('task-new'))
    expect(onCreated).not.toHaveBeenCalled()
  })
})
