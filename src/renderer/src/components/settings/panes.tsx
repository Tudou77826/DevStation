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
        label="启动时恢复上次会话"
        description="重新打开 DevStation 时，自动定位到上次使用的任务与工作会话。"
        control={<SettingsSwitch checked onChange={() => {}} ariaLabel="恢复会话" />}
      />
      <SettingsRow
        label="自动刷新 Git 状态"
        description="当 Agent 修改文件后，自动检测工作区变更。"
        control={<SettingsSwitch checked onChange={() => {}} ariaLabel="自动刷新 Git" />}
      />
      <SettingsRow
        label="发送匿名使用统计"
        description="帮助我们改进 DevStation。不包含任何代码或敏感数据。"
        control={
          <SettingsSwitch checked={false} onChange={() => {}} ariaLabel="使用统计" />
        }
      />
    </SettingsSection>
  )
}

export function TerminalPane(): React.ReactElement {
  return (
    <SettingsSection
      id="terminal"
      title="终端"
      badge="阶段 3"
      description="本地终端与 CLI Agent 运行相关配置。完整能力将在阶段 3 接入。"
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
            14 px
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
          <div className="text-[12px] text-muted-foreground">版本 0.1.0 · MVP 阶段 1</div>
        </div>
      </div>
      <p className="max-w-xl py-2 text-[13px] leading-relaxed text-muted-foreground">
        本地 AI 辅助研发桌面应用。验证一条本地研发链路：手动建任务 → 关联 Git 项目 → 运行
        CLI Agent → 跟踪状态 → 查看 Diff → 人工提交。
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
