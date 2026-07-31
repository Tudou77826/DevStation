import {
  ListTodo,
  Bot,
  Workflow,
  PanelLeftClose,
  PanelLeft,
  Sun,
  Moon,
  Settings2,
  type LucideIcon
} from 'lucide-react'
import type { NavSection } from '@shared/types'
import { PRIMARY_NAV } from '@/store/nav'
import { useNavStore } from '@/store/nav'
import { useThemeStore } from '@/store/theme'
import { useUIStore } from '@/store/ui'
import { cn } from '@/lib/utils'

// Map the string icon name in the nav model to an actual lucide component.
// Keeping this mapping in one place lets the nav model stay plain-data.
const ICONS: Record<string, LucideIcon> = {
  'list-todo': ListTodo,
  bot: Bot,
  workflow: Workflow
}

export function IconRail(): React.ReactElement {
  const activeSection = useNavStore((s) => s.activeSection)
  const setSection = useNavStore((s) => s.setSection)
  const collapsed = useNavStore((s) => s.sidebarCollapsed)
  const toggleCollapsed = useNavStore((s) => s.toggleSidebar)
  const resolved = useThemeStore((s) => s.resolved)
  const toggleTheme = useThemeStore((s) => s.toggle)
  const openSettings = useUIStore((s) => s.openSettings)

  return (
    <nav
      className="flex h-full w-14 flex-col items-center justify-between border-r border-sidebar-border bg-sidebar py-3"
      aria-label="主导航"
    >
      <div className="flex flex-col items-center gap-1">
        {PRIMARY_NAV.map((item) => {
          const Icon = ICONS[item.icon] ?? ListTodo
          const active = item.id === activeSection
          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              onClick={() => setSection(item.id as NavSection)}
              className={cn(
                'group relative flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors',
                'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                active && 'bg-sidebar-accent text-sidebar-accent-foreground'
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
              {active && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-sidebar-accent-foreground" />
              )}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col items-center gap-1">
        <button
          type="button"
          title={resolved === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
          aria-label={resolved === 'dark' ? '切换到亮色模式' : '切换到暗色模式'}
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {resolved === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button
          type="button"
          title="设置"
          aria-label="设置"
          onClick={() => openSettings(activeSection)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <Settings2 size={18} />
        </button>
        <button
          type="button"
          title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          onClick={toggleCollapsed}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
    </nav>
  )
}
