// Data store: the renderer's window onto the SQLite-backed domain data.
// All access goes through window.devstation.rpc (IPC → main repositories).
// Components read lists from here and call mutators; mutators refresh state.
import { create } from 'zustand'
import type { Project, Session, Task, TaskStatus } from '@shared/domain'
import type { AgentCatalogEntry } from '@shared/agent'
import type { RpcResponse, RpcError } from '@shared/rpc'

// RPC helper: unwraps the envelope, throwing RpcError on failure so callers can
// try/catch and surface a user message. Typed via RpcMethodMap.
type Api = typeof window.devstation.rpc
const rpc: Api = window.devstation.rpc

// Canonical list order, mirroring the SQL ORDER BY in repositories.ts:
// pinned DESC, last_opened_at DESC (nulls last), sort_order ASC, updated_at DESC.
function cmpTask(a: Task, b: Task): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  const la = a.lastOpenedAt ?? -1
  const lb = b.lastOpenedAt ?? -1
  if (la !== lb) return lb - la
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
  return b.updatedAt - a.updatedAt
}

function unwrap<T>(res: RpcResponse<T>): T {
  if (res.ok) return res.result
  throw res.error
}

interface DataState {
  agents: AgentCatalogEntry[]
  tasks: Task[]
  projects: Project[]
  sessionsByTask: Record<string, Session[]>
  sessionsByProject: Record<string, Session[]>
  loading: boolean
  /** last user-facing error message (for toasts); cleared on next success */
  error: string | null

  loadAll: () => Promise<void>
  loadAgents: () => Promise<AgentCatalogEntry[]>
  loadTasks: (filter?: {
    status?: TaskStatus
    projectId?: string
    keyword?: string
  }) => Promise<Task[]>
  createTask: (title: string, description?: string) => Promise<Task | null>
  updateTask: (
    id: string,
    patch: { title?: string; description?: string; status?: TaskStatus }
  ) => Promise<Task | null>
  setTaskPinned: (id: string, pinned: boolean) => Promise<Task | null>
  touchTask: (id: string) => Promise<void>
  deleteTask: (id: string) => Promise<boolean>
  setTaskProject: (id: string, projectId: string | null) => Promise<Task | null>

  loadProjects: () => Promise<Project[]>
  pickDirectory: () => Promise<string | null>
  createProject: (name: string, path: string) => Promise<Project | null>
  deleteProject: (id: string) => Promise<boolean>

  loadSessionsByTask: (taskId: string) => Promise<Session[]>
  loadSessionsByProject: (projectId: string) => Promise<Session[]>
  createSessionFromTask: (taskId: string, agentId?: string) => Promise<Session | null>
  touchSession: (id: string) => Promise<void>
  applySessionUpdate: (session: Session) => void

  /** map RpcError → a short Chinese message */
  errorMessage: (e: unknown) => string
}

export const useDataStore = create<DataState>((set, get) => ({
  agents: [],
  tasks: [],
  projects: [],
  sessionsByTask: {},
  sessionsByProject: {},
  loading: false,
  error: null,

  async loadAll() {
    set({ loading: true, error: null })
    try {
      const [tasks, projects, agents] = await Promise.all([
        unwrap(await rpc.invoke('tasks.list', {})),
        unwrap(await rpc.invoke('projects.list', {})),
        unwrap(await rpc.invoke('agents.list', {}))
      ])
      set({ tasks, projects, agents, loading: false })
    } catch (e) {
      set({ loading: false, error: get().errorMessage(e) })
    }
  },

  async loadAgents() {
    try {
      const agents = unwrap(await rpc.invoke('agents.list', {}))
      set({ agents, error: null })
      return agents
    } catch (e) {
      set({ error: get().errorMessage(e) })
      return get().agents
    }
  },

  async loadTasks(filter) {
    try {
      const tasks = await unwrap(await rpc.invoke('tasks.list', filter ?? {}))
      set({ tasks, error: null })
      return tasks
    } catch (e) {
      set({ error: get().errorMessage(e) })
      return get().tasks
    }
  },

  async createTask(title, description) {
    try {
      const task = await unwrap(await rpc.invoke('tasks.create', { title, description }))
      await get().loadTasks()
      return task
    } catch (e) {
      set({ error: get().errorMessage(e) })
      return null
    }
  },

  async updateTask(id, patch) {
    try {
      const task = await unwrap(await rpc.invoke('tasks.update', { id, ...patch }))
      await get().loadTasks()
      return task
    } catch (e) {
      set({ error: get().errorMessage(e) })
      return null
    }
  },

  async setTaskPinned(id, pinned) {
    try {
      const task = await unwrap(await rpc.invoke('tasks.setPinned', { id, pinned }))
      await get().loadTasks()
      return task
    } catch (e) {
      set({ error: get().errorMessage(e) })
      return null
    }
  },

  async touchTask(id) {
    try {
      const touched = unwrap(await rpc.invoke('tasks.touch', { id }))
      set((state) => ({
        tasks: state.tasks.map((task) => (task.id === id ? touched : task)).sort(cmpTask),
        error: null
      }))
    } catch (e) {
      set({ error: get().errorMessage(e) })
    }
  },

  async deleteTask(id) {
    try {
      await unwrap(await rpc.invoke('tasks.delete', { id }))
      await get().loadTasks()
      return true
    } catch (e) {
      set({ error: get().errorMessage(e) })
      return false
    }
  },

  async setTaskProject(id, projectId) {
    try {
      const task = await unwrap(await rpc.invoke('tasks.setProject', { id, projectId }))
      await get().loadTasks()
      return task
    } catch (e) {
      set({ error: get().errorMessage(e) })
      return null
    }
  },

  async loadProjects() {
    try {
      const projects = await unwrap(await rpc.invoke('projects.list', {}))
      set({ projects, error: null })
      return projects
    } catch (e) {
      set({ error: get().errorMessage(e) })
      return get().projects
    }
  },

  async pickDirectory() {
    try {
      const result = unwrap(await rpc.invoke('projects.pickDirectory', {}))
      set({ error: null })
      return result?.path ?? null
    } catch (e) {
      set({ error: get().errorMessage(e) })
      return null
    }
  },

  async createProject(name, path) {
    try {
      const project = await unwrap(await rpc.invoke('projects.create', { name, path }))
      await get().loadProjects()
      return project
    } catch (e) {
      set({ error: get().errorMessage(e) })
      return null
    }
  },

  async deleteProject(id) {
    try {
      await unwrap(await rpc.invoke('projects.delete', { id }))
      await get().loadProjects()
      return true
    } catch (e) {
      set({ error: get().errorMessage(e) })
      return false
    }
  },

  async loadSessionsByTask(taskId) {
    const sessions = await unwrap(await rpc.invoke('sessions.listByTask', { taskId }))
    set((s) => ({ sessionsByTask: { ...s.sessionsByTask, [taskId]: sessions } }))
    return sessions
  },

  async loadSessionsByProject(projectId) {
    const sessions = await unwrap(
      await rpc.invoke('sessions.listByProject', { projectId })
    )
    set((s) => ({ sessionsByProject: { ...s.sessionsByProject, [projectId]: sessions } }))
    return sessions
  },

  async createSessionFromTask(taskId, agentId) {
    try {
      const session = await unwrap(
        await rpc.invoke('sessions.createFromTask', { taskId, agentId })
      )
      await get().loadSessionsByTask(taskId)
      if (session.projectId !== null && get().sessionsByProject[session.projectId]) {
        await get().loadSessionsByProject(session.projectId)
      }
      set({ error: null })
      return session
    } catch (e) {
      set({ error: get().errorMessage(e) })
      return null
    }
  },

  async touchSession(id) {
    try {
      const touched = unwrap(await rpc.invoke('sessions.touch', { id }))
      const refresh = (sessions: Session[]): Session[] =>
        sessions
          .map((session) => (session.id === touched.id ? touched : session))
          .sort(
            (a, b) => (b.lastOpenedAt ?? b.createdAt) - (a.lastOpenedAt ?? a.createdAt)
          )
      set((state) => ({
        sessionsByTask: Object.fromEntries(
          Object.entries(state.sessionsByTask).map(([key, sessions]) => [
            key,
            refresh(sessions)
          ])
        ),
        sessionsByProject: Object.fromEntries(
          Object.entries(state.sessionsByProject).map(([key, sessions]) => [
            key,
            refresh(sessions)
          ])
        ),
        error: null
      }))
    } catch (e) {
      set({ error: get().errorMessage(e) })
    }
  },

  applySessionUpdate(session) {
    const replace = (sessions: Session[]): Session[] =>
      sessions.map((current) => (current.id === session.id ? session : current))
    set((state) => ({
      sessionsByTask: Object.fromEntries(
        Object.entries(state.sessionsByTask).map(([key, sessions]) => [
          key,
          replace(sessions)
        ])
      ),
      sessionsByProject: Object.fromEntries(
        Object.entries(state.sessionsByProject).map(([key, sessions]) => [
          key,
          replace(sessions)
        ])
      )
    }))
  },

  errorMessage(e) {
    if (e !== null && typeof e === 'object' && 'code' in e) {
      const err = e as RpcError
      return err.message
    }
    return '操作失败，请重试'
  }
}))
