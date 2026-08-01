// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RightPanelDock } from './RightPanel'

const mocks = vi.hoisted(() => ({
  nav: {
    activeSection: 'tasks' as 'tasks' | 'ai-space' | 'workflow',
    openRightPanel: vi.fn(),
    showAiRightPanel: vi.fn()
  }
}))

vi.mock('@/store/nav', () => ({
  useNavStore: (selector: (state: typeof mocks.nav) => unknown) => selector(mocks.nav)
}))

vi.mock('@/store/data', () => ({
  useDataStore: vi.fn()
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.nav.activeSection = 'tasks'
})

describe('RightPanelDock', () => {
  it('always exposes a reopen action after the task companion panel is collapsed', () => {
    render(<RightPanelDock />)
    fireEvent.click(screen.getByRole('button', { name: '打开附属栏' }))
    expect(mocks.nav.openRightPanel).toHaveBeenCalledOnce()
  })

  it('switches to changes and files entry points in AI Space', () => {
    mocks.nav.activeSection = 'ai-space'
    render(<RightPanelDock />)

    fireEvent.click(screen.getByRole('button', { name: '打开变更' }))
    fireEvent.click(screen.getByRole('button', { name: '打开文件' }))

    expect(mocks.nav.showAiRightPanel).toHaveBeenNthCalledWith(1, 'changes')
    expect(mocks.nav.showAiRightPanel).toHaveBeenNthCalledWith(2, 'files')
  })
})
