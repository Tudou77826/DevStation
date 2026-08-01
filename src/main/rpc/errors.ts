// RPC error class. Thrown inside main-process handlers/repositories; the
// dispatcher catches it and forwards {code, safe message} to the renderer.
// Generic (non-RpcError) throws are treated as INTERNAL and never leak details.
import type { RpcErrorCode } from '@shared/rpc'

export class RpcError extends Error {
  readonly code: RpcErrorCode

  constructor(code: RpcErrorCode, message: string) {
    super(message)
    this.name = 'RpcError'
    this.code = code
  }
}

export const notFound = (what: string): RpcError =>
  new RpcError('NOT_FOUND', `${what} 不存在`)
export const invalidPath = (reason = '路径无效'): RpcError =>
  new RpcError('INVALID_PATH', reason)
export const notGitRepo = (): RpcError =>
  new RpcError('NOT_GIT_REPOSITORY', '该路径不是 Git 仓库')
export const projectInUse = (): RpcError =>
  new RpcError('PROJECT_IN_USE', '该项目仍被任务或会话引用，无法删除')
