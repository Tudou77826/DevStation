import {
  MessageSquare,
  GitCommitHorizontal,
  TerminalSquare,
  FileCode
} from 'lucide-react'
import type { WorkAreaTab } from '@shared/types'
import { useNavStore } from '@/store/nav'
import { cn } from '@/lib/utils'

interface TabDef {
  id: WorkAreaTab
  label: string
  icon: typeof MessageSquare
}

const TABS: readonly TabDef[] = [
  { id: 'conversation', label: '对话', icon: MessageSquare },
  { id: 'changes', label: '变更', icon: GitCommitHorizontal },
  { id: 'terminal', label: '终端', icon: TerminalSquare },
  { id: 'files', label: '文件', icon: FileCode }
] as const

export function WorkTabs(): React.ReactElement {
  const active = useNavStore((s) => s.activeWorkTab)
  const setWorkTab = useNavStore((s) => s.setWorkTab)

  return (
    <div className="flex shrink-0 items-center gap-0.5 border-b border-border px-2">
      {TABS.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setWorkTab(tab.id)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'relative flex items-center gap-1.5 px-3 py-2.5 text-[13px] transition-colors',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/80'
            )}
          >
            <tab.icon size={15} strokeWidth={1.75} />
            <span>{tab.label}</span>
            {isActive && (
              <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-foreground" />
            )}
          </button>
        )
      })}
    </div>
  )
}
