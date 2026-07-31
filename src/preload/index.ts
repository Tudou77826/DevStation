// Preload runs in an isolated world: it is the ONLY bridge between the sandboxed
// Renderer and Node/Electron capabilities. Expose a whitelisted, frozen API.
import { contextBridge } from 'electron'
import type { DevStationAPI } from '@shared/types'

const api: DevStationAPI = {
  version: process.env['npm_package_version'] ?? '0.0.0',
  platform: process.platform
}

try {
  contextBridge.exposeInMainWorld('devstation', api)
} catch (error) {
  console.error('[DevStation preload] failed to expose API:', error)
}
