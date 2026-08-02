import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  AGENT_EVENT_VERSION,
  type AgentEvent,
  type AgentLaunchSpec
} from '../../shared/agent'
import { parseAgentEvent } from './agent-event'

const BRIDGE_VERSION = 1
const MANAGED_HEADER = `# DevStation managed Agent event bridge v${BRIDGE_VERSION}`
const TOKEN_PATTERN = /^[a-f0-9]{64}$/

export type ManagedBridgeStatus = 'missing' | 'current' | 'outdated'

export interface AgentRunIdentity {
  agentId: string
  devStationSessionId: string
  agentRunId: string
}

/**
 * Installs the stable PowerShell writer used by provider hooks and injects a
 * per-run inbox identity into Agent processes. The token is correlation only;
 * every consumed event is still validated against SQLite's current run.
 */
export class ManagedEventBridge {
  readonly inboxRoot: string
  readonly scriptPath: string

  constructor(readonly rootPath: string) {
    this.inboxRoot = join(rootPath, 'inbox')
    this.scriptPath = join(rootPath, 'bridge', 'devstation-agent-event.ps1')
  }

  status(): ManagedBridgeStatus {
    try {
      return readFileSync(this.scriptPath, 'utf8') === bridgeScript()
        ? 'current'
        : 'outdated'
    } catch {
      return 'missing'
    }
  }

  ensureInstalled(): ManagedBridgeStatus {
    const previous = this.status()
    mkdirSync(dirname(this.scriptPath), { recursive: true })
    mkdirSync(this.inboxRoot, { recursive: true })
    if (previous !== 'current') writeFileSync(this.scriptPath, bridgeScript(), 'utf8')
    return previous
  }

  uninstall(): void {
    rmSync(this.scriptPath, { force: true })
  }

  enrichLaunchSpec(spec: AgentLaunchSpec, identity: AgentRunIdentity): AgentLaunchSpec {
    const token = randomBytes(32).toString('hex')
    return {
      ...spec,
      env: {
        ...spec.env,
        DEVSTATION_AGENT_EVENT_VERSION: String(AGENT_EVENT_VERSION),
        DEVSTATION_AGENT_EVENT_BRIDGE: this.scriptPath,
        DEVSTATION_AGENT_EVENT_INBOX: this.inboxRoot,
        DEVSTATION_AGENT_EVENT_TOKEN: token,
        DEVSTATION_AGENT_ID: identity.agentId,
        DEVSTATION_SESSION_ID: identity.devStationSessionId,
        DEVSTATION_AGENT_RUN_ID: identity.agentRunId
      }
    }
  }

  /** Native equivalent of the managed script, used by direct integrations and tests. */
  writeEvent(token: string, event: AgentEvent): string {
    if (!TOKEN_PATTERN.test(token)) throw new Error('Invalid Agent event token')
    const validated = parseAgentEvent(event)
    const directory = join(this.inboxRoot, token)
    mkdirSync(directory, { recursive: true })
    const target = join(directory, `${validated.eventId}.json`)
    const temporary = join(directory, `${validated.eventId}.${randomUUID()}.tmp`)
    writeFileSync(temporary, JSON.stringify(validated), 'utf8')
    renameSync(temporary, target)
    return target
  }
}

function bridgeScript(): string {
  return `${MANAGED_HEADER}
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('session-bound','started','working','waiting','done','failed','ended')]
  [string]$Kind,
  [string]$SessionRefKind,
  [string]$SessionRefValue,
  [string]$TranscriptPath
)
$ErrorActionPreference = 'Stop'
$token = $env:DEVSTATION_AGENT_EVENT_TOKEN
$inbox = $env:DEVSTATION_AGENT_EVENT_INBOX
$agentId = $env:DEVSTATION_AGENT_ID
$sessionId = $env:DEVSTATION_SESSION_ID
$runId = $env:DEVSTATION_AGENT_RUN_ID
if ($token -notmatch '^[a-f0-9]{64}$') { throw 'Invalid DevStation event token' }
if (-not [IO.Path]::IsPathRooted($inbox)) { throw 'Invalid DevStation inbox path' }
foreach ($id in @($agentId, $sessionId, $runId)) {
  if ($id -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$') { throw 'Invalid DevStation run identity' }
}
$eventId = [Guid]::NewGuid().ToString()
$event = [ordered]@{
  version = ${AGENT_EVENT_VERSION}
  eventId = $eventId
  agentId = $agentId
  devStationSessionId = $sessionId
  agentRunId = $runId
  kind = $Kind
  occurredAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}
if ($Kind -eq 'session-bound') {
  if ([string]::IsNullOrWhiteSpace($SessionRefKind) -or [string]::IsNullOrWhiteSpace($SessionRefValue)) {
    throw 'session-bound requires a session reference'
  }
  $event.sessionRef = [ordered]@{ kind = $SessionRefKind; value = $SessionRefValue }
  if (-not [string]::IsNullOrEmpty($TranscriptPath)) { $event.sessionRef.transcriptPath = $TranscriptPath }
}
$directory = Join-Path $inbox $token
[IO.Directory]::CreateDirectory($directory) | Out-Null
$target = Join-Path $directory ($eventId + '.json')
$temporary = Join-Path $directory ($eventId + '.' + [Guid]::NewGuid().ToString() + '.tmp')
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText($temporary, ($event | ConvertTo-Json -Compress -Depth 4), $utf8)
[IO.File]::Move($temporary, $target)
`
}
