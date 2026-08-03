import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileDiff,
  MessageSquarePlus,
  Pencil,
  RefreshCw,
  Trash2,
  X
} from 'lucide-react'
import type { ReviewComment } from '@shared/domain'
import type { GitArea, GitChange, GitDiffLine, GitFileStatus } from '@shared/git'
import { useReviewStore } from '@/store/review'
import { cn } from '@/lib/utils'
import { SyntaxCode } from './CodeViewer'
import { FileTree, type FileTreeExpansionCommand } from './FileTree'
import { TreeExpansionControls } from './TreeExpansionControls'

export function ChangesPanel({ sessionId }: { sessionId: string }): React.ReactElement {
  const snapshot = useReviewStore((state) => state.snapshot)
  const selectedPath = useReviewStore((state) => state.selectedPath)
  const loading = useReviewStore((state) => state.loading)
  const error = useReviewStore((state) => state.error)
  const refresh = useReviewStore((state) => state.refreshChanges)
  const openDiff = useReviewStore((state) => state.openDiff)
  const [expansionCommand, setExpansionCommand] =
    useState<FileTreeExpansionCommand | null>(null)

  function setAllExpanded(expanded: boolean): void {
    setExpansionCommand((current) => ({ id: (current?.id ?? 0) + 1, expanded }))
  }

  useEffect(() => {
    void refresh(sessionId)
    const onFocus = (): void => void refresh(sessionId)
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh, sessionId])

  const changes = snapshot?.changes ?? []
  const staged = changes.filter((change) => change.stagedStatus !== null)
  const unstaged = changes.filter(
    (change) => change.worktreeStatus !== null && change.worktreeStatus !== 'untracked'
  )
  const untracked = changes.filter((change) => change.worktreeStatus === 'untracked')

  return (
    <div className="flex h-full min-h-0 bg-background">
      <section
        className="min-w-0 flex-1 overflow-y-auto bg-card/20"
        aria-label="Diff 评审区"
      >
        {selectedPath === null ? (
          <Empty
            text={
              snapshot !== null && snapshot.changes.length === 0
                ? '工作区干净，没有可评审的变更。'
                : '从右侧变更树选择文件进行评审。'
            }
            fill
          />
        ) : (
          <DiffView sessionId={sessionId} />
        )}
      </section>

      <aside
        className="flex w-[300px] shrink-0 flex-col border-l border-border bg-background"
        aria-label="变更文件导航"
      >
        <div className="shrink-0 border-b border-border p-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-[12px] font-medium text-foreground">
                {snapshot?.branch ?? (snapshot?.detached ? 'Detached HEAD' : '当前仓库')}
              </div>
              <div className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                {snapshot?.head?.slice(0, 10) ?? '尚无提交'}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <TreeExpansionControls
                onCollapse={() => setAllExpanded(false)}
                onExpand={() => setAllExpanded(true)}
              />
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
          </div>
          {error !== null && <ErrorMessage text={error} />}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          <div className="space-y-3">
            <ChangeGroup
              label="已暂存"
              tone="success"
              area="staged"
              changes={staged}
              expansionCommand={expansionCommand}
              onOpen={(path) => void openDiff(sessionId, path, 'staged')}
            />
            <ChangeGroup
              label="未暂存"
              tone="warning"
              area="worktree"
              changes={unstaged}
              expansionCommand={expansionCommand}
              onOpen={(path) => void openDiff(sessionId, path, 'worktree')}
            />
            <ChangeGroup
              label="未跟踪"
              tone="muted"
              area="worktree"
              changes={untracked}
              defaultCollapsed
              expansionCommand={expansionCommand}
              onOpen={(path) => void openDiff(sessionId, path, 'worktree')}
            />
          </div>
          {snapshot?.truncated === true && (
            <p className="mt-3 text-[10px] text-status-warning">
              文件过多，仅展示前 2000 项。
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}

function ChangeGroup({
  label,
  tone,
  area,
  changes,
  defaultCollapsed = false,
  expansionCommand,
  onOpen
}: {
  label: string
  tone: 'success' | 'warning' | 'muted'
  area: GitArea
  changes: GitChange[]
  defaultCollapsed?: boolean
  expansionCommand: FileTreeExpansionCommand | null
  onOpen: (path: string) => void
}): React.ReactElement | null {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  useEffect(() => {
    if (expansionCommand !== null) setCollapsed(!expansionCommand.expanded)
  }, [expansionCommand])
  if (changes.length === 0) return null
  return (
    <section>
      <button
        type="button"
        aria-label={`${label}，${changes.length} 个文件`}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((current) => !current)}
        className="mb-1 flex h-7 w-full items-center gap-2 rounded-md bg-muted/55 px-2 text-left text-[10px] font-medium tracking-[0.08em] text-foreground/80 hover:bg-muted"
      >
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            tone === 'success'
              ? 'bg-status-success'
              : tone === 'warning'
                ? 'bg-status-warning'
                : 'bg-muted-foreground/45'
          )}
        />
        <span className="min-w-0 flex-1">{label}</span>
        <span className="tabular-nums text-muted-foreground">{changes.length}</span>
        {collapsed ? (
          <ChevronRight size={11} className="text-muted-foreground" />
        ) : (
          <ChevronDown size={11} className="text-muted-foreground" />
        )}
      </button>
      {!collapsed && (
        <div className="ml-2 border-l border-border/70 pl-1.5">
          <FileTree
            ariaLabel={`${label}文件树`}
            expansionCommand={expansionCommand}
            entries={changes.map((change) => ({
              path: change.path,
              prefix: (
                <StatusBadge
                  status={area === 'staged' ? change.stagedStatus : change.worktreeStatus}
                />
              ),
              secondary:
                change.previousPath === null
                  ? undefined
                  : `原路径：${change.previousPath}`
            }))}
            onOpen={onOpen}
          />
        </div>
      )}
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
      <div className="sticky top-0 z-10 flex h-11 items-center gap-2 border-b border-border bg-background px-3">
        <FileDiff size={13} className="shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground">
          {diff?.path ?? '正在读取…'}
        </span>
        {diff !== null && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">
            {diff.area === 'staged' ? '暂存区' : '工作区'}
          </span>
        )}
        <button
          type="button"
          onClick={close}
          aria-label="关闭 Diff"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X size={13} />
        </button>
      </div>
      {error !== null && (
        <div className="px-3">
          <ErrorMessage text={error} />
        </div>
      )}
      {diff !== null && diff.kind !== 'text' && <Empty text={diffStateText(diff.kind)} />}
      {diff?.hunks.map((hunk) => (
        <div key={hunk.header} className="border-b border-border">
          <div className="diff-hunk-header px-3 py-1.5 font-mono text-[10px]">
            {hunk.header}
          </div>
          {hunk.lines.map((line, index) => {
            const key = `${line.oldLine ?? '-'}:${line.newLine ?? '-'}:${index}`
            const lineComments = commentsForLine(comments, line)
            return (
              <div key={key}>
                <div
                  className={cn(
                    'diff-line group flex min-w-max font-mono text-[11px] leading-5',
                    lineTone(line)
                  )}
                >
                  <span className="diff-line-number w-10 shrink-0 select-none border-r border-[var(--diff-gutter-border)] pr-2 text-right">
                    {line.oldLine ?? ''}
                  </span>
                  <span className="diff-line-number w-10 shrink-0 select-none border-r border-[var(--diff-gutter-border)] pr-2 text-right">
                    {line.newLine ?? ''}
                  </span>
                  <span className="diff-line-marker w-6 shrink-0 select-none text-center font-semibold">
                    {lineMarker(line)}
                  </span>
                  <code className="min-w-0 flex-1 whitespace-pre pr-4">
                    <SyntaxCode code={line.text || ' '} path={diff.path} />
                  </code>
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
    ? 'diff-line-addition'
    : line.kind === 'deletion'
      ? 'diff-line-deletion'
      : line.kind === 'meta'
        ? 'diff-line-meta'
        : 'diff-line-context'
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
function Empty({
  text,
  fill = false
}: {
  text: string
  fill?: boolean
}): React.ReactElement {
  return (
    <div
      className={cn(
        'flex min-h-48 flex-col items-center justify-center px-4 text-center text-[11px] text-muted-foreground',
        fill && 'h-full'
      )}
    >
      <FileDiff size={20} className="mb-2 opacity-50" />
      {text}
    </div>
  )
}
