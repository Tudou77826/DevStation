import { useEffect, useState } from 'react'
import {
  Plus,
  MessageSquare,
  Clock,
  Loader2,
  AlertCircle,
  ArrowUpRight
} from 'lucide-react'
import { useDataStore } from '@/store/data'
import { useNavStore } from '@/store/nav'
import { cn } from '@/lib/utils'
import type { Session } from '@shared/domain'

const EMPTY_SESSIONS: Session[] = []

// Session list, usable in two scopes: by-project or by-task. A session is a
// direct entry into its Agent workspace, not a passive history row.
export function SessionList({
  projectId,
  taskId
}: {
  projectId?: string
  taskId?: string
}): React.ReactElement {
  // selector returns undefined until the async load lands → coerce to [] so
  // sessions.length / sessions.map never crash on first paint.
  const sessions = useDataStore((s) => {
    if (projectId !== undefined) return s.sessionsByProject[projectId] ?? EMPTY_SESSIONS
    if (taskId !== undefined) return s.sessionsByTask[taskId] ?? EMPTY_SESSIONS
    return EMPTY_SESSIONS
  })
  const loadByProject = useDataStore((s) => s.loadSessionsByProject)
  const loadByTask = useDataStore((s) => s.loadSessionsByTask)
  const createFromTask = useDataStore((s) => s.createSessionFromTask)
  const touchSession = useDataStore((s) => s.touchSession)
  const setSection = useNavStore((s) => s.setSection)
  const selectSession = useNavStore((s) => s.selectSession)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const promise =
      projectId !== undefined
        ? loadByProject(projectId)
        : taskId !== undefined
          ? loadByTask(taskId)
          : Promise.resolve([])
    promise
      .catch((e: unknown) => {
        if (!cancelled) setError(useDataStore.getState().errorMessage(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, taskId, loadByProject, loadByTask])

  async function handleCreate(): Promise<void> {
    if (taskId === undefined) return
    await createFromTask(taskId)
  }

  function handleOpen(session: Session): void {
    if (session.projectId === null) {
      setError('该会话未关联项目，请先为任务关联本地项目')
      return
    }
    selectSession(session.id, session.projectId)
    setSection('ai-space')
    void touchSession(session.id)
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-[12px] font-medium text-muted-foreground">
          {loading ? '加载中…' : `${sessions.length} 个会话`}
        </span>
        {taskId !== undefined && (
          <button
            type="button"
            onClick={() => void handleCreate()}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Plus size={13} />
            新建工作会话
          </button>
        )}
      </div>
      {error !== null ? (
        <div className="flex items-center gap-1.5 px-3 py-4 text-[12px] text-status-error">
          <AlertCircle size={13} /> {error}
        </div>
      ) : loading && sessions.length === 0 ? (
        <div className="flex items-center justify-center gap-2 px-3 py-6 text-[12px] text-muted-foreground">
          <Loader2 size={13} className="animate-spin" /> 加载中…
        </div>
      ) : sessions.length === 0 ? (
        <div className="px-3 py-6 text-center text-[12px] text-muted-foreground">
          暂无会话{taskId !== undefined && '，点击右上方新建'}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleOpen(s)}
              className={cn(
                'group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                'hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none'
              )}
              title={s.projectId === null ? '请先为任务关联本地项目' : '在 AI 空间中打开'}
            >
              <MessageSquare size={15} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-foreground">
                  {s.title}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock size={11} />
                  {s.lastOpenedAt !== null
                    ? relTime(s.lastOpenedAt)
                    : relTime(s.createdAt)}
                </span>
              </span>
              <StatusBadge status={s.status} />
              <ArrowUpRight
                size={13}
                className="shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground group-focus-visible:text-foreground"
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }): React.ReactElement {
  const map: Record<string, { label: string; cls: string }> = {
    unknown: { label: '状态未知', cls: 'bg-muted-foreground/20 text-muted-foreground' },
    starting: { label: '启动中', cls: 'bg-status-success/15 text-status-success' },
    working: { label: '工作中', cls: 'bg-status-success/15 text-status-success' },
    waiting: { label: '等待', cls: 'bg-status-warning/15 text-status-warning' },
    done: { label: '已完成', cls: 'bg-muted-foreground/20 text-muted-foreground' },
    failed: { label: '失败', cls: 'bg-status-error/15 text-status-error' }
  }
  const m = map[status] ?? map.unknown
  return (
    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', m.cls)}>
      {m.label}
    </span>
  )
}

function relTime(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} 天前`
  return new Date(ts).toLocaleDateString()
}
