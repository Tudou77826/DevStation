import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Link2,
  LoaderCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface FileTreeEntry {
  path: string
  kind?: 'directory' | 'file' | 'symlink'
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
  initiallyExpanded = true,
  forceExpanded = false,
  expansionCommand = null,
  loadedDirectories = null,
  loadingDirectories = [],
  onDirectoryToggle,
  onOpen
}: {
  entries: FileTreeEntry[]
  ariaLabel: string
  initiallyExpanded?: boolean
  forceExpanded?: boolean
  expansionCommand?: FileTreeExpansionCommand | null
  loadedDirectories?: string[] | null
  loadingDirectories?: string[]
  onDirectoryToggle?: (path: string, expanded: boolean) => void
  onOpen: (path: string) => void
}): React.ReactElement {
  const [baseExpanded, setBaseExpanded] = useState(initiallyExpanded)
  const [exceptions, setExceptions] = useState<Set<string>>(() => new Set())
  const nodes = useMemo(() => buildTree(entries), [entries])
  const loadedDirectorySet = useMemo(
    () => (loadedDirectories === null ? null : new Set(loadedDirectories)),
    [loadedDirectories]
  )
  const loadingDirectorySet = useMemo(
    () => new Set(loadingDirectories),
    [loadingDirectories]
  )

  useEffect(() => {
    if (expansionCommand === null) return
    setBaseExpanded(expansionCommand.expanded)
    setExceptions(new Set())
  }, [expansionCommand])

  useEffect(() => {
    if (!baseExpanded || loadedDirectorySet === null || onDirectoryToggle === undefined) {
      return
    }
    for (const path of directoryPaths(nodes)) {
      if (!loadedDirectorySet.has(path) && !loadingDirectorySet.has(path)) {
        onDirectoryToggle(path, true)
      }
    }
  }, [baseExpanded, loadedDirectorySet, loadingDirectorySet, nodes, onDirectoryToggle])

  function toggle(path: string): void {
    const currentlyExpanded = exceptions.has(path) ? !baseExpanded : baseExpanded
    setExceptions((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
    onDirectoryToggle?.(path, !currentlyExpanded)
  }

  return (
    <div role="tree" aria-label={ariaLabel} className="space-y-px">
      {nodes.map((node) => (
        <TreeRow
          key={`${node.kind}:${node.path}`}
          node={node}
          depth={0}
          baseExpanded={baseExpanded}
          forceExpanded={forceExpanded}
          exceptions={exceptions}
          loadedDirectories={loadedDirectorySet}
          loadingDirectories={loadingDirectorySet}
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
  baseExpanded,
  forceExpanded,
  exceptions,
  loadedDirectories,
  loadingDirectories,
  onToggle,
  onOpen
}: {
  node: TreeNode
  depth: number
  baseExpanded: boolean
  forceExpanded: boolean
  exceptions: Set<string>
  loadedDirectories: Set<string> | null
  loadingDirectories: Set<string>
  onToggle: (path: string) => void
  onOpen: (path: string) => void
}): React.ReactElement {
  if (node.kind === 'directory') {
    const isExpanded =
      forceExpanded || (exceptions.has(node.path) ? !baseExpanded : baseExpanded)
    const isLoaded = loadedDirectories === null || loadedDirectories.has(node.path)
    const isLoading = loadingDirectories.has(node.path)
    return (
      <div role="treeitem" aria-expanded={isExpanded}>
        <button
          type="button"
          onClick={() => onToggle(node.path)}
          className="group flex h-7 w-full items-center gap-1 rounded-md pr-2 text-left text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          style={{ paddingLeft: depth * 12 + 4 }}
          title={node.path}
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {isExpanded ? <FolderOpen size={13} /> : <Folder size={13} />}
          <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
          {isLoading ? (
            <LoaderCircle size={11} className="animate-spin text-muted-foreground/70" />
          ) : isLoaded ? (
            <span className="text-[9px] tabular-nums text-muted-foreground/60">
              {countFiles(node)}
            </span>
          ) : null}
        </button>
        {isExpanded && (
          <div role="group">
            {node.children.map((child) => (
              <TreeRow
                key={`${child.kind}:${child.path}`}
                node={child}
                depth={depth + 1}
                baseExpanded={baseExpanded}
                forceExpanded={forceExpanded}
                exceptions={exceptions}
                loadedDirectories={loadedDirectories}
                loadingDirectories={loadingDirectories}
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
      {node.entry.prefix ??
        (node.entry.kind === 'symlink' ? (
          <Link2 size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
        ) : (
          <File size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
        ))}
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
  const directories = new Map<string, DirectoryNode>([['', root]])

  for (const entry of entries) {
    const segments = entry.path.split('/').filter(Boolean)
    if (segments.length === 0) continue
    let directory = root
    const directoryDepth =
      entry.kind === 'directory' ? segments.length : segments.length - 1
    for (let index = 0; index < directoryDepth; index += 1) {
      const name = segments[index]
      const path = segments.slice(0, index + 1).join('/')
      let child = directories.get(path)
      if (child === undefined) {
        child = { kind: 'directory', name, path, children: [] }
        directory.children.push(child)
        directories.set(path, child)
      }
      directory = child
    }
    if (entry.kind === 'directory') continue
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
