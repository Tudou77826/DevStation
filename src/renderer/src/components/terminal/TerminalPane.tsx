import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { AlertTriangle, Bot, Power, RotateCcw, SquareTerminal } from 'lucide-react'
import type { TerminalContext, TerminalDataEvent, TerminalSession } from '@shared/types'

type TerminalStatus =
  'connecting' | 'running' | 'stopped' | 'exited' | 'failed' | 'disconnected' | 'error'

export function TerminalPane({
  context
}: {
  context: TerminalContext
}): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<TerminalSession | null>(null)
  const [session, setSession] = useState<TerminalSession | null>(null)
  const [status, setStatus] = useState<TerminalStatus>('connecting')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [restart, setRestart] = useState(0)
  const contextKey =
    context.type === 'session'
      ? `session:${context.sessionId}`
      : `workspace:${context.projectId ?? 'default'}`

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    let cancelled = false
    const bufferedData: TerminalDataEvent[] = []
    const terminal = new XTerm({
      cursorBlink: true,
      fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 10_000,
      theme: {
        background: '#090909',
        foreground: '#d4d4d4',
        cursor: '#f5f5f5',
        selectionBackground: '#3f3f46'
      }
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(host)

    const fit = (): void => {
      try {
        fitAddon.fit()
        const active = sessionRef.current
        if (active !== null) {
          void window.devstation.terminal.resize(active.id, terminal.cols, terminal.rows)
        }
      } catch {
        // Navigation can temporarily leave the terminal host with no dimensions.
      }
    }
    fit()

    const resizeObserver = new ResizeObserver(() => requestAnimationFrame(fit))
    resizeObserver.observe(host)
    const inputDisposable = terminal.onData((data) => {
      const active = sessionRef.current
      if (active !== null) void window.devstation.terminal.write(active.id, data)
    })
    const unsubscribeData = window.devstation.terminal.onData((event) => {
      const active = sessionRef.current
      if (active === null) bufferedData.push(event)
      else if (active.id === event.sessionId) terminal.write(event.data)
    })
    const unsubscribeExit = window.devstation.terminal.onExit((event) => {
      const active = sessionRef.current
      if (active?.id !== event.sessionId) return
      const nextStatus: TerminalStatus =
        event.reason === 'stopped'
          ? 'stopped'
          : event.exitCode === 0
            ? 'exited'
            : 'failed'
      const message =
        nextStatus === 'stopped'
          ? '进程已由用户结束'
          : nextStatus === 'exited'
            ? '进程已正常退出'
            : `进程异常退出，代码 ${event.exitCode}`
      terminal.writeln(`\r\n[${message}]`)
      sessionRef.current = null
      setSession(null)
      setStatus(nextStatus)
      setStatusMessage(message)
    })
    const unsubscribeHostState = window.devstation.terminal.onHostState((event) => {
      if (event.state !== 'disconnected' || sessionRef.current === null) return
      terminal.writeln('\r\n[终端宿主连接中断；重新连接会优先接回原进程]')
      sessionRef.current = null
      setSession(null)
      setStatus('disconnected')
      setStatusMessage('终端宿主连接中断')
    })

    setStatus('connecting')
    setStatusMessage(null)
    void window.devstation.terminal
      .connect({ context, cols: terminal.cols, rows: terminal.rows })
      .then((connected) => {
        if (cancelled) {
          void window.devstation.terminal.disconnect(connected.id)
          return
        }
        terminal.clear()
        if (connected.snapshot) terminal.write(connected.snapshot)
        for (const event of bufferedData) {
          if (event.sessionId === connected.id) terminal.write(event.data)
        }
        sessionRef.current = connected
        setSession(connected)
        setStatus('running')
        setStatusMessage(null)
        terminal.focus()
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        terminal.writeln(`\r\n[终端连接失败] ${message}`)
        setStatus('error')
        setStatusMessage(message)
      })

    return () => {
      cancelled = true
      const active = sessionRef.current
      if (active !== null) void window.devstation.terminal.disconnect(active.id)
      sessionRef.current = null
      resizeObserver.disconnect()
      inputDisposable.dispose()
      unsubscribeData()
      unsubscribeExit()
      unsubscribeHostState()
      terminal.dispose()
    }
  }, [contextKey, restart])

  async function stop(): Promise<void> {
    const active = sessionRef.current
    if (active === null) return
    try {
      await window.devstation.terminal.close(active.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatus('error')
      setStatusMessage(message)
    }
  }

  const stateLabel = terminalStateLabel(status, session, statusMessage)
  const isFault = status === 'failed' || status === 'disconnected' || status === 'error'

  return (
    <div className="flex h-full min-h-[300px] flex-col bg-[#090909]">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/10 px-3">
        <div
          className="flex min-w-0 items-center gap-2 text-[12px] text-neutral-400"
          aria-live="polite"
          title={
            session === null
              ? (statusMessage ?? undefined)
              : `Terminal Host PID ${session.host.processId} · Protocol v${session.host.protocolVersion}`
          }
        >
          {isFault ? (
            <AlertTriangle size={14} className="shrink-0 text-amber-400" />
          ) : session?.agentType === 'opencode' ? (
            <Bot size={14} />
          ) : (
            <SquareTerminal size={14} />
          )}
          <span className={isFault ? 'truncate text-amber-300' : 'truncate'}>
            {stateLabel}
          </span>
          {session !== null && !session.isNew && (
            <span className="rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] text-emerald-400">
              已接回
            </span>
          )}
          {session?.agentResumed === true && (
            <span className="rounded bg-sky-400/10 px-1.5 py-0.5 text-[10px] text-sky-400">
              已恢复会话
            </span>
          )}
        </div>
        {session !== null ? (
          <button
            type="button"
            onClick={() => void stop()}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-[12px] text-neutral-300 hover:bg-white/8"
          >
            <Power size={13} />
            结束进程
          </button>
        ) : (
          status !== 'connecting' && (
            <button
              type="button"
              onClick={() => setRestart((value) => value + 1)}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-[12px] text-neutral-300 hover:bg-white/8"
            >
              <RotateCcw size={13} />
              重新连接
            </button>
          )
        )}
      </div>
      <div ref={hostRef} className="min-h-0 flex-1 px-2 py-2" />
    </div>
  )
}

function terminalStateLabel(
  status: TerminalStatus,
  session: TerminalSession | null,
  statusMessage: string | null
): string {
  if (status === 'connecting') return '正在连接 PowerShell…'
  if (session !== null) {
    return `${session.agentType === 'opencode' ? 'OpenCode · ' : ''}PowerShell · PID ${session.pid}`
  }
  if (status === 'stopped') return '进程已结束'
  if (status === 'exited') return '进程已正常退出'
  if (status === 'failed') return statusMessage ?? '进程异常退出'
  if (status === 'disconnected') return '终端宿主连接中断'
  return 'PowerShell 连接失败'
}
