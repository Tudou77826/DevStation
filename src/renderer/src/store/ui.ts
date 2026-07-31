// UI-level state that is not domain data.
// Settings is a FULL-PAGE view (Orca pattern): the caller passes the current
// nav section into openSettings so closeSettings can restore it (Back button).
import { create } from 'zustand'
import type { NavSection } from '@shared/types'

export type SettingsSection = 'appearance' | 'general' | 'terminal' | 'about'

interface UIState {
  /** whether the settings full-page view is shown */
  settingsOpen: boolean
  /** the section currently selected in the settings sidebar */
  settingsSection: SettingsSection
  /** the primary nav section the user was in before opening settings (for Back) */
  previousNavSection: NavSection | null

  openSettings: (origin: NavSection, section?: SettingsSection) => void
  closeSettings: () => void
  setSettingsSection: (section: SettingsSection) => void
}

export const useUIStore = create<UIState>((set) => ({
  settingsOpen: false,
  settingsSection: 'appearance',
  previousNavSection: null,

  openSettings: (origin, section) =>
    set({
      settingsOpen: true,
      settingsSection: section ?? 'appearance',
      previousNavSection: origin
    }),
  closeSettings: () => set({ settingsOpen: false, previousNavSection: null }),
  setSettingsSection: (section) => set({ settingsSection: section })
}))
