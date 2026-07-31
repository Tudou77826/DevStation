import { useCallback, useEffect, useRef, useState } from 'react'

// A vertical drag handle that resizes the panel to its left.
// `onDelta` receives the px movement since drag start; the owning component
// maps that onto its own clamped width state.
export function ResizeHandle({
  onDelta,
  side = 'right',
  title = '拖拽调整宽度'
}: {
  onDelta: (deltaPx: number) => void
  /** which edge the handle sits on; flips the cursor hint only */
  side?: 'left' | 'right'
  title?: string
}): React.ReactElement {
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)

  const onMove = useCallback(
    (e: MouseEvent) => {
      onDelta(e.clientX - startX.current)
    },
    [onDelta]
  )

  const onUp = useCallback(() => {
    setDragging(false)
  }, [])

  useEffect(() => {
    if (!dragging) return
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [dragging, onMove, onUp])

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault()
        startX.current = e.clientX
        setDragging(true)
      }}
      className={
        'group relative w-px shrink-0 cursor-col-resize bg-border transition-colors hover:bg-muted-foreground/50 ' +
        (dragging ? 'bg-muted-foreground/60 ' : '') +
        (side === 'left' ? ' -ml-1' : ' -mr-1')
      }
    >
      {/* Widen the hit area without changing the visible 1px line. */}
      <div className="absolute inset-y-0 -inset-x-1.5" />
    </div>
  )
}
