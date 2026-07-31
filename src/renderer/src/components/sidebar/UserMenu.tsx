import { useEffect, useRef, useState } from 'react'
import { ChevronUp, User, Bot, Settings, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MenuEntry {
  id: string
  label: string
  icon: typeof User
}

// Menu expands upward (per MVP plan §4: user entry pinned at bottom-left,
// fan-out goes up). Stage 1 only renders the structure; actions are stubs.
const ENTRIES: readonly MenuEntry[] = [
  { id: 'profile', label: '个人信息', icon: User },
  { id: 'agent-settings', label: 'Agent 设置', icon: Bot },
  { id: 'app-settings', label: '应用设置', icon: Settings },
  { id: 'logout', label: '退出登录', icon: LogOut }
] as const

export function UserMenu(): React.ReactElement {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent): void {
      if (rootRef.current !== null && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative px-2 pb-2">
      {open && (
        <div
          role="menu"
          className="absolute bottom-full left-2 right-2 mb-2 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-xl"
        >
          {ENTRIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={cn(
                'flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-popover-foreground transition-colors',
                'hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <entry.icon size={15} strokeWidth={1.75} />
              <span>{entry.label}</span>
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-[13px] transition-colors',
          'hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
        )}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground">
          李
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate font-medium text-sidebar-foreground">李工</span>
          <span className="block truncate text-[11px] text-muted-foreground">本地账号</span>
        </span>
        <ChevronUp
          size={15}
          className={cn('shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
    </div>
  )
}
