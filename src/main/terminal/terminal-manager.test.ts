import { beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'

type InvokeHandler = (event: FakeEvent, ...args: unknown[]) => unknown
type DataListener = (data: string) => void
type ExitListener = (event: { exitCode: number; signal?: number }) => void

interface FakeSender {
  id: number
  isDestroyed: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
}

interface FakeEvent {
  sender: FakeSender
}

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, InvokeHandler>(),
  handle: vi.fn((channel: string, handler: InvokeHandler) => {
    mocks.handlers.set(channel, handler)
  }),
  spawn: vi.fn()
}))

vi.mock('electron', () => ({ ipcMain: { handle: mocks.handle } }))
vi.mock('node-pty', () => ({ spawn: mocks.spawn }))

import { TerminalManager } from './terminal-manager'

function fakePty(pid: number) {
  let dataListener: DataListener | undefined
  let exitListener: ExitListener | undefined
  return {
    pid,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn((listener: DataListener) => {
      dataListener = listener
      return { dispose: vi.fn() }
    }),
    onExit: vi.fn((listener: ExitListener) => {
      exitListener = listener
      return { dispose: vi.fn() }
    }),
    emitData: (data: string) => dataListener?.(data),
    emitExit: (event: { exitCode: number; signal?: number }) => exitListener?.(event)
  }
}

function event(ownerId: number): FakeEvent {
  return {
    sender: { id: ownerId, isDestroyed: vi.fn(() => false), send: vi.fn() }
  }
}

function invoke(channel: string, senderEvent: FakeEvent, ...args: unknown[]): unknown {
  const handler = mocks.handlers.get(channel)
  if (handler === undefined) throw new Error(`handler not registered: ${channel}`)
  return handler(senderEvent, ...args)
}

describe('TerminalManager', () => {
  let manager: TerminalManager

  beforeEach(() => {
    mocks.handlers.clear()
    mocks.handle.mockClear()
    mocks.spawn.mockReset()
    manager = new TerminalManager()
    manager.registerIpc()
  })

  it('owns a PTY through create, I/O, resize, data and exit events', () => {
    const pty = fakePty(321)
    const owner = event(7)
    mocks.spawn.mockReturnValue(pty)

    const metadata = invoke('terminal:create', owner, {
      kind: 'shell',
      cols: 100,
      rows: 30,
      cwd: process.cwd()
    }) as { id: string; pid: number; cwd: string }

    expect(metadata).toMatchObject({ pid: 321, cwd: process.cwd() })
    expect(mocks.spawn).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.objectContaining({ cols: 100, rows: 30, cwd: process.cwd() })
    )

    invoke('terminal:write', owner, metadata.id, 'echo safe')
    invoke('terminal:resize', owner, metadata.id, 120, 40)
    expect(pty.write).toHaveBeenCalledWith('echo safe')
    expect(pty.resize).toHaveBeenCalledWith(120, 40)

    pty.emitData('output')
    expect(owner.sender.send).toHaveBeenCalledWith('terminal:data', {
      sessionId: metadata.id,
      data: 'output'
    })
    pty.emitExit({ exitCode: 3, signal: 9 })
    expect(owner.sender.send).toHaveBeenCalledWith('terminal:exit', {
      sessionId: metadata.id,
      exitCode: 3,
      signal: 9
    })
    expect(() => invoke('terminal:write', owner, metadata.id, 'late')).toThrow(
      'Terminal session not found'
    )
  })

  it('enforces launch request, working directory and dimension boundaries', () => {
    mocks.spawn.mockReturnValue(fakePty(1))
    const owner = event(1)
    expect(() => invoke('terminal:create', owner, null)).toThrow(
      'Invalid terminal request'
    )
    expect(() =>
      invoke('terminal:create', owner, { kind: 'other', cols: 80, rows: 24 })
    ).toThrow('Unsupported terminal launch kind')
    expect(() =>
      invoke('terminal:create', owner, { kind: 'shell', cols: 1, rows: 24 })
    ).toThrow(/cols must be an integer/)
    expect(() =>
      invoke('terminal:create', owner, { kind: 'shell', cols: 80.5, rows: 24 })
    ).toThrow(/cols must be an integer/)
    expect(() =>
      invoke('terminal:create', owner, {
        kind: 'shell',
        cols: 80,
        rows: 501,
        cwd: 'Z:\\definitely-missing-devstation-directory'
      })
    ).toThrow('Terminal working directory is unavailable')
    expect(() =>
      invoke('terminal:create', owner, {
        kind: 'shell',
        cols: 80,
        rows: 24,
        cwd: join(process.cwd(), 'package.json')
      })
    ).toThrow('Terminal working directory is unavailable')
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('prevents cross-window terminal access and oversized or non-string input', () => {
    const pty = fakePty(2)
    mocks.spawn.mockReturnValue(pty)
    const owner = event(1)
    const stranger = event(2)
    const metadata = invoke('terminal:create', owner, {
      kind: 'shell',
      cols: 80,
      rows: 24
    }) as { id: string }

    expect(() => invoke('terminal:write', stranger, metadata.id, 'steal')).toThrow(
      'Terminal session not found'
    )
    expect(() => invoke('terminal:close', stranger, metadata.id)).toThrow(
      'Terminal session not found'
    )
    expect(() => invoke('terminal:write', owner, 123, 'bad id')).toThrow(
      'Invalid terminal session id'
    )
    expect(() => invoke('terminal:write', owner, metadata.id, 123)).toThrow(
      'Invalid terminal input'
    )
    expect(() =>
      invoke('terminal:write', owner, metadata.id, 'x'.repeat(1024 * 1024 + 1))
    ).toThrow('Invalid terminal input')
    expect(pty.write).not.toHaveBeenCalled()
  })

  it('closes only the destroyed window’s terminals', () => {
    const first = fakePty(11)
    const second = fakePty(12)
    mocks.spawn.mockReturnValueOnce(first).mockReturnValueOnce(second)
    const ownerOne = event(1)
    const ownerTwo = event(2)
    const destroyedListeners: Array<() => void> = []
    manager.watch({
      id: 1,
      once: (_name: string, listener: () => void) => destroyedListeners.push(listener)
    } as never)

    const firstMetadata = invoke('terminal:create', ownerOne, {
      kind: 'shell',
      cols: 80,
      rows: 24
    }) as { id: string }
    const secondMetadata = invoke('terminal:create', ownerTwo, {
      kind: 'shell',
      cols: 80,
      rows: 24
    }) as { id: string }
    destroyedListeners[0]()

    expect(first.kill).toHaveBeenCalledOnce()
    expect(second.kill).not.toHaveBeenCalled()
    expect(() => invoke('terminal:write', ownerOne, firstMetadata.id, 'late')).toThrow()
    expect(() =>
      invoke('terminal:write', ownerTwo, secondMetadata.id, 'alive')
    ).not.toThrow()
  })

  it('closes an owned terminal explicitly and disposes all remaining PTYs', () => {
    const first = fakePty(21)
    const second = fakePty(22)
    mocks.spawn.mockReturnValueOnce(first).mockReturnValueOnce(second)
    const owner = event(1)
    const firstMetadata = invoke('terminal:create', owner, {
      kind: 'shell',
      cols: 80,
      rows: 24
    }) as { id: string }
    invoke('terminal:create', owner, { kind: 'codex', cols: 80, rows: 24 })

    invoke('terminal:close', owner, firstMetadata.id)
    expect(first.kill).toHaveBeenCalledOnce()
    manager.dispose()
    expect(first.kill).toHaveBeenCalledOnce()
    expect(second.kill).toHaveBeenCalledOnce()
  })

  it('does not send PTY events after the renderer is destroyed', () => {
    const pty = fakePty(31)
    const owner = event(1)
    owner.sender.isDestroyed.mockReturnValue(true)
    mocks.spawn.mockReturnValue(pty)
    invoke('terminal:create', owner, { kind: 'shell', cols: 80, rows: 24 })
    pty.emitData('late output')
    pty.emitExit({ exitCode: 0 })
    expect(owner.sender.send).not.toHaveBeenCalled()
  })
})
