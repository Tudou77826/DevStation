// Navigation model for the left sidebar and the center work area.
//
// Key rule: primary navigation owns the secondary navigation, while the
// center remains a single workspace. Details, files and changes belong to the
// contextual right inspector rather than introducing another nested split.
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { NavSection } from '@shared/types'

export const NAV_STORAGE_KEY = 'devstation.navigation'

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
  'ai-space': [],
  workflow: [
    { id: 'overview', label: '流程总览', icon: 'git-branch' },
    { id: 'templates', label: '模板', icon: 'layout-template' }
  ]
} as const

// Task/Project/Session live in the SQLite-backed data store
// (src/renderer/src/store/data.ts) via the RPC layer. The nav store keeps only
// UI navigation state (active section, selection, panel widths).

// ── Store ───────────────────────────────────────────────────────────────────

interface NavState {
  /** active primary section — drives which center view is rendered */
  activeSection: NavSection
  /** active secondary nav id, scoped per-section */
  activeSecondaryId: Record<NavSection, string>
  sidebarCollapsed: boolean

  /** selected task id in 任务面板 */
  selectedTaskId: string | null
  /** transient task draft; a task is not persisted until the user confirms it */
  taskCreateOpen: boolean

  /** AI Space tree selection and expansion. Projects are the tree roots. */
  selectedProjectId: string | null
  selectedSessionId: string | null
  expandedProjectIds: string[]

  rightPanelOpen: boolean
  /** Files and changes are AI-session context tools, never center-work tabs. */
  aiRightPanelView: 'changes' | 'files'

  /** resizable panel widths (px) */
  sidebarWidth: number
  rightPanelWidth: number

  setSection: (section: NavSection) => void
  setSecondary: (id: string) => void
  toggleSidebar: () => void
  selectTask: (id: string | null) => void
  startTaskCreation: () => void
  showTaskList: () => void
  selectProject: (id: string | null) => void
  selectSession: (id: string, projectId: string | null) => void
  toggleProjectExpanded: (id: string) => void
  toggleRightPanel: () => void
  openRightPanel: () => void
  closeRightPanel: () => void
  showAiRightPanel: (view: 'changes' | 'files') => void
  setSidebarWidth: (w: number) => void
  setRightPanelWidth: (w: number) => void
}

export const useNavStore = create<NavState>()(
  persist(
    (set) => ({
      activeSection: 'tasks',
      activeSecondaryId: {
        tasks: 'all',
        'ai-space': 'sessions',
        workflow: 'overview'
      },
      sidebarCollapsed: false,
      selectedTaskId: null,
      taskCreateOpen: false,
      selectedProjectId: null,
      selectedSessionId: null,
      expandedProjectIds: [],
      rightPanelOpen: true,
      aiRightPanelView: 'changes',
      sidebarWidth: 240,
      rightPanelWidth: 320,

      setSection: (section) =>
        set({
          activeSection: section,
          // The draft fields live in the task view. Leaving that workspace
          // discards the unsaved draft instead of returning to an empty shell.
          ...(section === 'tasks' ? {} : { taskCreateOpen: false })
        }),
      setSecondary: (id) =>
        set((s) => ({
          activeSecondaryId: { ...s.activeSecondaryId, [s.activeSection]: id },
          // Task secondary navigation always resolves to a list. Keeping a
          // detail open while its filter changes made the click appear broken.
          ...(s.activeSection === 'tasks'
            ? { selectedTaskId: null, taskCreateOpen: false }
            : {})
        })),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      selectTask: (id) => set({ selectedTaskId: id, taskCreateOpen: false }),
      startTaskCreation: () => set({ selectedTaskId: null, taskCreateOpen: true }),
      showTaskList: () => set({ selectedTaskId: null, taskCreateOpen: false }),
      selectProject: (id) =>
        set((state) => ({
          selectedProjectId: id,
          // Selecting a project means its plain PowerShell workspace. Agent
          // sessions remain explicit second-level tree selections.
          selectedSessionId: null,
          expandedProjectIds:
            id !== null && !state.expandedProjectIds.includes(id)
              ? [...state.expandedProjectIds, id]
              : state.expandedProjectIds
        })),
      selectSession: (id, projectId) =>
        set((state) => ({
          selectedSessionId: id,
          selectedProjectId: projectId,
          expandedProjectIds:
            projectId !== null && !state.expandedProjectIds.includes(projectId)
              ? [...state.expandedProjectIds, projectId]
              : state.expandedProjectIds
        })),
      toggleProjectExpanded: (id) =>
        set((state) => ({
          expandedProjectIds: state.expandedProjectIds.includes(id)
            ? state.expandedProjectIds.filter((projectId) => projectId !== id)
            : [...state.expandedProjectIds, id]
        })),
      toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),
      openRightPanel: () => set({ rightPanelOpen: true }),
      closeRightPanel: () => set({ rightPanelOpen: false }),
      showAiRightPanel: (view) => set({ aiRightPanelView: view, rightPanelOpen: true }),
      setSidebarWidth: (w) => set({ sidebarWidth: clamp(w, 200, 360) }),
      setRightPanelWidth: (w) => set({ rightPanelWidth: clamp(w, 300, 1200) })
    }),
    {
      name: NAV_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      // Persist only restorable UI facts. Actions and transient domain data
      // remain owned by Zustand and SQLite respectively.
      partialize: (state) => ({
        activeSection: state.activeSection,
        activeSecondaryId: state.activeSecondaryId,
        sidebarCollapsed: state.sidebarCollapsed,
        selectedTaskId: state.selectedTaskId,
        selectedProjectId: state.selectedProjectId,
        selectedSessionId: state.selectedSessionId,
        expandedProjectIds: state.expandedProjectIds,
        rightPanelOpen: state.rightPanelOpen,
        aiRightPanelView: state.aiRightPanelView,
        sidebarWidth: state.sidebarWidth,
        rightPanelWidth: state.rightPanelWidth
      })
    }
  )
)

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
