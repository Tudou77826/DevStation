// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { CodeViewer, languageLabelForPath } from './CodeViewer'

afterEach(cleanup)

describe('CodeViewer', () => {
  it('renders line numbers and language tokens as safe text nodes', () => {
    const { container } = render(
      <CodeViewer
        path="src/example.ts"
        code={'const value = "<script>alert(1)</script>"\nreturn value'}
      />
    )

    expect(screen.getByRole('region', { name: '代码内容' })).toBeTruthy()
    expect(container.querySelectorAll('.code-viewer-line')).toHaveLength(2)
    expect(container.querySelector('.token.keyword')?.textContent).toBe('const')
    expect(screen.getByText(/<script>alert\(1\)<\/script>/)).toBeTruthy()
    expect(container.querySelector('script')).toBeNull()
  })

  it('identifies common source and configuration formats', () => {
    expect(languageLabelForPath('src/view.tsx')).toBe('TSX')
    expect(languageLabelForPath('.github/workflows/release.yml')).toBe('YAML')
    expect(languageLabelForPath('unknown.data')).toBe('Text')
  })
})
