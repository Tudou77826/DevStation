// Durable domain entities shared by Main, Preload and Renderer.
// Field shapes mirror the SQLite schema in src/main/db/schema.ts.
// Times are epoch milliseconds (Date.now()), timezone-agnostic.

import type { AgentSessionRef } from './agent'

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

export type SessionStatus =
  'unknown' | 'starting' | 'working' | 'waiting' | 'done' | 'failed'
export type AgentStatusSource = 'none' | 'provider-event'

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
  /** Stable adapter registry key. Unknown historical values remain readable. */
  agentId: string
  /** Provider-owned reference used by the Agent's native resume command. */
  agentSessionRef: AgentSessionRef | null
  /** Current Agent process generation; changes only when a new PTY is created. */
  agentRunId: string | null
  /** Source of the Agent status; PTY lifecycle is deliberately not a status source. */
  statusSource: AgentStatusSource
  statusUpdatedAt: number | null
  lastOpenedAt: number | null
  createdAt: number
  updatedAt: number
}
