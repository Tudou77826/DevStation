import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, File, Folder, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FileTreeEntry {
  path: string
  prefix?: ReactNode
  suffix?: ReactNode
  secondary?: ReactNode
}

export interface FileTreeExpansionCommand {
  id: number
  expanded: boolean
}

interface DirectoryNode {
  kind: 'directory'
  name: string
  path: string
  children: TreeNode[]
}

interface FileNode {
  kind: 'file'
  name: string
  path: string
  entry: FileTreeEntry
}

type TreeNode = DirectoryNode | FileNode

export function FileTree({
  entries,
  ariaLabel,
  expansionCommand = null,
  onOpen
}: {
  entries: FileTreeEntry[]
  ariaLabel: string
  expansionCommand?: FileTreeExpansionCommand | null
  onOpen: (path: string) => void
}): React.ReactElement {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const nodes = useMemo(() => buildTree(entries), [entries])

  useEffect(() => {
    if (expansionCommand === null) return
    setCollapsed(expansionCommand.expanded ? new Set() : new Set(directoryPaths(nodes)))
  }, [expansionCommand, nodes])

  function toggle(path: string): void {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div role="tree" aria-label={ariaLabel} className="space-y-px">
      {nodes.map((node) => (
        <TreeRow
          key={`${node.kind}:${node.path}`}
          node={node}
          depth={0}
          collapsed={collapsed}
          onToggle={toggle}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}

function TreeRow({
  node,
  depth,
  collapsed,
  onToggle,
  onOpen
}: {
  node: TreeNode
  depth: number
  collapsed: Set<string>
  onToggle: (path: string) => void
  onOpen: (path: string) => void
}): React.ReactElement {
  if (node.kind === 'directory') {
    const isCollapsed = collapsed.has(node.path)
    return (
      <div role="treeitem" aria-expanded={!isCollapsed}>
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          className="group flex h-7 w-full items-center gap-1 rounded-md pr-2 text-left text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          style={{ paddingLeft: depth * 12 + 4 }}
          title={node.path}
        >
          {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          {isCollapsed ? <Folder size={13} /> : <FolderOpen size={13} />}
          <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
          <span className="text-[9px] tabular-nums text-muted-foreground/60">
            {countFiles(node)}
          </span>
        </button>
        {!isCollapsed && (
          <div role="group">
            {node.children.map((child) => (
              <TreeRow
                key={`${child.kind}:${child.path}`}
                node={child}
                depth={depth + 1}
                collapsed={collapsed}
                onToggle={onToggle}
                onOpen={onOpen}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      role="treeitem"
      onClick={() => onOpen(node.path)}
      className={cn(
        'group flex min-h-7 w-full items-start gap-1.5 rounded-md py-1 pr-2 text-left text-[11px]',
        'text-foreground/90 hover:bg-accent hover:text-foreground'
      )}
      style={{ paddingLeft: depth * 12 + 18 }}
      title={node.path}
    >
      {node.entry.prefix ?? (
        <File size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{node.name}</span>
        {node.entry.secondary !== undefined && (
          <span className="mt-0.5 block truncate text-[9px] text-muted-foreground">
            {node.entry.secondary}
          </span>
        )}
      </span>
      {node.entry.suffix}
    </button>
  )
}

function buildTree(entries: FileTreeEntry[]): TreeNode[] {
  const root: DirectoryNode = { kind: 'directory', name: '', path: '', children: [] }

  for (const entry of entries) {
    const segments = entry.path.split('/').filter(Boolean)
    if (segments.length === 0) continue
    let directory = root
    for (let index = 0; index < segments.length - 1; index += 1) {
      const name = segments[index]
      const path = segments.slice(0, index + 1).join('/')
      let child = directory.children.find(
        (candidate): candidate is DirectoryNode =>
          candidate.kind === 'directory' && candidate.name === name
      )
      if (child === undefined) {
        child = { kind: 'directory', name, path, children: [] }
        directory.children.push(child)
      }
      directory = child
    }
    directory.children.push({
      kind: 'file',
      name: segments.at(-1)!,
      path: entry.path,
      entry
    })
  }

  sortNodes(root.children)
  return root.children
}

function sortNodes(nodes: TreeNode[]): void {
  nodes.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
    return left.name.localeCompare(right.name)
  })
  for (const node of nodes) {
    if (node.kind === 'directory') sortNodes(node.children)
  }
}

function countFiles(node: DirectoryNode): number {
  return node.children.reduce(
    (count, child) => count + (child.kind === 'file' ? 1 : countFiles(child)),
    0
  )
}

function directoryPaths(nodes: TreeNode[]): string[] {
  return nodes.flatMap((node) =>
    node.kind === 'directory' ? [node.path, ...directoryPaths(node.children)] : []
  )
}
