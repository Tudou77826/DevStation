// AI Space center view. Routes by secondary nav:
//   'projects' → ProjectsView (project list + per-project sessions)
//   'sessions' → the session work area (TopBar + 4 work tabs + composer)
import { TopBar } from './TopBar'
import { WorkTabs } from './WorkTabs'
import { WorkPane } from './WorkPanes'
import { ChatComposer } from './ChatComposer'
import { ProjectsView } from '@/components/ai-space/ProjectsView'
import { useNavStore } from '@/store/nav'

export function AISpaceWorkArea(): React.ReactElement {
  const activeTab = useNavStore((s) => s.activeWorkTab)
  const sub = useNavStore((s) => s.activeSecondaryId['ai-space'])

  if (sub === 'projects') {
    return <ProjectsView />
  }

  return (
    <>
      <TopBar />
      <WorkTabs />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <WorkPane tab={activeTab} />
      </div>
      <ChatComposer />
    </>
  )
}
