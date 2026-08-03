// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FilesPanel } from './FilesPanel'

const actions = {
  refreshFiles: vi.fn(),
  loadDirectory: vi.fn(),
  openFile: vi.fn(),
  closeFile: vi.fn()
}
const state: Record<string, unknown> = {
  files: [],
  loadedDirectories: [],
  loadingDirectories: [],
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
    loadedDirectories: [],
    loadingDirectories: [],
    preview: null,
    loading: false,
    error: null
  })
})

describe('FilesPanel', () => {
  it('filters the repository file context and opens a bounded preview', () => {
    state.files = [
      { path: 'src', kind: 'directory' },
      { path: 'src/a.ts', kind: 'file' },
      { path: 'docs', kind: 'directory' },
      { path: 'docs/readme.md', kind: 'file' }
    ]
    state.loadedDirectories = ['', 'src', 'docs']
    render(<FilesPanel sessionId="s1" />)
    expect(
      screen.getByRole('treeitem', { name: /src/ }).getAttribute('aria-expanded')
    ).toBe('false')
    fireEvent.change(screen.getByPlaceholderText('筛选文件'), {
      target: { value: 'readme' }
    })
    expect(screen.queryByText('a.ts')).toBeNull()
    fireEvent.click(screen.getByText('readme.md'))
    expect(actions.openFile).toHaveBeenCalledWith('s1', 'docs/readme.md')
  })

  it('keeps large trees collapsed until the selected directory is opened', () => {
    state.files = [
      { path: 'src', kind: 'directory' },
      { path: 'src/components', kind: 'directory' },
      { path: 'src/components/a.ts', kind: 'file' },
      { path: 'src/store', kind: 'directory' },
      { path: 'src/store/b.ts', kind: 'file' },
      { path: 'docs', kind: 'directory' },
      { path: 'docs/readme.md', kind: 'file' }
    ]
    state.loadedDirectories = ['', 'src', 'src/components', 'src/store', 'docs']
    render(<FilesPanel sessionId="s1" />)

    fireEvent.click(screen.getByRole('button', { name: /src/ }))
    expect(actions.loadDirectory).toHaveBeenCalledWith('s1', 'src')
    expect(screen.getByText('components')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /components/ }))
    expect(screen.getByText('a.ts')).toBeTruthy()
    expect(screen.queryByText('readme.md')).toBeNull()
  })

  it('collapses and expands every folder from the shared tree controls', () => {
    state.files = [
      { path: 'src', kind: 'directory' },
      { path: 'src/components', kind: 'directory' },
      { path: 'src/components/a.ts', kind: 'file' },
      { path: 'docs', kind: 'directory' },
      { path: 'docs/readme.md', kind: 'file' }
    ]
    state.loadedDirectories = ['', 'src', 'src/components', 'docs']
    render(<FilesPanel sessionId="s1" />)

    fireEvent.click(screen.getByRole('button', { name: '全部展开文件夹' }))
    expect(screen.getByText('a.ts')).toBeTruthy()
    expect(screen.getByText('readme.md')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '全部收起文件夹' }))
    expect(screen.queryByText('a.ts')).toBeNull()
    expect(screen.queryByText('readme.md')).toBeNull()
  })

  it('summarizes a 2001-file directory without mounting every child row', () => {
    state.files = [
      { path: 'bulk', kind: 'directory' },
      ...Array.from({ length: 2_001 }, (_, index) => ({
        path: `bulk/file-${index.toString().padStart(4, '0')}.ts`,
        kind: 'file'
      }))
    ]
    state.loadedDirectories = ['', 'bulk']
    render(<FilesPanel sessionId="s1" />)

    expect(screen.getByText('已加载 2002 项')).toBeTruthy()
    expect(
      screen.getByRole('treeitem', { name: /bulk.*2001/ }).getAttribute('aria-expanded')
    ).toBe('false')
    expect(screen.queryByText('file-2000.ts')).toBeNull()
  })

  it('loads every discovered directory only when expand-all is requested', async () => {
    state.files = [
      { path: 'src', kind: 'directory' },
      { path: 'docs', kind: 'directory' }
    ]
    state.loadedDirectories = ['']
    render(<FilesPanel sessionId="s1" />)

    expect(actions.loadDirectory).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '全部展开文件夹' }))
    await waitFor(() => {
      expect(actions.loadDirectory).toHaveBeenCalledWith('s1', 'src')
      expect(actions.loadDirectory).toHaveBeenCalledWith('s1', 'docs')
    })
  })

  it('renders text previews without interpreting their contents as HTML', () => {
    state.files = [{ path: 'unsafe.html', kind: 'file' }]
    state.loadedDirectories = ['']
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
