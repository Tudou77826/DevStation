// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNavStore } from '@/store/nav'
import { Sidebar } from './Sidebar'

vi.mock('./IconRail', () => ({ IconRail: () => <div /> }))
vi.mock('./NavTree', () => ({ NavTree: () => <div /> }))
vi.mock('./UserMenu', () => ({ UserMenu: () => <div /> }))

beforeEach(() => {
  useNavStore.setState({ sidebarCollapsed: false, sidebarWidth: 240 })
})

afterEach(() => {
  fireEvent.mouseUp(document)
  cleanup()
})

describe('Sidebar resize', () => {
  it('tracks the pointer from one stable baseline without animated lag', () => {
    render(<Sidebar />)
    const separator = screen.getByRole('separator', {
      name: '拖拽调整侧边栏宽度'
    })
    const panel = screen.getByText('DevStation').parentElement?.parentElement
    expect(panel?.style.width).toBe('240px')
    expect(panel?.className).not.toContain('transition-[width]')
    expect(separator.getAttribute('title')).toBeNull()

    fireEvent.mouseDown(separator, { clientX: 100 })
    fireEvent.mouseMove(document, { clientX: 110 })
    expect(panel?.style.width).toBe('250px')
    fireEvent.mouseMove(document, { clientX: 120 })
    expect(panel?.style.width).toBe('260px')
  })
})
