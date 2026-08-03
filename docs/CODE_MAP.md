# DevStation 代码地图

本文只回答“某项能力应该从哪里开始读”。实现细节以代码和测试为准。

## 能力定位

| 能力                   | 主入口                                                                                                                                                                          | 边界与测试                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 应用启动与窗口安全     | [`src/main/index.ts`](../src/main/index.ts)                                                                                                                                     | Preload、Electron E2E                                         |
| 领域与 Agent 契约      | [`src/shared/`](../src/shared/)                                                                                                                                                 | SQLite Schema、Adapter 契约测试                               |
| SQLite 与迁移          | [`src/main/db/`](../src/main/db/)                                                                                                                                               | `db/__tests__/`                                               |
| RPC 白名单             | [`src/main/rpc/`](../src/main/rpc/)                                                                                                                                             | `rpc/__tests__/`                                              |
| Renderer 数据状态      | [`store/data.ts`](../src/renderer/src/store/data.ts)                                                                                                                            | `data.test.ts`                                                |
| 任务主工作区           | [`TaskPanel.tsx`](../src/renderer/src/components/tasks/TaskPanel.tsx)                                                                                                           | `TaskPanel`、`TaskDetailView` 测试                            |
| 导航、现场恢复与右栏   | [`store/nav.ts`](../src/renderer/src/store/nav.ts)                                                                                                                              | `nav.test.ts`、Electron E2E                                   |
| 工作会话入口           | [`SessionList.tsx`](../src/renderer/src/components/ai-space/SessionList.tsx)                                                                                                    | `SessionList.test.tsx`、E2E                                   |
| AI 主工作区            | [`AISpaceWorkArea.tsx`](../src/renderer/src/components/workarea/AISpaceWorkArea.tsx)                                                                                            | Electron E2E                                                  |
| 工作流展示占位         | [`WorkflowPanel.tsx`](../src/renderer/src/components/workflow/WorkflowPanel.tsx)                                                                                                | `store/aaw.ts`，当前仅为模拟数据                              |
| xterm 生命周期         | [`TerminalPane.tsx`](../src/renderer/src/components/terminal/TerminalPane.tsx)                                                                                                  | `TerminalPane.test.tsx`                                       |
| 终端上下文与权限       | [`terminal-manager.ts`](../src/main/terminal/terminal-manager.ts)                                                                                                               | `terminal-manager.test.ts`                                    |
| 独立 PTY 宿主          | [`terminal-host.ts`](../src/main/terminal/terminal-host.ts)                                                                                                                     | host、client、protocol 测试                                   |
| 宿主协议与客户端       | [`terminal-host-client.ts`](../src/main/terminal/terminal-host-client.ts)                                                                                                       | 握手、断连和请求生命周期测试                                  |
| 宿主进程入口           | [`terminal-host-entry.ts`](../src/main/terminal/terminal-host-entry.ts)                                                                                                         | Electron 跨重启 E2E                                           |
| Agent 注册、设置与运行 | [`registry.ts`](../src/main/agents/registry.ts)、[`settings-service.ts`](../src/main/agents/settings-service.ts)、[`runtime-service.ts`](../src/main/agents/runtime-service.ts) | [接入指南](./ADDING_CODING_AGENT.md)、契约与 Runtime 测试     |
| Agent 事件与离线重放   | [`agent-event-inbox.ts`](../src/main/agents/agent-event-inbox.ts)                                                                                                               | 事件解析、Bridge、收件箱、跨重启与 Schema 测试                |
| OpenCode 适配          | [`opencode-adapter.ts`](../src/main/agents/opencode-adapter.ts)、[`opencode-managed-integration.ts`](../src/main/agents/opencode-managed-integration.ts)                        | Adapter、会话定位与 Plugin 事件映射测试                       |
| Chrys 适配             | [`chrys-adapter.ts`](../src/main/agents/chrys-adapter.ts)、[`chrys-managed-integration.ts`](../src/main/agents/chrys-managed-integration.ts)                                    | Adapter、Hook 增量合并与真实 Bridge 映射测试                  |
| PowerShell Shell 选择  | [`launch-spec.ts`](../src/main/terminal/launch-spec.ts)                                                                                                                         | `launch-spec.test.ts`                                         |
| Git 读取与安全边界     | [`workspace.ts`](../src/main/git/workspace.ts)                                                                                                                                  | 临时仓库测试覆盖状态、Diff、特殊路径、二进制与资源上限        |
| Diff、评论与文件右栏   | [`ChangesPanel.tsx`](../src/renderer/src/components/rightpanel/ChangesPanel.tsx)、[`FilesPanel.tsx`](../src/renderer/src/components/rightpanel/FilesPanel.tsx)                  | `store/review.ts`、组件测试与 Electron 持久化 E2E             |
| 应用设置与能力事实     | [`panes.tsx`](../src/renderer/src/components/settings/panes.tsx)                                                                                                                | `panes.test.tsx`                                              |
| Coding Agent 设置      | [`CodingAgentsPane.tsx`](../src/renderer/src/components/settings/CodingAgentsPane.tsx)                                                                                          | `AgentSettingsService`、RPC、Schema 迁移、组件与 Electron E2E |
| 质量门禁               | [`vitest.config.ts`](../vitest.config.ts)                                                                                                                                       | [`TESTING.md`](./TESTING.md)、CI                              |
| CI 编排                | [`.github/workflows/quality.yml`](../.github/workflows/quality.yml)                                                                                                             | PR 与 Nightly                                                 |
| 打包态终端验收         | [`packaged-terminal-smoke.cjs`](../scripts/packaged-terminal-smoke.cjs)                                                                                                         | `verify:release`                                              |

## 跨层修改路径

数据字段变更：

```text
shared/domain.ts
→ main/db/schema.ts + repositories.ts
→ shared/rpc.ts + main/rpc/methods.ts（需要暴露时）
→ renderer/store/data.ts
→ UI 与测试
```

桌面能力变更：

```text
shared/types.ts
→ Main 实现与输入校验
→ Preload 白名单
→ Renderer 调用
→ 单元/组件测试 + Electron E2E
```

Git 评审链路从 `shared/git.ts → main/git/workspace.ts → RPC → renderer/store/review.ts → 右栏组件` 定位。项目根只由 Main 根据会话解析；评论 Schema 和 CRUD 位于 `main/db/`。

终端链路变更需同时检查：`TerminalPane → Preload → TerminalManager → HostClient → TerminalHost`。任何 UI 生命周期修改都必须证明 disconnect 不等于 close。

Coding Agent 启动、恢复、探测、原生会话发现和事件重放从 `src/main/agents/` 开始；TerminalManager 只消费统一运行结果。事件状态只由版本化 `AgentEvent` 更新，PTY 生命周期不是 Agent 状态来源。目标边界见[实施计划中的适配设计](./PLAN.md#coding-agent-适配设计)。
