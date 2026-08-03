// RPC method definitions: Zod schemas (.strict() + length caps) + handlers.
// Build the registry once and hand it to the dispatcher.
import { z } from 'zod'
import { app, dialog } from 'electron'
import { statSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { basename, isAbsolute } from 'node:path'
import type { AgentDiagnosticEntry } from '@shared/agent'
import { RpcRegistry, type RpcContext } from './core'
import { RpcError, invalidPath, notFound } from './errors'
import { resolveGitRepo } from '../git/validate'
import { validateRelativePath } from '../git/workspace'
import { encodePowerShellInvocation } from '../agents/agent-launch'
import type { ManagedIntegrationDiagnostic } from '../agents/adapter'

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
const agentIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/)
const createSessionFromTaskParams = z
  .object({ taskId: idSchema, agentId: agentIdSchema.optional() })
  .strict()
const projectIdParams = z.object({ projectId: idSchema }).strict()
const agentIdParams = z.object({ agentId: agentIdSchema }).strict()
const agentEnabledParams = z
  .object({ agentId: agentIdSchema, enabled: z.boolean() })
  .strict()
const agentIntegrationActionParams = z
  .object({
    agentId: agentIdSchema,
    action: z.enum(['enable', 'repair', 'disable'])
  })
  .strict()
const agentSettingParams = z
  .object({
    agentId: agentIdSchema,
    key: agentIdSchema,
    value: z.union([z.string().max(PATH_MAX), z.boolean(), z.null()])
  })
  .strict()
const sessionIdParams = z.object({ sessionId: idSchema }).strict()
const relativePathSchema = z.string().min(1).max(PATH_MAX)
const gitAreaSchema = z.enum(['staged', 'worktree'])
const gitDiffParams = z
  .object({ sessionId: idSchema, path: relativePathSchema, area: gitAreaSchema })
  .strict()
const gitPreviewParams = z
  .object({ sessionId: idSchema, path: relativePathSchema })
  .strict()
const reviewListParams = z
  .object({
    sessionId: idSchema,
    path: relativePathSchema.optional(),
    area: gitAreaSchema.optional()
  })
  .strict()
const reviewCreateParams = z
  .object({
    sessionId: idSchema,
    path: relativePathSchema,
    area: gitAreaSchema,
    side: z.enum(['old', 'new']),
    line: z.number().int().positive().max(10_000_000),
    lineContent: z.string().max(20_000),
    body: z.string().trim().min(1).max(4_000)
  })
  .strict()
const reviewUpdateParams = z
  .object({
    sessionId: idSchema,
    id: idSchema,
    body: z.string().trim().min(1).max(4_000)
  })
  .strict()
const reviewDeleteParams = z.object({ sessionId: idSchema, id: idSchema }).strict()

async function collectAgentDiagnostics(ctx: RpcContext): Promise<AgentDiagnosticEntry[]> {
  return Promise.all(
    ctx.agentRegistry.descriptors().map(async (descriptor) => {
      const adapter = ctx.agentRegistry.require(descriptor.id)
      const settings = ctx.agentSettings.effective(descriptor.id)
      const availability = await adapter.probe(settings.executablePath ?? undefined)
      const diagnostic = adapter.managedIntegration?.diagnose() ?? null
      return {
        descriptor,
        settings,
        availability,
        integration: diagnostic === null ? null : publicIntegrationDiagnostic(diagnostic)
      }
    })
  )
}

function publicIntegrationDiagnostic(
  diagnostic: ManagedIntegrationDiagnostic
): NonNullable<AgentDiagnosticEntry['integration']> {
  const messages: Record<ManagedIntegrationDiagnostic['state'], string> = {
    missing: '事件集成未安装',
    current: '事件集成已就绪',
    outdated: '事件集成需要修复或升级',
    conflict: '事件集成与现有配置冲突',
    unavailable: '事件集成当前不可用'
  }
  return { state: diagnostic.state, message: messages[diagnostic.state] }
}

// ── Build registry ───────────────────────────────────────────────────────────

export function buildRegistry(): RpcRegistry {
  const reg = new RpcRegistry()

  reg.register(
    method('agents.list', emptyParams, async (_p, { agentRegistry, agentSettings }) => {
      const available = await Promise.all(
        agentRegistry.catalog().map(async (entry) => {
          const settings = agentSettings.effective(entry.descriptor.id)
          if (!settings.enabled) return null
          const probe = await agentRegistry.probe(
            entry.descriptor.id,
            settings.executablePath ?? undefined
          )
          return probe.status === 'available'
            ? { entry, isDefault: settings.isDefault }
            : null
        })
      )
      return available
        .filter((value): value is NonNullable<typeof value> => value !== null)
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
        .map(({ entry }) => entry)
    })
  )
  reg.register(
    method('agents.diagnostics', emptyParams, (_p, ctx) => collectAgentDiagnostics(ctx))
  )
  reg.register(
    method('agents.pickExecutable', agentIdParams, async (p, ctx) => {
      const adapter = ctx.agentRegistry.get(p.agentId)
      if (adapter === null) throw notFound('Coding Agent')
      if (ctx.sender === null) return null
      const result = await dialog.showOpenDialog(ctx.sender, {
        title: `选择 ${adapter.descriptor.label} 可执行文件`,
        properties: ['openFile']
      })
      if (result.canceled || result.filePaths.length === 0) return null
      const executablePath = result.filePaths[0]
      let isFile = false
      try {
        isFile = isAbsolute(executablePath) && statSync(executablePath).isFile()
      } catch {
        isFile = false
      }
      if (!isFile) throw invalidPath('请选择真实存在的可执行文件')
      ctx.repositories.agentSettings.setExecutablePath(p.agentId, executablePath)
      return ctx.agentSettings.effective(p.agentId)
    })
  )
  reg.register(
    method('agents.clearExecutable', agentIdParams, (p, ctx) => {
      if (ctx.agentRegistry.get(p.agentId) === null) throw notFound('Coding Agent')
      ctx.repositories.agentSettings.setExecutablePath(p.agentId, null)
      return ctx.agentSettings.effective(p.agentId)
    })
  )
  reg.register(
    method('agents.setEnabled', agentEnabledParams, (p, ctx) => {
      if (ctx.agentRegistry.get(p.agentId) === null) throw notFound('Coding Agent')
      ctx.repositories.agentSettings.setEnabled(p.agentId, p.enabled)
      return ctx.agentSettings.effective(p.agentId)
    })
  )
  reg.register(
    method('agents.setDefault', agentIdParams, (p, ctx) => {
      if (ctx.agentRegistry.get(p.agentId) === null) throw notFound('Coding Agent')
      ctx.repositories.agentSettings.setDefault(p.agentId)
      return ctx.agentSettings.effective(p.agentId)
    })
  )
  reg.register(
    method('agents.setSetting', agentSettingParams, (p, ctx) => {
      try {
        return ctx.agentSettings.setValue(p.agentId, p.key, p.value)
      } catch (error) {
        throw new RpcError(
          'VALIDATION',
          error instanceof Error ? error.message : 'Coding Agent 设置不合法'
        )
      }
    })
  )
  reg.register(
    method('agents.openLoginTerminal', agentIdParams, async (p, ctx) => {
      const adapter = ctx.agentRegistry.get(p.agentId)
      if (adapter === null) throw notFound('Coding Agent')
      const settings = ctx.agentSettings.effective(p.agentId)
      const launch = adapter.buildLogin?.(settings.executablePath ?? undefined)
      if (launch === undefined) {
        throw new RpcError('CONFLICT', '该 Coding Agent 不需要独立登录终端')
      }
      const availability = await adapter.probe(settings.executablePath ?? undefined)
      if (availability.status !== 'available') {
        throw new RpcError('CONFLICT', 'CLI 当前不可用，请先修正可执行文件路径')
      }
      const child = spawn(
        'powershell.exe',
        ['-NoLogo', '-NoExit', '-Command', encodePowerShellInvocation(launch)],
        { detached: true, stdio: 'ignore', windowsHide: false }
      )
      child.unref()
      return { ok: true as const }
    })
  )
  reg.register(
    method('agents.integrationAction', agentIntegrationActionParams, (p, ctx) => {
      const integration = ctx.agentRegistry.get(p.agentId)?.managedIntegration
      if (integration === undefined) throw notFound('Agent 事件集成')
      if (p.action === 'disable') {
        const diagnostic = integration.uninstall()
        ctx.repositories.agentSettings.setIntegrationEnabled(p.agentId, false)
        return publicIntegrationDiagnostic(diagnostic)
      }
      ctx.repositories.agentSettings.setIntegrationEnabled(p.agentId, true)
      const diagnostic = integration.ensureInstalled()
      return publicIntegrationDiagnostic(diagnostic)
    })
  )

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
    method(
      'sessions.createFromTask',
      createSessionFromTaskParams,
      (p, { repositories, agentRegistry, agentSettings }) => {
        const task = repositories.tasks.get(p.taskId)
        if (task === null) throw notFound('任务')
        const agentId =
          p.agentId ??
          agentRegistry
            .descriptors()
            .find(({ id }) => agentSettings.effective(id).isDefault)?.id ??
          'opencode'
        if (agentRegistry.get(agentId) === null) throw notFound('Coding Agent')
        if (!agentSettings.effective(agentId).enabled) {
          throw new RpcError('CONFLICT', '该 Coding Agent 已停用')
        }
        return repositories.sessions.createFromTask(p.taskId, agentId)
      }
    )
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

  reg.register(
    method('git.status', sessionIdParams, (p, ctx) =>
      ctx.gitWorkspace.status(p.sessionId)
    )
  )
  reg.register(
    method('git.diff', gitDiffParams, (p, ctx) =>
      ctx.gitWorkspace.diff(p.sessionId, p.path, p.area)
    )
  )
  reg.register(
    method('git.files', sessionIdParams, (p, ctx) => ctx.gitWorkspace.files(p.sessionId))
  )
  reg.register(
    method('git.preview', gitPreviewParams, (p, ctx) =>
      ctx.gitWorkspace.preview(p.sessionId, p.path)
    )
  )
  reg.register(
    method('reviews.list', reviewListParams, (p, { repositories }) =>
      repositories.reviewComments.list(
        p.sessionId,
        p.path === undefined ? undefined : validateRelativePath(p.path),
        p.area
      )
    )
  )
  reg.register(
    method('reviews.create', reviewCreateParams, (p, { repositories }) =>
      repositories.reviewComments.create({
        ...p,
        path: validateRelativePath(p.path)
      })
    )
  )
  reg.register(
    method('reviews.update', reviewUpdateParams, (p, { repositories }) => {
      const existing = repositories.reviewComments.get(p.id)
      if (existing === null || existing.sessionId !== p.sessionId)
        throw notFound('评审意见')
      return repositories.reviewComments.update(p.id, p.body)
    })
  )
  reg.register(
    method('reviews.delete', reviewDeleteParams, (p, { repositories }) => {
      const existing = repositories.reviewComments.get(p.id)
      if (existing === null || existing.sessionId !== p.sessionId)
        throw notFound('评审意见')
      repositories.reviewComments.delete(p.id)
      return { ok: true as const }
    })
  )

  return reg
}
