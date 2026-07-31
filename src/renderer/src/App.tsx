import { Sidebar } from '@/components/sidebar/Sidebar'
import { AISpaceWorkArea } from '@/components/workarea/AISpaceWorkArea'
import { TaskPanel } from '@/components/tasks/TaskPanel'
import { WorkflowPanel } from '@/components/workflow/WorkflowPanel'
import { RightPanel } from '@/components/rightpanel/RightPanel'
import { Settings } from '@/components/settings/Settings'
import { useNavStore } from '@/store/nav'
import { useUIStore } from '@/store/ui'

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

// Three-column Codex-style shell:
//   [sidebar rail + nav tree] | [center section view] | [right panel]
//
// Center view changes with the active primary section (MVP plan §4):
//   - 任务面板  → task list + detail
//   - AI 空间   → work tabs (对话/变更/终端/文件) + bottom composer
//   - 工作流    → fixed flow placeholder
export default function App(): React.ReactElement {
  const section = useNavStore((s) => s.activeSection)
  const rightPanelOpen = useNavStore((s) => s.rightPanelOpen)
  const settingsOpen = useUIStore((s) => s.settingsOpen)

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

        {rightPanelOpen && <RightPanel />}
      </div>
    </div>
  )
}
