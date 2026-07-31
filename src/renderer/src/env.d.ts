/// <reference types="vite/client" />
import type { DevStationAPI } from '@shared/types'

declare global {
  interface Window {
    devstation: DevStationAPI
  }
}
