// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FilesPanel } from './FilesPanel'

const actions = { refreshFiles: vi.fn(), openFile: vi.fn(), closeFile: vi.fn() }
const state: Record<string, unknown> = {
  files: [],
  filesTruncated: false,
  preview: null,
  loading: false,
  error: null,
  ...actions
}
vi.mock('@/store/review', () => ({
  useReviewStore: (selector: (value: typeof state) => unknown) => selector(state)
}))

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(state, {
    files: [],
    filesTruncated: false,
    preview: null,
    loading: false,
    error: null
  })
})

describe('FilesPanel', () => {
  it('filters the repository file context and opens a bounded preview', () => {
    state.files = [{ path: 'src/a.ts' }, { path: 'docs/readme.md' }]
    render(<FilesPanel sessionId="s1" />)
    expect(
      screen.getByRole('treeitem', { name: /src/ }).getAttribute('aria-expanded')
    ).toBe('true')
    fireEvent.change(screen.getByPlaceholderText('筛选文件'), {
      target: { value: 'readme' }
    })
    expect(screen.queryByText('a.ts')).toBeNull()
    fireEvent.click(screen.getByText('readme.md'))
    expect(actions.openFile).toHaveBeenCalledWith('s1', 'docs/readme.md')
  })

  it('collapses nested directories without hiding sibling branches', () => {
    state.files = [
      { path: 'src/components/a.ts' },
      { path: 'src/store/b.ts' },
      { path: 'docs/readme.md' }
    ]
    render(<FilesPanel sessionId="s1" />)

    fireEvent.click(screen.getByRole('button', { name: /src/ }))
    expect(screen.queryByText('a.ts')).toBeNull()
    expect(screen.getByText('readme.md')).toBeTruthy()
  })

  it('collapses and expands every folder from the shared tree controls', () => {
    state.files = [{ path: 'src/components/a.ts' }, { path: 'docs/readme.md' }]
    render(<FilesPanel sessionId="s1" />)

    fireEvent.click(screen.getByRole('button', { name: '全部收起文件夹' }))
    expect(screen.queryByText('a.ts')).toBeNull()
    expect(screen.queryByText('readme.md')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '全部展开文件夹' }))
    expect(screen.getByText('a.ts')).toBeTruthy()
    expect(screen.getByText('readme.md')).toBeTruthy()
  })

  it('renders text previews without interpreting their contents as HTML', () => {
    state.files = [{ path: 'unsafe.html' }]
    state.preview = {
      path: 'unsafe.html',
      kind: 'text',
      content: '<script>alert(1)</script>',
      size: 25
    }
    render(<FilesPanel sessionId="s1" />)
    expect(screen.getByRole('region', { name: '代码内容' }).textContent).toContain(
      '<script>alert(1)</script>'
    )
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByRole('complementary', { name: '项目文件导航' })).toBeTruthy()
    expect(screen.getByRole('treeitem', { name: 'unsafe.html' })).toBeTruthy()
  })
})
