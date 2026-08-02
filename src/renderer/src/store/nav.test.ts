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
})
