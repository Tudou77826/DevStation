import { useEffect, useState } from 'react'
import { Plus, FolderGit2, Trash2, ChevronRight, Inbox, AlertCircle } from 'lucide-react'
import { useDataStore } from '@/store/data'
import { SessionList } from './SessionList'
import { cn } from '@/lib/utils'

// AI 空间 → 项目: lists local projects, add (via native dir picker + git
// validation), delete (PROJECT_IN_USE surfaces as an inline error), and shows
// the selected project's sessions.
export function ProjectsView(): React.ReactElement {
  const projects = useDataStore((s) => s.projects)
  const loading = useDataStore((s) => s.loading)
  const error = useDataStore((s) => s.error)
  const createProject = useDataStore((s) => s.createProject)
  const pickDirectory = useDataStore((s) => s.pickDirectory)
  const deleteProject = useDataStore((s) => s.deleteProject)

  const [selectedId, setSelectedId] = useState<string | null>(projects[0]?.id ?? null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (selectedId === null && projects.length > 0) setSelectedId(projects[0].id)
  }, [projects, selectedId])

  async function handleAdd(): Promise<void> {
    setBusy(true)
    try {
      const path = await pickDirectory()
      if (path === null) return
      const name = path.replace(/\\/g, '/').split('/').pop() ?? path
      const project = await createProject(name, path)
      if (project !== null) setSelectedId(project.id)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(id: string): Promise<void> {
    if (!window.confirm('确定移除这个本地项目吗？项目文件不会从磁盘删除。')) return
    const ok = await deleteProject(id)
    if (ok && selectedId === id) {
      const remaining = useDataStore.getState().projects
      setSelectedId(remaining[0]?.id ?? null)
    }
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* project list */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border">
        <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-border px-3">
          <span className="text-[13px] font-medium text-foreground">项目</span>
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={busy}
            title="添加本地项目"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading && projects.length === 0 ? (
            <Hint text="加载中…" />
          ) : projects.length === 0 ? (
            <Hint text="还没有项目，点击右上角添加一个本地 Git 仓库" />
          ) : (
            <div className="space-y-1">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className={cn(
                    'group flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors',
                    selectedId === p.id ? 'bg-accent' : 'hover:bg-accent/50'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    aria-current={selectedId === p.id ? 'page' : undefined}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <FolderGit2 size={16} className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-foreground">
                        {p.name}
                      </span>
                      <span className="block truncate font-mono text-[11px] text-muted-foreground">
                        {p.path}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    title={`移除项目 ${p.name}`}
                    aria-label={`移除项目 ${p.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleDelete(p.id)
                    }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground/50 opacity-0 transition-opacity hover:bg-status-error/10 hover:text-status-error focus:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* selected project detail + its sessions */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {error !== null && (
          <div className="flex items-center gap-2 border-b border-status-error/30 bg-status-error/10 px-4 py-2 text-[12px] text-status-error">
            <AlertCircle size={13} />
            <span>{error}</span>
          </div>
        )}
        {selectedId === null ? (
          <div className="flex h-full items-center justify-center">
            <Hint text="选择左侧项目查看详情" />
          </div>
        ) : (
          <ProjectDetail projectId={selectedId} />
        )}
      </div>
    </div>
  )
}

function ProjectDetail({ projectId }: { projectId: string }): React.ReactElement {
  const project = useDataStore((s) => s.projects.find((p) => p.id === projectId) ?? null)
  if (project === null) return <Hint text="选择左侧项目查看详情" />
  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      <div className="flex items-center gap-2 text-muted-foreground">
        <FolderGit2 size={15} />
        <span className="text-[12px] font-medium uppercase tracking-wider">项目</span>
      </div>
      <h1 className="mt-2 text-[20px] font-semibold text-foreground">{project.name}</h1>
      <code className="mt-2 block break-all rounded-md border border-border bg-card px-3 py-2 font-mono text-[12px] text-muted-foreground">
        {project.path}
      </code>

      <div className="mt-8 flex items-center gap-2">
        <ChevronRight size={14} className="text-muted-foreground/50" />
        <h2 className="text-[13px] font-medium text-foreground">该项目的会话</h2>
      </div>
      <div className="mt-3">
        <SessionList projectId={projectId} />
      </div>
    </div>
  )
}

function Hint({ text }: { text: string }): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center text-muted-foreground">
      <Inbox size={22} strokeWidth={1.5} />
      <span className="text-[12px]">{text}</span>
    </div>
  )
}
