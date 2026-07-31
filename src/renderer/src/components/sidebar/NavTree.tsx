import {
  Inbox,
  CircleDot,
  CheckCheck,
  FolderGit2,
  MessagesSquare,
  GitBranch,
  LayoutTemplate,
  type LucideIcon
} from 'lucide-react'
import { SECONDARY_NAV, useNavStore } from '@/store/nav'
import { cn } from '@/lib/utils'

const ICONS: Record<string, LucideIcon> = {
  inbox: Inbox,
  'circle-dot': CircleDot,
  'check-check': CheckCheck,
  'folder-git-2': FolderGit2,
  'messages-square': MessagesSquare,
  'git-branch': GitBranch,
  'layout-template': LayoutTemplate
}

export function NavTree(): React.ReactElement {
  const section = useNavStore((s) => s.activeSection)
  const activeId = useNavStore((s) => s.activeSecondaryId)
  const setSecondary = useNavStore((s) => s.setSecondary)
  const items = SECONDARY_NAV[section]

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-0.5 px-2 py-3">
      <div className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
        {sectionLabel(section)}
      </div>
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? Inbox
        const active = item.id === activeId
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setSecondary(item.id)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] text-muted-foreground transition-colors',
              'hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
              active && 'bg-sidebar-accent text-sidebar-accent-foreground'
            )}
          >
            <Icon size={16} strokeWidth={1.75} className="shrink-0" />
            <span className="truncate">{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="ml-auto rounded-full bg-secondary px-1.5 py-px text-[10px] font-medium tabular-nums text-secondary-foreground">
                {item.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function sectionLabel(section: string): string {
  switch (section) {
    case 'tasks':
      return '任务'
    case 'ai-space':
      return 'AI 空间'
    case 'workflow':
      return '工作流'
    default:
      return ''
  }
}
