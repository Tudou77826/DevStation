import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CalendarClock,
  FolderGit2,
  Inbox,
  Pin,
  Plus,
  Search
} from 'lucide-react'
import { useNavStore } from '@/store/nav'
import { useDataStore } from '@/store/data'
import type { Task } from '@shared/domain'
import { cn } from '@/lib/utils'
import { TaskDetailView } from './TaskDetailView'
import { TaskCreateView } from './TaskCreateView'
import { STATUS_META } from './task-meta'

export function TaskPanel(): React.ReactElement {
  const filter = useNavStore((s) => s.activeSecondaryId.tasks)
  const selectedId = useNavStore((s) => s.selectedTaskId)
  const createOpen = useNavStore((s) => s.taskCreateOpen)
  const selectTask = useNavStore((s) => s.selectTask)
  const startTaskCreation = useNavStore((s) => s.startTaskCreation)
  const showTaskList = useNavStore((s) => s.showTaskList)

  const tasks = useDataStore((s) => s.tasks)
  const projects = useDataStore((s) => s.projects)
  const loadTasks = useDataStore((s) => s.loadTasks)
  const touchTask = useDataStore((s) => s.touchTask)
  const loading = useDataStore((s) => s.loading)
  const error = useDataStore((s) => s.error)

  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  const filtered = useMemo(() => {
    const byStatus =
      filter === 'in-progress'
        ? tasks.filter((task) => task.status === 'in-progress')
        : filter === 'done'
          ? tasks.filter((task) => task.status === 'done')
          : tasks
    const normalizedKeyword = keyword.trim().toLocaleLowerCase()
    if (normalizedKeyword === '') return byStatus
    return byStatus.filter(
      (task) =>
        task.title.toLocaleLowerCase().includes(normalizedKeyword) ||
        task.description.toLocaleLowerCase().includes(normalizedKeyword)
    )
  }, [tasks, filter, keyword])

  function handleSelect(id: string): void {
    selectTask(id)
    void touchTask(id)
  }

  const filterLabel =
    filter === 'in-progress' ? '进行中' : filter === 'done' ? '已完成' : '全部任务'
  const selected = tasks.find((task) => task.id === selectedId) ?? null

  if (createOpen) {
    return (
      <section
        className="flex min-h-0 flex-1 flex-col bg-background"
        aria-label="任务工作区"
      >
        <TaskCreateView onCancel={showTaskList} onCreated={selectTask} />
      </section>
    )
  }

  if (selected !== null) {
    return (
      <section
        className="flex min-h-0 flex-1 flex-col bg-background"
        aria-label="任务工作区"
      >
        <TaskDetailView key={selected.id} task={selected} onBack={showTaskList} />
      </section>
    )
  }

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-background"
      aria-label="任务工作区"
    >
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-6 py-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            任务
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <h1 className="text-[20px] font-semibold tracking-tight text-foreground">
              {filterLabel}
            </h1>
            <span className="text-[12px] tabular-nums text-muted-foreground">
              {filtered.length}
            </span>
          </div>
        </div>
        <button
          type="button"
          title="新建任务"
          onClick={startTaskCreation}
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Plus size={14} />
          新建任务
        </button>
      </header>

      <div className="shrink-0 border-b border-border px-6 py-3">
        <label className="flex h-8 max-w-sm items-center gap-2 rounded-md border border-border bg-card px-2.5 focus-within:ring-1 focus-within:ring-ring">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索任务…"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {error !== null && (
          <div className="mb-3 flex items-center gap-1.5 rounded-md bg-status-error/10 px-3 py-2 text-[12px] text-status-error">
            <AlertCircle size={13} /> {error}
          </div>
        )}
        {loading && tasks.length === 0 ? (
          <Hint text="加载中…" />
        ) : filtered.length === 0 ? (
          <Hint text={keyword !== '' ? '没有匹配的任务' : '该筛选下暂无任务'} />
        ) : (
          <div className="w-full overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="grid grid-cols-[minmax(240px,1fr)_160px_110px_120px] gap-4 border-b border-border bg-muted/35 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <span>任务</span>
              <span>项目</span>
              <span>状态</span>
              <span className="text-right">更新</span>
            </div>
            <div className="divide-y divide-border">
              {filtered.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  projectName={
                    projects.find((project) => project.id === task.projectId)?.name ??
                    null
                  }
                  active={task.id === selectedId}
                  onClick={() => handleSelect(task.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function TaskRow({
  task,
  projectName,
  active,
  onClick
}: {
  task: Task
  projectName: string | null
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
        'grid w-full grid-cols-[minmax(240px,1fr)_160px_110px_120px] items-center gap-4 px-4 py-3 text-left transition-colors',
        active ? 'bg-accent' : 'hover:bg-accent/45'
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            task.status === 'done'
              ? 'bg-status-success'
              : task.status === 'in-progress'
                ? 'bg-status-warning'
                : 'bg-muted-foreground/45'
          )}
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            {task.pinned && <Pin size={11} className="shrink-0 text-muted-foreground" />}
            <span className="truncate text-[13px] font-medium text-foreground">
              {task.title}
            </span>
          </span>
          {task.description !== '' && (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
              {task.description}
            </span>
          )}
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <FolderGit2 size={12} className="shrink-0" />
        <span className="truncate">{projectName ?? '未关联'}</span>
      </span>
      <span>
        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', meta.tone)}>
          {meta.label}
        </span>
      </span>
      <span className="flex items-center justify-end gap-1.5 text-[11px] tabular-nums text-muted-foreground">
        <CalendarClock size={12} />
        {relativeTime(task.updatedAt)}
      </span>
    </button>
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

function Hint({ text }: { text: string }): React.ReactElement {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
      <Inbox size={24} strokeWidth={1.4} />
      <span className="text-[12px]">{text}</span>
    </div>
  )
}
