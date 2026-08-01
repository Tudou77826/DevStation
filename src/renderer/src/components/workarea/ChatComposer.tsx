import { useState } from 'react'
import { ArrowUp, Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'

// Fixed at the bottom of the center work area.
// Stage 1: visual only; submission just clears the input.
export function ChatComposer(): React.ReactElement {
  const [value, setValue] = useState('')
  const canSubmit = value.trim().length > 0

  function handleSubmit(): void {
    if (!canSubmit) return
    setValue('')
  }

  return (
    <div className="shrink-0 px-3 pb-3">
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-card px-3 py-2 focus-within:ring-2 focus-within:ring-ring/40">
        <button
          type="button"
          title="附件"
          aria-label="附件"
          className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Paperclip size={16} strokeWidth={1.75} />
        </button>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit()
            }
          }}
          rows={1}
          placeholder="向 Agent 发送指令（Enter 发送 / Shift+Enter 换行）"
          className="max-h-32 min-h-[24px] flex-1 resize-none bg-transparent py-1 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          aria-label="发送"
          className={cn(
            'mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
            canSubmit
              ? 'bg-primary text-primary-foreground hover:opacity-90'
              : 'cursor-not-allowed bg-secondary text-muted-foreground'
          )}
        >
          <ArrowUp size={15} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  )
}
