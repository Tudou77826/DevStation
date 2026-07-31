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
npm run build        # 构建产物
npm run build:win    # 打包 Windows 安装包
```

## 致谢

终端与 Git Diff 的运行机制参考自 [Orca](https://github.com/stablyai/orca)（MIT License）。
相关代码以独立模块方式抽取，保留其原始许可证与版权声明。
