import { memo, useMemo } from 'react'
import Prism from 'prismjs'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-tsx'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-markdown'
import 'prismjs/components/prism-bash'
import 'prismjs/components/prism-powershell'
import 'prismjs/components/prism-yaml'
import 'prismjs/components/prism-sql'
import 'prismjs/components/prism-go'
import 'prismjs/components/prism-rust'
import 'prismjs/components/prism-python'
import 'prismjs/components/prism-java'
import 'prismjs/components/prism-c'
import 'prismjs/components/prism-cpp'
import 'prismjs/components/prism-csharp'

interface HighlightSegment {
  text: string
  types: string[]
}

interface LanguageDefinition {
  id: string
  label: string
  grammar: Prism.Grammar | null
}

const LANGUAGE_BY_EXTENSION: Record<string, { id: string; label: string }> = {
  ts: { id: 'typescript', label: 'TypeScript' },
  tsx: { id: 'tsx', label: 'TSX' },
  js: { id: 'javascript', label: 'JavaScript' },
  jsx: { id: 'jsx', label: 'JSX' },
  mjs: { id: 'javascript', label: 'JavaScript' },
  cjs: { id: 'javascript', label: 'JavaScript' },
  json: { id: 'json', label: 'JSON' },
  jsonc: { id: 'javascript', label: 'JSONC' },
  css: { id: 'css', label: 'CSS' },
  html: { id: 'markup', label: 'HTML' },
  htm: { id: 'markup', label: 'HTML' },
  xml: { id: 'markup', label: 'XML' },
  svg: { id: 'markup', label: 'SVG' },
  md: { id: 'markdown', label: 'Markdown' },
  mdx: { id: 'markdown', label: 'MDX' },
  yml: { id: 'yaml', label: 'YAML' },
  yaml: { id: 'yaml', label: 'YAML' },
  sh: { id: 'bash', label: 'Shell' },
  bash: { id: 'bash', label: 'Shell' },
  ps1: { id: 'powershell', label: 'PowerShell' },
  psm1: { id: 'powershell', label: 'PowerShell' },
  py: { id: 'python', label: 'Python' },
  go: { id: 'go', label: 'Go' },
  rs: { id: 'rust', label: 'Rust' },
  java: { id: 'java', label: 'Java' },
  c: { id: 'c', label: 'C' },
  h: { id: 'c', label: 'C' },
  cc: { id: 'cpp', label: 'C++' },
  cpp: { id: 'cpp', label: 'C++' },
  hpp: { id: 'cpp', label: 'C++' },
  cs: { id: 'csharp', label: 'C#' },
  sql: { id: 'sql', label: 'SQL' },
  toml: { id: 'plain', label: 'TOML' },
  ini: { id: 'plain', label: 'INI' },
  txt: { id: 'plain', label: 'Text' }
}

function languageForPath(path: string): LanguageDefinition {
  const fileName = path.split('/').at(-1)?.toLocaleLowerCase() ?? ''
  if (fileName === 'dockerfile') {
    return { id: 'bash', label: 'Dockerfile', grammar: Prism.languages.bash }
  }
  if (fileName === 'makefile') {
    return { id: 'plain', label: 'Makefile', grammar: null }
  }
  const extension = fileName.includes('.') ? (fileName.split('.').at(-1) ?? '') : ''
  const language = LANGUAGE_BY_EXTENSION[extension] ?? { id: 'plain', label: 'Text' }
  return {
    ...language,
    grammar: language.id === 'plain' ? null : (Prism.languages[language.id] ?? null)
  }
}

function flattenTokens(
  stream: Prism.TokenStream,
  inheritedTypes: string[] = [],
  output: HighlightSegment[] = []
): HighlightSegment[] {
  if (typeof stream === 'string') {
    output.push({ text: stream, types: inheritedTypes })
    return output
  }
  if (Array.isArray(stream)) {
    for (const token of stream) flattenTokens(token, inheritedTypes, output)
    return output
  }
  const aliases =
    typeof stream.alias === 'string'
      ? [stream.alias]
      : Array.isArray(stream.alias)
        ? stream.alias
        : []
  return flattenTokens(
    stream.content,
    [...inheritedTypes, stream.type, ...aliases],
    output
  )
}

function highlightedLines(code: string, path: string): HighlightSegment[][] {
  const language = languageForPath(path)
  const segments =
    language.grammar === null
      ? [{ text: code, types: [] }]
      : flattenTokens(Prism.tokenize(code, language.grammar))
  const lines: HighlightSegment[][] = [[]]
  for (const segment of segments) {
    const parts = segment.text.split('\n')
    parts.forEach((text, index) => {
      if (text !== '') lines[lines.length - 1].push({ text, types: segment.types })
      if (index < parts.length - 1) lines.push([])
    })
  }
  return lines
}

export function languageLabelForPath(path: string): string {
  return languageForPath(path).label
}

export function CodeViewer({
  code,
  path
}: {
  code: string
  path: string
}): React.ReactElement {
  const lines = useMemo(() => highlightedLines(code, path), [code, path])
  const lineNumberWidth = Math.max(3, String(lines.length).length + 1)
  return (
    <div className="code-viewer min-w-max py-2" role="region" aria-label="代码内容">
      {lines.map((line, index) => (
        <div className="code-viewer-line" key={index}>
          <span
            className="code-viewer-line-number"
            style={{ width: `${lineNumberWidth}ch` }}
            aria-hidden="true"
          >
            {index + 1}
          </span>
          <code className="code-viewer-code">
            {line.length === 0 ? ' ' : <TokenSegments segments={line} />}
          </code>
        </div>
      ))}
    </div>
  )
}

export const SyntaxCode = memo(function SyntaxCode({
  code,
  path
}: {
  code: string
  path: string
}): React.ReactElement {
  const segments = useMemo(() => highlightedLines(code, path)[0] ?? [], [code, path])
  return <TokenSegments segments={segments} />
})

function TokenSegments({
  segments
}: {
  segments: HighlightSegment[]
}): React.ReactElement {
  return (
    <>
      {segments.map((segment, index) => (
        <span
          className={
            segment.types.length === 0 ? undefined : `token ${segment.types.join(' ')}`
          }
          key={`${index}:${segment.text}`}
        >
          {segment.text}
        </span>
      ))}
    </>
  )
}
