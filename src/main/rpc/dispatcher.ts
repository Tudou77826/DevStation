// RPC dispatcher. Mounted on a single ipcMain.handle('rpc', ...) channel.
//
// Flow: validate method is whitelisted → validate params with Zod → run handler
// with a per-call context (sender bound). RpcError forwards its code; any other
// throw becomes INTERNAL and the full detail is logged main-side only.
import { z } from 'zod'
import type { WebContents } from 'electron'
import type { RpcContext, RpcRegistry } from './core'
import { RpcError } from './errors'
import type { RpcResponse } from '@shared/rpc'

export interface RpcRequest {
  method: string
  params: unknown
}

/**
 * Create the ipcMain.handle callback for the 'rpc' channel.
 * `contextFactory` receives the requesting WebContents (the dispatcher resolves
 * it to a BrowserWindow for methods that need a parent for dialogs).
 */
export function createDispatcher(
  registry: RpcRegistry,
  contextFactory: (sender: WebContents) => RpcContext,
  isTrustedSender: (sender: WebContents) => boolean
) {
  return async (
    event: { sender: WebContents },
    request: RpcRequest
  ): Promise<RpcResponse<unknown>> => {
    const { method, params } = request ?? {}

    // 1. caller identity. A BrowserWindow instance alone is not a trust check:
    // only the currently registered application renderer may invoke RPC.
    if (!isTrustedSender(event.sender)) {
      return {
        ok: false,
        error: { code: 'FORBIDDEN', message: '无权调用该方法' }
      }
    }

    // 2. whitelist
    const def = registry.get(method)
    if (def === undefined) {
      return { ok: false, error: { code: 'VALIDATION', message: `未知方法: ${method}` } }
    }

    // 3. validate params (Zod .strict())
    const parsed = def.params.safeParse(params)
    if (!parsed.success) {
      return {
        ok: false,
        error: { code: 'VALIDATION', message: formatZodError(parsed.error) }
      }
    }

    // 4. run handler with a sender-bound context
    try {
      const ctx = contextFactory(event.sender)
      const result = await def.handler(parsed.data, ctx)
      return { ok: true, result }
    } catch (err) {
      if (err instanceof RpcError) {
        return { ok: false, error: { code: err.code, message: err.message } }
      }
      // INTERNAL: log full detail, return only a safe message.
      console.error(`[rpc] internal error in ${method}:`, err)
      return { ok: false, error: { code: 'INTERNAL', message: '内部错误' } }
    }
  }
}

function formatZodError(err: z.ZodError): string {
  const first = err.issues[0]
  if (first === undefined) return '参数无效'
  const where = first.path.length > 0 ? first.path.join('.') : '参数'
  return `${where}: ${first.message}`
}
