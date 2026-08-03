// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChangesPanel } from './ChangesPanel'

const actions = {
  refreshChanges: vi.fn(),
  openDiff: vi.fn(),
  closeDiff: vi.fn(),
  createComment: vi.fn().mockResolvedValue(true),
  updateComment: vi.fn().mockResolvedValue(true),
  deleteComment: vi.fn().mockResolvedValue(true)
}
const state: Record<string, unknown> = {
  snapshot: null,
  selectedPath: null,
  loading: false,
  error: null,
  diff: null,
  comments: [],
  ...actions
}

vi.mock('@/store/review', () => ({
  useReviewStore: (selector: (value: typeof state) => unknown) => selector(state)
}))

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(state, {
    snapshot: null,
    selectedPath: null,
    loading: false,
    error: null,
    diff: null,
    comments: []
  })
})

describe('ChangesPanel', () => {
  it('separates staged and worktree entries and opens the selected area', () => {
    state.snapshot = {
      branch: 'main',
      head: 'abcdef123456',
      detached: false,
      refreshedAt: 1,
      truncated: false,
      changes: [
        {
          path: 'src/a.ts',
          previousPath: null,
          stagedStatus: 'added',
          worktreeStatus: 'modified',
          conflicted: false
        }
      ]
    }
    render(<ChangesPanel sessionId="s1" />)
    expect(screen.getByText('暂存区 · 1')).toBeTruthy()
    expect(screen.getByText('工作区 · 1')).toBeTruthy()
    fireEvent.click(screen.getAllByText('src/a.ts')[1])
    expect(actions.openDiff).toHaveBeenCalledWith('s1', 'src/a.ts', 'worktree')
  })

  it('anchors exact comments and keeps changed lines in an explicit stale section', () => {
    state.selectedPath = 'src/a.ts'
    state.diff = {
      path: 'src/a.ts',
      area: 'worktree',
      kind: 'text',
      oldPath: 'src/a.ts',
      hunks: [
        {
          header: '@@ -1 +1 @@',
          lines: [{ kind: 'addition', oldLine: null, newLine: 1, text: 'current' }]
        }
      ]
    }
    state.comments = [
      {
        id: 'r1',
        sessionId: 's1',
        path: 'src/a.ts',
        area: 'worktree',
        side: 'new',
        line: 1,
        lineContent: 'current',
        body: '仍然有效',
        createdAt: 1,
        updatedAt: 1
      },
      {
        id: 'r2',
        sessionId: 's1',
        path: 'src/a.ts',
        area: 'worktree',
        side: 'new',
        line: 2,
        lineContent: 'old',
        body: '不要漂移',
        createdAt: 1,
        updatedAt: 1
      }
    ]
    render(<ChangesPanel sessionId="s1" />)
    expect(screen.getByText('仍然有效')).toBeTruthy()
    expect(screen.getByText('已失效意见 · 1')).toBeTruthy()
    expect(screen.getByText('不要漂移')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '添加行级意见' }))
    fireEvent.change(screen.getByPlaceholderText('记录评审意见…'), {
      target: { value: '新意见' }
    })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(actions.createComment).toHaveBeenCalledWith(
      expect.objectContaining({ body: '新意见', line: 1, lineContent: 'current' })
    )
  })
})
