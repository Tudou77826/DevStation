// RPC method definitions: Zod schemas (.strict() + length caps) + handlers.
// Build the registry once and hand it to the dispatcher.
import { z } from 'zod'
import { app, dialog } from 'electron'
import { basename } from 'node:path'
import { RpcRegistry, type RpcContext } from './core'
import { RpcError, invalidPath, notFound } from './errors'
import { resolveGitRepo } from '../git/validate'

// helper to define a method with params inferred from its schema
function method<P, R>(
  name: string,
  params: z.ZodType<P>,
  handler: (params: P, ctx: RpcContext) => R | Promise<R>
): {
  name: string
  params: z.ZodTypeAny
  handler: (params: P, ctx: RpcContext) => R | Promise<R>
} {
  return { name, params, handler }
}

// ── Field constraints ────────────────────────────────────────────────────────
const TITLE_MAX = 200
const DESC_MAX = 4000
const PATH_MAX = 1024

const idSchema = z.string().min(1).max(64)
const titleSchema = z.string().min(1).max(TITLE_MAX)
const descSchema = z.string().max(DESC_MAX).default('')
const pathSchema = z.string().min(1).max(PATH_MAX)
const taskStatusSchema = z.enum(['todo', 'in-progress', 'done'])

// ── Param schemas (strict: reject unknown keys) ──────────────────────────────
const tasksListParams = z
  .object({
    status: taskStatusSchema.optional(),
    projectId: idSchema.optional(),
    keyword: z.string().max(200).optional()
  })
  .strict()

const tasksCreateParams = z
  .object({ title: titleSchema, description: descSchema.optional() })
  .strict()

const tasksUpdateParams = z
  .object({
    id: idSchema,
    title: titleSchema.optional(),
    description: descSchema.optional(),
    status: taskStatusSchema.optional()
  })
  .strict()

const tasksSetPinnedParams = z.object({ id: idSchema, pinned: z.boolean() }).strict()
const idParams = z.object({ id: idSchema }).strict()
const tasksSetProjectParams = z
  .object({ id: idSchema, projectId: idSchema.nullable().optional() })
  .strict()

const projectsCreateParams = z
  .object({ name: z.string().min(1).max(100), path: pathSchema })
  .strict()
const emptyParams = z.object({}).strict()
const taskIdParams = z.object({ taskId: idSchema }).strict()
const projectIdParams = z.object({ projectId: idSchema }).strict()

// ── Build registry ───────────────────────────────────────────────────────────

export function buildRegistry(): RpcRegistry {
  const reg = new RpcRegistry()

  // tasks
  reg.register(
    method('tasks.list', tasksListParams, (p, { repositories }) =>
      repositories.tasks.list(p)
    )
  )
  reg.register(
    method('tasks.create', tasksCreateParams, (p, { repositories }) =>
      repositories.tasks.create(p)
    )
  )
  reg.register(
    method('tasks.update', tasksUpdateParams, (p, { repositories }) =>
      repositories.tasks.update(p)
    )
  )
  reg.register(
    method('tasks.setPinned', tasksSetPinnedParams, (p, { repositories }) =>
      repositories.tasks.setPinned(p.id, p.pinned)
    )
  )
  reg.register(
    method('tasks.touch', idParams, (p, { repositories }) =>
      repositories.tasks.touch(p.id)
    )
  )
  reg.register(
    method('tasks.delete', idParams, (p, { repositories }) => {
      repositories.tasks.delete(p.id)
      return { ok: true as const }
    })
  )
  reg.register(
    method('tasks.setProject', tasksSetProjectParams, (p, { repositories }) =>
      repositories.tasks.setProject(p.id, p.projectId ?? null)
    )
  )

  // projects
  reg.register(
    method('projects.pickDirectory', emptyParams, async (_p, { sender }) => {
      const e2eProjectPath = process.env['DEVSTATION_E2E_PROJECT_PATH']
      if (!app.isPackaged && process.env['DEVSTATION_E2E'] === '1' && e2eProjectPath) {
        return { path: e2eProjectPath }
      }
      if (sender === null) return null
      const result = await dialog.showOpenDialog(sender, {
        properties: ['openDirectory']
      })
      if (result.canceled || result.filePaths.length === 0) return null
      return { path: result.filePaths[0] }
    })
  )
  reg.register(
    method('projects.list', emptyParams, (_p, { repositories }) =>
      repositories.projects.list()
    )
  )
  reg.register(
    method('projects.create', projectsCreateParams, async (p, { repositories }) => {
      const resolved = await resolveGitRepo(p.path).catch((e: unknown) => {
        if (e instanceof RpcError) throw e
        throw invalidPath('无法校验该路径')
      })
      if (repositories.projects.getByPathKey(resolved.pathKey) !== null) {
        throw new RpcError('CONFLICT', '该项目已添加')
      }
      // The selected directory may be nested inside the repository. Derive
      // the display name from the resolved Git root so name and path agree.
      const name = basename(resolved.path) || p.name.trim()
      return repositories.projects.create({
        name,
        path: resolved.path,
        pathKey: resolved.pathKey
      })
    })
  )
  reg.register(
    method('projects.delete', idParams, (p, { repositories }) => {
      repositories.projects.delete(p.id) // throws PROJECT_IN_USE if referenced
      return { ok: true as const }
    })
  )

  // sessions
  reg.register(
    method('sessions.createFromTask', taskIdParams, (p, { repositories }) => {
      const task = repositories.tasks.get(p.taskId)
      if (task === null) throw notFound('任务')
      return repositories.sessions.createFromTask(p.taskId)
    })
  )
  reg.register(
    method('sessions.listByTask', taskIdParams, (p, { repositories }) =>
      repositories.sessions.listByTask(p.taskId)
    )
  )
  reg.register(
    method('sessions.listByProject', projectIdParams, (p, { repositories }) =>
      repositories.sessions.listByProject(p.projectId)
    )
  )
  reg.register(
    method('sessions.touch', idParams, (p, { repositories }) =>
      repositories.sessions.touch(p.id)
    )
  )

  return reg
}
