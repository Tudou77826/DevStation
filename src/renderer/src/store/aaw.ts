// Awesome-Agent-Workflow (AAW) pipeline model.
//
// This mirrors AAW's flow.yaml DAG and per-step execution status. The MVP keeps
// this page as an explicit mock placeholder; real workflow integration is out
// of scope until a later product phase.
//
// Reference source: Awesome-Agent-Workflow's flow.yaml and Step schema.

/** AAW phase = one swimlane in the pipeline view. */
export type AawPhase =
  | 'init' // 初始化
  | 'design' // 系统设计
  | 'detail' // 详细设计
  | 'gate' // 质量门禁
  | 'impl' // 编码实现

/** Per-step lifecycle, matching AAW's Step.execution_status. */
export type AawStatus = 'ready' | 'running' | 'completed' | 'failed' | 'blocked'

export interface AawPhaseMeta {
  id: AawPhase
  label: string
  /** lucide icon name */
  icon: string
}

export interface AawNode {
  /** node template id, e.g. sr-design (matches flow.yaml key) */
  id: string
  label: string
  phase: AawPhase
  /** one-line responsibility */
  responsibility: string
  /** primary deliverable artifact (relative path) */
  artifact: string
  status: AawStatus
  /** quality-gate nodes branch the pipeline */
  isGate?: boolean
}

// ── Phases (swimlanes) ───────────────────────────────────────────────────────

export const AAW_PHASES: readonly AawPhaseMeta[] = [
  { id: 'init', label: '初始化', icon: 'power' },
  { id: 'design', label: '系统设计', icon: 'clipboard-list' },
  { id: 'detail', label: '详细设计', icon: 'drafting-compass' },
  { id: 'gate', label: '质量门禁', icon: 'shield-check' },
  { id: 'impl', label: '编码实现', icon: 'code-2' }
] as const

// ── The DAG (13 nodes) with a mock run paused mid-detail-design ──────────────
// Status tells a story: init + system-design done, currently running AS-IS
// analysis in detail design, gate + impl still ahead.

export const AAW_NODES: readonly AawNode[] = [
  // 初始化
  {
    id: 'sr-init',
    label: '仓库初始化',
    phase: 'init',
    responsibility: '创建 .sdd/ 结构、架构模板与编码规范',
    artifact: 'software_architecture.md',
    status: 'completed'
  },
  // 系统设计
  {
    id: 'sr-design',
    label: '系统需求设计',
    phase: 'design',
    responsibility: '决策树式问答完成系统需求设计',
    artifact: 'SR-design.md',
    status: 'completed'
  },
  {
    id: 'ar-clarify',
    label: 'AR 需求澄清',
    phase: 'design',
    responsibility: '提取单个 AR 范围，结合代码做差距分析',
    artifact: 'AR-clarify.md',
    status: 'completed'
  },
  {
    id: 'module-boundary-design',
    label: '模块边界设计',
    phase: 'design',
    responsibility: '识别受影响模块，定义边界与交互',
    artifact: 'module-boundary-design.md',
    status: 'completed'
  },
  // 详细设计
  {
    id: 'module-detail-design-split',
    label: '设计组拆分',
    phase: 'detail',
    responsibility: '按耦合度拆分为设计组（2-4 模块/组）',
    artifact: '设计组划分',
    status: 'completed'
  },
  {
    id: 'module-asis-analysis',
    label: 'AS-IS 逆向分析',
    phase: 'detail',
    responsibility: '逆向分析现有代码，建立事实索引',
    artifact: '*.context.md',
    status: 'running'
  },
  {
    id: 'module-tobe-design',
    label: 'TO-BE 目标态设计',
    phase: 'detail',
    responsibility: '基于 AS-IS 证据进行目标态设计（唯一正式规格）',
    artifact: '模块详细设计说明书.md',
    status: 'ready'
  },
  {
    id: 'module-test-design',
    label: '测试用例设计',
    phase: 'detail',
    responsibility: '按最小充分验证集设计测试（P0/P1/P2）',
    artifact: '模块测试用例设计.md',
    status: 'ready'
  },
  // 质量门禁
  {
    id: 'module-design-gate',
    label: '质量门禁审查',
    phase: 'gate',
    responsibility: '7 维度严格评审：证据充分性、边界清晰度、决策终局性',
    artifact: '模块设计门禁结果.md',
    status: 'ready',
    isGate: true
  },
  // 编码实现
  {
    id: 'task-split',
    label: '任务拆分',
    phase: 'impl',
    responsibility: '将已通过的设计拆分为有序任务文件',
    artifact: 'overview.md + tasks/',
    status: 'ready'
  },
  {
    id: 'task-dev',
    label: '任务实现',
    phase: 'impl',
    responsibility: '按序实现每个任务，执行测试，验证 DoD',
    artifact: '代码实现',
    status: 'ready'
  }
] as const

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Nodes belonging to a phase, in DAG order. */
export function nodesOfPhase(phase: AawPhase): readonly AawNode[] {
  return AAW_NODES.filter((n) => n.phase === phase)
}

/** Overall progress as [completed, total]. */
export function pipelineProgress(): {
  completed: number
  total: number
  running: boolean
} {
  const total = AAW_NODES.length
  const completed = AAW_NODES.filter((n) => n.status === 'completed').length
  const running = AAW_NODES.some((n) => n.status === 'running')
  return { completed, total, running }
}

// ── Mock workflow context (which SR this pipeline belongs to) ────────────────

export const AAW_CONTEXT = {
  srId: 'SR-AUTH',
  title: '实现用户登录态校验',
  branch: 'feat/auth-guard',
  mode: '免拆分 AR' as const
}
