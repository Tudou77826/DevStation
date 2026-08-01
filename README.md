# DevStation

本地 AI 辅助研发桌面应用。验证一条本地研发链路：

```
手动建任务 → 关联本地 Git 项目 → 建 Agent 会话 → 终端跑 CLI Agent
→ Hook 跟踪状态 → 查看 Diff → 人工提交
```

技术栈：Electron + React 19 + TypeScript + Vite (electron-vite) + Tailwind v4。

## 分层

```
src/
├── main/        Electron 主进程（窗口、系统、安全边界）
├── preload/     隔离世界的白名单 API 桥
├── renderer/    React UI（任务 / 会话 / Diff / 终端视图）
│   └── src/
│       ├── components/   sidebar / workarea / rightpanel
│       ├── store/        zustand 状态
│       └── assets/       全局样式与主题 token
└── shared/      跨层共享类型
```

Renderer 运行在沙箱中，不直接访问 Node.js，所有系统能力经由 Preload 白名单 API。

## 开发

```bash
npm install
npm run dev          # 启动 electron-vite 开发模式
npm run typecheck    # 类型检查（node + web）
npm test             # 单元测试
npm run test:coverage # 单元/组件覆盖率及阈值门禁
npm run test:e2e      # 隔离 userData 的 Electron 黄金链路
npm run test:terminal # Electron 内真实 PTY + Codex 冒烟测试
npm run arch:check    # Main / Preload / Renderer / Shared 依赖边界
npm run license:check # 生产依赖许可证白名单
npm run verify:fast   # 本地快速门禁
npm run verify:pr     # 合并前完整门禁
npm run verify:nightly # 依赖审计及 Windows 安装包门禁
npm run verify:stage0 # 阶段 0 技术门禁
npm run build        # 构建产物
npm run build:win    # 打包 Windows 安装包
```

`verify:pr` 会生成覆盖率报告；E2E 失败时会保留截图和 Playwright trace。CI 使用
Windows + Node.js 24，与 Electron 原生模块和 `node:sqlite` 的运行环境保持一致。

完整的测试分层、覆盖率策略和测试编写规范见
[测试与质量防护体系](./docs/TESTING_STRATEGY.md)。

## 致谢

产品视觉和交互参考了 [Orca](https://github.com/stablyai/orca)（MIT License）。
当前终端为独立实现，没有复制 Orca 终端源码；准确版权声明见
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
