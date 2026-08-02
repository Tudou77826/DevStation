import { useEffect } from 'react'
import {
  Bot,
  FileCode2,
  FileDiff,
  FolderGit2,
  PanelRight,
  SquareTerminal
} from 'lucide-react'
import type { TerminalContext } from '@shared/types'
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
  const selectProject = useNavStore((state) => state.selectProject)
  const projects = useDataStore((state) => state.projects)
  const sessionsByProject = useDataStore((state) => state.sessionsByProject)

  const project = projects.find((candidate) => candidate.id === selectedProjectId) ?? null
  const session =
    selectedProjectId === null
      ? null
      : ((sessionsByProject[selectedProjectId] ?? []).find(
          (candidate) => candidate.id === selectedSessionId
        ) ?? null)
  const selectedProjectSessionsLoaded =
    selectedProjectId !== null &&
    Object.prototype.hasOwnProperty.call(sessionsByProject, selectedProjectId)

  // Resolve a persisted session only after its project sessions arrive. This
  // avoids briefly connecting the project's plain shell during startup.
  useEffect(() => {
    if (
      project !== null &&
      selectedSessionId !== null &&
      selectedProjectSessionsLoaded &&
      session === null
    ) {
      selectProject(project.id)
    }
  }, [project, selectProject, selectedProjectSessionsLoaded, selectedSessionId, session])

  const restoringSession = selectedSessionId !== null && session === null
  const context: TerminalContext =
    session !== null
      ? { type: 'session', sessionId: session.id }
      : { type: 'workspace', projectId: project?.id ?? null }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-[#090909]"
      aria-label="AI 空间工作区"
    >
      <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-background px-4">
        <div className="flex min-w-0 items-center gap-2 text-[12px]">
          {project === null ? (
            <SquareTerminal size={14} className="shrink-0 text-muted-foreground" />
          ) : (
            <FolderGit2 size={14} className="shrink-0 text-muted-foreground" />
          )}
          <span className="truncate text-muted-foreground">
            {project?.name ?? '本地 PowerShell'}
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

        {session !== null && (
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
        )}
      </header>

      <div className="min-h-0 flex-1">
        {restoringSession ? (
          <div
            className="flex h-full items-center justify-center bg-[#090909] text-[12px] text-white/45"
            aria-label="正在恢复 Agent 会话"
          >
            正在恢复 Agent 会话…
          </div>
        ) : (
          <TerminalPane context={context} />
        )}
      </div>
    </section>
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
