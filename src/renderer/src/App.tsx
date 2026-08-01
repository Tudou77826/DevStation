import { useEffect } from 'react'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { AISpaceWorkArea } from '@/components/workarea/AISpaceWorkArea'
import { TaskPanel } from '@/components/tasks/TaskPanel'
import { WorkflowPanel } from '@/components/workflow/WorkflowPanel'
import { RightPanel, RightPanelDock } from '@/components/rightpanel/RightPanel'
import { Settings } from '@/components/settings/Settings'
import { useNavStore } from '@/store/nav'
import { useUIStore } from '@/store/ui'
import { useDataStore } from '@/store/data'

// Thin draggable strip across the very top. The native title bar is hidden on
// Windows (overlay mode); this restores dragging. Caption buttons sit on top of
// the right end, so keep content centered and avoid the far-right area.
function TitleBarStrip(): React.ReactElement {
  return (
    <div
      className="drag-region fixed inset-x-0 top-0 z-50 flex h-9 items-center justify-center"
      aria-hidden="true"
    >
      <span className="pointer-events-none select-none text-[12px] font-medium text-muted-foreground">
        DevStation
      </span>
    </div>
  )
}

// Codex-style shell:
//   [primary rail + contextual tree] | [single center workspace] | [context inspector]
//
// Center view changes with the active primary section:
//   - 任务面板  → list-to-detail navigation inside one center workspace
//   - AI 空间   → one Agent stage; changes/files live in the inspector
//   - 工作流    → fixed flow placeholder
export default function App(): React.ReactElement {
  const section = useNavStore((s) => s.activeSection)
  const rightPanelOpen = useNavStore((s) => s.rightPanelOpen)
  const settingsOpen = useUIStore((s) => s.settingsOpen)
  const loadAll = useDataStore((s) => s.loadAll)

  // Hydrate SQLite-backed data on startup so lists are ready for any section.
  useEffect(() => {
    void loadAll()
  }, [loadAll])

  if (settingsOpen) {
    return (
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        <TitleBarStrip />
        <div className="pt-9">
          <Settings />
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <TitleBarStrip />
      <div className="flex min-w-0 flex-1 pt-9">
        <Sidebar />

        <main className="flex min-w-0 flex-1 flex-col">
          {section === 'tasks' && <TaskPanel />}
          {section === 'ai-space' && <AISpaceWorkArea />}
          {section === 'workflow' && <WorkflowPanel />}
        </main>

        {rightPanelOpen ? <RightPanel /> : <RightPanelDock />}
      </div>
    </div>
  )
}
