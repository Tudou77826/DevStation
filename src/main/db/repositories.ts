// Repository layer: all SQL lives here. Renderer/repositories never see SQL.
//
// Conventions:
//  - IDs: crypto.randomUUID()
//  - Times: epoch ms (Date.now()); every UPDATE refreshes updated_at
//  - touch() updates ONLY last_opened_at (≠ updated_at)
//  - Default list order: pinned DESC, last_opened_at DESC, sort_order ASC, updated_at DESC
import { randomUUID } from 'node:crypto'
import type { Database, SqlValue } from './database'
import { RpcError, notFound } from '../rpc/errors'
import type { Project, Session, Task, TaskStatus } from '@shared/domain'

// ── Row → entity mappers (DB snake_case / 0|1 → domain) ──────────────────────

interface TaskRow {
  id: string
  title: string
  description: string
  status: string
  project_id: string | null
  branch: string
  sort_order: number
  pinned: number
  last_opened_at: number | null
  created_at: number
  updated_at: number
}
function mapTask(r: TaskRow): Task {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    status: r.status as TaskStatus,
    projectId: r.project_id,
    branch: r.branch,
    sortOrder: r.sort_order,
    pinned: r.pinned === 1,
    lastOpenedAt: r.last_opened_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

interface ProjectRow {
  id: string
  name: string
  path: string
  path_key: string
  repo_url: string
  created_at: number
  updated_at: number
}
function mapProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    path: r.path,
    pathKey: r.path_key,
    repoUrl: r.repo_url,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

interface SessionRow {
  id: string
  task_id: string
  project_id: string | null
  title: string
  status: string
  last_opened_at: number | null
  created_at: number
  updated_at: number
}
function mapSession(r: SessionRow): Session {
  return {
    id: r.id,
    taskId: r.task_id,
    projectId: r.project_id,
    title: r.title,
    status: r.status as Session['status'],
    lastOpenedAt: r.last_opened_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

const TASK_ORDER = 'pinned DESC, last_opened_at DESC, sort_order ASC, updated_at DESC'

// StatementSync returns Record<string, SQLOutputValue>; route through unknown.
const asRows = <T>(rows: unknown): T[] => rows as T[]
const asRow = <T>(row: unknown): T | undefined => row as T | undefined

// ── Task repository ──────────────────────────────────────────────────────────

export interface TaskListFilter {
  status?: TaskStatus
  projectId?: string
  keyword?: string
}

export class TaskRepo {
  constructor(private readonly db: Database) {}

  list(filter: TaskListFilter = {}): Task[] {
    const where: string[] = []
    const params: SqlValue[] = []
    if (filter.status !== undefined) {
      where.push('status = ?')
      params.push(filter.status)
    }
    if (filter.projectId !== undefined) {
      where.push('project_id = ?')
      params.push(filter.projectId)
    }
    if (filter.keyword !== undefined && filter.keyword.trim() !== '') {
      where.push('(title LIKE ? OR description LIKE ?)')
      const kw = `%${filter.keyword}%`
      params.push(kw, kw)
    }
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
    const stmt = this.db.prepare(`SELECT * FROM tasks ${clause} ORDER BY ${TASK_ORDER}`)
    return asRows<TaskRow>(stmt.all(...params)).map(mapTask)
  }

  get(id: string): Task | null {
    const row = asRow<TaskRow>(
      this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)
    )
    return row === undefined ? null : mapTask(row)
  }

  create(input: { title: string; description?: string }): Task {
    const now = Date.now()
    const id = randomUUID()
    this.db
      .prepare(
        `INSERT INTO tasks (id, title, description, status, project_id, branch,
                            sort_order, pinned, last_opened_at, created_at, updated_at)
         VALUES (?, ?, ?, 'todo', NULL, '', 0, 0, NULL, ?, ?)`
      )
      .run(id, input.title, input.description ?? '', now, now)
    const created = this.get(id)
    if (created === null) throw new RpcError('INTERNAL', '创建任务失败')
    return created
  }

  update(input: {
    id: string
    title?: string
    description?: string
    status?: TaskStatus
  }): Task {
    const existing = this.get(input.id)
    if (existing === null) throw notFound('任务')

    const sets: string[] = []
    const params: SqlValue[] = []
    if (input.title !== undefined) {
      sets.push('title = ?')
      params.push(input.title)
    }
    if (input.description !== undefined) {
      sets.push('description = ?')
      params.push(input.description)
    }
    if (input.status !== undefined) {
      sets.push('status = ?')
      params.push(input.status)
    }
    if (sets.length === 0) return existing // nothing to change
    sets.push('updated_at = ?')
    params.push(Date.now())
    params.push(input.id)
    this.db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params)
    const updated = this.get(input.id)
    if (updated === null) throw notFound('任务')
    return updated
  }

  setPinned(id: string, pinned: boolean): Task {
    const existing = this.get(id)
    if (existing === null) throw notFound('任务')
    this.db
      .prepare('UPDATE tasks SET pinned = ?, updated_at = ? WHERE id = ?')
      .run(pinned ? 1 : 0, Date.now(), id)
    return this.get(id)!
  }

  /** Update ONLY last_opened_at (does not touch updated_at). */
  touch(id: string): Task {
    const existing = this.get(id)
    if (existing === null) throw notFound('任务')
    this.db
      .prepare('UPDATE tasks SET last_opened_at = ? WHERE id = ?')
      .run(Date.now(), id)
    return this.get(id)!
  }

  setProject(id: string, projectId: string | null): Task {
    const existing = this.get(id)
    if (existing === null) throw notFound('任务')
    if (
      projectId !== null &&
      this.db.prepare('SELECT 1 FROM projects WHERE id = ?').get(projectId) === undefined
    ) {
      throw notFound('项目')
    }
    this.db
      .prepare('UPDATE tasks SET project_id = ?, updated_at = ? WHERE id = ?')
      .run(projectId, Date.now(), id)
    return this.get(id)!
  }

  delete(id: string): void {
    // sessions.task_id CASCADE — sessions are removed automatically.
    const stmt = this.db.prepare('DELETE FROM tasks WHERE id = ?')
    const result = stmt.run(id)
    if (result.changes === 0) throw notFound('任务')
  }
}

// ── Project repository ───────────────────────────────────────────────────────

export class ProjectRepo {
  constructor(private readonly db: Database) {}

  list(): Project[] {
    const rows = asRows<ProjectRow>(
      this.db.prepare('SELECT * FROM projects ORDER BY name ASC').all()
    )
    return rows.map(mapProject)
  }

  get(id: string): Project | null {
    const row = asRow<ProjectRow>(
      this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
    )
    return row === undefined ? null : mapProject(row)
  }

  getByPathKey(pathKey: string): Project | null {
    const row = asRow<ProjectRow>(
      this.db.prepare('SELECT * FROM projects WHERE path_key = ?').get(pathKey)
    )
    return row === undefined ? null : mapProject(row)
  }

  create(input: {
    name: string
    path: string
    pathKey: string
    repoUrl?: string
  }): Project {
    const now = Date.now()
    const id = randomUUID()
    try {
      this.db
        .prepare(
          `INSERT INTO projects (id, name, path, path_key, repo_url, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, input.name, input.path, input.pathKey, input.repoUrl ?? '', now, now)
    } catch (err) {
      // UNIQUE(path_key) collision → conflict
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('path_key') || msg.includes('UNIQUE')) {
        throw new RpcError('CONFLICT', '该项目已添加')
      }
      throw err
    }
    return this.get(id)!
  }

  /** Pre-check references; FK RESTRICT is the final backstop. */
  isReferenced(id: string): boolean {
    const t = this.db.prepare('SELECT 1 FROM tasks WHERE project_id = ? LIMIT 1').get(id)
    if (t !== undefined) return true
    const s = this.db
      .prepare('SELECT 1 FROM sessions WHERE project_id = ? LIMIT 1')
      .get(id)
    return s !== undefined
  }

  delete(id: string): void {
    if (this.get(id) === null) throw notFound('项目')
    if (this.isReferenced(id)) {
      throw new RpcError('PROJECT_IN_USE', '该项目仍被任务或会话引用，无法删除')
    }
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }
}

// ── Session repository ───────────────────────────────────────────────────────

export class SessionRepo {
  constructor(private readonly db: Database) {}

  listByTask(taskId: string): Session[] {
    const rows = asRows<SessionRow>(
      this.db
        .prepare(
          'SELECT * FROM sessions WHERE task_id = ? ORDER BY last_opened_at DESC, created_at DESC'
        )
        .all(taskId)
    )
    return rows.map(mapSession)
  }

  listByProject(projectId: string): Session[] {
    const rows = asRows<SessionRow>(
      this.db
        .prepare(
          'SELECT * FROM sessions WHERE project_id = ? ORDER BY last_opened_at DESC, created_at DESC'
        )
        .all(projectId)
    )
    return rows.map(mapSession)
  }

  get(id: string): Session | null {
    const row = asRow<SessionRow>(
      this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
    )
    return row === undefined ? null : mapSession(row)
  }

  /**
   * Create a session bound to a task; snapshot the task's current project.
   * Does NOT start an Agent or register a Hook (Stage 2 boundary).
   */
  createFromTask(taskId: string): Session {
    const task = asRow<TaskRow>(
      this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId)
    )
    if (task === undefined) throw notFound('任务')

    const now = Date.now()
    const id = randomUUID()
    const title = task.title ? `${task.title} 会话` : '工作会话'
    this.db
      .prepare(
        `INSERT INTO sessions (id, task_id, project_id, title, status,
                               last_opened_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'idle', ?, ?, ?)`
      )
      .run(id, taskId, task.project_id, title, now, now, now)
    return this.get(id)!
  }

  /** Update ONLY last_opened_at (does not touch updated_at). */
  touch(id: string): Session {
    const existing = this.get(id)
    if (existing === null) throw notFound('会话')
    this.db
      .prepare('UPDATE sessions SET last_opened_at = ? WHERE id = ?')
      .run(Date.now(), id)
    return this.get(id)!
  }
}
