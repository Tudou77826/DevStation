export const TERMINAL_HOST_PROTOCOL_VERSION = 1

export interface HostCreateOrAttachRequest {
  sessionId: string
  cols: number
  rows: number
  cwd: string
  shell: { file: string; args: string[] }
  startupCommand?: string
}

export interface HostDiagnostics {
  protocolVersion: number
  processId: number
  startedAt: number
  sessions: Array<{
    id: string
    pid: number
    cwd: string
    createdAt: number
  }>
}

export type HostExitReason = 'exited' | 'stopped'

export interface HostSessionResult {
  id: string
  pid: number
  cwd: string
  shell: string
  createdAt: number
  isNew: boolean
  snapshot: string
}

export type HostRequest =
  | { method: 'diagnostics'; payload: Record<string, never> }
  | { method: 'createOrAttach'; payload: HostCreateOrAttachRequest }
  | { method: 'write'; payload: { sessionId: string; data: string } }
  | { method: 'resize'; payload: { sessionId: string; cols: number; rows: number } }
  | { method: 'close'; payload: { sessionId: string } }
  | { method: 'shutdown'; payload: Record<string, never> }

export interface HostRequestEnvelope {
  type: 'request'
  id: string
  token: string
  request: HostRequest
}

export type HostMessage =
  | { type: 'response'; id: string; ok: true; result: unknown }
  | { type: 'response'; id: string; ok: false; error: string }
  | { type: 'event'; event: 'data'; sessionId: string; data: string }
  | {
      type: 'event'
      event: 'exit'
      sessionId: string
      exitCode: number
      signal?: number
      reason: HostExitReason
    }

export function encodeHostMessage(message: HostRequestEnvelope | HostMessage): string {
  return `${JSON.stringify(message)}\n`
}
