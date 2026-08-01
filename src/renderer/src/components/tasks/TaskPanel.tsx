import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  GitBranch,
  Inbox,
  Search,
  Pin,
  PinOff,
  Check,
  FolderGit2,
  AlertCircle,
  Trash2
} from 'lucide-react'
import { useNavStore } from '@/store/nav'
import { useDataStore } from '@/store/data'
import type { Task, TaskStatus } from '@shared/domain'
import { SessionList } from '@/components/ai-space/SessionList'
import { cn } from '@/lib/utils'

const STATUS_META: Record<TaskStatus, { label: string; tone: string }> = {
  todo: { label: '待处理', tone: 'bg-muted-foreground/30 text-muted-foreground' },
  'in-progress': { label: '进行中', tone: 'bg-status-warning/15 text-status-warning' },
  done: { label: '已完成', tone: 'bg-status-success/15 text-status-success' }
}

export function TaskPanel(): React.ReactElement {
  const filter = useNavStore((s) => s.activeSecondaryId.tasks)
  const selectedId = useNavStore((s) => s.selectedTaskId)
  const selectTask = useNavStore((s) => s.selectTask)

  const tasks = useDataStore((s) => s.tasks)
  const loadTasks = useDataStore((s) => s.loadTasks)
  const createTask = useDataStore((s) => s.createTask)
  const touchTask = useDataStore((s) => s.touchTask)
  const loading = useDataStore((s) => s.loading)
  const error = useDataStore((s) => s.error)

  const [keyword, setKeyword] = useState('')
  const [creating, setCreating] = useState(false)

  // initial load
  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  // client keyword filter on top of server filter (status)
  const filtered = useMemo(() => {
    const byStatus =
      filter === 'in-progress'
        ? tasks.filter((t) => t.status === 'in-progress')
        : filter === 'done'
          ? tasks.filter((t) => t.status === 'done')
          : tasks
    const kw = keyword.trim()
    if (kw === '') return byStatus
    return byStatus.filter(
      (t) =>
        t.title.toLowerCase().includes(kw.toLowerCase()) ||
        t.description.toLowerCase().includes(kw.toLowerCase())
    )
  }, [tasks, filter, keyword])

  const selected = tasks.find((t) => t.id === selectedId) ?? null

  async function handleCreate(): Promise<void> {
    setCreating(true)
    const task = await createTask('新任务')
    if (task !== null) selectTask(task.id)
    setCreating(false)
  }

  function handleSelect(id: string): void {
    selectTask(id)
    // record last_opened_at on the selection event (NOT in a render effect,
    // to avoid a touch → reload → re-render loop). touchTask patches locally.
    void touchTask(id)
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Task list */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索任务…"
            className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="button"
            title="新建任务"
            onClick={() => void handleCreate()}
            disabled={creating}
            className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {error !== null && (
            <div className="mb-2 flex items-center gap-1.5 rounded-md bg-status-error/10 px-2 py-1.5 text-[11px] text-status-error">
              <AlertCircle size={12} /> {error}
            </div>
          )}
          {loading && tasks.length === 0 ? (
            <Hint text="加载中…" />
          ) : filtered.length === 0 ? (
            <Hint text={keyword !== '' ? '没有匹配的任务' : '该筛选下暂无任务'} />
          ) : (
            <div className="space-y-1">
              {filtered.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  active={task.id === selectedId}
                  onClick={() => handleSelect(task.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Task detail */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {selected === null ? (
          <div className="flex h-full items-center justify-center">
            <Hint text="选择左侧任务查看详情，或点右上角新建" />
          </div>
        ) : (
          <TaskDetail key={selected.id} task={selected} />
        )}
      </div>
    </div>
  )
}

function TaskRow({
  task,
  active,
  onClick
}: {
  task: Task
  active: boolean
  onClick: () => void
}): React.ReactElement {
  const meta = STATUS_META[task.status]
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left transition-colors',
        active ? 'bg-accent' : 'hover:bg-accent/50'
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {task.pinned && <Pin size={11} className="shrink-0 text-muted-foreground" />}
          <span className="truncate text-[13px] font-medium text-foreground">
            {task.title}
          </span>
        </span>
        {task.branch !== '' && (
          <span className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <GitBranch size={11} />
            <span className="truncate font-mono">{task.branch}</span>
          </span>
        )}
      </span>
      <span
        className={cn(
          'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
          meta.tone
        )}
      >
        {meta.label}
      </span>
    </button>
  )
}

function TaskDetail({ task }: { task: Task }): React.ReactElement {
  const projects = useDataStore((s) => s.projects)
  const updateTask = useDataStore((s) => s.updateTask)
  const setTaskPinned = useDataStore((s) => s.setTaskPinned)
  const setTaskProject = useDataStore((s) => s.setTaskProject)
  const deleteTask = useDataStore((s) => s.deleteTask)
  const selectTask = useNavStore((s) => s.selectTask)

  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Local editors stay in sync because the parent remounts this component via
  // key={task.id} when the selected task changes. No touch effect here — touch
  // is fired from the selection handler to avoid a reload loop.

  function commitTitle(): void {
    if (title.trim() !== '' && title !== task.title)
      void updateTask(task.id, { title: title.trim() })
  }
  function commitDescription(): void {
    if (description !== task.description) void updateTask(task.id, { description })
  }

  async function confirmTaskDeletion(): Promise<void> {
    if (!(await deleteTask(task.id))) return
    selectTask(null)
  }

  const meta = STATUS_META[task.status]

  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      <div className="flex items-center gap-2">
        <span className={cn('rounded px-2 py-0.5 text-[11px] font-medium', meta.tone)}>
          {meta.label}
        </span>
        <button
          type="button"
          onClick={() => void setTaskPinned(task.id, !task.pinned)}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          {task.pinned ? <PinOff size={12} /> : <Pin size={12} />}
          {task.pinned ? '取消置顶' : '置顶'}
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-status-error/10 hover:text-status-error"
        >
          <Trash2 size={12} />
          删除任务
        </button>
      </div>

      {confirmDelete && (
        <div
          role="alertdialog"
          aria-label="确认删除任务"
          className="mt-4 flex items-center gap-3 rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2.5 text-[12px]"
        >
          <span className="min-w-0 flex-1 text-foreground">
            删除任务会同时删除其工作会话，且无法撤销。
          </span>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="rounded px-2 py-1 text-muted-foreground hover:bg-accent"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void confirmTaskDeletion()}
            className="rounded bg-status-error px-2 py-1 text-white hover:opacity-90"
          >
            确认删除
          </button>
        </div>
      )}

      <input
        aria-label="任务标题"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="mt-3 w-full bg-transparent text-[20px] font-semibold leading-tight text-foreground focus:outline-none"
      />

      <div className="mt-6 grid grid-cols-2 gap-4 text-[13px]">
        <Field label="状态">
          <select
            aria-label="任务状态"
            value={task.status}
            onChange={(e) =>
              void updateTask(task.id, { status: e.target.value as TaskStatus })
            }
            className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="todo">待处理</option>
            <option value="in-progress">进行中</option>
            <option value="done">已完成</option>
          </select>
        </Field>
        <Field label="关联项目">
          <div className="flex items-center gap-2">
            <FolderGit2 size={14} className="shrink-0 text-muted-foreground" />
            <select
              aria-label="关联项目"
              value={task.projectId ?? ''}
              onChange={(e) =>
                void setTaskProject(
                  task.id,
                  e.target.value === '' ? null : e.target.value
                )
              }
              className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">未关联</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        </Field>
      </div>

      <section className="mt-8">
        <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
          描述
        </h2>
        <textarea
          aria-label="任务描述"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={commitDescription}
          rows={4}
          placeholder="补充任务描述…"
          className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </section>

      {task.status === 'done' && (
        <div className="mt-4 flex items-center gap-1.5 text-[12px] text-status-success">
          <Check size={13} /> 该任务已完成
        </div>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
          工作会话
        </h2>
        <SessionList taskId={task.id} />
      </section>
    </div>
  )
}

function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <div>
      <div className="mb-1.5 text-[11px] text-muted-foreground">{label}</div>
      {children}
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
