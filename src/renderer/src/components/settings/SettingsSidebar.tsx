import { ArrowLeft, Bot, Palette, Settings2, TerminalSquare, Info } from 'lucide-react'
import { useUIStore, type SettingsSection } from '@/store/ui'
import { cn } from '@/lib/utils'

// Orca-style grouped nav: an ordered registry drives both the sidebar and the
// content panes, so they can never drift.
interface NavEntry {
  id: SettingsSection
  title: string
  icon: typeof Palette
}
interface NavGroup {
  label: string
  entries: readonly NavEntry[]
}

const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: '界面',
    entries: [{ id: 'appearance', title: '外观', icon: Palette }]
  },
  {
    label: '工作区',
    entries: [
      { id: 'general', title: '通用', icon: Settings2 },
      { id: 'agents', title: 'Coding Agent', icon: Bot },
      { id: 'terminal', title: '终端', icon: TerminalSquare }
    ]
  },
  {
    label: '其他',
    entries: [{ id: 'about', title: '关于', icon: Info }]
  }
] as const

export function SettingsSidebar({
  active,
  onSelect
}: {
  active: SettingsSection
  onSelect: (id: SettingsSection) => void
}): React.ReactElement {
  const close = useUIStore((s) => s.closeSettings)

  return (
    <nav className="flex w-[260px] shrink-0 flex-col border-r border-border bg-sidebar">
      {/* Back button */}
      <div className="p-3">
        <button
          type="button"
          onClick={close}
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        >
          <ArrowLeft size={15} />
          <span>返回</span>
        </button>
      </div>

      {/* Grouped nav */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
              {group.label}
            </div>
            {group.entries.map((entry) => {
              const isActive = entry.id === active
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => onSelect(entry.id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors',
                    isActive
                      ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground ring-1 ring-sidebar-ring/25'
                      : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground'
                  )}
                >
                  <entry.icon size={15} className="shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{entry.title}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
    </nav>
  )
}

export { NAV_GROUPS }
