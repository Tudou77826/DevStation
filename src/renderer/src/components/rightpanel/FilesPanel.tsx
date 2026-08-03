import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowLeft, File, FileCode2, RefreshCw, Search } from 'lucide-react'
import { useReviewStore } from '@/store/review'
import { cn } from '@/lib/utils'

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

  useEffect(() => {
    void refresh(sessionId)
  }, [refresh, sessionId])
  const filtered = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase()
    return keyword === ''
      ? files
      : files.filter((file) => file.path.toLocaleLowerCase().includes(keyword))
  }, [files, query])

  if (preview !== null) {
    return (
      <div className="min-h-full">
        <div className="sticky top-0 flex items-center gap-2 border-b border-border bg-background px-3 py-2">
          <button
            type="button"
            onClick={closeFile}
            aria-label="返回文件列表"
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} />
          </button>
          <span className="min-w-0 flex-1 truncate font-mono text-[10px]">
            {preview.path}
          </span>
          <span className="text-[9px] text-muted-foreground">
            {formatSize(preview.size)}
          </span>
        </div>
        {preview.kind === 'text' ? (
          <pre className="overflow-x-auto whitespace-pre p-3 font-mono text-[10px] leading-5 text-foreground/80">
            {preview.content || '（空文件）'}
          </pre>
        ) : (
          <div className="flex min-h-48 items-center justify-center px-5 text-center text-[11px] text-muted-foreground">
            {preview.kind === 'binary'
              ? '二进制文件不支持文本预览。'
              : '文件超过 512 KB 预览上限。'}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-3">
      <div className="flex gap-2">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-input bg-card px-2">
          <Search size={12} className="text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="筛选文件"
            className="min-w-0 flex-1 bg-transparent text-[11px] outline-none"
          />
        </label>
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
        <div className="mt-3 flex gap-2 rounded-md bg-status-error/10 p-2 text-[10px] text-status-error">
          <AlertCircle size={12} />
          {error}
        </div>
      )}
      <div className="mt-3 space-y-0.5" role="tree" aria-label="项目文件">
        {filtered.map((entry) => {
          const segments = entry.path.split('/')
          return (
            <button
              key={entry.path}
              type="button"
              role="treeitem"
              onClick={() => void openFile(sessionId, entry.path)}
              className="flex w-full items-center gap-2 rounded-md py-1.5 pr-2 text-left text-[11px] hover:bg-accent"
              style={{ paddingLeft: Math.min(segments.length - 1, 5) * 10 + 8 }}
              title={entry.path}
            >
              <File size={12} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{segments.at(-1)}</span>
              {segments.length > 1 && (
                <span className="max-w-24 truncate text-[9px] text-muted-foreground">
                  {segments.slice(0, -1).join('/')}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {truncated && (
        <p className="mt-3 text-[10px] text-status-warning">
          文件过多，仅展示前 2000 项。
        </p>
      )}
      {filtered.length === 0 && (
        <div className="flex min-h-48 flex-col items-center justify-center text-[11px] text-muted-foreground">
          <FileCode2 size={20} className="mb-2 opacity-50" />
          没有匹配的文件。
        </div>
      )}
    </div>
  )
}

function formatSize(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`
}
