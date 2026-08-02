import { beforeEach, describe, expect, it, vi } from 'vitest'

type DataListener = (data: string) => void
type ExitListener = (event: { exitCode: number; signal?: number }) => void

const ptyMock = vi.hoisted(() => ({ spawn: vi.fn() }))
vi.mock('node-pty', () => ({ spawn: ptyMock.spawn }))

import { TerminalHost } from './terminal-host'

function fakePty(pid = 42) {
  let dataListener: DataListener | undefined
  let exitListener: ExitListener | undefined
  return {
    pid,
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    onData: vi.fn((listener: DataListener) => {
      dataListener = listener
    }),
    onExit: vi.fn((listener: ExitListener) => {
      exitListener = listener
    }),
    emitData: (data: string) => dataListener?.(data),
    emitExit: (event: { exitCode: number; signal?: number }) => exitListener?.(event)
  }
}

function request(startupCommand?: string) {
  return {
    sessionId: 'session:one',
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    shell: { file: 'powershell.exe', args: ['-NoLogo'] },
    ...(startupCommand === undefined ? {} : { startupCommand })
  }
}

describe('TerminalHost', () => {
  beforeEach(() => ptyMock.spawn.mockReset())

  it('reattaches the same live PTY and rebuilds the terminal from its snapshot', () => {
    const pty = fakePty()
    ptyMock.spawn.mockReturnValue(pty)
    const host = new TerminalHost()
    const data = vi.fn()
    host.on('data', data)

    const created = host.createOrAttach(request())
    pty.emitData('prompt> ')
    const attached = host.createOrAttach(request('must-not-run'))

    expect(created).toMatchObject({ id: 'session:one', pid: 42, isNew: true })
    expect(attached).toMatchObject({ isNew: false, snapshot: 'prompt> ' })
    expect(ptyMock.spawn).toHaveBeenCalledOnce()
    expect(pty.write).not.toHaveBeenCalled()
    expect(data).toHaveBeenCalledWith({ sessionId: 'session:one', data: 'prompt> ' })
  })

  it('runs the startup command once, forwards I/O, and reports process exit', () => {
    vi.useFakeTimers()
    const pty = fakePty(88)
    ptyMock.spawn.mockReturnValue(pty)
    const host = new TerminalHost()
    const exit = vi.fn()
    host.on('exit', exit)

    host.createOrAttach(request('opencode'))
    vi.advanceTimersByTime(150)
    expect(pty.write).toHaveBeenCalledWith('opencode\r')
    host.write('session:one', 'help\r')
    host.resize('session:one', 120, 40)
    expect(pty.write).toHaveBeenCalledWith('help\r')
    expect(pty.resize).toHaveBeenCalledWith(120, 40)

    pty.emitExit({ exitCode: 3, signal: 9 })
    expect(exit).toHaveBeenCalledWith({
      sessionId: 'session:one',
      exitCode: 3,
      signal: 9,
      reason: 'exited'
    })
    expect(() => host.write('session:one', 'late')).toThrow('Terminal session not found')
    vi.useRealTimers()
  })

  it('caps retained output and only kills a PTY on explicit close', () => {
    const pty = fakePty()
    ptyMock.spawn.mockReturnValue(pty)
    const host = new TerminalHost()
    host.createOrAttach(request())
    pty.emitData('a'.repeat(1_500_000))
    pty.emitData('b'.repeat(1_500_000))
    expect(host.createOrAttach(request()).snapshot).toBe('b'.repeat(1_500_000))
    pty.emitData('z'.repeat(2 * 1024 * 1024 + 50))
    const capped = host.createOrAttach(request()).snapshot
    expect(capped).toHaveLength(2 * 1024 * 1024)
    expect(capped).toBe('z'.repeat(2 * 1024 * 1024))

    const exit = vi.fn()
    host.on('exit', exit)
    host.close('session:one')
    expect(pty.kill).toHaveBeenCalledOnce()
    pty.emitExit({ exitCode: 0 })
    expect(exit).toHaveBeenCalledWith({
      sessionId: 'session:one',
      exitCode: 0,
      signal: undefined,
      reason: 'stopped'
    })
    expect(() => host.close('session:one')).toThrow('Terminal session not found')
  })

  it('reports host and PTY diagnostics without exposing terminal output', () => {
    const pty = fakePty(73)
    ptyMock.spawn.mockReturnValue(pty)
    const host = new TerminalHost(7001, () => 1234)

    expect(host.diagnostics()).toEqual({
      protocolVersion: 1,
      processId: 7001,
      startedAt: 1234,
      sessions: []
    })
    host.createOrAttach(request())
    pty.emitData('secret terminal output')
    expect(host.sessionCount).toBe(1)
    expect(host.diagnostics()).toEqual({
      protocolVersion: 1,
      processId: 7001,
      startedAt: 1234,
      sessions: [
        {
          id: 'session:one',
          pid: 73,
          cwd: process.cwd(),
          createdAt: expect.any(Number)
        }
      ]
    })
  })

  it('does not inject a delayed startup command after explicit close', () => {
    vi.useFakeTimers()
    const pty = fakePty()
    ptyMock.spawn.mockReturnValue(pty)
    const host = new TerminalHost()
    host.createOrAttach(request('opencode'))
    host.close('session:one')
    vi.advanceTimersByTime(150)
    expect(pty.write).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('can explicitly clean up every PTY owned by an isolated test profile', () => {
    const first = fakePty(1)
    const second = fakePty(2)
    ptyMock.spawn.mockReturnValueOnce(first).mockReturnValueOnce(second)
    const host = new TerminalHost()
    host.createOrAttach(request())
    host.createOrAttach({ ...request(), sessionId: 'session:two' })
    host.closeAll()
    expect(first.kill).toHaveBeenCalledOnce()
    expect(second.kill).toHaveBeenCalledOnce()
    expect(() => host.write('session:one', 'late')).toThrow('Terminal session not found')
  })
})
