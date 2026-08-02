import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { isMap, isSeq, parseDocument, type Document, type YAMLSeq } from 'yaml'
import type { ManagedAgentIntegration, ManagedIntegrationDiagnostic } from './adapter'

const INTEGRATION_VERSION = 2
const MANAGED_DESCRIPTION = `DevStation managed Chrys event observer v${INTEGRATION_VERSION}`
const REPORTER_HEADER = `# DevStation managed Chrys event reporter v${INTEGRATION_VERSION}`
const HOOK_FILE_NAMES = ['hooks.yaml', 'hooks.yml', 'hooks.json'] as const

interface HookEntry {
  id: string
  event: string
  description: string
  match?: { tool_name: string }
  run: { type: 'script'; path: string }
  execution: { mode: 'async'; timeout_seconds: number; on_error: 'ignore' }
}

interface EditableHooksFile {
  path: string
  entries: unknown[]
  write(entries: unknown[]): void
}

export interface ChrysManagedIntegrationOptions {
  configRoot?: string
  env?: NodeJS.ProcessEnv
  homePath?: string
}

export class ChrysManagedIntegration implements ManagedAgentIntegration {
  readonly configRoot: string
  readonly hooksDirectory: string
  readonly reporterPath: string

  constructor(options: ChrysManagedIntegrationOptions = {}) {
    this.configRoot =
      options.configRoot ??
      resolveChrysConfigRoot(options.env ?? process.env, options.homePath ?? homedir())
    this.hooksDirectory = join(this.configRoot, 'hooks')
    this.reporterPath = join(this.hooksDirectory, 'scripts', 'devstation-chrys-event.ps1')
  }

  diagnose(): ManagedIntegrationDiagnostic {
    try {
      const file = this.readEditableFile(false)
      if (file === null) return this.result('missing', 'Chrys 事件 Hook 尚未安装')
      const state = this.inspectEntries(file.entries)
      if (state === 'conflict') {
        return this.result('conflict', 'Chrys Hook 中存在同名的非 DevStation 配置')
      }
      if (state !== 'current' || this.reporterStatus() !== 'current') {
        return this.result('outdated', 'Chrys 事件 Hook 需要修复或升级')
      }
      return this.result('current', 'Chrys 事件 Hook 已就绪')
    } catch (error) {
      return this.result('unavailable', integrationError(error))
    }
  }

  ensureInstalled(): ManagedIntegrationDiagnostic {
    try {
      const file = this.readEditableFile(true)
      if (file === null) throw new Error('Unable to create Chrys hooks file')
      const state = this.inspectEntries(file.entries)
      if (state === 'conflict') {
        return this.result('conflict', 'Chrys Hook 中存在同名的非 DevStation 配置')
      }
      mkdirSync(dirname(this.reporterPath), { recursive: true })
      atomicWrite(this.reporterPath, reporterScript())
      const managedIds = new Set(
        managedEntries(this.reporterPath).map((entry) => entry.id)
      )
      const preserved = file.entries.filter((entry) => !isManagedEntry(entry, managedIds))
      file.write([...preserved, ...managedEntries(this.reporterPath)])
      return this.result('current', 'Chrys 事件 Hook 已安装')
    } catch (error) {
      return this.result('unavailable', integrationError(error))
    }
  }

  uninstall(): ManagedIntegrationDiagnostic {
    try {
      const file = this.readEditableFile(false)
      if (file !== null) {
        const managedIds = new Set(
          managedEntries(this.reporterPath).map((entry) => entry.id)
        )
        if (this.inspectEntries(file.entries) === 'conflict') {
          return this.result('conflict', '同名 Hook 不属于 DevStation，未执行停用')
        }
        file.write(file.entries.filter((entry) => !isManagedEntry(entry, managedIds)))
      }
      rmSync(this.reporterPath, { force: true })
      return this.result('missing', 'Chrys 事件 Hook 已停用')
    } catch (error) {
      return this.result('unavailable', integrationError(error))
    }
  }

  private inspectEntries(
    entries: unknown[]
  ): 'missing' | 'current' | 'outdated' | 'conflict' {
    const expected = managedEntries(this.reporterPath)
    const expectedById = new Map(expected.map((entry) => [entry.id, entry]))
    const found = entries.filter(
      (entry): entry is Record<string, unknown> =>
        isRecord(entry) &&
        typeof entry['id'] === 'string' &&
        expectedById.has(entry['id'])
    )
    if (found.length === 0) return 'missing'
    if (found.some((entry) => !isDevStationOwned(entry))) return 'conflict'
    if (found.length !== expected.length) return 'outdated'
    return expected.every((entry) =>
      found.some((candidate) => JSON.stringify(candidate) === JSON.stringify(entry))
    )
      ? 'current'
      : 'outdated'
  }

  private reporterStatus(): 'missing' | 'current' | 'outdated' {
    try {
      return readFileSync(this.reporterPath, 'utf8') === reporterScript()
        ? 'current'
        : 'outdated'
    } catch {
      return 'missing'
    }
  }

  private readEditableFile(create: boolean): EditableHooksFile | null {
    const existing = HOOK_FILE_NAMES.map((name) => join(this.hooksDirectory, name)).find(
      (path) => existsSync(path)
    )
    const path = existing ?? join(this.hooksDirectory, 'hooks.yaml')
    if (existing === undefined && !create) return null
    mkdirSync(this.hooksDirectory, { recursive: true })
    if (extname(path).toLowerCase() === '.json') return readJsonHooksFile(path, create)
    return readYamlHooksFile(path, create)
  }

  private result(
    state: ManagedIntegrationDiagnostic['state'],
    message: string
  ): ManagedIntegrationDiagnostic {
    return { state, path: this.reporterPath, message }
  }
}

export function resolveChrysConfigRoot(env: NodeJS.ProcessEnv, homePath: string): string {
  if (process.platform === 'win32') {
    return join(env['APPDATA'] ?? join(homePath, 'AppData', 'Roaming'), 'chrys')
  }
  return join(
    env['XDG_CONFIG_HOME'] ?? homePath,
    env['XDG_CONFIG_HOME'] ? 'chrys' : '.chrys'
  )
}

function managedEntries(reporterPath: string): HookEntry[] {
  const hooks: Array<Pick<HookEntry, 'id' | 'event' | 'match'>> = [
    { id: 'devstation-session-start', event: 'session_start' },
    { id: 'devstation-session-restored', event: 'session_restored' },
    { id: 'devstation-before-turn', event: 'before_turn' },
    { id: 'devstation-after-turn', event: 'after_turn' },
    {
      id: 'devstation-user-attention-requested',
      event: 'before_tool_call',
      match: { tool_name: 'ask_user' }
    },
    {
      id: 'devstation-user-attention-resolved',
      event: 'after_tool_call',
      match: { tool_name: 'ask_user' }
    },
    { id: 'devstation-user-interrupt', event: 'user_interrupt' },
    { id: 'devstation-session-end', event: 'session_end' }
  ]
  return hooks.map((hook) => ({
    ...hook,
    description: MANAGED_DESCRIPTION,
    run: { type: 'script', path: reporterPath },
    execution: { mode: 'async', timeout_seconds: 5, on_error: 'ignore' }
  }))
}

function readJsonHooksFile(path: string, create: boolean): EditableHooksFile {
  const text = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const root: unknown =
    text.trim() === '' && create ? { version: 1, hooks: [] } : JSON.parse(text)
  if (!isRecord(root) || (root['version'] !== undefined && root['version'] !== 1)) {
    throw new Error('Unsupported Chrys hooks JSON root')
  }
  if (root['hooks'] !== undefined && !Array.isArray(root['hooks'])) {
    throw new Error('Chrys hooks must be an array')
  }
  const entries = (root['hooks'] ?? []) as unknown[]
  return {
    path,
    entries,
    write(next) {
      root['hooks'] = next
      atomicWrite(path, `${JSON.stringify(root, null, 2)}\n`)
    }
  }
}

function readYamlHooksFile(path: string, create: boolean): EditableHooksFile {
  const text = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const document = parseDocument(
    text.trim() === '' && create ? 'version: 1\nhooks: []\n' : text
  )
  if (document.errors.length > 0 || !isMap(document.contents)) {
    throw new Error('Invalid Chrys hooks YAML')
  }
  const version = document.get('version')
  if (version !== undefined && version !== 1)
    throw new Error('Unsupported Chrys hooks version')
  let sequence = document.get('hooks', true)
  if (sequence === undefined) {
    document.set('hooks', [])
    sequence = document.get('hooks', true)
  }
  if (!isSeq(sequence)) throw new Error('Chrys hooks must be a sequence')
  const yamlSequence = sequence as YAMLSeq
  const root = document.toJS() as unknown
  if (!isRecord(root) || !Array.isArray(root['hooks'])) {
    throw new Error('Invalid Chrys hooks YAML root')
  }
  const entries = root['hooks']
  const originalNodes = [...yamlSequence.items]
  return {
    path,
    entries,
    write(next) {
      replaceYamlSequence(document, yamlSequence, entries, originalNodes, next)
      atomicWrite(path, document.toString())
    }
  }
}

function replaceYamlSequence(
  document: Document,
  sequence: YAMLSeq,
  originalEntries: unknown[],
  originalNodes: YAMLSeq['items'],
  entries: unknown[]
): void {
  sequence.items = entries.map((entry) => {
    const originalIndex = originalEntries.indexOf(entry)
    return originalIndex === -1
      ? document.createNode(entry)
      : originalNodes[originalIndex]
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isDevStationOwned(entry: Record<string, unknown>): boolean {
  return (
    typeof entry['description'] === 'string' &&
    entry['description'].startsWith('DevStation managed Chrys event observer v')
  )
}

function isManagedEntry(entry: unknown, managedIds: ReadonlySet<string>): boolean {
  return (
    isRecord(entry) &&
    typeof entry['id'] === 'string' &&
    managedIds.has(entry['id']) &&
    isDevStationOwned(entry)
  )
}

function atomicWrite(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  writeFileSync(temporary, content, 'utf8')
  renameSync(temporary, path)
}

function integrationError(error: unknown): string {
  const detail = error instanceof Error ? error.message : '未知错误'
  return `Chrys 事件 Hook 不可用：${detail}`
}

function reporterScript(): string {
  return `${REPORTER_HEADER}
$ErrorActionPreference = 'Stop'
if ($env:DEVSTATION_AGENT_ID -ne 'chrys') { exit 0 }
$bridge = $env:DEVSTATION_AGENT_EVENT_BRIDGE
$payloadPath = $env:CHRYS_HOOK_PAYLOAD_FILE
if ([string]::IsNullOrWhiteSpace($bridge) -or -not [IO.File]::Exists($bridge)) { exit 0 }
if ([string]::IsNullOrWhiteSpace($payloadPath) -or -not [IO.File]::Exists($payloadPath)) { exit 0 }
$payload = Get-Content -Raw -LiteralPath $payloadPath | ConvertFrom-Json
$baseTime = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$sequence = 0
function Send-DevStationEvent {
  param([string]$Kind, [string]$SessionRefValue)
  $script:sequence += 1
  $eventId = 'chrys-' + $payload.event + '-' + [Guid]::NewGuid().ToString('N')
  $arguments = @{
    Kind = $Kind
    EventId = $eventId
    OccurredAt = ($baseTime + $script:sequence)
  }
  if (-not [string]::IsNullOrWhiteSpace($SessionRefValue)) {
    $arguments.SessionRefKind = 'chrys-session-id'
    $arguments.SessionRefValue = $SessionRefValue
  }
  & $bridge @arguments
}
switch ($payload.event) {
  'session_start' {
    Send-DevStationEvent 'session-bound' ([string]$payload.session_id)
    Send-DevStationEvent 'started' ''
  }
  'session_restored' {
    $nativeId = [string]$payload.restored_session_id
    if ([string]::IsNullOrWhiteSpace($nativeId)) { $nativeId = [string]$payload.session_id }
    Send-DevStationEvent 'session-bound' $nativeId
    Send-DevStationEvent 'started' ''
  }
  'before_turn' { Send-DevStationEvent 'working' '' }
  'before_tool_call' {
    if ([string]$payload.tool.name -eq 'ask_user') { Send-DevStationEvent 'waiting' '' }
  }
  'after_tool_call' {
    if ([string]$payload.tool.name -eq 'ask_user') { Send-DevStationEvent 'working' '' }
  }
  'after_turn' {
    if ($payload.status -eq 'failed') { Send-DevStationEvent 'failed' '' }
    else { Send-DevStationEvent 'done' '' }
  }
  'user_interrupt' { Send-DevStationEvent 'done' '' }
  'session_end' { Send-DevStationEvent 'ended' '' }
}
`
}
