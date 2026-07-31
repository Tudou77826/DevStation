import { Power, ClipboardList, DraftingCompass, ShieldCheck, Code2 } from 'lucide-react'
import { NodeCard, NodeConnector } from './NodeCard'
import { AAW_PHASES, nodesOfPhase, type AawPhase, type AawNode } from '@/store/aaw'

const PHASE_ICONS: Record<AawPhase, typeof Power> = {
  init: Power,
  design: ClipboardList,
  detail: DraftingCompass,
  gate: ShieldCheck,
  impl: Code2
}

// Render the gate's branching arrows: Pass → forward (to impl), Fail/Blocked →
// loop back into detail design. Drawn as a labeled band beneath the gate row.
function GateBranches(): React.ReactElement {
  return (
    <div className="flex items-center gap-4 py-2 pl-2 text-[11px]">
      <span className="inline-flex items-center gap-1.5 text-status-success">
        <span className="h-px w-5 bg-status-success" />
        Pass → 进入编码实现
      </span>
      <span className="inline-flex items-center gap-1.5 text-status-warning">
        <svg width="22" height="14" viewBox="0 0 22 14" fill="none" className="shrink-0">
          <path
            d="M21 1 H 6 Q 1 1 1 7 V 13"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeDasharray="3 2.5"
            fill="none"
          />
          <path d="M-2 10 L 1 13 L 4 10" stroke="currentColor" strokeWidth="1.2" fill="none" />
        </svg>
        Fail / Blocked → 回到详细设计原地修正
      </span>
    </div>
  )
}

function Swimlane({ phase }: { phase: AawPhase }): React.ReactElement {
  const meta = AAW_PHASES.find((p) => p.id === phase)!
  const Icon = PHASE_ICONS[phase]
  const nodes = nodesOfPhase(phase)

  return (
    <div className="flex items-stretch gap-3">
      {/* phase label column */}
      <div className="flex w-28 shrink-0 flex-col justify-center rounded-lg border border-border bg-muted/20 px-3 py-2">
        <Icon size={16} className="text-muted-foreground" strokeWidth={1.75} />
        <div className="mt-1 text-[12px] font-medium text-foreground">{meta.label}</div>
      </div>

      {/* nodes row */}
      <div className="flex min-w-0 items-center gap-0 overflow-x-auto py-2">
        {nodes.map((node, i) => (
          <RowItem key={node.id} node={node} isLast={i === nodes.length - 1} />
        ))}
      </div>
    </div>
  )
}

function RowItem({ node, isLast }: { node: AawNode; isLast: boolean }): React.ReactElement {
  // Connector tone follows the upstream node's status.
  const tone = node.status === 'completed' ? 'success' : node.status === 'running' ? 'active' : 'muted'
  return (
    <>
      {isLast ? null : <NodeConnector tone={tone} />}
      <NodeCard node={node} />
    </>
  )
}

export function PipelineView(): React.ReactElement {
  return (
    <div className="space-y-1">
      {AAW_PHASES.map((phase) => (
        <div key={phase.id}>
          <Swimlane phase={phase.id} />
          {phase.id === 'gate' && <GateBranches />}
        </div>
      ))}
    </div>
  )
}
