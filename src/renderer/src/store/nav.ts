// Navigation model for the left sidebar.
// Stage 1 uses mock data only; Stage 2 swaps this for SQLite-backed state.
import { create } from 'zustand'
import type { NavSection, WorkAreaTab } from '@shared/types'

export interface NavPrimaryItem {
  id: NavSection
  label: string
  /** lucide icon name */
  icon: string
}

export interface NavSecondaryItem {
  id: string
  label: string
  icon: string
  /** optional badge count (e.g. pending tasks, running sessions) */
  badge?: number
}

export const PRIMARY_NAV: readonly NavPrimaryItem[] = [
  { id: 'tasks', label: '任务面板', icon: 'list-todo' },
  { id: 'ai-space', label: 'AI 空间', icon: 'bot' },
  { id: 'workflow', label: '工作流', icon: 'workflow' }
] as const

/** Secondary nav contents, keyed by the active primary section. */
export const SECONDARY_NAV: Record<NavSection, readonly NavSecondaryItem[]> = {
  tasks: [
    { id: 'all', label: '全部任务', icon: 'inbox' },
    { id: 'in-progress', label: '进行中', icon: 'circle-dot', badge: 2 },
    { id: 'done', label: '已完成', icon: 'check-check' }
  ],
  'ai-space': [
    { id: 'projects', label: '项目', icon: 'folder-git-2' },
    { id: 'sessions', label: '工作会话', icon: 'messages-square', badge: 3 }
  ],
  workflow: [
    { id: 'overview', label: '流程总览', icon: 'git-branch' },
    { id: 'templates', label: '模板', icon: 'layout-template' }
  ]
} as const

interface NavState {
  activeSection: NavSection
  activeSecondaryId: string
  collapsed: boolean
  activeWorkTab: WorkAreaTab
  rightPanelOpen: boolean
  setSection: (section: NavSection) => void
  setSecondary: (id: string) => void
  toggleCollapsed: () => void
  setWorkTab: (tab: WorkAreaTab) => void
  toggleRightPanel: () => void
}

export const useNavStore = create<NavState>((set) => ({
  activeSection: 'ai-space',
  activeSecondaryId: 'sessions',
  collapsed: false,
  activeWorkTab: 'conversation',
  rightPanelOpen: true,
  setSection: (section) =>
    set({ activeSection: section, activeSecondaryId: SECONDARY_NAV[section][0]?.id ?? '' }),
  setSecondary: (id) => set({ activeSecondaryId: id }),
  toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
  setWorkTab: (tab) => set({ activeWorkTab: tab }),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen }))
}))
