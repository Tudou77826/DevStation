// Shared settings form primitives, modeled on Orca's SettingsFormControls.
// These compose the grammar of every settings row: a label + description on
// the left, a control on the right, all inside a section header + body card.

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// ── Section: a titled, banded block of settings ─────────────────────────────

export function SettingsSection({
  id,
  title,
  description,
  badge,
  children
}: {
  id?: string
  title: string
  description?: string
  badge?: string
  children: ReactNode
}): React.ReactElement {
  return (
    <section id={id} className="scroll-mt-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border/60 pb-5">
        <div className="min-w-0 space-y-2">
          <h2 className="flex flex-wrap items-center gap-2 text-[22px] font-semibold leading-tight text-foreground">
            {title}
            {badge !== undefined && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                {badge}
              </span>
            )}
          </h2>
          {description !== undefined && (
            <p className="max-w-3xl text-[13px] leading-6 text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      <div className="rounded-xl border border-border/50 bg-card/50 px-7 py-6 shadow-xs">
        <div className="space-y-1">{children}</div>
      </div>
    </section>
  )
}

// Sub-header inside a section body, to group related rows.
export function SettingsSubHeader({
  title,
  action
}: {
  title: string
  action?: ReactNode
}): React.ReactElement {
  return (
    <div className="flex items-center justify-between pt-4">
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      {action}
    </div>
  )
}

// ── SettingsRow: label + description | control ──────────────────────────────

export function SettingsRow({
  label,
  description,
  control,
  alignTop = false
}: {
  label: string
  description?: string
  control: ReactNode
  alignTop?: boolean
}): React.ReactElement {
  return (
    <div
      className={cn(
        'flex gap-4',
        description !== undefined ? 'py-3' : 'py-2',
        alignTop ? 'items-start' : 'items-center justify-between'
      )}
    >
      <div className="min-w-0 flex-1 space-y-1">
        <Label>{label}</Label>
        {description !== undefined && (
          <p className="text-[12px] leading-snug text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  )
}

function Label({ children }: { children: ReactNode }): React.ReactElement {
  return <span className="text-[13px] font-medium text-foreground">{children}</span>
}

// ── Switch ──────────────────────────────────────────────────────────────────

export function SettingsSwitch({
  checked,
  onChange,
  ariaLabel
}: {
  checked: boolean
  onChange: (next: boolean) => void
  ariaLabel?: string
}): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors',
        checked ? 'bg-foreground' : 'bg-muted-foreground/30'
      )}
    >
      <span
        className={cn(
          'absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-background transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5'
        )}
      />
    </button>
  )
}

// ── Segmented control: mutually exclusive options (theme, etc.) ─────────────

export interface SegmentedOption<T extends string> {
  value: T
  label: string
}

export function SettingsSegmentedControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel
}: {
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<SegmentedOption<T>>
  ariaLabel?: string
}): React.ReactElement {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex rounded-md border border-border bg-background/50 p-0.5"
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              'rounded-[5px] px-3 py-1 text-[12px] transition-colors',
              active
                ? 'bg-accent font-medium text-accent-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Badge pill ──────────────────────────────────────────────────────────────

export function SettingsBadge({
  children,
  tone = 'neutral'
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'muted'
}): React.ReactElement {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em]',
        tone === 'neutral' && 'bg-muted text-muted-foreground',
        tone === 'accent' && 'bg-primary/10 text-primary',
        tone === 'muted' && 'bg-muted/50 text-muted-foreground/70'
      )}
    >
      {children}
    </span>
  )
}
