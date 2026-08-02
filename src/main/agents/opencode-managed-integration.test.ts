import { pathToFileURL } from 'node:url'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Database } from '../db/database'
import { SessionRepo, TaskRepo } from '../db/repositories'
import { initializeDatabase } from '../db/schema'
import { AgentEventInbox } from './agent-event-inbox'
import { parseAgentEventJson } from './agent-event'
import { ManagedEventBridge } from './managed-event-bridge'
import { OpenCodeAdapter } from './opencode-adapter'
import {
  OpenCodeManagedIntegration,
  openCodePluginSource,
  resolveOpenCodeConfigRoot
} from './opencode-managed-integration'
import { AgentRegistry } from './registry'

const roots: string[] = []

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'devstation-opencode-plugin-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('OpenCodeManagedIntegration', () => {
  it('installs, diagnoses, repairs and removes only its owned plugin', () => {
    const root = tempRoot()
    const integration = new OpenCodeManagedIntegration({ configRoot: root })
    expect(integration.diagnose()).toMatchObject({ state: 'missing' })
    expect(integration.ensureInstalled()).toMatchObject({ state: 'current' })
    expect(readFileSync(integration.pluginPath, 'utf8')).toBe(openCodePluginSource())

    writeFileSync(
      integration.pluginPath,
      '// DevStation managed OpenCode event plugin v0\n',
      'utf8'
    )
    expect(integration.diagnose()).toMatchObject({ state: 'outdated' })
    expect(integration.ensureInstalled()).toMatchObject({ state: 'current' })
    expect(integration.uninstall()).toMatchObject({ state: 'missing' })
  })

  it('does not overwrite or remove a foreign file at the managed path', () => {
    const root = tempRoot()
    const integration = new OpenCodeManagedIntegration({ configRoot: root })
    integration.ensureInstalled()
    writeFileSync(integration.pluginPath, 'export const UserPlugin = async () => ({})\n')
    expect(integration.ensureInstalled()).toMatchObject({ state: 'conflict' })
    expect(integration.uninstall()).toMatchObject({ state: 'conflict' })
    expect(readFileSync(integration.pluginPath, 'utf8')).toContain('UserPlugin')
  })

  it('uses the OpenCode global config directory without editing opencode.json', () => {
    expect(resolveOpenCodeConfigRoot({}, 'C:\\Users\\dev')).toBe(
      join('C:\\Users\\dev', '.config', 'opencode')
    )
    expect(
      resolveOpenCodeConfigRoot({ XDG_CONFIG_HOME: 'D:\\xdg' }, 'C:\\Users\\dev')
    ).toBe(join('D:\\xdg', 'opencode'))
  })

  it('stays inert when OpenCode is not launched by DevStation', async () => {
    const root = tempRoot()
    const modulePath = join(root, 'devstation-events.mjs')
    writeFileSync(modulePath, openCodePluginSource(), 'utf8')
    const module = (await import(
      `${pathToFileURL(modulePath).href}?inert=${Date.now()}`
    )) as {
      DevStationEvents: (input: { directory: string }) => Promise<Record<string, unknown>>
    }
    expect(await module.DevStationEvents({ directory: root })).toEqual({})
  })

  it('maps one tracked top-level OpenCode session into ordered unified events', async () => {
    const root = tempRoot()
    const eventRoot = join(root, 'agent-events')
    const bridge = new ManagedEventBridge(eventRoot)
    bridge.ensureInstalled()
    const token = 'b'.repeat(64)
    const db = new Database(':memory:')
    initializeDatabase(db)
    const tasks = new TaskRepo(db)
    const sessions = new SessionRepo(db)
    const task = tasks.create({ title: 'Plugin mapping' })
    const session = sessions.createFromTask(task.id, 'opencode')
    sessions.startAgentRun(session.id, 'run-1')
    const previous = { ...process.env }
    Object.assign(process.env, {
      DEVSTATION_AGENT_ID: 'opencode',
      DEVSTATION_AGENT_EVENT_INBOX: bridge.inboxRoot,
      DEVSTATION_AGENT_EVENT_TOKEN: token,
      DEVSTATION_SESSION_ID: session.id,
      DEVSTATION_AGENT_RUN_ID: 'run-1'
    })
    try {
      const modulePath = join(root, 'devstation-events.mjs')
      writeFileSync(modulePath, openCodePluginSource(), 'utf8')
      const module = (await import(
        `${pathToFileURL(modulePath).href}?active=${Date.now()}`
      )) as {
        DevStationEvents: (input: { directory: string }) => Promise<{
          event: (input: { event: unknown }) => Promise<void>
        }>
      }
      const project = join(root, 'repo')
      const hooks = await module.DevStationEvents({ directory: project })
      await hooks.event({
        event: {
          type: 'session.updated',
          properties: { info: { id: 'ses_historical', directory: project } }
        }
      })
      await hooks.event({
        event: {
          type: 'session.created',
          properties: { info: { id: 'ses_other', directory: join(root, 'other') } }
        }
      })
      await hooks.event({
        event: {
          type: 'session.created',
          properties: {
            info: { id: 'ses_child', parentID: 'ses_parent', directory: project }
          }
        }
      })
      await hooks.event({
        event: {
          type: 'session.created',
          properties: { info: { id: 'ses_native1', directory: project } }
        }
      })
      for (const event of [
        {
          type: 'session.status',
          properties: { sessionID: 'ses_native1', status: { type: 'busy' } }
        },
        { type: 'permission.asked', properties: { sessionID: 'ses_native1' } },
        { type: 'permission.replied', properties: { sessionID: 'ses_native1' } },
        {
          type: 'session.status',
          properties: { sessionID: 'ses_native1', status: { type: 'idle' } }
        }
      ]) {
        await hooks.event({ event })
      }

      const directory = join(bridge.inboxRoot, token)
      const events = readdirSync(directory)
        .filter((name) => name.endsWith('.json'))
        .map((name) => parseAgentEventJson(readFileSync(join(directory, name), 'utf8')))
        .sort((a, b) => a.occurredAt - b.occurredAt)
      expect(events.map((event) => event.kind)).toEqual([
        'session-bound',
        'working',
        'waiting',
        'working',
        'done'
      ])
      expect(events[0]?.sessionRef).toEqual({ kind: 'session-id', value: 'ses_native1' })
      expect(new Set(events.map((event) => event.agentRunId))).toEqual(new Set(['run-1']))

      const inbox = new AgentEventInbox({
        inboxRoot: bridge.inboxRoot,
        registry: new AgentRegistry([
          new OpenCodeAdapter({
            snapshot: () => new Set(),
            findCreatedSession: () => null
          })
        ]),
        sessions
      })
      expect(inbox.consumeNow()).toEqual({ consumed: 5, quarantined: 0, retained: 0 })
      expect(sessions.get(session.id)).toMatchObject({
        status: 'done',
        statusSource: 'provider-event',
        agentSessionRef: { kind: 'session-id', value: 'ses_native1' }
      })
    } finally {
      process.env = previous
      db.close()
    }
  })
})
