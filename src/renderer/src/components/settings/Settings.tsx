import { useEffect, useRef } from 'react'
import { SettingsSidebar } from './SettingsSidebar'
import { AppearancePane, GeneralPane, TerminalPane, AboutPane } from './panes'
import { CodingAgentsPane } from './CodingAgentsPane'
import { useUIStore, type SettingsSection } from '@/store/ui'

const PANES: ReadonlyArray<{ id: SettingsSection; render: () => React.ReactElement }> = [
  { id: 'appearance', render: () => <AppearancePane /> },
  { id: 'general', render: () => <GeneralPane /> },
  { id: 'agents', render: () => <CodingAgentsPane /> },
  { id: 'terminal', render: () => <TerminalPane /> },
  { id: 'about', render: () => <AboutPane /> }
] as const

// Full-page settings view (Orca pattern): master–detail, fills the window.
// Only the active pane mounts; selecting a sidebar item scrolls it into view.
export function Settings(): React.ReactElement {
  const active = useUIStore((s) => s.settingsSection)
  const setSection = useUIStore((s) => s.setSettingsSection)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Scroll the selected section into view when it changes.
  useEffect(() => {
    const root = scrollRef.current
    if (root === null) return
    const el = root.querySelector(`#${CSS.escape(active)}`) as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [active])

  function handleSelect(id: SettingsSection): void {
    setSection(id)
  }

  const activePane = PANES.find((p) => p.id === active) ?? PANES[0]

  return (
    <div className="settings-view-shell flex min-h-0 flex-1 overflow-hidden bg-background">
      <SettingsSidebar active={active} onSelect={handleSelect} />
      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-8 pt-10 pb-24">
            {activePane.render()}
          </div>
        </div>
      </div>
    </div>
  )
}
