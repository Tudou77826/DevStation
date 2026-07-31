// AI Space center view: the only place that shows the 4 work tabs
// (对话/变更/终端/文件) and the bottom composer. Owned by the AI Space section.
import { TopBar } from './TopBar'
import { WorkTabs } from './WorkTabs'
import { WorkPane } from './WorkPanes'
import { ChatComposer } from './ChatComposer'
import { useNavStore } from '@/store/nav'

export function AISpaceWorkArea(): React.ReactElement {
  const activeTab = useNavStore((s) => s.activeWorkTab)

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
