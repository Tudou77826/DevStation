import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, FileCode2, RefreshCw, Search, X } from 'lucide-react'
import { useReviewStore } from '@/store/review'
import { cn } from '@/lib/utils'
import { CodeViewer, languageLabelForPath } from './CodeViewer'
import { FileTree, type FileTreeExpansionCommand } from './FileTree'
import { TreeExpansionControls } from './TreeExpansionControls'

export function FilesPanel({ sessionId }: { sessionId: string }): React.ReactElement {
  const files = useReviewStore((state) => state.files)
  const preview = useReviewStore((state) => state.preview)
  const truncated = useReviewStore((state) => state.filesTruncated)
  const loading = useReviewStore((state) => state.loading)
  const error = useReviewStore((state) => state.error)
  const refresh = useReviewStore((state) => state.refreshFiles)
  const openFile = useReviewStore((state) => state.openFile)
  const closeFile = useReviewStore((state) => state.closeFile)
  const [query, setQuery] = useState('')
  const [expansionCommand, setExpansionCommand] =
    useState<FileTreeExpansionCommand | null>(null)

  function setAllExpanded(expanded: boolean): void {
    setExpansionCommand((current) => ({ id: (current?.id ?? 0) + 1, expanded }))
  }

  useEffect(() => {
    void refresh(sessionId)
  }, [refresh, sessionId])

  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase()
    return keyword === ''
      ? files
      : files.filter((file) => file.path.toLocaleLowerCase().includes(keyword))
  }, [files, query])

  return (
    <div className="flex h-full min-h-0 bg-background">
      <section
        className="min-w-0 flex-1 overflow-y-auto bg-card/20"
        aria-label="文件预览"
      >
        {preview === null ? (
          <WorkspaceHint text="从右侧文件树选择文件进行预览。" />
        ) : (
          <>
            <div className="sticky top-0 z-10 flex h-11 items-center gap-2 border-b border-border bg-background px-3">
              <FileCode2 size={13} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                {preview.path}
              </span>
              <span className="text-[9px] text-muted-foreground">
                {formatSize(preview.size)}
              </span>
              <span className="rounded border border-border bg-muted/70 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                {languageLabelForPath(preview.path)}
              </span>
              <button
                type="button"
                onClick={closeFile}
                aria-label="关闭文件预览"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X size={13} />
              </button>
            </div>
            {preview.kind === 'text' ? (
              <div className="min-h-0 overflow-auto bg-[var(--code-surface)]">
                <CodeViewer code={preview.content || '（空文件）'} path={preview.path} />
              </div>
            ) : (
              <WorkspaceHint
                text={
                  preview.kind === 'binary'
                    ? '二进制文件不支持文本预览。'
                    : '文件超过 512 KB 预览上限。'
                }
              />
            )}
          </>
        )}
      </section>

      <aside
        className="flex w-[300px] shrink-0 flex-col border-l border-border bg-background"
        aria-label="项目文件导航"
      >
        <div className="shrink-0 border-b border-border p-2.5">
          <div className="flex gap-1.5">
            <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-card px-2">
              <Search size={12} className="text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="筛选文件"
                className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
              />
            </label>
            <TreeExpansionControls
              onCollapse={() => setAllExpanded(false)}
              onExpand={() => setAllExpanded(true)}
            />
            <button
              type="button"
              onClick={() => void refresh(sessionId)}
              aria-label="刷新文件"
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
            >
              <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
            </button>
          </div>
          {error !== null && (
            <div className="mt-2 flex gap-2 rounded-md bg-status-error/10 p-2 text-[10px] text-status-error">
              <AlertCircle size={12} className="shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          <FileTree
            entries={filtered.map((entry) => ({ path: entry.path }))}
            ariaLabel="项目文件"
            expansionCommand={expansionCommand}
            onOpen={(path) => void openFile(sessionId, path)}
          />
          {truncated && (
            <p className="mt-3 text-[10px] text-status-warning">
              文件过多，仅展示前 2000 项。
            </p>
          )}
          {filtered.length === 0 && (
            <div className="flex min-h-40 flex-col items-center justify-center text-[11px] text-muted-foreground">
              <FileCode2 size={20} className="mb-2 opacity-50" />
              没有匹配的文件。
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function WorkspaceHint({ text }: { text: string }): React.ReactElement {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center text-[11px] text-muted-foreground">
      <FileCode2 size={24} strokeWidth={1.4} className="mb-3 opacity-45" />
      {text}
    </div>
  )
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}
