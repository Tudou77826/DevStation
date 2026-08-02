# DevStation

DevStation 是面向 AI 辅助研发的本地桌面工作台。MVP 以一条顺畅的本地研发链路为目标：

```text
创建任务 → 关联 Git 项目 → 创建工作会话 → 运行 CLI Agent → 跟踪状态 → 评审 Diff
```

当前已完成任务、项目、会话的本地持久化，PowerShell 热接回，以及 OpenCode/Chrys 的原生会话恢复与状态事件；统一 Agent 设置、会话搜索和 Diff 仍在后续计划中。

技术栈：Electron、React、TypeScript、electron-vite、SQLite、xterm.js、node-pty。

## 开始开发

```bash
npm install
npm run dev
npm run verify:fast
```

合并前运行 `npm run verify:pr`；完整命令和测试原则见[测试体系](./docs/TESTING.md)。

## 继续阅读

| 需要了解                   | 文档                                            |
| -------------------------- | ----------------------------------------------- |
| 当前能力、结构、限制和风险 | [当前状态](./docs/STATUS.md)                    |
| 某项能力对应的代码和测试   | [代码地图](./docs/CODE_MAP.md)                  |
| 接入新的 Coding Agent      | [适配器接入指南](./docs/ADDING_CODING_AGENT.md) |
| 测试原则和质量门禁         | [测试体系](./docs/TESTING.md)                   |
| 尚未完成的 MVP 工作        | [实施计划](./docs/PLAN.md)                      |

AI Agent 应先阅读 [AGENTS.md](./AGENTS.md)。代码、测试、Schema 和配置是实现事实的唯一来源。

## 许可证

产品视觉和交互参考了 [Orca](https://github.com/stablyai/orca)（MIT License）。当前终端为独立实现；版权边界见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
