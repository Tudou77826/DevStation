// Lightweight class-name combiner (replaces clsx + tailwind-merge for the MVP).
// Concatenates truthy values; later conflict resolution is not needed yet
// because Stage 1 styling is static per component.
export function cn(...parts: ReadonlyArray<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
