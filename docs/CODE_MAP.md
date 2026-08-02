# DevStation 代码地图

本文只回答“某项能力应该从哪里开始读”。实现细节以代码和测试为准。

## 能力定位

| 能力                 | 主入口                                                                               | 边界与测试                         |
| -------------------- | ------------------------------------------------------------------------------------ | ---------------------------------- |
| 应用启动与窗口安全   | [`src/main/index.ts`](../src/main/index.ts)                                          | Preload、Electron E2E              |
| 领域模型             | [`src/shared/domain.ts`](../src/shared/domain.ts)                                    | SQLite Schema、RPC Map             |
| SQLite 与迁移        | [`src/main/db/`](../src/main/db/)                                                    | `db/__tests__/`                    |
| RPC 白名单           | [`src/main/rpc/`](../src/main/rpc/)                                                  | `rpc/__tests__/`                   |
| Renderer 数据状态    | [`store/data.ts`](../src/renderer/src/store/data.ts)                                 | `data.test.ts`                     |
| 任务主工作区         | [`TaskPanel.tsx`](../src/renderer/src/components/tasks/TaskPanel.tsx)                | `TaskPanel`、`TaskDetailView` 测试 |
| 导航、现场恢复与右栏 | [`store/nav.ts`](../src/renderer/src/store/nav.ts)                                   | `nav.test.ts`、Electron E2E        |
| 工作会话入口         | [`SessionList.tsx`](../src/renderer/src/components/ai-space/SessionList.tsx)         | `SessionList.test.tsx`、E2E        |
| AI 主工作区          | [`AISpaceWorkArea.tsx`](../src/renderer/src/components/workarea/AISpaceWorkArea.tsx) | Electron E2E                       |
| 工作流展示占位       | [`WorkflowPanel.tsx`](../src/renderer/src/components/workflow/WorkflowPanel.tsx)     | `store/aaw.ts`，当前仅为模拟数据   |
| xterm 生命周期       | [`TerminalPane.tsx`](../src/renderer/src/components/terminal/TerminalPane.tsx)       | `TerminalPane.test.tsx`            |
| 终端上下文与权限     | [`terminal-manager.ts`](../src/main/terminal/terminal-manager.ts)                    | `terminal-manager.test.ts`         |
| 独立 PTY 宿主        | [`terminal-host.ts`](../src/main/terminal/terminal-host.ts)                          | host、client、protocol 测试        |
| 宿主协议与客户端     | [`terminal-host-client.ts`](../src/main/terminal/terminal-host-client.ts)            | 握手、断连和请求生命周期测试       |
| 宿主进程入口         | [`terminal-host-entry.ts`](../src/main/terminal/terminal-host-entry.ts)              | Electron 跨重启 E2E                |
| OpenCode 会话识别    | [`opencode-session-locator.ts`](../src/main/terminal/opencode-session-locator.ts)    | 只读 SQLite 定位器测试             |
| Agent 启动与恢复命令 | [`launch-spec.ts`](../src/main/terminal/launch-spec.ts)                              | `launch-spec.test.ts`              |
| Git 仓库校验         | [`src/main/git/`](../src/main/git/)                                                  | `validate.test.ts`                 |
| 设置与能力事实       | [`panes.tsx`](../src/renderer/src/components/settings/panes.tsx)                     | `panes.test.tsx`                   |
| 质量门禁             | [`vitest.config.ts`](../vitest.config.ts)                                            | [`TESTING.md`](./TESTING.md)、CI   |
| CI 编排              | [`.github/workflows/quality.yml`](../.github/workflows/quality.yml)                  | PR 与 Nightly                      |
| 打包态终端验收       | [`packaged-terminal-smoke.cjs`](../scripts/packaged-terminal-smoke.cjs)              | `verify:release`                   |

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

终端链路变更需同时检查：`TerminalPane → Preload → TerminalManager → HostClient → TerminalHost`。任何 UI 生命周期修改都必须证明 disconnect 不等于 close。
