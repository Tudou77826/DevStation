/** Read-only repository review contracts shared across Electron processes. */

export type GitArea = 'staged' | 'worktree'
export type GitFileStatus =
  'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unmerged' | 'untracked'

export interface GitChange {
  path: string
  previousPath: string | null
  stagedStatus: GitFileStatus | null
  worktreeStatus: GitFileStatus | null
  conflicted: boolean
}

export interface GitRepositorySnapshot {
  branch: string | null
  head: string | null
  detached: boolean
  changes: GitChange[]
  refreshedAt: number
  truncated: boolean
}

export type GitDiffLineKind = 'context' | 'addition' | 'deletion' | 'meta'

export interface GitDiffLine {
  kind: GitDiffLineKind
  oldLine: number | null
  newLine: number | null
  text: string
}

export interface GitDiffHunk {
  header: string
  lines: GitDiffLine[]
}

export interface GitFileDiff {
  path: string
  area: GitArea
  kind: 'text' | 'binary' | 'too-large' | 'empty'
  oldPath: string | null
  hunks: GitDiffHunk[]
}

export interface GitWorkspaceFile {
  path: string
}

export interface GitWorkspaceFileList {
  files: GitWorkspaceFile[]
  truncated: boolean
}

export interface GitFilePreview {
  path: string
  kind: 'text' | 'binary' | 'too-large'
  content: string
  size: number
}
