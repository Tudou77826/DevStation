// Domain entities (Stage 2). Shared by Main (DB rows), Preload, Renderer.
// Field shapes mirror the SQLite schema in src/main/db/schema.ts.
// Times are epoch milliseconds (Date.now()), timezone-agnostic.

export type TaskStatus = 'todo' | 'in-progress' | 'done'

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  /** FK → projects.id; nullable (a task may have no project). RESTRICT on delete. */
  projectId: string | null
  branch: string
  sortOrder: number
  pinned: boolean
  /** last time the user opened/selected this task; ≠ updatedAt */
  lastOpenedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface Project {
  id: string
  name: string
  /** normalized repo root from `git rev-parse --show-toplevel`, for display/exec */
  path: string
  /** lowercased on Windows for uniqueness; identity key */
  pathKey: string
  repoUrl: string
  createdAt: number
  updatedAt: number
}

export type SessionStatus = 'idle' | 'running' | 'waiting' | 'done' | 'failed'
export type CodingAgentType = 'opencode'

export interface Session {
  id: string
  /** FK → tasks.id; NOT NULL. CASCADE on delete. */
  taskId: string
  /**
   * FK → projects.id; snapshot of the task's project at session creation time,
   * so re-associating the task later does not retroactively change historical
   * sessions. RESTRICT on delete.
   */
  projectId: string | null
  title: string
  status: SessionStatus
  /** Coding Agent used by this workspace session. MVP initially supports OpenCode. */
  agentType: CodingAgentType
  /** Provider-owned session id used by the Agent's native resume command. */
  agentSessionId: string | null
  lastOpenedAt: number | null
  createdAt: number
  updatedAt: number
}
