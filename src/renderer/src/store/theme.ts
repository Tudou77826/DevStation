// Theme store: resolves light/dark/system to the actual mode applied to <html>.
//
// The choice persists in localStorage so it survives reloads. The .dark class
// on <html> drives all CSS variables in main.css (:root = light, .dark = dark).
import { create } from 'zustand'

export type ThemeChoice = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'devstation.theme'
const MEDIA_QUERY = '(prefers-color-scheme: dark)'

function readStoredChoice(): ThemeChoice {
  const v = localStorage.getItem(STORAGE_KEY)
  if (v === 'light' || v === 'dark' || v === 'system') return v
  return 'dark' // DevStation is dark-first by default.
}

function systemPrefersDark(): boolean {
  return window.matchMedia(MEDIA_QUERY).matches
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  return choice === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : choice
}

function applyToDocument(theme: ResolvedTheme): void {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

// Notify the main process so the native window chrome (background + caption
// buttons) follows the app theme. No-op outside Electron (web preview).
function pushToMain(theme: ResolvedTheme): void {
  const api = (
    window as unknown as {
      devstation?: { theme?: { update?: (t: ResolvedTheme) => unknown } }
    }
  ).devstation?.theme?.update
  if (typeof api === 'function') {
    try {
      void api(theme)
    } catch {
      // best-effort; never let window-chrome sync break the UI
    }
  }
}

/** Apply theme to the document AND sync the native window chrome. */
function applyTheme(theme: ResolvedTheme): void {
  applyToDocument(theme)
  pushToMain(theme)
}

interface ThemeState {
  choice: ThemeChoice
  resolved: ResolvedTheme
  setChoice: (choice: ThemeChoice) => void
  /** toggle between light/dark, used by the quick switcher. */
  toggle: () => void
}

const initialChoice = readStoredChoice()

export const useThemeStore = create<ThemeState>((set, get) => ({
  choice: initialChoice,
  resolved: resolve(initialChoice),
  setChoice: (choice) => {
    localStorage.setItem(STORAGE_KEY, choice)
    const resolved = resolve(choice)
    applyTheme(resolved)
    set({ choice, resolved })
  },
  toggle: () => {
    get().setChoice(get().resolved === 'dark' ? 'light' : 'dark')
  }
}))

// Apply once at module load so the very first paint matches the stored choice.
applyTheme(resolve(initialChoice))

// React to OS theme changes while in 'system' mode.
if (typeof window !== 'undefined' && window.matchMedia !== undefined) {
  window.matchMedia(MEDIA_QUERY).addEventListener('change', () => {
    if (useThemeStore.getState().choice === 'system') {
      const resolved = systemPrefersDark() ? 'dark' : 'light'
      applyTheme(resolved)
      useThemeStore.setState({ resolved })
    }
  })
}
