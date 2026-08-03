import { FoldVertical, UnfoldVertical } from 'lucide-react'

export function TreeExpansionControls({
  onCollapse,
  onExpand
}: {
  onCollapse: () => void
  onExpand: () => void
}): React.ReactElement {
  return (
    <div className="flex items-center rounded-md border border-border bg-card p-0.5">
      <button
        type="button"
        aria-label="全部收起文件夹"
        title="全部收起"
        onClick={onCollapse}
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <FoldVertical size={12} />
      </button>
      <button
        type="button"
        aria-label="全部展开文件夹"
        title="全部展开"
        onClick={onExpand}
        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <UnfoldVertical size={12} />
      </button>
    </div>
  )
}
