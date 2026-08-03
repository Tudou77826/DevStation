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
    fireEvent.change(screen.getByPlaceholderText('筛选文件'), {
      target: { value: 'readme' }
    })
    expect(screen.queryByText('a.ts')).toBeNull()
    fireEvent.click(screen.getByText('readme.md'))
    expect(actions.openFile).toHaveBeenCalledWith('s1', 'docs/readme.md')
  })

  it('renders text previews without interpreting their contents as HTML', () => {
    state.preview = {
      path: 'unsafe.html',
      kind: 'text',
      content: '<script>alert(1)</script>',
      size: 25
    }
    render(<FilesPanel sessionId="s1" />)
    expect(screen.getByText('<script>alert(1)</script>')).toBeTruthy()
    expect(document.querySelector('script')).toBeNull()
  })
})
