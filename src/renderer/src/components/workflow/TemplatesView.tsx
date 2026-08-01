import { GitBranch, Bug, Wrench, Rocket } from 'lucide-react'
import type { AawPhase } from '@/store/aaw'
import { AAW_PHASES } from '@/store/aaw'
import { cn } from '@/lib/utils'

interface Template {
  id: string
  icon: typeof GitBranch
  title: string
  desc: string
  /** which AAW phases this template emphasizes */
  phases: readonly AawPhase[]
}

const TEMPLATES: readonly Template[] = [
  {
    id: 'feature',
    icon: GitBranch,
    title: 'Feature 开发',
    desc: '从需求澄清到编码实现的完整 SDD 链路',
    phases: ['design', 'detail', 'gate', 'impl']
  },
  {
    id: 'bugfix',
    icon: Bug,
    title: 'Bug 修复',
    desc: '聚焦 AS-IS 根因分析与最小变更验证',
    phases: ['detail', 'gate', 'impl']
  },
  {
    id: 'refactor',
    icon: Wrench,
    title: '重构',
    desc: '保留行为的前提下改进结构，门禁严控回归',
    phases: ['detail', 'gate', 'impl']
  },
  {
    id: 'greenfield',
    icon: Rocket,
    title: '全新项目',
    desc: '从仓库初始化开始的完整流程',
    phases: ['init', 'design', 'detail', 'gate', 'impl']
  }
] as const

export function TemplatesView(): React.ReactElement {
  return (
    <div>
      <h1 className="text-[20px] font-semibold text-foreground">工作流模板</h1>
      <p className="mt-2 text-[13px] text-muted-foreground">
        不同研发场景对应不同的 AAW 阶段组合。阶段 1
        仅展示模板;后续阶段可基于模板创建工作流。
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {TEMPLATES.map((tpl) => (
          <TemplateCard key={tpl.id} template={tpl} />
        ))}
      </div>
    </div>
  )
}

function TemplateCard({ template }: { template: Template }): React.ReactElement {
  return (
    <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-muted-foreground/40">
      <div className="flex items-center gap-2">
        <template.icon size={18} className="text-muted-foreground" strokeWidth={1.75} />
        <span className="text-[13px] font-medium text-foreground">{template.title}</span>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">
        {template.desc}
      </p>

      {/* which phases this template passes through */}
      <div className="mt-3 flex flex-wrap gap-1">
        {template.phases.map((ph) => {
          const meta = AAW_PHASES.find((p) => p.id === ph)
          return (
            <span
              key={ph}
              className={cn(
                'rounded px-1.5 py-0.5 text-[10px] font-medium',
                'bg-secondary text-secondary-foreground'
              )}
            >
              {meta?.label ?? ph}
            </span>
          )
        })}
      </div>
    </div>
  )
}
