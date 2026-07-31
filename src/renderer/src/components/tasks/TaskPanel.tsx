import { useMemo } from 'react'
import { Plus, GitBranch, Inbox, Search } from 'lucide-react'
import {
  MOCK_TASKS,
  useNavStore,
  type Task,
  type TaskStatus
} from '@/store/nav'
import { cn } from '@/lib/utils'

const STATUS_META: Record<TaskStatus, { label: string; tone: string }> = {
  todo: { label: '待处理', tone: 'bg-muted-foreground/30 text-muted-foreground' },
  'in-progress': { label: '进行中', tone: 'bg-status-warning/15 text-status-warning' },
  done: { label: '已完成', tone: 'bg-status-success/15 text-status-success' }
}

/**
 * 任务面板 center view: a task list on the left + a detail pane on the right.
 * The list filters by the active secondary nav id (全部 / 进行中 / 已完成).
 */
export function TaskPanel(): React.ReactElement {
  const filter = useNavStore((s) => s.activeSecondaryId.tasks)
  const selectedId = useNavStore((s) => s.selectedTaskId)
  const selectTask = useNavStore((s) => s.selectTask)

  const tasks = useMemo(() => {
    if (filter === 'in-progress') return MOCK_TASKS.filter((t) => t.status === 'in-progress')
    if (filter === 'done') return MOCK_TASKS.filter((t) => t.status === 'done')
    return MOCK_TASKS
  }, [filter])

  const selected = MOCK_TASKS.find((t) => t.id === selectedId) ?? null

  return (
    <div className="flex min-h-0 flex-1">
      {/* Task list */}
      <div className="flex w-72 shrink-0 flex-col border-r border-border">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
          <Search size={14} className="text-muted-foreground" />
          <input
            placeholder="搜索任务…"
            className="flex-1 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <button
            type="button"
            title="新建任务"
            className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground hover:opacity-90"
          >
            <Plus size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {tasks.length === 0 ? (
            <EmptyHint text="该筛选下暂无任务" />
          ) : (
            <div className="space-y-1">
              {tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  active={task.id === selectedId}
                  onClick={() => selectTask(task.id)}
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
            <EmptyHint text="选择左侧任务查看详情" />
          </div>
        ) : (
          <TaskDetail task={selected} />
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
        'w-full rounded-lg px-3 py-2.5 text-left transition-colors',
        active ? 'bg-accent' : 'hover:bg-accent/50'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium leading-snug text-foreground">
          {task.title}
        </span>
        <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', meta.tone)}>
          {meta.label}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground">
        <GitBranch size={11} />
        <span className="truncate font-mono">{task.branch}</span>
        <span className="text-muted-foreground/40">·</span>
        <span className="truncate">{task.project}</span>
      </div>
    </button>
  )
}

function TaskDetail({ task }: { task: Task }): React.ReactElement {
  const meta = STATUS_META[task.status]
  return (
    <div className="mx-auto max-w-3xl px-8 py-6">
      <span className={cn('inline-block rounded px-2 py-0.5 text-[11px] font-medium', meta.tone)}>
        {meta.label}
      </span>
      <h1 className="mt-3 text-[20px] font-semibold leading-tight text-foreground">
        {task.title}
      </h1>

      <dl className="mt-6 grid grid-cols-2 gap-4 text-[13px]">
        <Field label="关联项目" value={task.project} />
        <Field label="分支" value={task.branch} mono />
        <Field label="最后更新" value={task.updatedAt} />
        <Field label="任务 ID" value={task.id} mono />
      </dl>

      <section className="mt-8">
        <h2 className="mb-2 text-[12px] font-medium uppercase tracking-wider text-muted-foreground">
          描述
        </h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          阶段 1 占位内容。阶段 2 将从 SQLite 读取任务描述、验收标准与关联的工作会话。
        </p>
      </section>
    </div>
  )
}

function Field({
  label,
  value,
  mono
}: {
  label: string
  value: string
  mono?: boolean
}): React.ReactElement {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={cn('mt-1 truncate text-foreground', mono && 'font-mono text-[12px]')}>
        {value}
      </dd>
    </div>
  )
}

function EmptyHint({ text }: { text: string }): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center text-muted-foreground">
      <Inbox size={22} strokeWidth={1.5} />
      <span className="text-[12px]">{text}</span>
    </div>
  )
}
