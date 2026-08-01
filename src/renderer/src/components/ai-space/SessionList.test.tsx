// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionList } from './SessionList'

const mocks = vi.hoisted(() => {
  const state = {
    sessionsByTask: {} as Record<string, never[]>,
    sessionsByProject: {} as Record<string, never[]>,
    loadSessionsByTask: vi.fn(async () => []),
    loadSessionsByProject: vi.fn(async () => []),
    createSessionFromTask: vi.fn(async () => null),
    touchSession: vi.fn(async () => undefined),
    errorMessage: vi.fn(() => '加载失败')
  }
  return { state }
})

vi.mock('@/store/data', () => {
  const useDataStore = Object.assign(
    (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state),
    { getState: () => mocks.state }
  )
  return { useDataStore }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
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
      expect(mocks.state.createSessionFromTask).toHaveBeenCalledWith('task-2')
    )
  })
})
