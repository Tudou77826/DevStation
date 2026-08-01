// RPC core: context, handler signature, and the method registry.
//
// A method is { name, paramsSchema (Zod), handler }. The handler runs with an
// RpcContext that carries shared dependencies (repositories). Handlers return a
// value or throw RpcError (forwarded with its code) / anything else (INTERNAL).
import type { ZodTypeAny } from 'zod'
import type { ProjectRepo, SessionRepo, TaskRepo } from '../db/repositories'
import type { BrowserWindow } from 'electron'

export interface RpcContext {
  repositories: {
    tasks: TaskRepo
    projects: ProjectRepo
    sessions: SessionRepo
  }
  /** the requesting window; some methods (dialog) need it */
  sender: BrowserWindow | null
}

export type RpcHandler<P, R> = (params: P, ctx: RpcContext) => R | Promise<R>

/**
 * A registered method. `params` is the Zod schema; the handler's TS param type
 * is provided separately (usually `z.infer<typeof schema>`). The registry stores
 * methods in erased form; the dispatcher re-parses at call time.
 */
export interface RpcMethod<P = any, R = any> {
  name: string
  params: ZodTypeAny
  handler: RpcHandler<P, R>
}

/** A registry mapping method name → method. The dispatcher only accepts keys present here. */
export class RpcRegistry {
  private readonly methods = new Map<string, RpcMethod>()

  register<P, R>(method: RpcMethod<P, R>): void {
    if (this.methods.has(method.name)) {
      throw new Error(`RPC method already registered: ${method.name}`)
    }
    this.methods.set(method.name, method)
  }

  get(name: string): RpcMethod | undefined {
    return this.methods.get(name)
  }

  has(name: string): boolean {
    return this.methods.has(name)
  }
}
