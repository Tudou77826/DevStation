// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AboutPane, GeneralPane, TerminalPane } from './panes'

afterEach(cleanup)

describe('settings capability facts', () => {
  it('shows implemented work-context restoration without fake controls', () => {
    render(<GeneralPane />)

    expect(screen.getByText('启动时恢复工作现场')).toBeTruthy()
    expect(screen.getByText('已启用')).toBeTruthy()
    expect(screen.getByText('M5')).toBeTruthy()
    expect(screen.getByText('未启用')).toBeTruthy()
    expect(screen.queryAllByRole('switch')).toHaveLength(0)
  })

  it('shows stable terminal and About facts without a hard-coded project phase', () => {
    const { unmount } = render(<TerminalPane />)
    expect(screen.getByText('已可用')).toBeTruthy()
    expect(screen.getByText('13 px')).toBeTruthy()
    expect(screen.queryByText('阶段 3')).toBeNull()
    unmount()

    render(<AboutPane />)
    expect(screen.getByText('版本 0.1.0')).toBeTruthy()
    expect(screen.getByText(/Hook 状态与 Diff 评审仍在建设中/)).toBeTruthy()
    expect(screen.queryByText(/MVP M3\.2|MVP 阶段/)).toBeNull()
  })
})
