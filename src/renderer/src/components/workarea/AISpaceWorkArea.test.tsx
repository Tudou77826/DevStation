// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AISpaceWorkArea } from './AISpaceWorkArea'

const mocks = vi.hoisted(() => ({
  data: {
    projects: [
      {
        id: 'project-1',
        name: 'DevStation',
        path: 'D:/dev/DevStation',
        pathKey: 'd:/dev/devstation',
        repoUrl: '',
        createdAt: 1,
        updatedAt: 1
      }
    ],
    sessionsByProject: {} as Record<string, unknown[]>
  },
  nav: {
    selectedProjectId: 'project-1',
    selectedSessionId: 'session-1',
    rightPanelOpen: true,
    aiRightPanelView: 'changes' as const,
    showAiRightPanel: vi.fn(),
    selectProject: vi.fn()
  },
  terminalContext: vi.fn()
}))

vi.mock('@/store/data', () => ({
  useDataStore: (selector: (state: typeof mocks.data) => unknown) => selector(mocks.data)
}))

vi.mock('@/store/nav', () => ({
  useNavStore: (selector: (state: typeof mocks.nav) => unknown) => selector(mocks.nav)
}))

vi.mock('@/components/terminal/TerminalPane', () => ({
  TerminalPane: ({ context }: { context: unknown }) => {
    mocks.terminalContext(context)
    return <div>terminal ready</div>
  }
}))

afterEach(() => {
  cleanup()
  mocks.data.sessionsByProject = {}
  vi.clearAllMocks()
})

describe('AI workspace startup restoration', () => {
  it('waits for persisted session data before connecting a terminal', () => {
    const view = render(<AISpaceWorkArea />)

    expect(screen.getByLabelText('正在恢复 Agent 会话')).toBeTruthy()
    expect(mocks.terminalContext).not.toHaveBeenCalled()

    mocks.data.sessionsByProject = {
      'project-1': [
        {
          id: 'session-1',
          taskId: 'task-1',
          projectId: 'project-1',
          title: 'Agent 验收会话',
          status: 'idle',
          agentType: 'opencode',
          agentSessionId: null,
          lastOpenedAt: null,
          createdAt: 1,
          updatedAt: 1
        }
      ]
    }
    view.rerender(<AISpaceWorkArea />)

    expect(screen.getByText('terminal ready')).toBeTruthy()
    expect(mocks.terminalContext).toHaveBeenLastCalledWith({
      type: 'session',
      sessionId: 'session-1'
    })
  })
})
