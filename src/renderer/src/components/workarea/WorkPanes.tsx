import { MessageSquare, GitCommitHorizontal, FileCode } from 'lucide-react'
import type { WorkAreaTab } from '@shared/types'
import { TerminalPane } from '../terminal/TerminalPane'

// Each pane is a Stage-1 placeholder: empty state + a (toggleable) loading
// state. Real content lands in Stage 3 (terminal), Stage 5 (changes/files).
function EmptyState({
  icon: Icon,
  title,
  hint
}: {
  icon: typeof MessageSquare
  title: string
  hint: string
}): React.ReactElement {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground">
        <Icon size={22} strokeWidth={1.5} />
      </div>
      <div>
        <div className="text-[14px] font-medium text-foreground">{title}</div>
        <div className="mt-1 text-[12px] text-muted-foreground">{hint}</div>
      </div>
    </div>
  )
}

function ConversationPane(): React.ReactElement {
  return (
    <EmptyState
      icon={MessageSquare}
      title="还没有对话"
      hint="在下方输入框向 Agent 发送第一条指令"
    />
  )
}
function ChangesPane(): React.ReactElement {
  return (
    <EmptyState
      icon={GitCommitHorizontal}
      title="暂无文件变更"
      hint="Agent 修改文件后，变更将出现在这里"
    />
  )
}
function FilesPane(): React.ReactElement {
  return (
    <EmptyState
      icon={FileCode}
      title="暂无可预览文件"
      hint="选择变更中的文件以查看 Diff（阶段 5）"
    />
  )
}

export function WorkPane({ tab }: { tab: WorkAreaTab }): React.ReactElement {
  switch (tab) {
    case 'conversation':
      return <ConversationPane />
    case 'changes':
      return <ChangesPane />
    case 'terminal':
      return <TerminalPane />
    case 'files':
      return <FilesPane />
  }
}
