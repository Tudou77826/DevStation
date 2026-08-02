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
  Search,
  AlertTriangle,
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
  const agents = useDataStore((state) => state.agents ?? [])
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
  const [keyword, setKeyword] = useState('')
  const [agentFilter, setAgentFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

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

  const normalizedKeyword = keyword.trim().toLocaleLowerCase()
  const visibleProjects = projects.flatMap((project) => {
    const sessions = sessionsByProject[project.id] ?? []
    const filteredSessions = sessions.filter((session) => {
      const matchesKeyword =
        normalizedKeyword === '' ||
        project.name.toLocaleLowerCase().includes(normalizedKeyword) ||
        session.title.toLocaleLowerCase().includes(normalizedKeyword)
      const matchesAgent = agentFilter === 'all' || session.agentId === agentFilter
      const matchesStatus = statusFilter === 'all' || session.status === statusFilter
      return matchesKeyword && matchesAgent && matchesStatus
    })
    const projectNameMatches = project.name
      .toLocaleLowerCase()
      .includes(normalizedKeyword)
    const hasSessionFilter = agentFilter !== 'all' || statusFilter !== 'all'
    if (
      (normalizedKeyword !== '' &&
        !projectNameMatches &&
        filteredSessions.length === 0) ||
      (hasSessionFilter && filteredSessions.length === 0)
    ) {
      return []
    }
    return [
      {
        project,
        sessions:
          normalizedKeyword !== '' || hasSessionFilter ? filteredSessions : sessions
      }
    ]
  })

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pb-2">
      <div className="sticky top-0 z-10 space-y-1.5 bg-sidebar pb-2">
        <label className="flex items-center gap-2 rounded-md border border-sidebar-border bg-background/50 px-2 py-1.5 focus-within:border-ring">
          <Search size={13} className="text-muted-foreground" />
          <input
            aria-label="搜索项目或会话"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索项目或会话"
            className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          <select
            aria-label="按 Coding Agent 筛选"
            value={agentFilter}
            onChange={(event) => setAgentFilter(event.target.value)}
            className="min-w-0 rounded-md border border-sidebar-border bg-background/50 px-1.5 py-1 text-[10px] text-muted-foreground outline-none"
          >
            <option value="all">全部 Agent</option>
            {agents.map(({ descriptor }) => (
              <option key={descriptor.id} value={descriptor.id}>
                {descriptor.label}
              </option>
            ))}
          </select>
          <select
            aria-label="按会话状态筛选"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="min-w-0 rounded-md border border-sidebar-border bg-background/50 px-1.5 py-1 text-[10px] text-muted-foreground outline-none"
          >
            <option value="all">全部状态</option>
            <option value="working">工作中</option>
            <option value="waiting">等待</option>
            <option value="done">已完成</option>
            <option value="failed">失败</option>
            <option value="unknown">未知</option>
          </select>
        </div>
      </div>
      {visibleProjects.length === 0 && (
        <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">
          没有匹配的项目或会话
        </div>
      )}
      {visibleProjects.map(({ project, sessions }) => {
        const expanded = expandedProjectIds.includes(project.id)
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
              <div className="ml-2 space-y-1 border-l border-sidebar-border py-1 pl-2">
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
                          'flex w-full items-start gap-2 rounded-lg border px-2 py-2 text-left transition-colors',
                          active
                            ? 'border-sidebar-ring/40 bg-sidebar-accent text-sidebar-accent-foreground'
                            : 'border-sidebar-border bg-background/45 text-muted-foreground hover:bg-sidebar-accent/55 hover:text-sidebar-accent-foreground'
                        )}
                      >
                        <Bot size={14} className="mt-0.5 shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12px] text-foreground/90">
                            {session.title}
                          </span>
                          <span className="mt-1 flex items-center gap-1 truncate text-[9px] text-muted-foreground">
                            <span>
                              {agents.find(
                                ({ descriptor }) => descriptor.id === session.agentId
                              )?.descriptor.label ?? session.agentId}
                            </span>
                            <span>·</span>
                            <span>{sessionStatusLabel(session.status)}</span>
                            <span>·</span>
                            <span>
                              {relativeTime(
                                session.statusUpdatedAt ??
                                  session.lastOpenedAt ??
                                  session.createdAt
                              )}
                            </span>
                          </span>
                        </span>
                        {(session.statusSource === 'none' ||
                          session.status === 'unknown') && (
                          <AlertTriangle
                            size={11}
                            aria-label="状态已降级"
                            className="mt-0.5 shrink-0 text-status-warning"
                          />
                        )}
                        <span
                          className={cn(
                            'h-1.5 w-1.5 shrink-0 rounded-full',
                            session.status === 'working' || session.status === 'starting'
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

function sessionStatusLabel(status: string): string {
  return (
    {
      unknown: '状态未知',
      starting: '启动中',
      working: '工作中',
      waiting: '等待',
      done: '已完成',
      failed: '失败'
    }[status] ?? '状态未知'
  )
}

function relativeTime(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60_000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
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
