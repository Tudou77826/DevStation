// Cross-layer shared types. Imported by Main, Preload and Renderer.
// Keep this module free of any Node/Electron/DOM-only imports.

/**
 * Whitelisted API exposed by the preload script to the sandboxed renderer.
 * Mirrors the object in src/preload/index.ts.
 *
 * `platform` is typed as a plain string (rather than NodeJS.Platform) so this
 * shared module stays DOM-safe: it is imported by the renderer tsconfig, which
 * does not include @types/node.
 */
export interface DevStationAPI {
  readonly version: string
  readonly platform: string
  /** capabilities exposed to the sandboxed renderer */
  readonly theme: {
    /** push the resolved theme so the native window chrome can follow it */
    update: (theme: 'dark' | 'light') => Promise<unknown>
  }
}

/** First-level navigation entries in the left sidebar. */
export type NavSection = 'tasks' | 'ai-space' | 'workflow'

/** Secondary navigation entry shown under the active first-level section. */
export interface NavSubItem {
  id: string
  label: string
  /** lucide icon name (resolved in renderer) */
  icon: string
}

/** The four work-area tabs for an AI Space session. */
export type WorkAreaTab = 'conversation' | 'changes' | 'terminal' | 'files'
