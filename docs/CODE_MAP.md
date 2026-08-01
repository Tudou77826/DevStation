# DevStation 代码地图

本文用于把能力快速映射到代码、跨层契约和测试。先确定目标能力，再沿表中入口读取；具体实现以代码为准。

## 能力定位

| 能力                              | 主要代码                                                                                                               | 跨层契约或配置                                                            | 主要测试                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 应用启动与窗口安全                | [`src/main/index.ts`](../src/main/index.ts)                                                                            | [`src/preload/index.ts`](../src/preload/index.ts)                         | Electron E2E；Main 定向测试待补                                                                      |
| 领域模型                          | [`src/shared/domain.ts`](../src/shared/domain.ts)                                                                      | SQLite Schema、RPC Map                                                    | Repository 与 RPC 测试                                                                               |
| SQLite 与迁移                     | [`src/main/db/`](../src/main/db/)                                                                                      | [`schema.ts`](../src/main/db/schema.ts)                                   | [`db/__tests__/`](../src/main/db/__tests__/)                                                         |
| Task、Project、Session Repository | [`repositories.ts`](../src/main/db/repositories.ts)                                                                    | [`domain.ts`](../src/shared/domain.ts)                                    | [`repositories.test.ts`](../src/main/db/__tests__/repositories.test.ts)                              |
| RPC 白名单与参数校验              | [`src/main/rpc/`](../src/main/rpc/)                                                                                    | [`src/shared/rpc.ts`](../src/shared/rpc.ts)                               | [`rpc/__tests__/`](../src/main/rpc/__tests__/)                                                       |
| Renderer 数据状态                 | [`store/data.ts`](../src/renderer/src/store/data.ts)                                                                   | RPC Map、领域模型                                                         | [`data.test.ts`](../src/renderer/src/store/data.test.ts)                                             |
| Git 仓库校验                      | [`src/main/git/`](../src/main/git/)                                                                                    | RPC `projects.create`                                                     | [`validate.test.ts`](../src/main/git/__tests__/validate.test.ts)                                     |
| PTY 生命周期                      | [`src/main/terminal/`](../src/main/terminal/)                                                                          | [`src/shared/types.ts`](../src/shared/types.ts)                           | [`terminal-manager.test.ts`](../src/main/terminal/terminal-manager.test.ts)、PTY 冒烟                |
| 终端界面                          | [`TerminalPane.tsx`](../src/renderer/src/components/terminal/TerminalPane.tsx)                                         | Preload `terminal` API                                                    | 跨进程组件测试待补                                                                                   |
| 任务界面                          | [`components/tasks/`](../src/renderer/src/components/tasks/)                                                           | Renderer Data Store                                                       | [`TaskPanel.test.tsx`](../src/renderer/src/components/tasks/TaskPanel.test.tsx)                      |
| 项目与会话界面                    | [`components/ai-space/`](../src/renderer/src/components/ai-space/)                                                     | Renderer Data Store                                                       | [`SessionList.test.tsx`](../src/renderer/src/components/ai-space/SessionList.test.tsx)、Electron E2E |
| 导航与工作区                      | [`store/nav.ts`](../src/renderer/src/store/nav.ts)、[`components/workarea/`](../src/renderer/src/components/workarea/) | [`src/shared/types.ts`](../src/shared/types.ts)                           | Electron E2E                                                                                         |
| 工作流占位                        | [`components/workflow/`](../src/renderer/src/components/workflow/)                                                     | 无运行契约                                                                | 未建立功能测试                                                                                       |
| 测试与质量门禁                    | [`vitest.config.ts`](../vitest.config.ts)、[`playwright.config.ts`](../playwright.config.ts)                           | [`package.json`](../package.json)、[CI](../.github/workflows/quality.yml) | [`docs/TESTING.md`](./TESTING.md)                                                                    |
| Windows 打包                      | [`electron-builder.config.json`](../electron-builder.config.json)                                                      | `package.json`                                                            | `npm run build:win`                                                                                  |

## 跨层修改路径

新增或修改数据字段时，按以下顺序检查：

```text
shared/domain.ts
→ main/db/schema.ts 与 repositories.ts
→ shared/rpc.ts 与 main/rpc/methods.ts
→ renderer/store/data.ts
→ 相关 UI 与测试
```

新增桌面能力时，按以下顺序检查：

```text
shared 跨进程类型
→ Main 实现与输入校验
→ Preload 白名单
→ Renderer 调用
→ 单元测试与 Electron 集成测试
```

新增用户入口时，先检查 `store/nav.ts`、`components/sidebar/` 和对应工作区组件。只有能力、边界或入口发生变化时才更新本地图；内部函数重构不需要记录。
