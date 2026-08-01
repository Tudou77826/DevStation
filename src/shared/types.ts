// Cross-layer shared types. Imported by Main, Preload and Renderer.
// Keep this module free of any Node/Electron/DOM-only imports.

import type { RpcMethodName, RpcParams, RpcResponse, RpcResult } from './rpc'

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
  readonly terminal: {
    create: (request: TerminalCreateRequest) => Promise<TerminalSession>
    write: (sessionId: string, data: string) => Promise<void>
    resize: (sessionId: string, cols: number, rows: number) => Promise<void>
    close: (sessionId: string) => Promise<void>
    onData: (listener: (event: TerminalDataEvent) => void) => () => void
    onExit: (listener: (event: TerminalExitEvent) => void) => () => void
  }
  /**
   * Invoke a registered RPC method. The dispatcher validates params (Zod) and
   * the caller identity; returns a discriminated success/error envelope.
   */
  readonly rpc: {
    invoke: <M extends RpcMethodName>(
      method: M,
      params: RpcParams<M>
    ) => Promise<RpcResponse<RpcResult<M>>>
  }
}

export type TerminalLaunchKind = 'shell' | 'codex'

export interface TerminalCreateRequest {
  kind: TerminalLaunchKind
  cols: number
  rows: number
  cwd?: string
}

export interface TerminalSession {
  id: string
  pid: number
  kind: TerminalLaunchKind
  cwd: string
  shell: string
}

export interface TerminalDataEvent {
  sessionId: string
  data: string
}

export interface TerminalExitEvent {
  sessionId: string
  exitCode: number
  signal?: number
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
