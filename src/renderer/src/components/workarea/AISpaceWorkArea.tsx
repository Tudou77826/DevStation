import { Bot, FileCode2, FileDiff, FolderGit2, PanelRight } from 'lucide-react'
import { TerminalPane } from '@/components/terminal/TerminalPane'
import { useDataStore } from '@/store/data'
import { useNavStore } from '@/store/nav'
import { cn } from '@/lib/utils'

export function AISpaceWorkArea(): React.ReactElement {
  const selectedProjectId = useNavStore((state) => state.selectedProjectId)
  const selectedSessionId = useNavStore((state) => state.selectedSessionId)
  const rightPanelOpen = useNavStore((state) => state.rightPanelOpen)
  const aiRightPanelView = useNavStore((state) => state.aiRightPanelView)
  const showAiRightPanel = useNavStore((state) => state.showAiRightPanel)
  const projects = useDataStore((state) => state.projects)
  const sessionsByProject = useDataStore((state) => state.sessionsByProject)

  const project = projects.find((candidate) => candidate.id === selectedProjectId) ?? null
  const session =
    selectedProjectId === null
      ? null
      : ((sessionsByProject[selectedProjectId] ?? []).find(
          (candidate) => candidate.id === selectedSessionId
        ) ?? null)

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-background"
      aria-label="AI 空间工作区"
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border px-4">
        <div className="flex min-w-0 items-center gap-2 text-[12px]">
          <FolderGit2 size={14} className="shrink-0 text-muted-foreground" />
          <span className="truncate text-muted-foreground">
            {project?.name ?? 'AI 空间'}
          </span>
          {session !== null && (
            <>
              <span className="text-muted-foreground/40">/</span>
              <Bot size={13} className="shrink-0 text-muted-foreground" />
              <span className="truncate font-medium text-foreground">
                {session.title}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          <ContextButton
            label="变更"
            active={rightPanelOpen && aiRightPanelView === 'changes'}
            icon={FileDiff}
            onClick={() => showAiRightPanel('changes')}
          />
          <ContextButton
            label="文件"
            active={rightPanelOpen && aiRightPanelView === 'files'}
            icon={FileCode2}
            onClick={() => showAiRightPanel('files')}
          />
          {!rightPanelOpen && (
            <span className="ml-1 text-muted-foreground/50" title="右侧栏已收起">
              <PanelRight size={14} />
            </span>
          )}
        </div>
      </header>

      {project === null ? (
        <EmptyState
          icon={FolderGit2}
          title="选择一个项目目录"
          hint="在左侧展开项目，然后选择要继续的工作会话"
        />
      ) : session === null ? (
        <ProjectLanding
          name={project.name}
          path={project.path}
          sessionCount={(sessionsByProject[project.id] ?? []).length}
        />
      ) : (
        <AgentStage
          title={session.title}
          status={session.status}
          projectName={project.name}
        />
      )}
    </section>
  )
}

function AgentStage({
  title,
  status,
  projectName
}: {
  title: string
  status: string
  projectName: string
}): React.ReactElement {
  return (
    <div className="min-h-0 flex-1 overflow-hidden p-4">
      <div className="mx-auto flex h-full max-w-6xl flex-col overflow-hidden rounded-xl border border-white/10 bg-[#080808] shadow-[0_18px_55px_rgba(0,0,0,0.28)]">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/8 text-neutral-300">
              <Bot size={14} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium text-neutral-100">
                {title}
              </div>
              <div className="truncate text-[10px] text-neutral-500">{projectName}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-neutral-500">
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                status === 'running'
                  ? 'bg-emerald-400'
                  : status === 'waiting'
                    ? 'bg-amber-400'
                    : status === 'failed'
                      ? 'bg-red-400'
                      : 'bg-neutral-600'
              )}
            />
            Agent
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <TerminalPane />
        </div>
      </div>
    </div>
  )
}

function ProjectLanding({
  name,
  path,
  sessionCount
}: {
  name: string
  path: string
  sessionCount: number
}): React.ReactElement {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-8 py-10">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FolderGit2 size={15} />
          <span className="text-[10px] font-medium uppercase tracking-[0.16em]">
            项目目录
          </span>
        </div>
        <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-foreground">
          {name}
        </h1>
        <code className="mt-2 block truncate text-[11px] text-muted-foreground">
          {path}
        </code>
        <div className="mt-6 border-t border-border pt-4 text-[12px] text-muted-foreground">
          {sessionCount > 0
            ? `左侧共有 ${sessionCount} 个工作会话，选择后进入 Agent。`
            : '该项目还没有工作会话，请从任务详情中创建。'}
        </div>
      </div>
    </div>
  )
}

function ContextButton({
  label,
  active,
  icon: Icon,
  onClick
}: {
  label: string
  active: boolean
  icon: typeof FileDiff
  onClick: () => void
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] transition-colors',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
      )}
    >
      <Icon size={13} />
      {label}
    </button>
  )
}

function EmptyState({
  icon: Icon,
  title,
  hint
}: {
  icon: typeof FolderGit2
  title: string
  hint: string
}): React.ReactElement {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
      <Icon size={26} strokeWidth={1.35} className="text-muted-foreground/55" />
      <h1 className="mt-3 text-[14px] font-medium text-foreground">{title}</h1>
      <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-muted-foreground">
        {hint}
      </p>
    </div>
  )
}
