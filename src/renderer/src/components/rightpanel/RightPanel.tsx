import { useState } from 'react'
import {
  AlertCircle,
  FileCode2,
  FileDiff,
  FolderGit2,
  Info,
  PanelRightOpen,
  X
} from 'lucide-react'
import { ResizeHandle } from '@/components/common/ResizeHandle'
import { useNavStore } from '@/store/nav'
import { useDataStore } from '@/store/data'
import { cn } from '@/lib/utils'
import { ChangesPanel } from './ChangesPanel'
import { FilesPanel } from './FilesPanel'

export function RightPanel(): React.ReactElement {
  const section = useNavStore((state) => state.activeSection)
  const close = useNavStore((state) => state.closeRightPanel)
  const width = useNavStore((state) => state.rightPanelWidth)
  const setWidth = useNavStore((state) => state.setRightPanelWidth)
  const selectedProjectId = useNavStore((state) => state.selectedProjectId)
  const selectedSessionId = useNavStore((state) => state.selectedSessionId)
  const workflowView = useNavStore((state) => state.activeSecondaryId.workflow)
  const aiView = useNavStore((state) => state.aiRightPanelView)
  const showAiView = useNavStore((state) => state.showAiRightPanel)
  const projects = useDataStore((state) => state.projects)
  const sessionsByProject = useDataStore((state) => state.sessionsByProject)

  const project = projects.find((candidate) => candidate.id === selectedProjectId) ?? null
  const session =
    selectedProjectId === null
      ? null
      : ((sessionsByProject[selectedProjectId] ?? []).find(
          (candidate) => candidate.id === selectedSessionId
        ) ?? null)

  const title =
    section === 'tasks'
      ? '附属信息'
      : section === 'ai-space'
        ? session === null
          ? '项目上下文'
          : aiView === 'changes'
            ? '变更'
            : '文件'
        : workflowView === 'templates'
          ? '模板说明'
          : '运行上下文'

  return (
    <>
      <ResizeHandle
        side="left"
        onDelta={(delta) => setWidth(width - delta)}
        title="拖拽调整右侧栏宽度"
      />
      <aside
        className="flex shrink-0 flex-col border-l border-border bg-background"
        style={{ width }}
        aria-label="上下文侧栏"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {title}
            </span>
            {section === 'ai-space' && session !== null && (
              <div className="flex items-center rounded-md bg-muted p-0.5">
                <PanelTab
                  label="变更"
                  icon={FileDiff}
                  active={aiView === 'changes'}
                  onClick={() => showAiView('changes')}
                />
                <PanelTab
                  label="文件"
                  icon={FileCode2}
                  active={aiView === 'files'}
                  onClick={() => showAiView('files')}
                />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            title="收起右侧栏"
            aria-label="收起右侧栏"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {section === 'tasks' && <div aria-label="暂无任务附属内容" />}

          {section === 'ai-space' &&
            (project === null ? (
              <PanelEmpty
                icon={FolderGit2}
                text="选择项目或会话后，这里显示其附加上下文。"
              />
            ) : session === null ? (
              <ProjectInspector projectId={project.id} />
            ) : aiView === 'changes' ? (
              <ChangesPanel sessionId={session.id} />
            ) : (
              <FilesPanel sessionId={session.id} />
            ))}

          {section === 'workflow' && (
            <PanelEmpty
              icon={Info}
              title={workflowView === 'templates' ? '模板使用说明' : '当前流程'}
              text={
                workflowView === 'templates'
                  ? '选择模板时，参数和适用边界将显示在这里。'
                  : '选择流程节点时，运行状态、输入和产物将显示在这里。'
              }
            />
          )}
        </div>
      </aside>
    </>
  )
}

export function RightPanelDock(): React.ReactElement {
  const section = useNavStore((state) => state.activeSection)
  const open = useNavStore((state) => state.openRightPanel)
  const showAiView = useNavStore((state) => state.showAiRightPanel)

  return (
    <aside
      className="flex w-10 shrink-0 flex-col items-center border-l border-border bg-background py-2"
      aria-label="右侧栏入口"
    >
      {section === 'ai-space' ? (
        <>
          <DockButton
            label="打开变更"
            icon={FileDiff}
            onClick={() => showAiView('changes')}
          />
          <DockButton
            label="打开文件"
            icon={FileCode2}
            onClick={() => showAiView('files')}
          />
        </>
      ) : (
        <DockButton
          label={section === 'tasks' ? '打开附属栏' : '打开运行上下文'}
          icon={PanelRightOpen}
          onClick={open}
        />
      )}
    </aside>
  )
}

function ProjectInspector({ projectId }: { projectId: string }): React.ReactElement {
  const project = useDataStore((state) =>
    state.projects.find((item) => item.id === projectId)
  )
  const error = useDataStore((state) => state.error)
  const deleteProject = useDataStore((state) => state.deleteProject)
  const selectProject = useNavStore((state) => state.selectProject)
  const [busy, setBusy] = useState(false)

  if (project === undefined) return <PanelEmpty icon={FolderGit2} text="项目已不存在。" />

  async function handleDelete(): Promise<void> {
    if (!window.confirm('确定移除这个本地项目吗？项目文件不会从磁盘删除。')) return
    setBusy(true)
    try {
      if (await deleteProject(projectId)) selectProject(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 p-4">
      {error !== null && (
        <div className="flex items-start gap-2 rounded-md bg-status-error/10 p-2.5 text-[11px] leading-relaxed text-status-error">
          <AlertCircle size={13} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}
      <div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <FolderGit2 size={14} />
          <span className="text-[10px] font-medium uppercase tracking-[0.14em]">
            项目
          </span>
        </div>
        <h2 className="mt-2 text-[17px] font-semibold text-foreground">{project.name}</h2>
        <code className="mt-2 block break-all rounded-md border border-border bg-card p-2 text-[10px] leading-relaxed text-muted-foreground">
          {project.path}
        </code>
      </div>
      <button
        type="button"
        title={`移除项目 ${project.name}`}
        aria-label={`移除项目 ${project.name}`}
        disabled={busy}
        onClick={() => void handleDelete()}
        className="text-[11px] text-muted-foreground transition-colors hover:text-status-error disabled:opacity-50"
      >
        移除本地项目
      </button>
    </div>
  )
}

function PanelTab({
  label,
  icon: Icon,
  active,
  onClick
}: {
  label: string
  icon: typeof FileDiff
  active: boolean
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex h-6 w-7 items-center justify-center rounded transition-colors',
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
      )}
    >
      <Icon size={12} />
    </button>
  )
}

function DockButton({
  label,
  icon: Icon,
  onClick
}: {
  label: string
  icon: typeof FileDiff
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <Icon size={15} />
    </button>
  )
}

function PanelEmpty({
  icon: Icon,
  title,
  text
}: {
  icon: typeof Info
  title?: string
  text: string
}): React.ReactElement {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center">
      <Icon size={22} strokeWidth={1.4} className="text-muted-foreground/55" />
      {title !== undefined && (
        <h2 className="mt-3 text-[12px] font-medium text-foreground">{title}</h2>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{text}</p>
    </div>
  )
}
