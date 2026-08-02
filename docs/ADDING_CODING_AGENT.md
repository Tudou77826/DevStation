# 添加 Coding Agent 适配器

本文说明如何把一个新的 CLI Coding Agent 接入 DevStation。完整适配仍需编写并测试内置 Adapter；设置页面只负责引导用户启用和配置已经实现的 Adapter。

架构边界见[适配设计](./PLAN.md#coding-agent-适配设计)，实际接口以 [`src/main/agents/`](../src/main/agents/) 为准。

## 接入边界

新增 Agent 应只扩展适配层和组合根，不修改 `TerminalManager`、Terminal Host、Session Schema 或 Renderer 的供应商逻辑。

| 位置                         | 需要提供的事实                                            |
| ---------------------------- | --------------------------------------------------------- |
| `AgentDescriptor`            | 稳定小写 ID、名称、真实能力、版本化设置 Schema 和引导步骤 |
| `probe`                      | 只读检测 CLI 和版本；不登录、不升级、不修改用户配置       |
| `buildLaunch`                | 返回结构化 `executable / args / env`，不返回 Shell 字符串 |
| `buildResume`                | 根据已校验引用生成恢复 argv；不支持恢复时返回 `null`      |
| `validateSessionRef`         | 校验引用种类、长度和供应商格式，拒绝控制字符与选项注入    |
| `sessionLocator`（可选）     | 安全发现原生会话；失败不得影响终端使用                    |
| `managedIntegration`（可选） | 检查、安装、修复和卸载带 DevStation 标识的 Hook/Plugin    |

能力必须按当前实现声明。没有可靠事件来源时，`activityEvents` 必须为 `false`；PTY 存活不能被解释为 Agent 正在工作。

## 实施步骤

1. 在 `src/main/agents/<agent>-adapter.ts` 实现 `CodingAgentAdapter`。`agentId` 必须匹配 `^[a-z0-9][a-z0-9._-]{0,63}$`；参考 [`opencode-adapter.ts`](../src/main/agents/opencode-adapter.ts)，不要复制其中的供应商规则。
2. 如需从本地索引发现原生会话，把只读访问封装在同目录的 Locator 中，再通过 Adapter 的 `sessionLocator` 暴露统一引用。
3. 使用 [`probeCli`](../src/main/agents/cli-probe.ts) 完成可用性检测；使用 Adapter 返回的结构化参数，统一安全编码由 [`agent-launch.ts`](../src/main/agents/agent-launch.ts) 负责。
4. 在 [`src/main/index.ts`](../src/main/index.ts) 的组合根注册 Adapter。注册键必须匹配 Session 保存的 `agentId`。
5. 创建该 Agent 的 Session。当前可由 `SessionRepo.createFromTask(taskId, agentId)` 写入绑定；用户选择和默认 Agent 将由设置中心统一承载。
6. 添加 Adapter 契约测试和显式启用的本机 Smoke，再运行 `npm run verify:pr`。

## 接入供应商事件

供应商 Hook/Plugin 只负责把原生事件转换为版本化 `AgentEvent`，再原子写入统一收件箱；状态归约、去重、跨重启重放和界面刷新由核心链路处理。参考 [`opencode-managed-integration.ts`](../src/main/agents/opencode-managed-integration.ts)，但事件名、会话规则和配置方式必须以目标 Agent 的官方契约为准。

- 启动时使用 Main 注入的 Session ID、`agentRunId`、收件箱和随机令牌，不接受 Renderer 提供这些值。
- 只绑定目标项目、本次启动的顶层会话；恢复时只接受 Adapter 已校验的原生引用。
- 配置写入必须带稳定的 DevStation 标识，可重复执行、可诊断、可卸载，且不得覆盖同路径的用户内容。
- Hook/Plugin 缺失或损坏时降级为终端与原生恢复，不能用 PTY 存活伪造 Agent 状态。

## 必测风险

- 新建、热接回和 PTY 结束后的冷恢复使用正确 argv。
- 恶意或损坏的原生引用被拒绝，不能降级为新会话。
- 参数中的引号、分号和空格只作为数据传入，不能形成新 PowerShell 命令。
- CLI 缺失、版本检测失败和本地索引不可用时，错误可诊断且不泄露路径或密钥。
- 原生会话发现只匹配当前项目、本次运行和供应商顶层会话。
- 事件映射覆盖工作、等待、完成、失败、结束和原生会话绑定；重复、乱序及旧运行事件不回退状态。
- 受管集成在非 DevStation 进程中静默，安装、升级和卸载不改变用户自有配置。
- 使用测试 Adapter 接入启动与恢复时，无需修改终端核心。

真实 Agent Smoke 必须显式启用，不能进入确定性 PR 门禁；`test:terminal` 继续只验证真实 PTY，不绑定任何 Agent CLI。

## 完成判断

满足以下条件才算完成接入：

- Adapter 已注册，Session 能保存并恢复其 `agentId` 和结构化引用。
- 能力声明与实际行为一致；缺少事件、恢复或 Transcript 时明确降级。
- 不接受 Renderer 提供的任意命令、参数、环境变量或 Hook 命令。
- Adapter、Runtime、Session 持久化兼容性及真实 CLI 链路均有对应验证。
- 新增供应商没有引入 `TerminalManager`、数据库和 UI 的供应商分支。
