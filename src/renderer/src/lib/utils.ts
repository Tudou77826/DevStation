// Lightweight class-name combiner. It concatenates truthy values; callers are
// responsible for avoiding conflicting utility classes.
export function cn(...parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
