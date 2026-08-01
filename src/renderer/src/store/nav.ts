// Navigation model for the left sidebar and the center work area.
// Stage 1 uses mock data only; Stage 2 swaps this for SQLite-backed state.
//
// Key rule (MVP plan §4): the CENTER WORK AREA must change with the active
// primary section. The 4 tabs (对话/变更/终端/文件) belong ONLY to the
// AI Space session view; 任务面板 shows a task list; 工作流 shows a placeholder.
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
    { id: 'in-progress', label: '进行中', icon: 'circle-dot' },
    { id: 'done', label: '已完成', icon: 'check-check' }
  ],
  'ai-space': [
    { id: 'projects', label: '项目', icon: 'folder-git-2' },
    { id: 'sessions', label: '工作会话', icon: 'messages-square' }
  ],
  workflow: [
    { id: 'overview', label: '流程总览', icon: 'git-branch' },
    { id: 'templates', label: '模板', icon: 'layout-template' }
  ]
} as const

// ── Mock domain data: REMOVED in Stage 2 ────────────────────────────────────
// Task/Project/Session now live in the SQLite-backed data store
// (src/renderer/src/store/data.ts) via the RPC layer. The nav store keeps only
// UI navigation state (active section, selection, panel widths).

// ── Store ───────────────────────────────────────────────────────────────────

interface NavState {
  /** active primary section — drives which center view is rendered */
  activeSection: NavSection
  /** active secondary nav id, scoped per-section */
  activeSecondaryId: Record<NavSection, string>
  sidebarCollapsed: boolean

  /** AI Space session work tab (对话/变更/终端/文件) */
  activeWorkTab: WorkAreaTab

  /** selected task id in 任务面板 */
  selectedTaskId: string | null

  rightPanelOpen: boolean

  /** resizable panel widths (px) */
  sidebarWidth: number
  rightPanelWidth: number

  setSection: (section: NavSection) => void
  setSecondary: (id: string) => void
  toggleSidebar: () => void
  setWorkTab: (tab: WorkAreaTab) => void
  selectTask: (id: string | null) => void
  toggleRightPanel: () => void
  setSidebarWidth: (w: number) => void
  setRightPanelWidth: (w: number) => void
}

export const useNavStore = create<NavState>((set) => ({
  activeSection: 'tasks',
  activeSecondaryId: {
    tasks: 'all',
    'ai-space': 'sessions',
    workflow: 'overview'
  },
  sidebarCollapsed: false,
  activeWorkTab: 'conversation',
  selectedTaskId: 't-1',
  rightPanelOpen: true,
  sidebarWidth: 240,
  rightPanelWidth: 320,

  setSection: (section) => set({ activeSection: section }),
  setSecondary: (id) =>
    set((s) => ({
      activeSecondaryId: { ...s.activeSecondaryId, [s.activeSection]: id }
    })),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setWorkTab: (tab) => set({ activeWorkTab: tab }),
  selectTask: (id) => set({ selectedTaskId: id }),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
  setSidebarWidth: (w) => set({ sidebarWidth: clamp(w, 200, 360) }),
  setRightPanelWidth: (w) => set({ rightPanelWidth: clamp(w, 260, 480) })
}))

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Helper: resolve the secondary id for a given section. */
export function secondaryIdOf(
  state: Pick<NavState, 'activeSecondaryId'>,
  section: NavSection
): string {
  return state.activeSecondaryId[section]
}
