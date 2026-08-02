import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { ManagedAgentIntegration, ManagedIntegrationDiagnostic } from './adapter'

const PLUGIN_VERSION = 1
const MANAGED_HEADER = `// DevStation managed OpenCode event plugin v${PLUGIN_VERSION}`

export interface OpenCodeManagedIntegrationOptions {
  configRoot?: string
  env?: NodeJS.ProcessEnv
  homePath?: string
}

/** Owns one inert-by-default global OpenCode plugin file, never user config. */
export class OpenCodeManagedIntegration implements ManagedAgentIntegration {
  readonly configRoot: string
  readonly pluginPath: string

  constructor(options: OpenCodeManagedIntegrationOptions = {}) {
    this.configRoot =
      options.configRoot ??
      resolveOpenCodeConfigRoot(options.env ?? process.env, options.homePath ?? homedir())
    this.pluginPath = join(this.configRoot, 'plugins', 'devstation-events.js')
  }

  diagnose(): ManagedIntegrationDiagnostic {
    try {
      if (!existsSync(this.pluginPath)) {
        return this.result('missing', 'OpenCode 事件插件尚未安装')
      }
      const content = readFileSync(this.pluginPath, 'utf8')
      if (content === openCodePluginSource()) {
        return this.result('current', 'OpenCode 事件插件已就绪')
      }
      return content.startsWith('// DevStation managed OpenCode event plugin v')
        ? this.result('outdated', 'OpenCode 事件插件需要修复或升级')
        : this.result('conflict', '目标路径存在非 DevStation 管理的插件，未覆盖')
    } catch (error) {
      return this.result('unavailable', describeError(error))
    }
  }

  ensureInstalled(): ManagedIntegrationDiagnostic {
    const before = this.diagnose()
    if (before.state === 'current') return before
    if (before.state === 'conflict' || before.state === 'unavailable') return before
    try {
      mkdirSync(join(this.configRoot, 'plugins'), { recursive: true })
      writeFileSync(this.pluginPath, openCodePluginSource(), 'utf8')
      return this.result('current', 'OpenCode 事件插件已安装')
    } catch (error) {
      return this.result('unavailable', describeError(error))
    }
  }

  uninstall(): ManagedIntegrationDiagnostic {
    const before = this.diagnose()
    if (before.state === 'missing' || before.state === 'conflict') return before
    if (before.state === 'unavailable') return before
    try {
      rmSync(this.pluginPath, { force: true })
      return this.result('missing', 'OpenCode 事件插件已停用')
    } catch (error) {
      return this.result('unavailable', describeError(error))
    }
  }

  private result(
    state: ManagedIntegrationDiagnostic['state'],
    message: string
  ): ManagedIntegrationDiagnostic {
    return { state, path: this.pluginPath, message }
  }
}

export function resolveOpenCodeConfigRoot(
  env: NodeJS.ProcessEnv,
  homePath: string
): string {
  const xdg = env['XDG_CONFIG_HOME']
  return xdg === undefined || xdg.trim() === ''
    ? join(homePath, '.config', 'opencode')
    : join(xdg, 'opencode')
}

export function openCodePluginSource(): string {
  return `${MANAGED_HEADER}
import { randomUUID } from "node:crypto"
import { mkdirSync, renameSync, writeFileSync } from "node:fs"
import { isAbsolute, join } from "node:path"

const SAFE_ENTITY_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/
const SAFE_SESSION_ID = /^ses_[A-Za-z0-9_-]{1,120}$/
const SAFE_TOKEN = /^[a-f0-9]{64}$/

export const DevStationEvents = async ({ directory }) => {
  const inbox = process.env.DEVSTATION_AGENT_EVENT_INBOX
  const token = process.env.DEVSTATION_AGENT_EVENT_TOKEN
  const devStationSessionId = process.env.DEVSTATION_SESSION_ID
  const runId = process.env.DEVSTATION_AGENT_RUN_ID
  const enabled =
    process.env.DEVSTATION_AGENT_ID === "opencode" &&
    typeof inbox === "string" &&
    isAbsolute(inbox) &&
    SAFE_TOKEN.test(token ?? "") &&
    SAFE_ENTITY_ID.test(devStationSessionId ?? "") &&
    SAFE_ENTITY_ID.test(runId ?? "")
  if (!enabled) return {}

  const expected = process.env.DEVSTATION_OPENCODE_SESSION_ID
  let trackedSessionId = SAFE_SESSION_ID.test(expected ?? "") ? expected : null
  let lastOccurredAt = 0

  const normalizePath = (value) => {
    const normalized = String(value ?? "").replaceAll("\\\\", "/").toLowerCase()
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized
  }

  const emit = (kind, sessionRefValue) => {
    const occurredAt = Math.max(Date.now(), lastOccurredAt + 1)
    lastOccurredAt = occurredAt
    const eventId = randomUUID()
    const event = {
      version: 1,
      eventId,
      agentId: "opencode",
      devStationSessionId,
      agentRunId: runId,
      kind,
      occurredAt
    }
    if (sessionRefValue) {
      event.sessionRef = { kind: "session-id", value: sessionRefValue }
    }
    try {
      const directory = join(inbox, token)
      mkdirSync(directory, { recursive: true })
      const target = join(directory, eventId + ".json")
      const temporary = join(directory, eventId + "." + randomUUID() + ".tmp")
      writeFileSync(temporary, JSON.stringify(event), "utf8")
      renameSync(temporary, target)
    } catch {}
  }

  const bind = (info) => {
    if (trackedSessionId || !info || info.parentID) return false
    if (!SAFE_SESSION_ID.test(info.id ?? "")) return false
    if (normalizePath(info.directory) !== normalizePath(directory)) return false
    trackedSessionId = info.id
    emit("session-bound", trackedSessionId)
    return true
  }

  const isTracked = (sessionID) =>
    trackedSessionId !== null && sessionID === trackedSessionId

  return {
    event: async ({ event }) => {
      try {
        if (event.type === "session.created") {
          bind(event.properties?.info)
          return
        }
        const sessionID = event.properties?.sessionID
        if (!isTracked(sessionID)) return
        if (event.type === "session.status") {
          const status = event.properties?.status?.type
          if (status === "busy" || status === "retry") emit("working")
          if (status === "idle") emit("done")
          return
        }
        if (event.type === "session.idle") {
          emit("done")
          return
        }
        if (event.type === "permission.asked" || event.type === "question.asked") {
          emit("waiting")
          return
        }
        if (
          event.type === "permission.replied" ||
          event.type === "question.replied" ||
          event.type === "question.rejected"
        ) {
          emit("working")
          return
        }
        if (event.type === "session.error") {
          emit(event.properties?.error?.name === "MessageAbortedError" ? "ended" : "failed")
          return
        }
        if (event.type === "session.deleted") emit("ended")
      } catch {}
    }
  }
}
`
}

function describeError(error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  return `OpenCode 事件插件不可用：${detail}`
}
