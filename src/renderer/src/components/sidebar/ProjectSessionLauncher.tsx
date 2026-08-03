import { useEffect, useState } from 'react'
import { MessageSquarePlus, X } from 'lucide-react'
import type { Project } from '@shared/domain'
import { useDataStore } from '@/store/data'
import { useNavStore } from '@/store/nav'

export function ProjectContextMenu({
  x,
  y,
  onClose,
  onCreateSession
}: {
  x: number
  y: number
  onClose: () => void
  onCreateSession: () => void
}): React.ReactElement {
  useEffect(() => {
    const close = (): void => onClose()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return (
    <div
      role="menu"
      aria-label="项目操作"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
      className="fixed z-50 min-w-48 rounded-lg border border-border bg-popover p-1 shadow-xl"
    >
      <button
        type="button"
        role="menuitem"
        onClick={onCreateSession}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] text-popover-foreground hover:bg-accent"
      >
        <MessageSquarePlus size={14} />
        在此项目中新建会话
      </button>
    </div>
  )
}

export function ProjectSessionDialog({
  project,
  onClose
}: {
  project: Project
  onClose: () => void
}): React.ReactElement {
  const tasks = useDataStore((state) => state.tasks)
  const agents = useDataStore((state) => state.agents)
  const loadAgents = useDataStore((state) => state.loadAgents)
  const createTask = useDataStore((state) => state.createTask)
  const setTaskProject = useDataStore((state) => state.setTaskProject)
  const deleteTask = useDataStore((state) => state.deleteTask)
  const createSession = useDataStore((state) => state.createSessionFromTask)
  const loadSessions = useDataStore((state) => state.loadSessionsByProject)
  const selectSession = useNavStore((state) => state.selectSession)
  const touchSession = useDataStore((state) => state.touchSession)
  const projectTasks = tasks.filter((task) => task.projectId === project.id)
  const [taskChoice, setTaskChoice] = useState(projectTasks[0]?.id ?? '__new__')
  const [title, setTitle] = useState('')
  const [agentId, setAgentId] = useState(agents[0]?.descriptor.id ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (agents.length === 0) void loadAgents()
  }, [agents.length, loadAgents])

  useEffect(() => {
    if (agents.some((agent) => agent.descriptor.id === agentId)) return
    if (agents[0] !== undefined) setAgentId(agents[0].descriptor.id)
  }, [agentId, agents])

  const valid =
    agentId !== '' && (taskChoice !== '__new__' || title.trim() !== '') && !busy

  async function confirm(): Promise<void> {
    if (!valid) return
    setBusy(true)
    setError(null)
    let createdTaskId: string | null = null
    try {
      let taskId = taskChoice
      if (taskChoice === '__new__') {
        const task = await createTask(title.trim())
        if (task === null) throw new Error('任务创建失败')
        createdTaskId = task.id
        const associated = await setTaskProject(task.id, project.id)
        if (associated === null) {
          await deleteTask(task.id)
          createdTaskId = null
          throw new Error('任务关联项目失败')
        }
        taskId = task.id
      }
      const session = await createSession(taskId, agentId)
      if (session === null) {
        if (createdTaskId !== null) await deleteTask(createdTaskId)
        throw new Error('会话创建失败')
      }
      await loadSessions(project.id)
      selectSession(session.id, project.id)
      void touchSession(session.id)
      onClose()
    } catch (caught) {
      setError(useDataStore.getState().errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`在 ${project.name} 中启动会话`}
        className="w-full max-w-md rounded-xl border border-border bg-popover shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[14px] font-medium text-foreground">启动工作会话</h2>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              {project.name} · {project.path}
            </p>
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X size={14} />
          </button>
        </header>
        <div className="space-y-4 px-5 py-5">
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              任务
            </span>
            <select
              aria-label="会话关联任务"
              value={taskChoice}
              onChange={(event) => setTaskChoice(event.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring"
            >
              {projectTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
              <option value="__new__">新建任务…</option>
            </select>
          </label>
          {taskChoice === '__new__' && (
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                新任务标题
              </span>
              <input
                autoFocus
                aria-label="新任务标题"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="输入任务标题（必填）"
                className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/55 focus:ring-1 focus:ring-ring"
              />
            </label>
          )}
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Coding Agent
            </span>
            <select
              aria-label="Coding Agent"
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-ring"
            >
              {agents.map((agent) => (
                <option key={agent.descriptor.id} value={agent.descriptor.id}>
                  {agent.descriptor.label}
                </option>
              ))}
            </select>
          </label>
          {error !== null && (
            <p className="rounded-md bg-status-error/10 px-3 py-2 text-[11px] text-status-error">
              {error}
            </p>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-md px-3 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={!valid}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-[12px] font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <MessageSquarePlus size={14} />
            {busy ? '正在创建…' : '创建并打开'}
          </button>
        </footer>
      </section>
    </div>
  )
}
