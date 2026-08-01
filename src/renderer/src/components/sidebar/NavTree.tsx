import { useEffect, useState } from 'react'
import {
  Bot,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleDot,
  FolderGit2,
  GitBranch,
  Inbox,
  LayoutTemplate,
  Plus,
  type LucideIcon
} from 'lucide-react'
import { SECONDARY_NAV, useNavStore } from '@/store/nav'
import { useDataStore } from '@/store/data'
import { cn } from '@/lib/utils'

const ICONS: Record<string, LucideIcon> = {
  inbox: Inbox,
  'circle-dot': CircleDot,
  'check-check': CheckCheck,
  'git-branch': GitBranch,
  'layout-template': LayoutTemplate
}

export function NavTree(): React.ReactElement {
  const section = useNavStore((state) => state.activeSection)

  return (
    <div className="flex min-h-0 flex-1 flex-col px-2 py-3">
      <div className="flex h-7 shrink-0 items-center justify-between px-2 pb-1">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
          {sectionLabel(section)}
        </span>
        {section === 'ai-space' && <AddProjectButton />}
      </div>
      {section === 'ai-space' ? <AISpaceTree /> : <StaticSecondaryNav />}
    </div>
  )
}

function StaticSecondaryNav(): React.ReactElement {
  const section = useNavStore((state) => state.activeSection)
  const activeId = useNavStore((state) => state.activeSecondaryId[section])
  const setSecondary = useNavStore((state) => state.setSecondary)
  const tasks = useDataStore((state) => state.tasks)
  const items = SECONDARY_NAV[section]

  return (
    <div className="space-y-0.5">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? Inbox
        const active = item.id === activeId
        const badge =
          section === 'tasks'
            ? item.id === 'all'
              ? tasks.length
              : tasks.filter((task) => task.status === item.id).length
            : item.badge
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setSecondary(item.id)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'group flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] text-muted-foreground transition-colors',
              'hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
              active && 'bg-sidebar-accent text-sidebar-accent-foreground'
            )}
          >
            <Icon size={16} strokeWidth={1.75} className="shrink-0" />
            <span className="truncate">{item.label}</span>
            {badge !== undefined && badge > 0 && (
              <span className="ml-auto rounded-full bg-secondary px-1.5 py-px text-[10px] font-medium tabular-nums text-secondary-foreground">
                {badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function AISpaceTree(): React.ReactElement {
  const projects = useDataStore((state) => state.projects)
  const sessionsByProject = useDataStore((state) => state.sessionsByProject)
  const loadSessionsByProject = useDataStore((state) => state.loadSessionsByProject)
  const touchSession = useDataStore((state) => state.touchSession)
  const selectedProjectId = useNavStore((state) => state.selectedProjectId)
  const selectedSessionId = useNavStore((state) => state.selectedSessionId)
  const expandedProjectIds = useNavStore((state) => state.expandedProjectIds)
  const selectProject = useNavStore((state) => state.selectProject)
  const selectSession = useNavStore((state) => state.selectSession)
  const toggleProjectExpanded = useNavStore((state) => state.toggleProjectExpanded)
  const [loadedIds, setLoadedIds] = useState<string[]>([])

  useEffect(() => {
    const pending = projects
      .map((project) => project.id)
      .filter((projectId) => !loadedIds.includes(projectId))
    if (pending.length === 0) return
    setLoadedIds((current) => [...current, ...pending])
    for (const projectId of pending) {
      void loadSessionsByProject(projectId).catch(() => undefined)
    }
  }, [projects, loadedIds, loadSessionsByProject])

  if (projects.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <FolderGit2 size={22} strokeWidth={1.4} className="text-muted-foreground/60" />
        <p className="mt-2 text-[12px] text-muted-foreground">还没有本地项目</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground/65">
          添加 Git 目录后，会话会按项目归类
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-2">
      {projects.map((project) => {
        const expanded = expandedProjectIds.includes(project.id)
        const sessions = sessionsByProject[project.id] ?? []
        const projectActive =
          selectedProjectId === project.id && selectedSessionId === null
        return (
          <div key={project.id} className="mb-1">
            <div
              className={cn(
                'group flex items-center rounded-md transition-colors hover:bg-sidebar-accent/60',
                projectActive && 'bg-sidebar-accent'
              )}
            >
              <button
                type="button"
                title={expanded ? `收起 ${project.name}` : `展开 ${project.name}`}
                aria-label={expanded ? `收起 ${project.name}` : `展开 ${project.name}`}
                onClick={() => toggleProjectExpanded(project.id)}
                className="flex h-8 w-7 shrink-0 items-center justify-center text-muted-foreground"
              >
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              <button
                type="button"
                onClick={() => selectProject(project.id)}
                aria-label={project.name}
                aria-current={projectActive ? 'page' : undefined}
                className="flex min-w-0 flex-1 items-center gap-2 py-2 pr-2 text-left"
              >
                <FolderGit2 size={15} className="shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-sidebar-foreground">
                  {project.name}
                </span>
                {sessions.length > 0 && (
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {sessions.length}
                  </span>
                )}
              </button>
            </div>

            {expanded && (
              <div className="ml-3 border-l border-sidebar-border pl-2">
                {sessions.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-muted-foreground/65">
                    暂无工作会话
                  </div>
                ) : (
                  sessions.map((session) => {
                    const active = selectedSessionId === session.id
                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => {
                          selectSession(session.id, project.id)
                          void touchSession(session.id)
                        }}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors',
                          active
                            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'text-muted-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-accent-foreground'
                        )}
                      >
                        <Bot size={14} className="shrink-0" />
                        <span className="min-w-0 flex-1 truncate text-[12px]">
                          {session.title}
                        </span>
                        <span
                          className={cn(
                            'h-1.5 w-1.5 shrink-0 rounded-full',
                            session.status === 'running'
                              ? 'bg-status-success'
                              : session.status === 'waiting'
                                ? 'bg-status-warning'
                                : session.status === 'failed'
                                  ? 'bg-status-error'
                                  : 'bg-muted-foreground/40'
                          )}
                        />
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function AddProjectButton(): React.ReactElement {
  const pickDirectory = useDataStore((state) => state.pickDirectory)
  const createProject = useDataStore((state) => state.createProject)
  const selectProject = useNavStore((state) => state.selectProject)
  const [busy, setBusy] = useState(false)

  async function handleAdd(): Promise<void> {
    setBusy(true)
    try {
      const path = await pickDirectory()
      if (path === null) return
      const name = path.replace(/\\/g, '/').split('/').pop() ?? path
      const project = await createProject(name, path)
      if (project !== null) selectProject(project.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      title="添加本地项目"
      aria-label="添加本地项目"
      disabled={busy}
      onClick={() => void handleAdd()}
      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground disabled:opacity-50"
    >
      <Plus size={14} />
    </button>
  )
}

function sectionLabel(section: string): string {
  switch (section) {
    case 'tasks':
      return '任务'
    case 'ai-space':
      return '项目与会话'
    case 'workflow':
      return '工作流'
    default:
      return ''
  }
}
