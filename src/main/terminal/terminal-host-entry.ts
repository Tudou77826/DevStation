import { createServer, type Socket } from 'node:net'
import { TerminalHost } from './terminal-host'
import {
  encodeHostMessage,
  type HostMessage,
  type HostRequestEnvelope
} from './terminal-host-protocol'

const endpoint = process.env['DEVSTATION_TERMINAL_HOST_ENDPOINT']
const token = process.env['DEVSTATION_TERMINAL_HOST_TOKEN']
if (!endpoint || !token) throw new Error('Terminal host endpoint is not configured')
const configuredIdleMs = Number(process.env['DEVSTATION_TERMINAL_HOST_IDLE_MS'])
const idleExitMs =
  Number.isFinite(configuredIdleMs) && configuredIdleMs >= 100 ? configuredIdleMs : 15_000

const host = new TerminalHost()
const authenticatedSockets = new Set<Socket>()
let idleTimer: ReturnType<typeof setTimeout> | null = null

function cancelIdleExit(): void {
  if (idleTimer !== null) clearTimeout(idleTimer)
  idleTimer = null
}

function scheduleIdleExit(): void {
  cancelIdleExit()
  if (host.sessionCount > 0 || authenticatedSockets.size > 0) return
  idleTimer = setTimeout(() => {
    server.close(() => process.exit(0))
  }, idleExitMs)
}

function send(socket: Socket, message: HostMessage): void {
  if (!socket.destroyed) socket.write(encodeHostMessage(message))
}

host.on('data', (payload) => {
  for (const socket of authenticatedSockets) {
    send(socket, { type: 'event', event: 'data', ...payload })
  }
})
host.on('exit', (payload) => {
  for (const socket of authenticatedSockets) {
    send(socket, { type: 'event', event: 'exit', ...payload })
  }
  scheduleIdleExit()
})

function handle(socket: Socket, envelope: HostRequestEnvelope): void {
  if (envelope.type !== 'request' || envelope.token !== token) {
    socket.destroy()
    return
  }
  authenticatedSockets.add(socket)
  try {
    const { request } = envelope
    let result: unknown
    if (request.method === 'diagnostics') result = host.diagnostics()
    else if (request.method === 'createOrAttach')
      result = host.createOrAttach(request.payload)
    else if (request.method === 'write')
      result = host.write(request.payload.sessionId, request.payload.data)
    else if (request.method === 'resize')
      result = host.resize(
        request.payload.sessionId,
        request.payload.cols,
        request.payload.rows
      )
    else if (request.method === 'close') result = host.close(request.payload.sessionId)
    else {
      result = host.closeAll()
      send(socket, { type: 'response', id: envelope.id, ok: true, result })
      setImmediate(() => {
        for (const client of authenticatedSockets) client.end()
        server.close(() => process.exit(0))
      })
      return
    }
    send(socket, { type: 'response', id: envelope.id, ok: true, result })
  } catch (error) {
    send(socket, {
      type: 'response',
      id: envelope.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Terminal host request failed'
    })
  }
}

const server = createServer((socket) => {
  cancelIdleExit()
  let buffered = ''
  socket.setEncoding('utf8')
  socket.on('data', (data) => {
    buffered += data
    let newline = buffered.indexOf('\n')
    while (newline >= 0) {
      const line = buffered.slice(0, newline)
      buffered = buffered.slice(newline + 1)
      if (line.trim()) {
        try {
          handle(socket, JSON.parse(line) as HostRequestEnvelope)
        } catch {
          socket.destroy()
        }
      }
      newline = buffered.indexOf('\n')
    }
  })
  socket.on('close', () => {
    authenticatedSockets.delete(socket)
    scheduleIdleExit()
  })
})

server.listen(endpoint, scheduleIdleExit)
