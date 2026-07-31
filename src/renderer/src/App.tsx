import { Sidebar } from '@/components/sidebar/Sidebar'
import { TopBar } from '@/components/workarea/TopBar'
import { WorkTabs } from '@/components/workarea/WorkTabs'
import { WorkPane } from '@/components/workarea/WorkPanes'
import { ChatComposer } from '@/components/workarea/ChatComposer'
import { RightPanel } from '@/components/rightpanel/RightPanel'
import { useNavStore } from '@/store/nav'

// Three-column Codex-style shell:
//   [sidebar rail + nav tree] | [top bar + tabs + content + composer] | [right panel]
// The right panel is collapsible (per MVP plan §4).
export default function App(): React.ReactElement {
  const activeTab = useNavStore((s) => s.activeWorkTab)
  const rightPanelOpen = useNavStore((s) => s.rightPanelOpen)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar />

      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <WorkTabs />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <WorkPane tab={activeTab} />
        </div>
        <ChatComposer />
      </main>

      {rightPanelOpen && <RightPanel />}
    </div>
  )
}
