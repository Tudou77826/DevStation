// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const storageKey = 'devstation.navigation'

describe('navigation work context persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
  })

  it('restores the active section, selected Agent session and panel layout', async () => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        state: {
          activeSection: 'ai-space',
          activeSecondaryId: {
            tasks: 'done',
            'ai-space': 'sessions',
            workflow: 'overview'
          },
          sidebarCollapsed: true,
          selectedTaskId: 'task-1',
          selectedProjectId: 'project-1',
          selectedSessionId: 'session-1',
          expandedProjectIds: ['project-1'],
          rightPanelOpen: false,
          aiRightPanelView: 'files',
          sidebarWidth: 280,
          rightPanelWidth: 360
        },
        version: 1
      })
    )

    const { useNavStore } = await import('./nav')

    expect(useNavStore.getState()).toMatchObject({
      activeSection: 'ai-space',
      selectedTaskId: 'task-1',
      selectedProjectId: 'project-1',
      selectedSessionId: 'session-1',
      expandedProjectIds: ['project-1'],
      sidebarCollapsed: true,
      rightPanelOpen: false,
      aiRightPanelView: 'files',
      sidebarWidth: 280,
      rightPanelWidth: 360
    })
  })

  it('treats a project click as selecting its plain PowerShell workspace', async () => {
    const { useNavStore } = await import('./nav')
    useNavStore.getState().selectSession('session-1', 'project-1')

    useNavStore.getState().selectProject('project-1')

    expect(useNavStore.getState()).toMatchObject({
      selectedProjectId: 'project-1',
      selectedSessionId: null,
      expandedProjectIds: ['project-1']
    })
  })

  it('keeps navigation and panel controls inside the persisted work context', async () => {
    const { secondaryIdOf, useNavStore } = await import('./nav')
    const actions = useNavStore.getState()

    actions.setSection('workflow')
    useNavStore.getState().setSecondary('templates')
    useNavStore.getState().toggleSidebar()
    useNavStore.getState().selectTask('task-2')
    useNavStore.getState().selectSession('session-without-project', null)
    useNavStore.getState().selectSession('session-2', 'project-2')
    useNavStore.getState().toggleProjectExpanded('project-3')
    useNavStore.getState().toggleProjectExpanded('project-3')
    useNavStore.getState().toggleProjectExpanded('project-3')
    useNavStore.getState().showAiRightPanel('files')
    useNavStore.getState().closeRightPanel()
    useNavStore.getState().openRightPanel()
    useNavStore.getState().toggleRightPanel()
    useNavStore.getState().setSidebarWidth(280)
    useNavStore.getState().setSidebarWidth(100)
    useNavStore.getState().setRightPanelWidth(360)
    useNavStore.getState().setRightPanelWidth(900)

    const state = useNavStore.getState()
    expect(secondaryIdOf(state, 'workflow')).toBe('templates')
    expect(state).toMatchObject({
      activeSection: 'workflow',
      sidebarCollapsed: true,
      selectedTaskId: 'task-2',
      selectedProjectId: 'project-2',
      selectedSessionId: 'session-2',
      expandedProjectIds: ['project-2', 'project-3'],
      rightPanelOpen: false,
      aiRightPanelView: 'files',
      sidebarWidth: 200,
      rightPanelWidth: 480
    })

    const persisted = JSON.parse(localStorage.getItem(storageKey) ?? '{}') as {
      state?: Record<string, unknown>
    }
    expect(persisted.state).toMatchObject({
      activeSection: 'workflow',
      selectedSessionId: 'session-2',
      sidebarWidth: 200,
      rightPanelWidth: 480
    })
  })
})
