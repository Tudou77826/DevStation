// RPC protocol types shared by Main (dispatcher) and Renderer (caller).
//
// The dispatcher exposes ONE ipc channel ('rpc') and routes by method name.
// RpcMethodMap is the single source of truth: every whitelisted method name
// maps to its Zod-typed params and TS result type, so callers get static typing
// and the dispatcher only accepts registered methods.
import type {
  Project,
  ReviewComment,
  ReviewCommentSide,
  Session,
  Task,
  TaskStatus
} from './domain'
import type {
  GitArea,
  GitFileDiff,
  GitFilePreview,
  GitRepositorySnapshot,
  GitWorkspaceFileList
} from './git'
import type {
  AgentCatalogEntry,
  AgentDiagnosticEntry,
  AgentSettingValue,
  AgentUserSettings
} from './agent'

export type RpcErrorCode =
  | 'VALIDATION'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PROJECT_IN_USE'
  | 'INVALID_PATH'
  | 'NOT_GIT_REPOSITORY'
  | 'INTERNAL'

export interface RpcError {
  code: RpcErrorCode
  /** safe to show in the UI; never contains SQL/paths/stack */
  message: string
}

export type RpcResponse<T> = { ok: true; result: T } | { ok: false; error: RpcError }

// ── Param shapes (also enforced by Zod schemas in src/main/rpc/methods.ts) ────

export interface TasksListParams {
  status?: TaskStatus
  projectId?: string
  keyword?: string
}
export interface TasksCreateParams {
  title: string
  description?: string
}
export interface TasksUpdateParams {
  id: string
  title?: string
  description?: string
  status?: TaskStatus
}
export interface IdParam {
  id: string
}
export interface TasksSetPinnedParams {
  id: string
  pinned: boolean
}
export interface TasksSetProjectParams {
  id: string
  /** undefined / null clears the association */
  projectId?: string | null
}
export interface ProjectsCreateParams {
  name: string
  path: string
}
export interface TaskIdParam {
  taskId: string
}
export interface CreateSessionFromTaskParam extends TaskIdParam {
  agentId?: string
}
export interface ProjectIdParam {
  projectId: string
}
export interface AgentIdParam {
  agentId: string
}
export interface AgentEnabledParam extends AgentIdParam {
  enabled: boolean
}
export interface AgentIntegrationActionParam extends AgentIdParam {
  action: 'enable' | 'repair' | 'disable'
}
export interface AgentSettingParam extends AgentIdParam {
  key: string
  value: AgentSettingValue | null
}
export interface SessionIdParam {
  sessionId: string
}
export interface GitFilesParam extends SessionIdParam {
  path: string
}
export interface GitDiffParam extends SessionIdParam {
  path: string
  area: GitArea
}
export interface GitPreviewParam extends SessionIdParam {
  path: string
}
export interface ReviewListParam extends SessionIdParam {
  path?: string
  area?: GitArea
}
export interface ReviewCreateParam extends SessionIdParam {
  path: string
  area: GitArea
  side: ReviewCommentSide
  line: number
  lineContent: string
  body: string
}
export interface ReviewUpdateParam extends SessionIdParam {
  id: string
  body: string
}
export interface ReviewDeleteParam extends SessionIdParam {
  id: string
}

// ── The whitelist map: method name → { params, result } ──────────────────────

export interface RpcMethodMap {
  'agents.list': { params: Record<string, never>; result: AgentCatalogEntry[] }
  'agents.diagnostics': {
    params: Record<string, never>
    result: AgentDiagnosticEntry[]
  }
  'agents.pickExecutable': {
    params: AgentIdParam
    result: AgentUserSettings | null
  }
  'agents.clearExecutable': { params: AgentIdParam; result: AgentUserSettings }
  'agents.setEnabled': { params: AgentEnabledParam; result: AgentUserSettings }
  'agents.setDefault': { params: AgentIdParam; result: AgentUserSettings }
  'agents.setSetting': { params: AgentSettingParam; result: AgentUserSettings }
  'agents.openLoginTerminal': { params: AgentIdParam; result: { ok: true } }
  'agents.integrationAction': {
    params: AgentIntegrationActionParam
    result: AgentDiagnosticEntry['integration']
  }
  'tasks.list': { params: TasksListParams; result: Task[] }
  'tasks.create': { params: TasksCreateParams; result: Task }
  'tasks.update': { params: TasksUpdateParams; result: Task }
  'tasks.setPinned': { params: TasksSetPinnedParams; result: Task }
  'tasks.touch': { params: IdParam; result: Task }
  'tasks.delete': { params: IdParam; result: { ok: true } }
  'tasks.setProject': { params: TasksSetProjectParams; result: Task }

  'projects.pickDirectory': {
    params: Record<string, never>
    result: { path: string } | null
  }
  'projects.list': { params: Record<string, never>; result: Project[] }
  'projects.create': { params: ProjectsCreateParams; result: Project }
  'projects.delete': { params: IdParam; result: { ok: true } }

  'sessions.createFromTask': { params: CreateSessionFromTaskParam; result: Session }
  'sessions.listByTask': { params: TaskIdParam; result: Session[] }
  'sessions.listByProject': { params: ProjectIdParam; result: Session[] }
  'sessions.touch': { params: IdParam; result: Session }

  'git.status': { params: SessionIdParam; result: GitRepositorySnapshot }
  'git.diff': { params: GitDiffParam; result: GitFileDiff }
  'git.files': { params: GitFilesParam; result: GitWorkspaceFileList }
  'git.preview': { params: GitPreviewParam; result: GitFilePreview }

  'reviews.list': { params: ReviewListParam; result: ReviewComment[] }
  'reviews.create': { params: ReviewCreateParam; result: ReviewComment }
  'reviews.update': { params: ReviewUpdateParam; result: ReviewComment }
  'reviews.delete': { params: ReviewDeleteParam; result: { ok: true } }
}

export type RpcMethodName = keyof RpcMethodMap
export type RpcParams<M extends RpcMethodName> = RpcMethodMap[M]['params']
export type RpcResult<M extends RpcMethodName> = RpcMethodMap[M]['result']
