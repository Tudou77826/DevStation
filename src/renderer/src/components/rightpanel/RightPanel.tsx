import { PanelRightClose, Activity, GitBranch, FileDiff } from 'lucide-react'
import { useNavStore } from '@/store/nav'
import { cn } from '@/lib/utils'

// Right panel shows task summary, agent status and code-change summary.
// Collapsible (per MVP plan §4). Stage 1 = placeholder structure.
export function RightPanel(): React.ReactElement {
  const toggle = useNavStore((s) => s.toggleRightPanel)

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-background">
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
          概览
        </span>
        <button
          type="button"
          onClick={toggle}
          title="收起右侧面板"
          aria-label="收起右侧面板"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        <PanelCard icon={Activity} title="任务摘要">
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            实现用户登录态校验
          </p>
          <div className="mt-2 flex items-center gap-2">
            <StatusDot className="bg-status-warning" />
            <span className="text-[11px] text-muted-foreground">进行中 · Agent 编码中</span>
          </div>
        </PanelCard>

        <PanelCard icon={Activity} title="Agent 状态">
          <div className="space-y-1.5">
            <StatusRow label="运行中" value="1" tone="success" />
            <StatusRow label="等待用户" value="0" />
            <StatusRow label="已完成" value="2" />
          </div>
        </PanelCard>

        <PanelCard icon={GitBranch} title="当前分支">
          <div className="flex items-center gap-1.5 font-mono text-[12px] text-foreground">
            <GitBranch size={13} className="text-muted-foreground" />
            <span>feat/auth-guard</span>
          </div>
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <FileDiff size={12} /> 5 文件
            </span>
            <span className="tabular-nums">+128 / -34</span>
          </div>
        </PanelCard>
      </div>
    </aside>
  )
}

function PanelCard({
  icon: Icon,
  title,
  children
}: {
  icon: typeof Activity
  title: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2 text-muted-foreground">
        <Icon size={14} strokeWidth={1.75} />
        <span className="text-[11px] font-medium uppercase tracking-wider">{title}</span>
      </div>
      {children}
    </section>
  )
}

function StatusRow({
  label,
  value,
  tone
}: {
  label: string
  value: string
  tone?: 'success'
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 tabular-nums text-foreground">
        {tone === 'success' && <StatusDot className="bg-status-success" />}
        {value}
      </span>
    </div>
  )
}

function StatusDot({ className }: { className: string }): React.ReactElement {
  return <span className={cn('inline-block h-1.5 w-1.5 rounded-full', className)} />
}
