// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RpcResponse } from '@shared/rpc'

const invoke = vi.fn()
Object.defineProperty(window, 'devstation', {
  configurable: true,
  value: { rpc: { invoke } }
})

const { useReviewStore } = await import('./review')
const ok = <T>(result: T): RpcResponse<T> => ({ ok: true, result })
const fail = (message = '失败'): RpcResponse<never> => ({
  ok: false,
  error: { code: 'INTERNAL', message }
})

const snapshot = {
  branch: 'main',
  head: 'abc',
  detached: false,
  refreshedAt: 1,
  truncated: false,
  changes: [
    {
      path: 'src/a.ts',
      previousPath: null,
      stagedStatus: null,
      worktreeStatus: 'modified' as const,
      conflicted: false
    }
  ]
}
const diff = {
  path: 'src/a.ts',
  area: 'worktree' as const,
  kind: 'text' as const,
  oldPath: 'src/a.ts',
  hunks: []
}
const comment = {
  id: 'r1',
  sessionId: 's1',
  path: 'src/a.ts',
  area: 'worktree' as const,
  side: 'new' as const,
  line: 1,
  lineContent: 'line',
  body: 'review',
  createdAt: 1,
  updatedAt: 1
}

function reset(): void {
  useReviewStore.setState({
    sessionId: null,
    snapshot: null,
    selectedPath: null,
    selectedArea: 'worktree',
    diff: null,
    comments: [],
    files: [],
    loadedDirectories: [],
    loadingDirectories: [],
    preview: null,
    loading: false,
    error: null
  })
}

describe('review store', () => {
  beforeEach(() => {
    invoke.mockReset()
    reset()
  })

  it('refreshes status and reopens only a still-present selected diff', async () => {
    invoke.mockImplementation(async (method: string) => {
      if (method === 'git.status') return ok(snapshot)
      if (method === 'git.diff') return ok(diff)
      return ok([comment])
    })
    useReviewStore.setState({ selectedPath: 'src/a.ts', selectedArea: 'worktree' })
    await useReviewStore.getState().refreshChanges('s1')
    expect(useReviewStore.getState()).toMatchObject({
      snapshot,
      diff,
      comments: [comment],
      loading: false,
      error: null
    })

    invoke.mockResolvedValueOnce(ok({ ...snapshot, changes: [] }))
    await useReviewStore.getState().refreshChanges('s1')
    expect(useReviewStore.getState()).toMatchObject({
      selectedPath: null,
      diff: null,
      comments: []
    })
  })

  it('loads files and bounded previews, then clears selected views', async () => {
    invoke.mockImplementation(async (method: string, params: { path?: string }) => {
      if (method === 'git.files') {
        return params.path === ''
          ? ok({
              directory: '',
              entries: [{ path: 'src', kind: 'directory' as const }]
            })
          : ok({
              directory: 'src',
              entries: [{ path: 'src/a.ts', kind: 'file' as const }]
            })
      }
      return ok({ path: 'src/a.ts', kind: 'text', content: 'line', size: 4 })
    })
    useReviewStore.setState({
      sessionId: 'old-session',
      preview: { path: 'old.ts', kind: 'text', content: 'old', size: 3 }
    })
    await useReviewStore.getState().refreshFiles('s1')
    expect(useReviewStore.getState().preview).toBeNull()
    await useReviewStore.getState().loadDirectory('s1', 'src')
    await useReviewStore.getState().loadDirectory('s1', 'src')
    await useReviewStore.getState().openFile('s1', 'src/a.ts')
    expect(useReviewStore.getState()).toMatchObject({
      files: [
        { path: 'src', kind: 'directory' },
        { path: 'src/a.ts', kind: 'file' }
      ],
      loadedDirectories: ['', 'src'],
      preview: { content: 'line' }
    })
    expect(invoke.mock.calls.filter(([method]) => method === 'git.files')).toHaveLength(2)
    useReviewStore.getState().closeFile()
    useReviewStore.setState({ selectedPath: 'src/a.ts', diff, comments: [comment] })
    useReviewStore.getState().closeDiff()
    expect(useReviewStore.getState()).toMatchObject({
      preview: null,
      selectedPath: null,
      diff: null,
      comments: []
    })
  })

  it('clears another session’s diff before an asynchronous refresh completes', async () => {
    let finish!: (value: RpcResponse<typeof snapshot>) => void
    invoke.mockReturnValue(
      new Promise<RpcResponse<typeof snapshot>>((resolve) => {
        finish = resolve
      })
    )
    useReviewStore.setState({
      sessionId: 'old-session',
      selectedPath: 'src/old.ts',
      diff,
      comments: [comment],
      preview: { path: 'old.ts', kind: 'text', content: 'old', size: 3 }
    })
    const pending = useReviewStore.getState().refreshChanges('new-session')
    expect(useReviewStore.getState()).toMatchObject({
      sessionId: 'new-session',
      selectedPath: null,
      diff: null,
      comments: [],
      preview: null
    })
    finish(ok(snapshot))
    await pending
  })

  it('creates, edits and deletes comments using persisted RPC results', async () => {
    invoke
      .mockResolvedValueOnce(ok(comment))
      .mockResolvedValueOnce(ok({ ...comment, body: 'updated', updatedAt: 2 }))
      .mockResolvedValueOnce(ok({ ok: true as const }))
    expect(
      await useReviewStore.getState().createComment({
        sessionId: 's1',
        path: 'src/a.ts',
        area: 'worktree',
        side: 'new',
        line: 1,
        lineContent: 'line',
        body: 'review'
      })
    ).toBe(true)
    expect(await useReviewStore.getState().updateComment('s1', 'r1', 'updated')).toBe(
      true
    )
    expect(useReviewStore.getState().comments[0].body).toBe('updated')
    expect(await useReviewStore.getState().deleteComment('s1', 'r1')).toBe(true)
    expect(useReviewStore.getState().comments).toEqual([])
  })

  it('keeps failures explicit across reads and mutations', async () => {
    invoke.mockResolvedValue(fail('仓库不可用'))
    await useReviewStore.getState().refreshChanges('s1')
    await useReviewStore.getState().openDiff('s1', 'a.ts', 'worktree')
    await useReviewStore.getState().refreshFiles('s1')
    await useReviewStore.getState().openFile('s1', 'a.ts')
    expect(
      await useReviewStore.getState().createComment({
        sessionId: 's1',
        path: 'a.ts',
        area: 'worktree',
        side: 'new',
        line: 1,
        lineContent: 'x',
        body: 'x'
      })
    ).toBe(false)
    expect(await useReviewStore.getState().updateComment('s1', 'r1', 'x')).toBe(false)
    expect(await useReviewStore.getState().deleteComment('s1', 'r1')).toBe(false)
    expect(useReviewStore.getState()).toMatchObject({
      loading: false,
      error: '仓库不可用'
    })
  })
})
