import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync
} from 'node:fs'
import { basename, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { AgentEvent } from '@shared/agent'
import type { Session } from '@shared/domain'
import type { SessionRepo } from '../db/repositories'
import type { AgentRegistry } from './registry'
import { MAX_AGENT_EVENT_BYTES, parseAgentEventJson } from './agent-event'

const TOKEN_PATTERN = /^[a-f0-9]{64}$/
const EVENT_FILE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}\.json$/

interface EventRepository {
  applyAgentEvent: SessionRepo['applyAgentEvent']
}

export interface AgentEventInboxOptions {
  inboxRoot: string
  registry: AgentRegistry
  sessions: EventRepository
  pollIntervalMs?: number
  now?: () => number
  logger?: Pick<Console, 'warn' | 'error'>
  onSessionUpdated?: (session: Session) => void
}

export interface InboxConsumeResult {
  consumed: number
  quarantined: number
  retained: number
}

/** Replays atomic event files without allowing malformed input to block startup. */
export class AgentEventInbox {
  private timer: ReturnType<typeof setInterval> | null = null
  private consuming = false
  private readonly quarantineRoot: string
  private readonly now: () => number
  private readonly logger: Pick<Console, 'warn' | 'error'>

  constructor(private readonly options: AgentEventInboxOptions) {
    this.quarantineRoot = join(options.inboxRoot, '..', 'quarantine')
    this.now = options.now ?? Date.now
    this.logger = options.logger ?? console
  }

  start(): void {
    if (this.timer !== null) return
    mkdirSync(this.options.inboxRoot, { recursive: true })
    mkdirSync(this.quarantineRoot, { recursive: true })
    this.consumeNow()
    this.timer = setInterval(() => this.consumeNow(), this.options.pollIntervalMs ?? 500)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer)
    this.timer = null
  }

  consumeNow(): InboxConsumeResult {
    if (this.consuming) return { consumed: 0, quarantined: 0, retained: 0 }
    this.consuming = true
    const result: InboxConsumeResult = { consumed: 0, quarantined: 0, retained: 0 }
    try {
      for (const path of this.eventFiles()) this.consumeFile(path, result)
    } catch (error) {
      this.logger.error('[DevStation] Agent event inbox scan failed:', error)
    } finally {
      this.consuming = false
    }
    return result
  }

  private eventFiles(): string[] {
    const files: string[] = []
    mkdirSync(this.options.inboxRoot, { recursive: true })
    for (const token of readdirSync(this.options.inboxRoot)) {
      if (!TOKEN_PATTERN.test(token)) continue
      const directory = join(this.options.inboxRoot, token)
      if (!lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink())
        continue
      for (const name of readdirSync(directory)) {
        if (!EVENT_FILE_PATTERN.test(name)) continue
        const path = join(directory, name)
        if (lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink())
          files.push(path)
      }
    }
    return files.sort()
  }

  private consumeFile(path: string, result: InboxConsumeResult): void {
    let event: AgentEvent
    try {
      if (statSync(path).size > MAX_AGENT_EVENT_BYTES) {
        this.quarantine(path, 'event file exceeds size limit')
        result.quarantined += 1
        return
      }
      event = parseAgentEventJson(readFileSync(path, 'utf8'), this.now())
      this.validateAdapterEvent(event)
    } catch (error) {
      if (isTransientFilesystemError(error)) {
        this.logger.warn('[DevStation] Agent event retained for retry:', error)
        result.retained += 1
        return
      }
      this.quarantine(path, error instanceof Error ? error.message : 'invalid event')
      result.quarantined += 1
      return
    }

    let applied: ReturnType<EventRepository['applyAgentEvent']>
    try {
      applied = this.options.sessions.applyAgentEvent(event, this.now())
    } catch (error) {
      // Database contention or shutdown must never turn a valid event into bad data.
      this.logger.warn('[DevStation] Agent event retained after apply failure:', error)
      result.retained += 1
      return
    }
    if (applied.outcome === 'unknown-session') {
      this.quarantine(path, 'event references an unknown session')
      result.quarantined += 1
      return
    }
    if (
      applied.session !== null &&
      (applied.outcome === 'applied-status' || applied.outcome === 'applied-ref')
    ) {
      try {
        this.options.onSessionUpdated?.(applied.session)
      } catch (error) {
        this.logger.warn('[DevStation] Agent session update notification failed:', error)
      }
    }
    try {
      unlinkSync(path)
    } catch (error) {
      // The SQLite receipt makes the retained file safe to replay.
      this.logger.warn('[DevStation] consumed Agent event could not be removed:', error)
      result.retained += 1
      return
    }
    result.consumed += 1
  }

  private validateAdapterEvent(event: AgentEvent): void {
    const adapter = this.options.registry.get(event.agentId)
    if (adapter === null) throw new Error('Agent event references an unavailable adapter')
    if (!adapter.descriptor.capabilities.activityEvents) {
      throw new Error('Agent event was emitted by an adapter without event capability')
    }
    if (event.kind !== 'session-bound') return
    if (!adapter.descriptor.capabilities.sessionIdentity) {
      throw new Error('Agent event contains an unsupported native session reference')
    }
    const ref = adapter.validateSessionRef(event.sessionRef)
    if (ref === null) throw new Error('Agent event contains an invalid session reference')
    event.sessionRef = ref
  }

  private quarantine(path: string, reason: string): void {
    mkdirSync(this.quarantineRoot, { recursive: true })
    const target = join(
      this.quarantineRoot,
      `${this.now()}-${randomUUID()}-${basename(path)}.bad`
    )
    try {
      renameSync(path, target)
      this.logger.warn(`[DevStation] quarantined Agent event: ${reason}`)
    } catch (error) {
      this.logger.error('[DevStation] failed to quarantine Agent event:', error)
    }
  }
}

function isTransientFilesystemError(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false
  const code = (error as NodeJS.ErrnoException).code
  return code === 'EBUSY' || code === 'EACCES' || code === 'EPERM'
}
