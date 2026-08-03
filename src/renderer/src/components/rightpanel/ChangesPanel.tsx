import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowLeft,
  FileDiff,
  MessageSquarePlus,
  Pencil,
  RefreshCw,
  Trash2
} from 'lucide-react'
import type { ReviewComment } from '@shared/domain'
import type { GitArea, GitChange, GitDiffLine, GitFileStatus } from '@shared/git'
import { useReviewStore } from '@/store/review'
import { cn } from '@/lib/utils'

export function ChangesPanel({ sessionId }: { sessionId: string }): React.ReactElement {
  const snapshot = useReviewStore((state) => state.snapshot)
  const selectedPath = useReviewStore((state) => state.selectedPath)
  const loading = useReviewStore((state) => state.loading)
  const error = useReviewStore((state) => state.error)
  const refresh = useReviewStore((state) => state.refreshChanges)
  const openDiff = useReviewStore((state) => state.openDiff)

  useEffect(() => {
    void refresh(sessionId)
    const onFocus = (): void => void refresh(sessionId)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh, sessionId])

  if (selectedPath !== null) return <DiffView sessionId={sessionId} />

  return (
    <div className="min-h-full p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-medium text-foreground">
            {snapshot?.branch ?? (snapshot?.detached ? 'Detached HEAD' : '当前仓库')}
          </div>
          <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
            {snapshot?.head?.slice(0, 10) ?? '尚无提交'}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refresh(sessionId)}
          aria-label="刷新变更"
          title="刷新变更"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
        </button>
      </div>
      {error !== null && <ErrorMessage text={error} />}
      {snapshot !== null && snapshot.changes.length === 0 && (
        <Empty text="工作区干净，没有可评审的变更。" />
      )}
      <div className="mt-3 space-y-3">
        <ChangeGroup
          label="暂存区"
          area="staged"
          changes={
            snapshot?.changes.filter((change) => change.stagedStatus !== null) ?? []
          }
          onOpen={(path) => void openDiff(sessionId, path, 'staged')}
        />
        <ChangeGroup
          label="工作区"
          area="worktree"
          changes={
            snapshot?.changes.filter((change) => change.worktreeStatus !== null) ?? []
          }
          onOpen={(path) => void openDiff(sessionId, path, 'worktree')}
        />
      </div>
      {snapshot?.truncated === true && (
        <p className="mt-3 text-[10px] text-status-warning">
          文件过多，仅展示前 2000 项。
        </p>
      )}
    </div>
  )
}

function ChangeGroup({
  label,
  area,
  changes,
  onOpen
}: {
  label: string
  area: GitArea
  changes: GitChange[]
  onOpen: (path: string) => void
}): React.ReactElement | null {
  if (changes.length === 0) return null
  return (
    <section>
      <h3 className="mb-1 px-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {label} · {changes.length}
      </h3>
      <div className="space-y-0.5">
        {changes.map((change) => {
          const status = area === 'staged' ? change.stagedStatus : change.worktreeStatus
          return (
            <button
              key={`${area}:${change.path}`}
              type="button"
              onClick={() => onOpen(change.path)}
              className="group flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
            >
              <StatusBadge status={status} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[11px] text-foreground">
                  {change.path}
                </span>
                {change.previousPath !== null && (
                  <span className="block truncate text-[9px] text-muted-foreground">
                    原路径：{change.previousPath}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function DiffView({ sessionId }: { sessionId: string }): React.ReactElement {
  const diff = useReviewStore((state) => state.diff)
  const comments = useReviewStore((state) => state.comments)
  const error = useReviewStore((state) => state.error)
  const close = useReviewStore((state) => state.closeDiff)
  const [composeKey, setComposeKey] = useState<string | null>(null)

  const anchoredIds = useMemo(() => {
    const ids = new Set<string>()
    if (diff === null) return ids
    for (const hunk of diff.hunks) {
      for (const line of hunk.lines) {
        for (const comment of commentsForLine(comments, line)) ids.add(comment.id)
      }
    }
    return ids
  }, [comments, diff])
  const stale = comments.filter((comment) => !anchoredIds.has(comment.id))

  return (
    <div className="min-h-full">
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background px-3 py-2">
        <button
          type="button"
          onClick={close}
          aria-label="返回变更列表"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} />
        </button>
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground">
          {diff?.path ?? '正在读取…'}
        </span>
        {diff !== null && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
            {diff.area === 'staged' ? '暂存区' : '工作区'}
          </span>
        )}
      </div>
      {error !== null && (
        <div className="px-3">
          <ErrorMessage text={error} />
        </div>
      )}
      {diff !== null && diff.kind !== 'text' && <Empty text={diffStateText(diff.kind)} />}
      {diff?.hunks.map((hunk) => (
        <div key={hunk.header} className="border-b border-border">
          <div className="bg-blue-500/10 px-3 py-1.5 font-mono text-[9px] text-blue-500">
            {hunk.header}
          </div>
          {hunk.lines.map((line, index) => {
            const key = `${line.oldLine ?? '-'}:${line.newLine ?? '-'}:${index}`
            const lineComments = commentsForLine(comments, line)
            return (
              <div key={key}>
                <div
                  className={cn(
                    'group flex min-w-0 font-mono text-[10px] leading-5',
                    lineTone(line)
                  )}
                >
                  <span className="w-8 shrink-0 select-none text-right text-foreground/30">
                    {line.oldLine ?? ''}
                  </span>
                  <span className="w-8 shrink-0 select-none pr-1 text-right text-foreground/30">
                    {line.newLine ?? ''}
                  </span>
                  <span className="w-4 shrink-0 select-none text-center text-foreground/40">
                    {lineMarker(line)}
                  </span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-all pr-1">
                    {line.text || ' '}
                  </span>
                  {commentable(line) && (
                    <button
                      type="button"
                      title="添加行级意见"
                      aria-label="添加行级意见"
                      onClick={() => setComposeKey(composeKey === key ? null : key)}
                      className="mr-1 mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-30 hover:bg-background/50 group-hover:opacity-100"
                    >
                      <MessageSquarePlus size={10} />
                    </button>
                  )}
                </div>
                {composeKey === key && diff !== null && (
                  <CommentComposer
                    sessionId={sessionId}
                    path={diff.path}
                    area={diff.area}
                    line={line}
                    onDone={() => setComposeKey(null)}
                  />
                )}
                {lineComments.map((comment) => (
                  <CommentCard key={comment.id} sessionId={sessionId} comment={comment} />
                ))}
              </div>
            )
          })}
        </div>
      ))}
      {stale.length > 0 && (
        <section className="m-3 rounded-md border border-status-warning/30 bg-status-warning/5 p-2">
          <h3 className="text-[10px] font-medium text-status-warning">
            已失效意见 · {stale.length}
          </h3>
          <p className="mt-1 text-[9px] leading-relaxed text-muted-foreground">
            原代码行已变化，意见没有自动迁移。
          </p>
          {stale.map((comment) => (
            <CommentCard key={comment.id} sessionId={sessionId} comment={comment} stale />
          ))}
        </section>
      )}
    </div>
  )
}

function CommentComposer({
  sessionId,
  path,
  area,
  line,
  onDone
}: {
  sessionId: string
  path: string
  area: GitArea
  line: GitDiffLine
  onDone: () => void
}): React.ReactElement {
  const create = useReviewStore((state) => state.createComment)
  const [body, setBody] = useState('')
  const lineNumber = line.newLine ?? line.oldLine!
  const side = line.newLine !== null ? 'new' : 'old'
  async function save(): Promise<void> {
    if (body.trim() === '') return
    if (
      await create({
        sessionId,
        path,
        area,
        side,
        line: lineNumber,
        lineContent: line.text,
        body
      })
    )
      onDone()
  }
  return (
    <div className="border-y border-blue-500/20 bg-card p-2">
      <textarea
        autoFocus
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="记录评审意见…"
        className="min-h-16 w-full resize-y rounded-md border border-input bg-background p-2 text-[11px] outline-none focus:border-ring"
      />
      <div className="mt-1.5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="text-[10px] text-muted-foreground"
        >
          取消
        </button>
        <button
          type="button"
          onClick={() => void save()}
          className="rounded-md bg-primary px-2 py-1 text-[10px] text-primary-foreground"
        >
          保存
        </button>
      </div>
    </div>
  )
}

function CommentCard({
  sessionId,
  comment,
  stale = false
}: {
  sessionId: string
  comment: ReviewComment
  stale?: boolean
}): React.ReactElement {
  const update = useReviewStore((state) => state.updateComment)
  const remove = useReviewStore((state) => state.deleteComment)
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(comment.body)
  return (
    <div
      className={cn(
        'mx-2 my-1 rounded-md border bg-card p-2 text-[10px]',
        stale ? 'border-status-warning/25' : 'border-blue-500/20'
      )}
    >
      {editing ? (
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="min-h-14 w-full resize-y rounded border border-input bg-background p-1.5 text-[10px]"
        />
      ) : (
        <p className="whitespace-pre-wrap break-words leading-relaxed text-foreground">
          {comment.body}
        </p>
      )}
      <div className="mt-1 flex items-center justify-between text-[9px] text-muted-foreground">
        <span>
          {comment.side === 'new' ? '+' : '-'}
          {comment.line}
          {stale ? ' · 已失效' : ''}
        </span>
        <span className="flex gap-1">
          <button
            type="button"
            aria-label={editing ? '保存意见' : '编辑意见'}
            onClick={() => {
              if (editing) void update(sessionId, comment.id, body)
              setEditing(!editing)
            }}
            className="p-0.5 hover:text-foreground"
          >
            <Pencil size={10} />
          </button>
          <button
            type="button"
            aria-label="删除意见"
            onClick={() => void remove(sessionId, comment.id)}
            className="p-0.5 hover:text-status-error"
          >
            <Trash2 size={10} />
          </button>
        </span>
      </div>
    </div>
  )
}

function commentsForLine(comments: ReviewComment[], line: GitDiffLine): ReviewComment[] {
  return comments.filter((comment) =>
    comment.side === 'new'
      ? line.newLine === comment.line && line.text === comment.lineContent
      : line.oldLine === comment.line && line.text === comment.lineContent
  )
}

function StatusBadge({ status }: { status: GitFileStatus | null }): React.ReactElement {
  const labels: Record<GitFileStatus, string> = {
    added: 'A',
    modified: 'M',
    deleted: 'D',
    renamed: 'R',
    copied: 'C',
    unmerged: 'U',
    untracked: '?'
  }
  return (
    <span
      className={cn(
        'mt-0.5 w-4 shrink-0 text-center font-mono text-[10px]',
        status === 'deleted' || status === 'unmerged'
          ? 'text-status-error'
          : status === 'added' || status === 'untracked'
            ? 'text-status-success'
            : 'text-status-warning'
      )}
    >
      {status === null ? '·' : labels[status]}
    </span>
  )
}

function commentable(line: GitDiffLine): boolean {
  return line.kind === 'addition' || line.kind === 'deletion'
}
function lineMarker(line: GitDiffLine): string {
  return line.kind === 'addition'
    ? '+'
    : line.kind === 'deletion'
      ? '-'
      : line.kind === 'meta'
        ? '\\'
        : ' '
}
function lineTone(line: GitDiffLine): string {
  return line.kind === 'addition'
    ? 'bg-green-500/10 text-green-200'
    : line.kind === 'deletion'
      ? 'bg-red-500/10 text-red-200'
      : 'text-foreground/75'
}
function diffStateText(kind: 'binary' | 'too-large' | 'empty'): string {
  return kind === 'binary'
    ? '二进制文件不支持文本 Diff。'
    : kind === 'too-large'
      ? 'Diff 超过 2 MB 安全上限。'
      : '该区域没有可显示的文本变更。'
}
function ErrorMessage({ text }: { text: string }): React.ReactElement {
  return (
    <div className="mt-3 flex gap-2 rounded-md bg-status-error/10 p-2 text-[10px] text-status-error">
      <AlertCircle size={12} className="shrink-0" />
      {text}
    </div>
  )
}
function Empty({ text }: { text: string }): React.ReactElement {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center text-[11px] text-muted-foreground">
      <FileDiff size={20} className="mb-2 opacity-50" />
      {text}
    </div>
  )
}
