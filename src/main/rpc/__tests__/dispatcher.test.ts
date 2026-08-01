import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { createDispatcher } from '../dispatcher'
import { RpcRegistry } from '../core'
import { RpcError } from '../errors'
import type { RpcContext } from '../core'

// Build a registry with a couple of fake methods; no electron dependency.
function makeRegistry(): RpcRegistry {
  const reg = new RpcRegistry()
  reg.register({
    name: 'echo',
    params: z.object({ msg: z.string() }).strict(),
    handler: (p) => ({ back: (p as { msg: string }).msg })
  })
  reg.register({
    name: 'boom',
    params: z.object({}).strict(),
    handler: () => {
      throw new RpcError('NOT_FOUND', '不存在')
    }
  })
  reg.register({
    name: 'crash',
    params: z.object({}).strict(),
    handler: () => {
      throw new Error('SQL: SELECT secret FROM /etc/passwd at line 99')
    }
  })
  return reg
}

const ctx: RpcContext = {
  repositories: {} as RpcContext['repositories'],
  sender: null
}

const dispatch = createDispatcher(
  makeRegistry(),
  () => ctx,
  () => true
)

describe('dispatcher', () => {
  it('rejects calls from an untrusted WebContents before dispatch', async () => {
    const untrustedDispatch = createDispatcher(
      makeRegistry(),
      () => ctx,
      () => false
    )
    const res = await untrustedDispatch(
      { sender: null as never },
      { method: 'echo', params: { msg: 'hi' } }
    )
    expect(res).toEqual({
      ok: false,
      error: { code: 'FORBIDDEN', message: '无权调用该方法' }
    })
  })

  it('returns {ok, result} for a valid call', async () => {
    const res = await dispatch(
      { sender: null as never },
      { method: 'echo', params: { msg: 'hi' } }
    )
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.result).toEqual({ back: 'hi' })
  })

  it('rejects an unknown method (whitelist)', async () => {
    const res = await dispatch({ sender: null as never }, { method: 'nope', params: {} })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('VALIDATION')
  })

  it('rejects invalid params (Zod strict)', async () => {
    const res = await dispatch(
      { sender: null as never },
      { method: 'echo', params: { msg: 123 } } // wrong type
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('VALIDATION')
  })

  it('rejects unknown keys (.strict())', async () => {
    const res = await dispatch(
      { sender: null as never },
      { method: 'echo', params: { msg: 'x', extra: 1 } }
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error.code).toBe('VALIDATION')
  })

  it('forwards RpcError code', async () => {
    const res = await dispatch({ sender: null as never }, { method: 'boom', params: {} })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.code).toBe('NOT_FOUND')
      expect(res.error.message).toBe('不存在')
    }
  })

  it('masks INTERNAL errors (no SQL/path leak)', async () => {
    const res = await dispatch({ sender: null as never }, { method: 'crash', params: {} })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error.code).toBe('INTERNAL')
      expect(res.error.message).toBe('内部错误')
      // the dangerous detail must NOT reach the renderer
      expect(res.error.message).not.toMatch(/SELECT|passwd|line 99/)
    }
  })
})
