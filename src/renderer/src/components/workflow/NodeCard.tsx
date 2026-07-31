import { Check, Loader2, Circle, X, ShieldCheck, FileCode } from 'lucide-react'
import type { AawNode, AawStatus } from '@/store/aaw'
import { cn } from '@/lib/utils'

// Status → color + icon. Aligns with AAW's execution_status semantics.
const STATUS_META: Record<
  AawStatus,
  { dot: string; ring: string; icon: typeof Check; label: string }
> = {
  completed: {
    dot: 'bg-status-success',
    ring: 'border-status-success/40',
    icon: Check,
    label: '已完成'
  },
  running: {
    dot: 'bg-blue-500',
    ring: 'border-blue-500/60',
    icon: Loader2,
    label: '进行中'
  },
  ready: {
    dot: 'bg-muted-foreground/40',
    ring: 'border-border',
    icon: Circle,
    label: '待开始'
  },
  failed: {
    dot: 'bg-status-error',
    ring: 'border-status-error/50',
    icon: X,
    label: '失败'
  },
  blocked: {
    dot: 'bg-status-warning',
    ring: 'border-status-warning/50',
    icon: X,
    label: '阻塞'
  }
}

export function NodeCard({ node }: { node: AawNode }): React.ReactElement {
  const meta = STATUS_META[node.status]
  const StatusIcon = meta.icon
  const GateIcon = node.isGate === true ? ShieldCheck : null

  return (
    <div
      className={cn(
        'group relative w-[180px] shrink-0 rounded-xl border bg-card p-3 transition-colors',
        meta.ring,
        node.isGate === true && 'border-dashed'
      )}
    >
      {/* status row */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className={cn('inline-block size-2 rounded-full', meta.dot)} />
          <span className="text-[11px] text-muted-foreground">{meta.label}</span>
        </span>
        <StatusIcon
          size={14}
          className={cn(
            'text-muted-foreground',
            node.status === 'running' && 'animate-spin text-blue-500',
            node.status === 'completed' && 'text-status-success',
            (node.status === 'failed' || node.status === 'blocked') && 'text-status-error'
          )}
        />
      </div>

      {/* title */}
      <div className="mt-2 flex items-center gap-1.5">
        {GateIcon !== null && (
          <GateIcon size={14} className="shrink-0 text-muted-foreground" strokeWidth={1.75} />
        )}
        <span className="text-[13px] font-medium leading-tight text-foreground">
          {node.label}
        </span>
      </div>

      {/* responsibility */}
      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
        {node.responsibility}
      </p>

      {/* artifact */}
      <div className="mt-2 flex items-center gap-1 border-t border-border/60 pt-2">
        <FileCode size={11} className="shrink-0 text-muted-foreground/70" />
        <code className="truncate font-mono text-[10px] text-muted-foreground/80">
          {node.artifact}
        </code>
      </div>
    </div>
  )
}

/** A horizontal connector between two nodes in the same swimlane. */
export function NodeConnector({
  tone = 'muted'
}: {
  tone?: 'muted' | 'active' | 'success'
}): React.ReactElement {
  return (
    <div
      className={cn(
        'h-px w-6 shrink-0 self-center',
        tone === 'muted' && 'bg-border',
        tone === 'active' && 'bg-blue-500',
        tone === 'success' && 'bg-status-success'
      )}
    />
  )
}
