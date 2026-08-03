import { useState } from 'react'
import { ArrowLeft, Check, FolderGit2, ListTodo, Pin, PinOff, Trash2 } from 'lucide-react'
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
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-5">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft size={14} />
            返回任务列表
          </button>
          <span className="h-4 w-px bg-border" />
          <ListTodo size={14} className="text-muted-foreground" />
          <span className="min-w-0 truncate text-[12px] font-medium text-foreground">
            任务详情
          </span>
        </div>
        <span className={cn('rounded px-2 py-1 text-[10px] font-medium', meta.tone)}>
          {meta.label}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-5">
        <div className="grid min-h-full gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <main className="min-w-0 rounded-xl border border-border bg-card/70 shadow-sm">
            <section className="border-b border-border p-6">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                任务内容
              </p>
              <input
                aria-label="任务标题"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onBlur={commitTitle}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                }}
                className="mt-3 w-full border-b border-transparent bg-transparent pb-2 text-[26px] font-semibold leading-tight tracking-tight text-foreground outline-none hover:border-border focus:border-ring"
              />
              <label className="mt-7 block">
                <span className="mb-2 block text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  描述
                </span>
                <textarea
                  aria-label="任务描述"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  onBlur={commitDescription}
                  rows={7}
                  placeholder="补充任务背景、目标和验收条件…"
                  className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-[13px] leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring"
                />
              </label>
            </section>

            <section className="p-6">
              <div className="mb-4">
                <h2 className="text-[14px] font-medium text-foreground">工作会话</h2>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  从当前任务创建并继续 Agent 工作会话。
                </p>
              </div>
              <SessionList taskId={task.id} />
            </section>
          </main>

          <aside className="min-w-0 rounded-xl border border-border bg-card/70 p-5 shadow-sm">
            <h2 className="text-[12px] font-medium text-foreground">任务属性</h2>
            <div className="mt-5 space-y-5">
              <Field label="状态">
                <select
                  aria-label="任务状态"
                  value={task.status}
                  onChange={(event) =>
                    void updateTask(task.id, {
                      status: event.target.value as TaskStatus
                    })
                  }
                  className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="todo">待处理</option>
                  <option value="in-progress">进行中</option>
                  <option value="done">已完成</option>
                </select>
              </Field>
              <Field label="关联项目">
                <div className="flex h-9 items-center gap-2 rounded-md border border-border bg-background px-2.5">
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
                    className="min-w-0 flex-1 bg-transparent text-[12px] text-foreground outline-none"
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

            {task.status === 'done' && (
              <div className="mt-5 flex items-center gap-1.5 rounded-md bg-status-success/10 px-3 py-2 text-[11px] text-status-success">
                <Check size={13} /> 该任务已完成
              </div>
            )}

            <div className="mt-7 border-t border-border pt-5">
              <button
                type="button"
                onClick={() => void setTaskPinned(task.id, !task.pinned)}
                className="inline-flex h-8 w-full items-center gap-2 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {task.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                {task.pinned ? '取消置顶' : '置顶任务'}
              </button>
            </div>

            <div className="mt-2">
              {confirmDelete ? (
                <div
                  role="alertdialog"
                  aria-label="确认删除任务"
                  className="rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-[11px]"
                >
                  <p className="leading-relaxed text-foreground">
                    删除任务会同时删除其工作会话，且无法撤销。
                  </p>
                  <div className="mt-3 flex justify-end gap-2">
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
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex h-8 w-full items-center gap-2 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-status-error/10 hover:text-status-error"
                >
                  <Trash2 size={13} /> 删除任务
                </button>
              )}
            </div>
          </aside>
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
