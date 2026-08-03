import { Workflow, GitBranch, Loader2, CheckCircle2 } from 'lucide-react'
import { PipelineView } from './PipelineView'
import { TemplatesView } from './TemplatesView'
import { useNavStore } from '@/store/nav'
import { AAW_CONTEXT, pipelineProgress } from '@/store/aaw'

// 工作流 section: visualizes the real AAW pipeline. The secondary nav
// (流程总览 / 模板) switches between the swimlane pipeline and the templates.
export function WorkflowPanel(): React.ReactElement {
  const sub = useNavStore((s) => s.activeSecondaryId.workflow)
  const progress = pipelineProgress()

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="w-full px-6 py-6">
        {/* header */}
        <div className="mb-1 flex items-center gap-2 text-muted-foreground">
          <Workflow size={16} strokeWidth={1.75} />
          <span className="text-[12px] font-medium uppercase tracking-wider">工作流</span>
        </div>

        {/* context bar: which SR this pipeline belongs to + progress */}
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-secondary-foreground">
              {AAW_CONTEXT.srId}
            </span>
            <span className="truncate text-[14px] font-medium text-foreground">
              {AAW_CONTEXT.title}
            </span>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <GitBranch size={12} />
            <span className="font-mono">{AAW_CONTEXT.branch}</span>
          </span>
          <span className="text-[11px] text-muted-foreground/50">·</span>
          <span className="text-[11px] text-muted-foreground">{AAW_CONTEXT.mode}</span>

          {/* progress */}
          <span className="ml-auto flex items-center gap-1.5 text-[12px]">
            {progress.running ? (
              <>
                <Loader2 size={13} className="animate-spin text-blue-500" />
                <span className="text-blue-500">
                  {progress.completed}/{progress.total} 进行中
                </span>
              </>
            ) : (
              <>
                <CheckCircle2 size={13} className="text-status-success" />
                <span className="text-muted-foreground">
                  {progress.completed}/{progress.total}
                </span>
              </>
            )}
          </span>
        </div>

        {/* routed content */}
        <div className="mt-6">
          {sub === 'templates' ? <TemplatesView /> : <PipelineView />}
        </div>
      </div>
    </div>
  )
}
