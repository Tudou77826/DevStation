import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { AGENT_EVENT_VERSION, type AgentEvent } from '@shared/agent'
import { ManagedEventBridge } from './managed-event-bridge'
import {
  ChrysManagedIntegration,
  resolveChrysConfigRoot
} from './chrys-managed-integration'

const tempDirectories: string[] = []

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'devstation-chrys-'))
  tempDirectories.push(directory)
  return directory
}

describe('ChrysManagedIntegration', () => {
  it('incrementally installs, repairs and removes only DevStation hooks', () => {
    const root = temporaryDirectory()
    const hooksPath = join(root, 'hooks', 'hooks.yaml')
    const integration = new ChrysManagedIntegration({ configRoot: root })
    mkdirSync(join(root, 'hooks'), { recursive: true })
    writeFileSync(
      hooksPath,
      `# keep this user comment\nversion: 1\nhooks:\n  # keep this hook comment\n  - id: user-hook\n    event: before_turn\n    run:\n      type: command\n      argv: [user-command]\n`,
      'utf8'
    )

    expect(integration.ensureInstalled().state).toBe('current')
    expect(integration.ensureInstalled().state).toBe('current')
    const installedText = readFileSync(hooksPath, 'utf8')
    const installed = parse(installedText) as {
      hooks: Array<{
        id: string
        event: string
        match?: { tool_name: string }
      }>
    }
    expect(installedText).toContain('# keep this user comment')
    expect(installedText).toContain('# keep this hook comment')
    expect(installed.hooks.filter((hook) => hook.id === 'user-hook')).toHaveLength(1)
    expect(
      installed.hooks.filter((hook) => hook.id.startsWith('devstation-'))
    ).toHaveLength(8)
    expect(
      installed.hooks.find((hook) => hook.id === 'devstation-user-attention-requested')
    ).toMatchObject({
      event: 'before_tool_call',
      match: { tool_name: 'ask_user' }
    })
    expect(
      installed.hooks.find((hook) => hook.id === 'devstation-user-attention-resolved')
    ).toMatchObject({
      event: 'after_tool_call',
      match: { tool_name: 'ask_user' }
    })
    expect(integration.diagnose().state).toBe('current')

    expect(integration.uninstall().state).toBe('missing')
    const uninstalledText = readFileSync(hooksPath, 'utf8')
    const uninstalled = parse(uninstalledText) as { hooks: Array<{ id: string }> }
    expect(uninstalledText).toContain('# keep this hook comment')
    expect(uninstalled.hooks.map((hook) => hook.id)).toEqual(['user-hook'])
  })

  it('migrates the v1 attention events to stock Chrys ask_user hooks', () => {
    const root = temporaryDirectory()
    const hooksPath = join(root, 'hooks', 'hooks.yaml')
    const integration = new ChrysManagedIntegration({ configRoot: root })
    mkdirSync(join(root, 'hooks'), { recursive: true })
    writeFileSync(
      hooksPath,
      `version: 1
hooks:
  - id: devstation-user-attention-requested
    event: user_attention_requested
    description: DevStation managed Chrys event observer v1
    run: { type: script, path: old-reporter.ps1 }
    execution: { mode: async, timeout_seconds: 5, on_error: ignore }
  - id: devstation-user-attention-resolved
    event: user_attention_resolved
    description: DevStation managed Chrys event observer v1
    run: { type: script, path: old-reporter.ps1 }
    execution: { mode: async, timeout_seconds: 5, on_error: ignore }
`,
      'utf8'
    )

    expect(integration.diagnose().state).toBe('outdated')
    expect(integration.ensureInstalled().state).toBe('current')
    const installed = parse(readFileSync(hooksPath, 'utf8')) as {
      hooks: Array<{
        id: string
        event: string
        description: string
        match?: { tool_name: string }
      }>
    }
    expect(installed.hooks.some((hook) => hook.event.startsWith('user_attention_'))).toBe(
      false
    )
    expect(
      installed.hooks.find((hook) => hook.id === 'devstation-user-attention-requested')
    ).toMatchObject({
      event: 'before_tool_call',
      description: 'DevStation managed Chrys event observer v2',
      match: { tool_name: 'ask_user' }
    })
    expect(integration.diagnose().state).toBe('current')
  })

  it('refuses to overwrite a user hook that owns a managed id', () => {
    const root = temporaryDirectory()
    const hooksPath = join(root, 'hooks', 'hooks.json')
    const integration = new ChrysManagedIntegration({ configRoot: root })
    mkdirSync(join(root, 'hooks'), { recursive: true })
    writeFileSync(
      hooksPath,
      JSON.stringify({
        version: 1,
        hooks: [
          {
            id: 'devstation-session-start',
            event: 'session_start',
            run: { type: 'command', argv: ['user-command'] }
          }
        ]
      }),
      'utf8'
    )

    expect(integration.ensureInstalled().state).toBe('conflict')
    expect(readFileSync(hooksPath, 'utf8')).toContain('user-command')
  })

  it('maps real Chrys hook payloads into the provider-neutral inbox', () => {
    const root = temporaryDirectory()
    const integration = new ChrysManagedIntegration({ configRoot: join(root, 'chrys') })
    expect(integration.ensureInstalled().state).toBe('current')
    const bridge = new ManagedEventBridge(join(root, 'agent-events'))
    bridge.ensureInstalled()
    const token = 'a'.repeat(64)
    const nativeSessionId = 'aa72fa1e-801f-44a6-a902-f23bb85296cb'
    const hookPayloads = [
      { event: 'session_start', session_id: nativeSessionId },
      { event: 'before_turn', session_id: nativeSessionId },
      {
        event: 'before_tool_call',
        session_id: nativeSessionId,
        tool: { name: 'ask_user' }
      },
      {
        event: 'before_tool_call',
        session_id: nativeSessionId,
        tool: { name: 'shell' }
      },
      {
        event: 'after_tool_call',
        session_id: nativeSessionId,
        tool: { name: 'ask_user' }
      },
      { event: 'after_turn', session_id: nativeSessionId, status: 'failed' },
      { event: 'session_end', session_id: nativeSessionId }
    ]

    const payloadPaths = hookPayloads.map((payload, index) => {
      const path = join(root, `payload-${index}.json`)
      writeFileSync(path, JSON.stringify(payload), 'utf8')
      return path
    })
    const runnerPath = join(root, 'invoke-chrys-hooks.ps1')
    writeFileSync(
      runnerPath,
      [
        "$ErrorActionPreference = 'Stop'",
        '$reporterPath = $env:DEVSTATION_CHRYS_TEST_REPORTER',
        '$payloadPaths = ConvertFrom-Json $env:DEVSTATION_CHRYS_TEST_PAYLOADS',
        'foreach ($payloadPath in $payloadPaths) {',
        '  $env:CHRYS_HOOK_PAYLOAD_FILE = $payloadPath',
        '  & $reporterPath',
        '}'
      ].join('\n'),
      'utf8'
    )
    execFileSync('powershell.exe', ['-NoProfile', '-File', runnerPath], {
      env: {
        ...process.env,
        DEVSTATION_CHRYS_TEST_REPORTER: integration.reporterPath,
        DEVSTATION_CHRYS_TEST_PAYLOADS: JSON.stringify(payloadPaths),
        DEVSTATION_AGENT_EVENT_BRIDGE: bridge.scriptPath,
        DEVSTATION_AGENT_EVENT_TOKEN: token,
        DEVSTATION_AGENT_EVENT_INBOX: bridge.inboxRoot,
        DEVSTATION_AGENT_ID: 'chrys',
        DEVSTATION_SESSION_ID: 'session-1',
        DEVSTATION_AGENT_RUN_ID: 'run-1'
      },
      stdio: 'pipe'
    })

    const events = readdirSync(join(bridge.inboxRoot, token)).map(
      (name) =>
        JSON.parse(
          readFileSync(join(bridge.inboxRoot, token, name), 'utf8')
        ) as AgentEvent
    )
    expect(events.every((event) => event.version === AGENT_EVENT_VERSION)).toBe(true)
    expect(events.map((event) => event.kind).sort()).toEqual(
      [
        'session-bound',
        'started',
        'working',
        'waiting',
        'working',
        'failed',
        'ended'
      ].sort()
    )
    expect(events.find((event) => event.kind === 'session-bound')?.sessionRef).toEqual({
      kind: 'chrys-session-id',
      value: nativeSessionId
    })
  }, 30_000)

  it('resolves the Windows roaming Chrys config root', () => {
    expect(resolveChrysConfigRoot({ APPDATA: 'D:\\roaming' }, 'C:\\Users\\dev')).toBe(
      process.platform === 'win32' ? 'D:\\roaming\\chrys' : 'C:\\Users\\dev\\.chrys'
    )
  })
})
