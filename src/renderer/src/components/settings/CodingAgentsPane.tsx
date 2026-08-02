import { useCallback, useEffect, useState } from 'react'
import {
  AlertTriangle,
  Check,
  FolderOpen,
  RefreshCw,
  RotateCcw,
  SquareTerminal,
  Wrench
} from 'lucide-react'
import type {
  AgentCapability,
  AgentDiagnosticEntry,
  AgentSettingAction,
  AgentSettingField,
  AgentSettingValue
} from '@shared/agent'
import type { RpcResponse } from '@shared/rpc'
import { cn } from '@/lib/utils'
import { useDataStore } from '@/store/data'
import { SettingsSection, SettingsSwitch } from './SettingsControls'

const CAPABILITY_LABELS: Readonly<Record<AgentCapability, string>> = {
  resume: '恢复会话',
  sessionIdentity: '会话绑定',
  activityEvents: '状态事件',
  transcript: '对话记录'
}

function unwrap<T>(response: RpcResponse<T>): T {
  if (response.ok) return response.result
  throw response.error
}

function messageOf(error: unknown): string {
  if (error !== null && typeof error === 'object' && 'message' in error) {
    return String(error.message)
  }
  return '操作失败，请重试'
}

export function CodingAgentsPane(): React.ReactElement {
  const [entries, setEntries] = useState<AgentDiagnosticEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [busyAgentId, setBusyAgentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loadAgents = useDataStore((state) => state.loadAgents)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setEntries(unwrap(await window.devstation.rpc.invoke('agents.diagnostics', {})))
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function run(agentId: string, action: () => Promise<unknown>): Promise<void> {
    setBusyAgentId(agentId)
    setError(null)
    try {
      await action()
      await Promise.all([load(), loadAgents()])
    } catch (cause) {
      setError(messageOf(cause))
    } finally {
      setBusyAgentId(null)
    }
  }

  return (
    <SettingsSection
      id="agents"
      title="Coding Agent"
      description="发现、诊断并配置本机 Coding Agent。所有会话仍由 Agent 原生终端运行，DevStation 只管理启动、恢复和状态接入。"
    >
      <div className="flex items-center justify-between pb-4">
        <p className="text-[12px] text-muted-foreground">
          {loading ? '正在检测本机环境…' : `已识别 ${entries.length} 个适配器`}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading || busyAgentId !== null}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
          重新检测
        </button>
      </div>

      {error !== null && (
        <div
          role="alert"
          className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-[12px] text-destructive"
        >
          <AlertTriangle size={14} />
          {error}
        </div>
      )}

      <div className="space-y-3">
        {entries.map((entry) => (
          <AgentCard
            key={entry.descriptor.id}
            entry={entry}
            busy={busyAgentId === entry.descriptor.id}
            onRun={(action) => run(entry.descriptor.id, action)}
          />
        ))}
      </div>
    </SettingsSection>
  )
}

function AgentCard({
  entry,
  busy,
  onRun
}: {
  entry: AgentDiagnosticEntry
  busy: boolean
  onRun: (action: () => Promise<unknown>) => Promise<void>
}): React.ReactElement {
  const { descriptor, settings, availability, integration } = entry
  const available = availability.status === 'available'
  const capabilities = Object.entries(descriptor.capabilities).filter(
    ([, value]) => value
  )
  const actions = new Map(
    descriptor.settings.actions.map((action) => [action.id, action])
  )

  function runDeclaredAction(action: AgentSettingAction): void {
    void onRun(async () => {
      if (action.kind === 'probe') return
      if (action.kind === 'open-login') {
        unwrap(
          await window.devstation.rpc.invoke('agents.openLoginTerminal', {
            agentId: descriptor.id
          })
        )
        return
      }
      const integrationAction = integrationRpcAction(action.kind)
      if (integrationAction === undefined) return
      unwrap(
        await window.devstation.rpc.invoke('agents.integrationAction', {
          agentId: descriptor.id,
          action: integrationAction
        })
      )
    })
  }

  return (
    <article
      className={cn(
        'rounded-xl border border-border/70 bg-background/55',
        !settings.enabled && 'opacity-70'
      )}
    >
      <header className="flex items-start gap-4 border-b border-border/50 px-5 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-[14px] font-semibold text-foreground">
          {descriptor.label.slice(0, 1).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-semibold text-foreground">
              {descriptor.label}
            </h3>
            {settings.isDefault && <Pill tone="active">默认</Pill>}
            <Pill tone={available ? 'success' : 'warning'}>
              {available ? (availability.version ?? '可用') : '不可用'}
            </Pill>
          </div>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            {descriptor.description}
          </p>
        </div>
        <SettingsSwitch
          checked={settings.enabled}
          ariaLabel={`启用 ${descriptor.label}`}
          onChange={(enabled) =>
            void onRun(async () =>
              unwrap(
                await window.devstation.rpc.invoke('agents.setEnabled', {
                  agentId: descriptor.id,
                  enabled
                })
              )
            )
          }
        />
      </header>

      <div className="divide-y divide-border/45 px-5">
        <div className="grid gap-3 py-4 sm:grid-cols-[120px_1fr_auto] sm:items-center">
          <div className="text-[12px] font-medium text-foreground">命令行程序</div>
          <div className="min-w-0">
            <div
              className="truncate font-mono text-[11px] text-foreground/80"
              title={availability.executable}
            >
              {availability.executable}
            </div>
            <div
              className={cn(
                'mt-1 text-[11px]',
                available ? 'text-muted-foreground' : 'text-status-warning'
              )}
            >
              {available
                ? '检测通过，后续新建和恢复会话将使用此程序。'
                : (availability.message ?? '未检测到可执行程序。')}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {settings.executablePath !== null && (
              <ActionButton
                label="恢复自动发现"
                icon={RotateCcw}
                disabled={busy}
                onClick={() =>
                  void onRun(async () =>
                    unwrap(
                      await window.devstation.rpc.invoke('agents.clearExecutable', {
                        agentId: descriptor.id
                      })
                    )
                  )
                }
              />
            )}
            <ActionButton
              label="选择文件"
              icon={FolderOpen}
              disabled={busy}
              onClick={() =>
                void onRun(async () =>
                  unwrap(
                    await window.devstation.rpc.invoke('agents.pickExecutable', {
                      agentId: descriptor.id
                    })
                  )
                )
              }
            />
          </div>
        </div>

        {descriptor.settings.fields.length > 0 && (
          <div className="space-y-3 py-4">
            <div className="text-[12px] font-medium text-foreground">Agent 设置</div>
            {descriptor.settings.fields.map((field) => (
              <AgentFieldControl
                key={field.key}
                agentId={descriptor.id}
                field={field}
                value={settings.values[field.key]}
                busy={busy}
                onRun={onRun}
              />
            ))}
          </div>
        )}

        {integration !== null && (
          <div className="grid gap-3 py-4 sm:grid-cols-[120px_1fr_auto] sm:items-center">
            <div className="text-[12px] font-medium text-foreground">事件集成</div>
            <div>
              <div className="flex items-center gap-2 text-[11px]">
                <span
                  className={cn(
                    'size-1.5 rounded-full',
                    integration.state === 'current' && settings.integrationEnabled
                      ? 'bg-status-success'
                      : 'bg-status-warning'
                  )}
                />
                <span className="text-foreground/80">
                  {!settings.integrationEnabled
                    ? '已停用'
                    : integrationLabel(integration.state)}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                {integration.message}
              </p>
            </div>
            <IntegrationButton entry={entry} busy={busy} onRun={onRun} />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="flex flex-wrap gap-1.5">
            {capabilities.map(([capability]) => (
              <Pill key={capability}>
                {CAPABILITY_LABELS[capability as AgentCapability]}
              </Pill>
            ))}
          </div>
          <div className="flex items-center gap-3">
            {descriptor.settings.actions.some(({ kind }) => kind === 'open-login') &&
              available && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    runDeclaredAction(
                      descriptor.settings.actions.find(
                        ({ kind }) => kind === 'open-login'
                      )!
                    )
                  }
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  <SquareTerminal size={12} />
                  打开登录终端
                </button>
              )}
            {!settings.isDefault && settings.enabled && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void onRun(async () =>
                    unwrap(
                      await window.devstation.rpc.invoke('agents.setDefault', {
                        agentId: descriptor.id
                      })
                    )
                  )
                }
                className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
              >
                设为默认
              </button>
            )}
          </div>
        </div>

        {descriptor.setupSteps.length > 0 && (
          <div className="space-y-2 py-4">
            <div className="text-[12px] font-medium text-foreground">接入引导</div>
            {descriptor.setupSteps.map((step, index) => {
              const action =
                step.actionId === undefined ? undefined : actions.get(step.actionId)
              return (
                <div
                  key={step.id}
                  className="flex items-start gap-3 rounded-lg border border-border/50 bg-card/45 px-3 py-2.5"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-medium text-foreground">
                      {step.title}
                    </div>
                    <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                  {action !== undefined && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => runDeclaredAction(action)}
                      className="shrink-0 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                    >
                      {action.label}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </article>
  )
}

function integrationRpcAction(
  kind: AgentSettingAction['kind']
): 'enable' | 'repair' | 'disable' | undefined {
  if (kind === 'integration-enable') return 'enable'
  if (kind === 'integration-repair') return 'repair'
  if (kind === 'integration-disable') return 'disable'
  return undefined
}

function AgentFieldControl({
  agentId,
  field,
  value,
  busy,
  onRun
}: {
  agentId: string
  field: AgentSettingField
  value: AgentSettingValue | undefined
  busy: boolean
  onRun: (action: () => Promise<unknown>) => Promise<void>
}): React.ReactElement {
  const [draft, setDraft] = useState(typeof value === 'string' ? value : '')

  useEffect(() => {
    setDraft(typeof value === 'string' ? value : '')
  }, [value])

  const save = (next: AgentSettingValue | null): void => {
    void onRun(async () =>
      unwrap(
        await window.devstation.rpc.invoke('agents.setSetting', {
          agentId,
          key: field.key,
          value: next
        })
      )
    )
  }

  return (
    <div className="grid gap-2 sm:grid-cols-[120px_1fr_auto] sm:items-center">
      <div>
        <div className="text-[11px] text-foreground/85">{field.label}</div>
        {field.description !== undefined && (
          <div className="mt-0.5 text-[10px] text-muted-foreground">
            {field.description}
          </div>
        )}
      </div>
      {field.kind === 'boolean' ? (
        <SettingsSwitch
          checked={value === true}
          ariaLabel={`${field.label}`}
          onChange={(checked) => save(checked)}
        />
      ) : field.kind === 'select' ? (
        <select
          aria-label={field.label}
          value={typeof value === 'string' ? value : ''}
          disabled={busy}
          onChange={(event) => save(event.target.value)}
          className="rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] text-foreground outline-none"
        >
          {!field.required && <option value="">未设置</option>}
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-label={field.label}
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={field.required ? '请输入绝对路径' : '可选绝对路径'}
          className="rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px] text-foreground outline-none"
        />
      )}
      {field.kind === 'path' && (
        <ActionButton
          label="保存"
          icon={Check}
          disabled={busy || draft === (typeof value === 'string' ? value : '')}
          onClick={() => save(draft === '' && !field.required ? null : draft)}
        />
      )}
    </div>
  )
}

function IntegrationButton({
  entry,
  busy,
  onRun
}: {
  entry: AgentDiagnosticEntry
  busy: boolean
  onRun: (action: () => Promise<unknown>) => Promise<void>
}): React.ReactElement {
  const integration = entry.integration!
  const action = !entry.settings.integrationEnabled
    ? 'enable'
    : integration.state === 'current'
      ? 'disable'
      : 'repair'
  const label = action === 'enable' ? '启用' : action === 'disable' ? '停用' : '修复'
  return (
    <ActionButton
      label={label}
      icon={action === 'disable' ? Check : Wrench}
      disabled={busy}
      onClick={() =>
        void onRun(async () =>
          unwrap(
            await window.devstation.rpc.invoke('agents.integrationAction', {
              agentId: entry.descriptor.id,
              action
            })
          )
        )
      }
    />
  )
}

function integrationLabel(
  state: NonNullable<AgentDiagnosticEntry['integration']>['state']
): string {
  return {
    missing: '尚未安装',
    current: '已接入',
    outdated: '需要更新',
    conflict: '存在配置冲突',
    unavailable: '暂不可用'
  }[state]
}

function ActionButton({
  label,
  icon: Icon,
  disabled,
  onClick
}: {
  label: string
  icon: typeof FolderOpen
  disabled: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
    >
      <Icon size={12} />
      {label}
    </button>
  )
}

function Pill({
  children,
  tone = 'neutral'
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'active' | 'success' | 'warning'
}): React.ReactElement {
  return (
    <span
      className={cn(
        'rounded-full border px-2 py-0.5 text-[10px] font-medium',
        tone === 'neutral' && 'border-border bg-muted/50 text-muted-foreground',
        tone === 'active' && 'border-primary/25 bg-primary/10 text-primary',
        tone === 'success' &&
          'border-status-success/25 bg-status-success/10 text-status-success',
        tone === 'warning' &&
          'border-status-warning/25 bg-status-warning/10 text-status-warning'
      )}
    >
      {children}
    </span>
  )
}
