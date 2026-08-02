// Preload runs in an isolated world: it is the ONLY bridge between the sandboxed
// Renderer and Node/Electron capabilities. Expose a whitelisted, frozen API.
import { contextBridge, ipcRenderer } from 'electron'
import type {
  DevStationAPI,
  TerminalDataEvent,
  TerminalExitEvent,
  TerminalHostStateEvent
} from '@shared/types'
import type { Session } from '@shared/domain'

const api: DevStationAPI = {
  version: process.env['npm_package_version'] ?? '0.0.0',
  platform: process.platform,
  theme: {
    /** push the resolved theme to main so native window chrome follows it */
    update: (theme: 'dark' | 'light') => ipcRenderer.invoke('theme:update', theme)
  },
  agent: {
    onSessionUpdated: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, session: Session): void =>
        listener(session)
      ipcRenderer.on('agent:session-updated', handler)
      return () => ipcRenderer.removeListener('agent:session-updated', handler)
    }
  },
  terminal: {
    connect: (request) => ipcRenderer.invoke('terminal:connect', request),
    disconnect: (sessionId) => ipcRenderer.invoke('terminal:disconnect', sessionId),
    write: (sessionId, data) => ipcRenderer.invoke('terminal:write', sessionId, data),
    resize: (sessionId, cols, rows) =>
      ipcRenderer.invoke('terminal:resize', sessionId, cols, rows),
    close: (sessionId) => ipcRenderer.invoke('terminal:close', sessionId),
    onData: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: TerminalDataEvent
      ): void => listener(payload)
      ipcRenderer.on('terminal:data', handler)
      return () => ipcRenderer.removeListener('terminal:data', handler)
    },
    onExit: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: TerminalExitEvent
      ): void => listener(payload)
      ipcRenderer.on('terminal:exit', handler)
      return () => ipcRenderer.removeListener('terminal:exit', handler)
    },
    onHostState: (listener) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: TerminalHostStateEvent
      ): void => listener(payload)
      ipcRenderer.on('terminal:host-state', handler)
      return () => ipcRenderer.removeListener('terminal:host-state', handler)
    }
  },
  rpc: {
    invoke: (method, params) => ipcRenderer.invoke('rpc', { method, params })
  }
}

try {
  contextBridge.exposeInMainWorld('devstation', api)
} catch (error) {
  console.error('[DevStation preload] failed to expose API:', error)
}
