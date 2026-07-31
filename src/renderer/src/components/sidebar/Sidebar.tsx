import { IconRail } from './IconRail'
import { NavTree } from './NavTree'
import { UserMenu } from './UserMenu'
import { useNavStore } from '@/store/nav'
import { cn } from '@/lib/utils'

export function Sidebar(): React.ReactElement {
  const collapsed = useNavStore((s) => s.collapsed)

  return (
    <div className="flex h-full">
      <IconRail />
      <div
        className={cn(
          'flex h-full flex-col bg-sidebar transition-[width] duration-150',
          collapsed ? 'w-0 overflow-hidden' : 'w-60 border-r border-sidebar-border'
        )}
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
    </div>
  )
}
