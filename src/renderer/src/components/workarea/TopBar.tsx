import { GitBranch, ChevronRight, PanelRight } from 'lucide-react'
import { useNavStore } from '@/store/nav'
import { cn } from '@/lib/utils'

// Thin bar above the work area: breadcrumb (project > session) + git branch +
// right-panel toggle. Reflects the "Git 状态和当前分支展示" requirement.
export function TopBar(): React.ReactElement {
  const rightPanelOpen = useNavStore((s) => s.rightPanelOpen)
  const toggleRightPanel = useNavStore((s) => s.toggleRightPanel)

  return (
    <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-3">
      <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
        <span className="truncate text-muted-foreground">web-platform</span>
        <ChevronRight size={13} className="shrink-0 text-muted-foreground/50" />
        <span className="truncate font-medium text-foreground">登录态校验</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 font-mono text-[11px] text-muted-foreground">
          <GitBranch size={12} />
          <span>feat/auth-guard</span>
        </span>
        {!rightPanelOpen && (
          <button
            type="button"
            onClick={toggleRightPanel}
            title="展开右侧面板"
            aria-label="展开右侧面板"
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
              'hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <PanelRight size={15} />
          </button>
        )}
      </div>
    </header>
  )
}
