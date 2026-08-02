import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AGENT_EVENT_VERSION, type AgentEvent } from '@shared/agent'
import { parseAgentEventJson } from './agent-event'
import { ManagedEventBridge } from './managed-event-bridge'

const roots: string[] = []

function bridge(): ManagedEventBridge {
  const root = mkdtempSync(join(tmpdir(), 'devstation-event-bridge-'))
  roots.push(root)
  return new ManagedEventBridge(root)
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('ManagedEventBridge', () => {
  it('installs, detects drift and repairs the owned bridge', () => {
    const managed = bridge()
    expect(managed.status()).toBe('missing')
    expect(managed.ensureInstalled()).toBe('missing')
    expect(managed.status()).toBe('current')
    writeFileSync(managed.scriptPath, '# drift', 'utf8')
    expect(managed.status()).toBe('outdated')
    expect(managed.ensureInstalled()).toBe('outdated')
    expect(readFileSync(managed.scriptPath, 'utf8')).toContain(
      'DevStation managed Agent event bridge v1'
    )
    managed.uninstall()
    expect(managed.status()).toBe('missing')
  })

  it('injects a distinct run identity and writes only a completed json file', () => {
    const managed = bridge()
    managed.ensureInstalled()
    const spec = managed.enrichLaunchSpec(
      { executable: 'agent', args: [], env: { KEEP: 'yes' } },
      { agentId: 'opencode', devStationSessionId: 'session-1', agentRunId: 'run-1' }
    )
    expect(spec.env).toMatchObject({
      KEEP: 'yes',
      DEVSTATION_AGENT_ID: 'opencode',
      DEVSTATION_SESSION_ID: 'session-1',
      DEVSTATION_AGENT_RUN_ID: 'run-1'
    })
    expect(spec.env['DEVSTATION_AGENT_EVENT_TOKEN']).toMatch(/^[a-f0-9]{64}$/)

    const event: AgentEvent = {
      version: AGENT_EVENT_VERSION,
      eventId: 'event-1',
      agentId: 'opencode',
      devStationSessionId: 'session-1',
      agentRunId: 'run-1',
      kind: 'working',
      occurredAt: 1_000
    }
    const path = managed.writeEvent(spec.env['DEVSTATION_AGENT_EVENT_TOKEN']!, event)
    expect(parseAgentEventJson(readFileSync(path, 'utf8'), 1_000)).toEqual(event)
    expect(
      readdirSync(join(managed.inboxRoot, spec.env['DEVSTATION_AGENT_EVENT_TOKEN']!))
    ).toEqual(['event-1.json'])
    expect(() =>
      managed.writeEvent(spec.env['DEVSTATION_AGENT_EVENT_TOKEN']!, {
        ...event,
        eventId: 'drive:stream'
      })
    ).toThrow('Invalid eventId')
  })

  it.skipIf(
    process.platform !== 'win32' ||
      process.env['npm_lifecycle_event'] !== 'test:event-bridge'
  )(
    'writes an event through the standalone PowerShell bridge while Electron is absent',
    () => {
      const managed = bridge()
      managed.ensureInstalled()
      const spec = managed.enrichLaunchSpec(
        { executable: 'agent', args: [], env: {} },
        { agentId: 'opencode', devStationSessionId: 'session-1', agentRunId: 'run-1' }
      )
      execFileSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-File',
          managed.scriptPath,
          '-Kind',
          'working',
          '-EventId',
          'event-from-hook',
          '-OccurredAt',
          '1234'
        ],
        { env: { ...process.env, ...spec.env }, stdio: 'pipe' }
      )
      const token = spec.env['DEVSTATION_AGENT_EVENT_TOKEN']!
      const names = readdirSync(join(managed.inboxRoot, token))
      expect(names).toHaveLength(1)
      const event = parseAgentEventJson(
        readFileSync(join(managed.inboxRoot, token, names[0]!), 'utf8')
      )
      expect(event).toMatchObject({
        version: AGENT_EVENT_VERSION,
        agentId: 'opencode',
        devStationSessionId: 'session-1',
        agentRunId: 'run-1',
        kind: 'working',
        eventId: 'event-from-hook',
        occurredAt: 1234
      })
    }
  )
})
