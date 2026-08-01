import { useState } from 'react'
import { ArrowLeft, Check, FolderGit2, Pin, PinOff, Trash2 } from 'lucide-react'
import type { Task, TaskStatus } from '@shared/domain'
import { SessionList } from '@/components/ai-space/SessionList'
import { useDataStore } from '@/store/data'
import { cn } from '@/lib/utils'
import { STATUS_META } from './task-meta'

export function TaskDetailView({
  task,
  onBack
}: {
  task: Task
  onBack: () => void
}): React.ReactElement {
  const projects = useDataStore((state) => state.projects)
  const updateTask = useDataStore((state) => state.updateTask)
  const setTaskPinned = useDataStore((state) => state.setTaskPinned)
  const setTaskProject = useDataStore((state) => state.setTaskProject)
  const deleteTask = useDataStore((state) => state.deleteTask)

  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const meta = STATUS_META[task.status]

  function commitTitle(): void {
    const normalized = title.trim()
    if (normalized !== '' && normalized !== task.title) {
      void updateTask(task.id, { title: normalized })
    }
  }

  function commitDescription(): void {
    if (description !== task.description) void updateTask(task.id, { description })
  }

  async function confirmTaskDeletion(): Promise<void> {
    if (await deleteTask(task.id)) onBack()
  }

  return (
    <>
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft size={14} />
          返回任务列表
        </button>
        <div className="flex items-center gap-2">
          <span
            className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', meta.tone)}
          >
            {meta.label}
          </span>
          <button
            type="button"
            onClick={() => void setTaskPinned(task.id, !task.pinned)}
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {task.pinned ? <PinOff size={12} /> : <Pin size={12} />}
            {task.pinned ? '取消置顶' : '置顶'}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-8 py-8">
          <div className="border-b border-border pb-7">
            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              任务详情
            </p>
            <input
              aria-label="任务标题"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={commitTitle}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
              className="mt-2 w-full bg-transparent text-[26px] font-semibold leading-tight tracking-tight text-foreground focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-5 border-b border-border py-6">
            <Field label="状态">
              <select
                aria-label="任务状态"
                value={task.status}
                onChange={(event) =>
                  void updateTask(task.id, {
                    status: event.target.value as TaskStatus
                  })
                }
                className="h-9 w-full rounded-md border border-border bg-card px-2.5 text-[12px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="todo">待处理</option>
                <option value="in-progress">进行中</option>
                <option value="done">已完成</option>
              </select>
            </Field>
            <Field label="关联项目">
              <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-2.5">
                <FolderGit2 size={14} className="shrink-0 text-muted-foreground" />
                <select
                  aria-label="关联项目"
                  value={task.projectId ?? ''}
                  onChange={(event) =>
                    void setTaskProject(
                      task.id,
                      event.target.value === '' ? null : event.target.value
                    )
                  }
                  className="min-w-0 flex-1 bg-transparent text-[12px] text-foreground focus:outline-none"
                >
                  <option value="">未关联</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
          </div>

          <section className="border-b border-border py-6">
            <Field label="描述">
              <textarea
                aria-label="任务描述"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                onBlur={commitDescription}
                rows={6}
                placeholder="补充任务背景、目标和验收条件…"
                className="w-full resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </Field>
            {task.status === 'done' && (
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-status-success">
                <Check size={13} /> 该任务已完成
              </div>
            )}
          </section>

          <section className="py-6">
            <div className="mb-3">
              <h2 className="text-[14px] font-medium text-foreground">工作会话</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                从当前任务创建并继续 Agent 工作会话。
              </p>
            </div>
            <SessionList taskId={task.id} />
          </section>

          <section className="border-t border-border pt-6">
            {confirmDelete ? (
              <div
                role="alertdialog"
                aria-label="确认删除任务"
                className="flex items-center gap-3 rounded-lg border border-status-error/30 bg-status-error/10 px-3 py-2.5 text-[12px]"
              >
                <p className="min-w-0 flex-1 text-foreground">
                  删除任务会同时删除其工作会话，且无法撤销。
                </p>
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
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-status-error"
              >
                <Trash2 size={12} /> 删除任务
              </button>
            )}
          </section>
        </div>
      </div>
    </>
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
      <div className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  )
}
