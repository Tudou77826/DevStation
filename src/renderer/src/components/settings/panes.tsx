import { Github } from 'lucide-react'
import {
  SettingsSection,
  SettingsRow,
  SettingsSwitch,
  SettingsSegmentedControl
} from './SettingsControls'
import { useThemeStore, type ThemeChoice } from '@/store/theme'
import { useNavStore } from '@/store/nav'

export function AppearancePane(): React.ReactElement {
  const choice = useThemeStore((s) => s.choice)
  const setChoice = useThemeStore((s) => s.setChoice)
  const sidebarCollapsed = useNavStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useNavStore((s) => s.toggleSidebar)
  const rightPanelOpen = useNavStore((s) => s.rightPanelOpen)
  const toggleRightPanel = useNavStore((s) => s.toggleRightPanel)

  return (
    <SettingsSection
      id="appearance"
      title="外观"
      description="自定义 DevStation 的整体视觉风格与布局密度。"
    >
      <SettingsSubHeader title="主题" />
      <SettingsRow
        label="配色模式"
        description="选择应用的明暗配色。「跟随系统」会与操作系统设置同步。"
        control={
          <SettingsSegmentedControl<ThemeChoice>
            ariaLabel="配色模式"
            value={choice}
            onChange={setChoice}
            options={[
              { value: 'system', label: '跟随系统' },
              { value: 'dark', label: '暗色' },
              { value: 'light', label: '亮色' }
            ]}
          />
        }
      />

      <SettingsSubHeader title="布局" />
      <SettingsRow
        label="收起侧边栏二级目录"
        description="仅保留左侧图标栏，获得更大的工作区域。"
        control={
          <SettingsSwitch
            checked={sidebarCollapsed}
            onChange={toggleSidebar}
            ariaLabel="收起侧边栏"
          />
        }
      />
      <SettingsRow
        label="显示右侧概览面板"
        description="展示任务摘要、Agent 状态与代码变更概览。"
        control={
          <SettingsSwitch
            checked={rightPanelOpen}
            onChange={toggleRightPanel}
            ariaLabel="右侧面板"
          />
        }
      />
    </SettingsSection>
  )
}

function SettingsSubHeader({ title }: { title: string }): React.ReactElement {
  return <h3 className="pt-4 text-[13px] font-semibold text-foreground">{title}</h3>
}

export function GeneralPane(): React.ReactElement {
  return (
    <SettingsSection id="general" title="通用" description="应用的基础行为与默认值。">
      <SettingsRow
        label="启动时恢复工作现场"
        description="自动恢复上次使用的一级入口、任务、项目、Agent 会话和面板布局。"
        control={<FactValue tone="active">已启用</FactValue>}
      />
      <SettingsRow
        label="Git 状态与 Diff"
        description="当前仅校验 Git 项目目录；状态刷新和 Diff 评审将在 M5 接入。"
        control={<FactValue>M5</FactValue>}
      />
      <SettingsRow
        label="发送匿名使用统计"
        description="当前版本不采集或发送使用统计。"
        control={<FactValue>未启用</FactValue>}
      />
    </SettingsSection>
  )
}

function FactValue({
  children,
  tone = 'neutral'
}: {
  children: React.ReactNode
  tone?: 'neutral' | 'active'
}): React.ReactElement {
  return (
    <span
      className={
        tone === 'active'
          ? 'rounded-md border border-status-success/25 bg-status-success/10 px-2.5 py-1 text-[11px] font-medium text-status-success'
          : 'rounded-md border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground'
      }
    >
      {children}
    </span>
  )
}

export function TerminalPane(): React.ReactElement {
  return (
    <SettingsSection
      id="terminal"
      title="终端"
      badge="M3.2 可用"
      description="AI 主工作区使用本地 PowerShell，并通过独立 PTY 宿主保持运行和接回。"
    >
      <SettingsRow
        label="默认 Shell"
        description="新建终端时使用的 Shell。"
        control={
          <span className="rounded-md border border-border bg-background px-2.5 py-1 font-mono text-[12px] text-muted-foreground">
            {defaultShell()}
          </span>
        }
      />
      <SettingsRow
        label="字体大小"
        description="终端文字大小（像素）。"
        control={
          <span className="rounded-md border border-border bg-background px-2.5 py-1 text-[12px] text-muted-foreground">
            13 px
          </span>
        }
      />
      <SettingsRow
        label="滚动缓冲行数"
        control={
          <span className="rounded-md border border-border bg-background px-2.5 py-1 text-[12px] text-muted-foreground">
            10000
          </span>
        }
      />
    </SettingsSection>
  )
}

function defaultShell(): string {
  if (typeof navigator === 'undefined') return 'powershell'
  return navigator.platform.includes('Win') ? 'powershell' : 'bash'
}

export function AboutPane(): React.ReactElement {
  return (
    <SettingsSection id="about" title="关于" description="DevStation 版本与项目信息。">
      <div className="flex items-center gap-4 py-2">
        <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-[18px] font-bold text-primary-foreground">
          D
        </div>
        <div>
          <div className="text-[15px] font-semibold text-foreground">DevStation</div>
          <div className="text-[12px] text-muted-foreground">版本 0.1.0 · MVP M3.2</div>
        </div>
      </div>
      <p className="max-w-xl py-2 text-[13px] leading-relaxed text-muted-foreground">
        本地 AI 辅助研发桌面应用。当前已打通手动建任务、关联 Git 项目、创建工作会话和运行
        OpenCode 的本地闭环；Hook 状态与 Diff 评审仍在建设中。
      </p>
      <div className="py-2">
        <a
          href="https://github.com/Tudou77826/DevStation"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <Github size={13} />
          GitHub 仓库
        </a>
      </div>
    </SettingsSection>
  )
}
