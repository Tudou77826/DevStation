import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Bot, Power, SquareTerminal } from 'lucide-react'
import type { TerminalLaunchKind, TerminalSession } from '@shared/types'

type TerminalStatus = 'idle' | 'starting' | 'running' | 'exited' | 'error'

export function TerminalPane(): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionRef = useRef<TerminalSession | null>(null)
  const [session, setSession] = useState<TerminalSession | null>(null)
  const [status, setStatus] = useState<TerminalStatus>('idle')

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return

    const terminal = new XTerm({
      cursorBlink: true,
      fontFamily: '"Cascadia Code", "JetBrains Mono", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: {
        background: '#0a0a0a',
        foreground: '#d4d4d4',
        cursor: '#f5f5f5',
        selectionBackground: '#3f3f46'
      }
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(host)
    terminalRef.current = terminal
    fitRef.current = fitAddon

    const fit = (): void => {
      try {
        fitAddon.fit()
        const active = sessionRef.current
        if (active !== null) {
          void window.devstation.terminal.resize(active.id, terminal.cols, terminal.rows)
        }
      } catch {
        // The host can briefly have no dimensions while tabs are switching.
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
      if (active === null || active.id === event.sessionId) terminal.write(event.data)
    })
    const unsubscribeExit = window.devstation.terminal.onExit((event) => {
      const active = sessionRef.current
      if (active === null || active.id === event.sessionId) {
        terminal.writeln(`\r\n[进程已退出，代码 ${event.exitCode}]`)
        sessionRef.current = null
        setSession(null)
        setStatus('exited')
      }
    })

    return () => {
      const active = sessionRef.current
      if (active !== null) void window.devstation.terminal.close(active.id)
      sessionRef.current = null
      resizeObserver.disconnect()
      inputDisposable.dispose()
      unsubscribeData()
      unsubscribeExit()
      terminal.dispose()
      terminalRef.current = null
      fitRef.current = null
    }
  }, [])

  async function launch(kind: TerminalLaunchKind): Promise<void> {
    const terminal = terminalRef.current
    if (terminal === null || status === 'starting' || sessionRef.current !== null) return
    setStatus('starting')
    terminal.clear()
    terminal.writeln(kind === 'codex' ? '正在启动 Codex…' : '正在启动本地 Shell…')
    try {
      fitRef.current?.fit()
      const created = await window.devstation.terminal.create({
        kind,
        cols: terminal.cols,
        rows: terminal.rows
      })
      sessionRef.current = created
      setSession(created)
      setStatus('running')
      terminal.focus()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      terminal.writeln(`\r\n[启动失败] ${message}`)
      setStatus('error')
    }
  }

  async function stop(): Promise<void> {
    const active = sessionRef.current
    if (active === null) return
    sessionRef.current = null
    setSession(null)
    setStatus('exited')
    await window.devstation.terminal.close(active.id)
  }

  return (
    <div className="flex h-full min-h-[300px] flex-col bg-[#0a0a0a]">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/10 px-3">
        <div className="flex items-center gap-2 text-[12px] text-neutral-400">
          <SquareTerminal size={15} />
          <span>
            {session === null
              ? status === 'starting'
                ? '正在启动'
                : '本地终端'
              : `${session.kind === 'codex' ? 'Codex' : 'Shell'} · PID ${session.pid}`}
          </span>
        </div>
        {session === null ? (
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={status === 'starting'}
              onClick={() => void launch('shell')}
              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-[12px] text-neutral-300 hover:bg-white/8 disabled:opacity-50"
            >
              <SquareTerminal size={13} />
              Shell
            </button>
            <button
              type="button"
              disabled={status === 'starting'}
              onClick={() => void launch('codex')}
              className="inline-flex h-7 items-center gap-1.5 rounded-md bg-neutral-100 px-2.5 text-[12px] text-neutral-900 hover:bg-white disabled:opacity-50"
            >
              <Bot size={13} />
              Codex
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void stop()}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-[12px] text-neutral-300 hover:bg-white/8"
          >
            <Power size={13} />
            结束
          </button>
        )}
      </div>
      <div ref={hostRef} className="min-h-0 flex-1 px-2 py-2" />
    </div>
  )
}
