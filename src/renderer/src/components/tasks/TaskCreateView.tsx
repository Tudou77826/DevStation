import { useState } from 'react'
import { ArrowLeft, Check, FolderGit2, ListTodo } from 'lucide-react'
import { useDataStore } from '@/store/data'

export function TaskCreateView({
  onCancel,
  onCreated
}: {
  onCancel: () => void
  onCreated: (taskId: string) => void
}): React.ReactElement {
  const projects = useDataStore((state) => state.projects)
  const createTask = useDataStore((state) => state.createTask)
  const setTaskProject = useDataStore((state) => state.setTaskProject)
  const deleteTask = useDataStore((state) => state.deleteTask)
  const error = useDataStore((state) => state.error)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectId, setProjectId] = useState('')
  const [busy, setBusy] = useState(false)

  const valid = title.trim() !== ''

  async function confirm(): Promise<void> {
    if (!valid || busy) return
    setBusy(true)
    try {
      const task = await createTask(title.trim(), description.trim())
      if (task === null) return
      if (projectId !== '') {
        const associated = await setTaskProject(task.id, projectId)
        if (associated === null) {
          await deleteTask(task.id)
          return
        }
      }
      onCreated(task.id)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-muted/10">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft size={14} />
            返回任务列表
          </button>
          <span className="h-4 w-px bg-border" />
          <span className="text-[12px] font-medium text-foreground">创建任务</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-md px-3 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={!valid || busy}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check size={14} />
            {busy ? '正在创建…' : '创建任务'}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <div className="grid min-h-full gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="rounded-xl border border-border bg-card/70 p-6 shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <ListTodo size={14} />
              任务内容
            </div>
            <label className="mt-7 block">
              <span className="sr-only">任务标题</span>
              <input
                autoFocus
                aria-label="任务标题"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    void confirm()
                  }
                }}
                placeholder="输入任务标题（必填）"
                className="w-full border-b border-border bg-transparent pb-3 text-[26px] font-semibold tracking-tight text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground/55 focus:border-ring"
              />
            </label>
            <label className="mt-8 block">
              <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                描述
              </span>
              <textarea
                aria-label="任务描述"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={10}
                placeholder="补充任务背景、目标和验收条件…"
                className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground/60 focus:ring-1 focus:ring-ring"
              />
            </label>
          </section>

          <aside className="rounded-xl border border-border bg-card/70 p-5 shadow-sm">
            <h2 className="text-[12px] font-medium text-foreground">任务属性</h2>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              确认创建后任务才会保存，默认状态为待处理。
            </p>
            <label className="mt-6 block">
              <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                关联项目
              </span>
              <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-2.5">
                <FolderGit2 size={14} className="shrink-0 text-muted-foreground" />
                <select
                  aria-label="关联项目"
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-[12px] text-foreground outline-none"
                >
                  <option value="">暂不关联</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            </label>
            {error !== null && (
              <p className="mt-4 rounded-md bg-status-error/10 px-3 py-2 text-[11px] text-status-error">
                {error}
              </p>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
