// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalPane } from './TerminalPane'

const terminalMocks = vi.hoisted(() => ({
  instances: [] as Array<{
    cols: number
    rows: number
    write: ReturnType<typeof vi.fn>
    writeln: ReturnType<typeof vi.fn>
    clear: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
  }>
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 80
    rows = 24
    write = vi.fn()
    writeln = vi.fn()
    clear = vi.fn()
    focus = vi.fn()
    dispose = vi.fn()
    loadAddon = vi.fn()
    open = vi.fn()
    onData = vi.fn(() => ({ dispose: vi.fn() }))

    constructor() {
      terminalMocks.instances.push(this)
    }
  }
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn()
  }
}))

class ResizeObserverStub {
  observe = vi.fn()
  disconnect = vi.fn()
}

describe('TerminalPane', () => {
  let dataListener: (event: { sessionId: string; data: string }) => void
  let exitListener: (event: {
    sessionId: string
    exitCode: number
    reason: 'exited' | 'stopped'
  }) => void
  let hostStateListener: (event: {
    state: 'connected' | 'disconnected'
    message?: string
  }) => void
  let api: {
    connect: ReturnType<typeof vi.fn>
    disconnect: ReturnType<typeof vi.fn>
    write: ReturnType<typeof vi.fn>
    resize: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    onData: ReturnType<typeof vi.fn>
    onExit: ReturnType<typeof vi.fn>
    onHostState: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    terminalMocks.instances.length = 0
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
      callback()
      return 1
    })
    api = {
      connect: vi.fn(async (request) => ({
        id:
          request.context.type === 'session'
            ? `session:${request.context.sessionId}`
            : 'workspace:default',
        pid: 99,
        cwd: 'D:\\project',
        shell: 'powershell.exe',
        context: request.context,
        isNew: false,
        agentType: request.context.type === 'session' ? 'opencode' : null,
        agentResumed: false,
        snapshot: 'restored prompt> ',
        host: { protocolVersion: 1, processId: 9001, startedAt: 1 }
      })),
      disconnect: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      onData: vi.fn((listener) => {
        dataListener = listener
        return vi.fn()
      }),
      onExit: vi.fn((listener) => {
        exitListener = listener
        return vi.fn()
      }),
      onHostState: vi.fn((listener) => {
        hostStateListener = listener
        return vi.fn()
      })
    }
    Object.defineProperty(window, 'devstation', {
      configurable: true,
      value: { terminal: api }
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('reattaches the selected session snapshot and filters live output by PTY id', async () => {
    render(<TerminalPane context={{ type: 'session', sessionId: 'one' }} />)
    await screen.findByText(/OpenCode · PowerShell · PID 99/)
    const terminal = terminalMocks.instances[0]
    expect(api.connect).toHaveBeenCalledWith({
      context: { type: 'session', sessionId: 'one' },
      cols: 80,
      rows: 24
    })
    expect(terminal.write).toHaveBeenCalledWith('restored prompt> ')

    dataListener({ sessionId: 'session:other', data: 'wrong' })
    dataListener({ sessionId: 'session:one', data: 'right' })
    expect(terminal.write).not.toHaveBeenCalledWith('wrong')
    expect(terminal.write).toHaveBeenCalledWith('right')
    expect(
      screen
        .getByText(/PID 99/)
        .closest('[title]')
        ?.getAttribute('title')
    ).toBe('Terminal Host PID 9001 · Protocol v1')
  })

  it('detaches on navigation without closing the process, but honors explicit stop', async () => {
    const view = render(<TerminalPane context={{ type: 'session', sessionId: 'one' }} />)
    await screen.findByText(/PID 99/)
    view.rerender(<TerminalPane context={{ type: 'session', sessionId: 'two' }} />)
    await waitFor(() => expect(api.disconnect).toHaveBeenCalledWith('session:one'))
    expect(api.close).not.toHaveBeenCalled()

    await screen.findByText(/PID 99/)
    fireEvent.click(screen.getByRole('button', { name: '结束进程' }))
    await waitFor(() => expect(api.close).toHaveBeenCalledWith('session:two'))
    exitListener({ sessionId: 'session:two', exitCode: 0, reason: 'stopped' })
    expect(await screen.findByText('进程已结束')).toBeTruthy()
  })

  it('explains a host disconnect and offers a real reconnect action', async () => {
    render(<TerminalPane context={{ type: 'workspace', projectId: null }} />)
    await screen.findByText(/PID 99/)

    hostStateListener({
      state: 'disconnected',
      message: 'Terminal host connection was lost'
    })
    expect(await screen.findByText('终端宿主连接中断')).toBeTruthy()
    expect(terminalMocks.instances[0].writeln).toHaveBeenCalledWith(
      '\r\n[终端宿主连接中断；重新连接会优先接回原进程]'
    )

    fireEvent.click(screen.getByRole('button', { name: '重新连接' }))
    await waitFor(() => expect(api.connect).toHaveBeenCalledTimes(2))
  })

  it('distinguishes an abnormal process exit from a normal exit', async () => {
    render(<TerminalPane context={{ type: 'workspace', projectId: null }} />)
    await screen.findByText(/PID 99/)

    exitListener({ sessionId: 'workspace:default', exitCode: 17, reason: 'exited' })
    expect(await screen.findByText('进程异常退出，代码 17')).toBeTruthy()
    expect(terminalMocks.instances[0].writeln).toHaveBeenCalledWith(
      '\r\n[进程异常退出，代码 17]'
    )
  })
})
