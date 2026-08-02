import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TerminalHostClient, terminalHostEndpoint } from './terminal-host-client'
import type { HostRequestEnvelope } from './terminal-host-protocol'
import { TERMINAL_HOST_PROTOCOL_VERSION } from './terminal-host-protocol'

const cleanups: Array<() => void> = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

async function fakeHost(
  userDataPath: string,
  handle: (socket: Socket, request: HostRequestEnvelope) => void,
  diagnosticsDelayMs = 0
): Promise<Server> {
  const server = createServer((socket) => {
    let buffered = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk) => {
      buffered += String(chunk)
      let newline = buffered.indexOf('\n')
      while (newline >= 0) {
        const envelope = JSON.parse(buffered.slice(0, newline)) as HostRequestEnvelope
        buffered = buffered.slice(newline + 1)
        if (envelope.request.method === 'diagnostics') {
          setTimeout(() => {
            socket.write(
              `${JSON.stringify({
                type: 'response',
                id: envelope.id,
                ok: true,
                result: {
                  protocolVersion: TERMINAL_HOST_PROTOCOL_VERSION,
                  processId: 123,
                  startedAt: 1,
                  sessions: []
                }
              })}\n`
            )
          }, diagnosticsDelayMs)
        } else {
          handle(socket, envelope)
        }
        newline = buffered.indexOf('\n')
      }
    })
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(terminalHostEndpoint(userDataPath), resolve)
  })
  return server
}

function tempUserData(): string {
  const directory = mkdtempSync(join(tmpdir(), 'devstation-host-client-'))
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }))
  return directory
}

describe('TerminalHostClient', () => {
  it('uses the authenticated protocol and forwards host events', async () => {
    const userDataPath = tempUserData()
    const server = await fakeHost(userDataPath, (socket, envelope) => {
      expect(envelope.token).toMatch(/^[a-f0-9]{64}$/)
      expect(envelope.request).toEqual({
        method: 'write',
        payload: { sessionId: 'session:one', data: 'hello' }
      })
      socket.write(`${JSON.stringify({ type: 'response', id: envelope.id, ok: true })}\n`)
      socket.write(
        `${JSON.stringify({
          type: 'event',
          event: 'data',
          sessionId: 'session:one',
          data: 'world'
        })}\n`
      )
    })
    const client = new TerminalHostClient({ userDataPath, hostEntryPath: 'unused.js' })
    const data = vi.fn()
    const state = vi.fn()
    client.on('data', data)
    client.on('state', state)

    await client.write('session:one', 'hello')
    await vi.waitFor(() =>
      expect(data).toHaveBeenCalledWith({
        sessionId: 'session:one',
        data: 'world'
      })
    )
    expect(state).toHaveBeenCalledWith({ state: 'connected' })
    await expect(client.diagnostics()).resolves.toMatchObject({
      protocolVersion: TERMINAL_HOST_PROTOCOL_VERSION,
      processId: 123
    })

    client.dispose()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('rejects an in-flight operation when the host disconnects', async () => {
    const userDataPath = tempUserData()
    const server = await fakeHost(userDataPath, (socket) => socket.destroy())
    const client = new TerminalHostClient({ userDataPath, hostEntryPath: 'unused.js' })
    const state = vi.fn()
    client.on('state', state)

    await expect(client.close('session:missing')).rejects.toThrow(
      'Terminal host disconnected'
    )
    expect(state).toHaveBeenLastCalledWith({
      state: 'disconnected',
      message: 'Terminal host connection was lost'
    })

    client.dispose()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('completes the protocol handshake before concurrent operations reach the host', async () => {
    const userDataPath = tempUserData()
    let handshakeCompleted = false
    const server = await fakeHost(
      userDataPath,
      (socket, envelope) => {
        expect(handshakeCompleted).toBe(true)
        socket.write(
          `${JSON.stringify({ type: 'response', id: envelope.id, ok: true })}\n`
        )
      },
      20
    )
    const client = new TerminalHostClient({ userDataPath, hostEntryPath: 'unused.js' })
    client.on('state', (event) => {
      if (event.state === 'connected') handshakeCompleted = true
    })

    await Promise.all([
      client.write('session:one', 'first'),
      client.write('session:one', 'second')
    ])
    expect(handshakeCompleted).toBe(true)

    client.dispose()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })
})
