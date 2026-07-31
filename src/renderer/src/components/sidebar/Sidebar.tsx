import { IconRail } from './IconRail'
import { NavTree } from './NavTree'
import { UserMenu } from './UserMenu'
import { ResizeHandle } from '@/components/common/ResizeHandle'
import { useNavStore } from '@/store/nav'
import { cn } from '@/lib/utils'

export function Sidebar(): React.ReactElement {
  const collapsed = useNavStore((s) => s.sidebarCollapsed)
  const width = useNavStore((s) => s.sidebarWidth)
  const setWidth = useNavStore((s) => s.setSidebarWidth)

  return (
    <div className="flex h-full">
      <IconRail />
      <div
        className={cn(
          'flex h-full flex-col bg-sidebar',
          collapsed
            ? 'w-0 overflow-hidden'
            : 'border-r border-sidebar-border transition-[width] duration-150'
        )}
        style={collapsed ? undefined : { width }}
        aria-hidden={collapsed}
      >
        <div className="flex h-11 shrink-0 items-center px-4">
          <span className="text-[13px] font-semibold tracking-tight text-sidebar-foreground">
            DevStation
          </span>
        </div>
        <NavTree />
        <div className="shrink-0 border-t border-sidebar-border pt-1">
          <UserMenu />
        </div>
      </div>
      {!collapsed && (
        <ResizeHandle
          side="right"
          onDelta={(d) => setWidth(width + d)}
          title="拖拽调整侧边栏宽度"
        />
      )}
    </div>
  )
}
