import { create } from 'zustand'
import type { ReviewComment } from '@shared/domain'
import type {
  GitArea,
  GitFileDiff,
  GitFilePreview,
  GitRepositorySnapshot,
  GitWorkspaceFile
} from '@shared/git'
import type { RpcError, RpcResponse } from '@shared/rpc'

const rpc = window.devstation.rpc

function unwrap<T>(response: RpcResponse<T>): T {
  if (response.ok) return response.result
  throw response.error
}

function message(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'message' in error) {
    return (error as RpcError).message
  }
  return '读取项目上下文失败，请重试'
}

interface ReviewState {
  sessionId: string | null
  snapshot: GitRepositorySnapshot | null
  selectedPath: string | null
  selectedArea: GitArea
  diff: GitFileDiff | null
  comments: ReviewComment[]
  files: GitWorkspaceFile[]
  loadedDirectories: string[]
  loadingDirectories: string[]
  preview: GitFilePreview | null
  loading: boolean
  error: string | null
  refreshChanges: (sessionId: string) => Promise<void>
  openDiff: (sessionId: string, path: string, area: GitArea) => Promise<void>
  closeDiff: () => void
  refreshFiles: (sessionId: string) => Promise<void>
  loadDirectory: (sessionId: string, path: string) => Promise<void>
  openFile: (sessionId: string, path: string) => Promise<void>
  closeFile: () => void
  createComment: (input: {
    sessionId: string
    path: string
    area: GitArea
    side: 'old' | 'new'
    line: number
    lineContent: string
    body: string
  }) => Promise<boolean>
  updateComment: (sessionId: string, id: string, body: string) => Promise<boolean>
  deleteComment: (sessionId: string, id: string) => Promise<boolean>
}

export const useReviewStore = create<ReviewState>((set, get) => ({
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
  error: null,

  async refreshChanges(sessionId) {
    const switched = get().sessionId !== null && get().sessionId !== sessionId
    set({
      loading: true,
      error: null,
      sessionId,
      ...(switched ? { selectedPath: null, diff: null, comments: [], preview: null } : {})
    })
    try {
      const snapshot = unwrap(await rpc.invoke('git.status', { sessionId }))
      set({ snapshot, loading: false })
      const { selectedPath, selectedArea } = get()
      const stillPresent = snapshot.changes.some(
        (change) =>
          change.path === selectedPath &&
          (selectedArea === 'staged'
            ? change.stagedStatus !== null
            : change.worktreeStatus !== null)
      )
      if (selectedPath !== null && stillPresent) {
        await get().openDiff(sessionId, selectedPath, selectedArea)
      } else if (selectedPath !== null) {
        set({ selectedPath: null, diff: null, comments: [] })
      }
    } catch (error) {
      set({ loading: false, error: message(error), snapshot: null })
    }
  },

  async openDiff(sessionId, path, area) {
    set({
      loading: true,
      error: null,
      sessionId,
      selectedPath: path,
      selectedArea: area,
      diff: null,
      comments: []
    })
    try {
      const [diff, comments] = await Promise.all([
        rpc.invoke('git.diff', { sessionId, path, area }).then(unwrap),
        rpc.invoke('reviews.list', { sessionId, path, area }).then(unwrap)
      ])
      set({ diff, comments, loading: false })
    } catch (error) {
      set({ loading: false, error: message(error), diff: null, comments: [] })
    }
  },

  closeDiff() {
    set({ selectedPath: null, diff: null, comments: [] })
  },

  async refreshFiles(sessionId) {
    const switched = get().sessionId !== null && get().sessionId !== sessionId
    set({
      loading: true,
      error: null,
      sessionId,
      ...(switched
        ? {
            files: [],
            loadedDirectories: [],
            loadingDirectories: [],
            preview: null,
            selectedPath: null,
            diff: null,
            comments: []
          }
        : {})
    })
    try {
      const result = unwrap(await rpc.invoke('git.files', { sessionId, path: '' }))
      set((current) =>
        current.sessionId === sessionId
          ? {
              files: result.entries,
              loadedDirectories: [''],
              loadingDirectories: [],
              loading: false
            }
          : current
      )
    } catch (error) {
      set((current) =>
        current.sessionId === sessionId
          ? {
              files: [],
              loadedDirectories: [],
              loadingDirectories: [],
              loading: false,
              error: message(error)
            }
          : current
      )
    }
  },

  async loadDirectory(sessionId, path) {
    const state = get()
    if (
      state.sessionId !== sessionId ||
      state.loadedDirectories.includes(path) ||
      state.loadingDirectories.includes(path)
    ) {
      return
    }
    set({ loadingDirectories: [...state.loadingDirectories, path], error: null })
    try {
      const result = unwrap(await rpc.invoke('git.files', { sessionId, path }))
      set((current) => {
        if (current.sessionId !== sessionId) return current
        const entries = new Map(current.files.map((entry) => [entry.path, entry]))
        for (const entry of result.entries) entries.set(entry.path, entry)
        return {
          files: [...entries.values()],
          loadedDirectories: [...current.loadedDirectories, path],
          loadingDirectories: current.loadingDirectories.filter(
            (directory) => directory !== path
          )
        }
      })
    } catch (error) {
      set((current) =>
        current.sessionId === sessionId
          ? {
              error: message(error),
              loadingDirectories: current.loadingDirectories.filter(
                (directory) => directory !== path
              )
            }
          : current
      )
    }
  },

  async openFile(sessionId, path) {
    set({ loading: true, error: null, sessionId })
    try {
      const preview = unwrap(await rpc.invoke('git.preview', { sessionId, path }))
      set({ preview, loading: false })
    } catch (error) {
      set({ preview: null, loading: false, error: message(error) })
    }
  },

  closeFile() {
    set({ preview: null })
  },

  async createComment(input) {
    try {
      const comment = unwrap(await rpc.invoke('reviews.create', input))
      set((state) => ({ comments: [...state.comments, comment], error: null }))
      return true
    } catch (error) {
      set({ error: message(error) })
      return false
    }
  },

  async updateComment(sessionId, id, body) {
    try {
      const updated = unwrap(await rpc.invoke('reviews.update', { sessionId, id, body }))
      set((state) => ({
        comments: state.comments.map((comment) =>
          comment.id === id ? updated : comment
        ),
        error: null
      }))
      return true
    } catch (error) {
      set({ error: message(error) })
      return false
    }
  },

  async deleteComment(sessionId, id) {
    try {
      unwrap(await rpc.invoke('reviews.delete', { sessionId, id }))
      set((state) => ({
        comments: state.comments.filter((comment) => comment.id !== id),
        error: null
      }))
      return true
    } catch (error) {
      set({ error: message(error) })
      return false
    }
  }
}))
