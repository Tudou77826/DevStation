# DevStation 测试体系

测试防护网保护四类事实：功能正确、跨进程契约、架构边界和可交付产物。测试应覆盖真实风险，不以数量或覆盖率本身作为目标。

## 门禁

| 命令                     | 用途                                           | 触发时机             |
| ------------------------ | ---------------------------------------------- | -------------------- |
| `npm run verify:fast`    | 类型、Lint、格式、依赖方向、单元与组件测试     | 本地频繁执行         |
| `npm run verify:pr`      | fast + 覆盖率 + Electron E2E + 真实 PTY smoke  | 跨进程或用户链路变更 |
| `npm run verify:nightly` | PR 门禁 + 依赖、许可证、安全审计、Windows 构建 | 定时或手动全量验证   |
| `npm run verify:release` | nightly + 打包态终端生命周期                   | 发布候选             |

`test:terminal` 只验证真实 PTY，不绑定任何 Agent CLI，保证结果确定。Agent 适配通过固定命令契约、供应商数据适配测试和显式启用的本机 smoke 验证。Chrys smoke 使用 `DEVSTATION_CHRYS_SMOKE=1` 和 `DEVSTATION_CHRYS_BIN_DIR=<目录>` 启用，覆盖真实 TUI 启动、Hook 状态、原生 Session ID 绑定和 `-s` 冷恢复。

`test:event-bridge` 单独启动 PowerShell 验证 Electron 关闭时的原子事件写入。它在 PR 门禁中串行执行，不进入普通单测和覆盖率并发池，避免外部进程冷启动挤占 SQLite 测试预算。

`main` 只允许通过 Pull Request 合入，并要求 `pr-gate` 成功；Nightly 用于发现供应链和打包回归，不能替代合并门禁。`build:win` 只验证安装包构建，禁止隐式发布；版本发布使用独立的人工授权流程。

## 分层职责

- 单元测试：迁移、Repository、Agent Registry/Runtime、argv 安全、PTY 宿主和供应商会话定位。
- 组件测试：数据 Store、导航、任务详情、右栏和 TerminalPane 生命周期。
- Electron E2E：真实 Main/Preload/Renderer 链路、持久化和窗口行为。
- PTY smoke：真实 `node-pty` 的启动、输入、输出、resize 和退出。
- 架构门禁：强制 Renderer → Preload → Main，阻止平台依赖泄漏到 Shared。
- 供应链门禁：依赖树、许可证、安全审计和 Windows 构建。

## 终端关键不变量

以下回归会直接丢失开发者工作，必须由测试守住：

- 相同稳定 ID 只创建一个 PTY，重新连接返回相同 PID 和快照。
- 页面卸载、导航切换和窗口销毁只 detach，不 close。
- 只有显式“结束进程”才关闭 PTY。
- Renderer 不能提供 cwd、shell 或任意启动命令。
- 新 Agent Session 只绑定当前目录、本次启动后出现的供应商顶层会话。
- 已保存且通过 Adapter 校验的原生引用才能进入冷恢复 argv；无效引用不得降级为新会话。
- Adapter 只能返回结构化 executable、args 和 env；所有值由 Main 统一编码，不能拼接 Shell。
- Agent 事件先原子落盘再归约；重复、乱序和旧 `agentRunId` 事件不得回退当前状态。
- Electron 关闭期间的事件可在下次启动重放；坏文件被隔离且不能阻塞终端或其他有效事件。
- 受管 Plugin 在普通 OpenCode 进程中必须静默，只能绑定当前目录、本次运行的目标顶层会话。
- Chrys 受管 Hook 只能增量维护 DevStation 标识项；用户 Hook、注释和同名冲突必须保留。
- Chrys 的会话、工作和结束状态必须来自生命周期 Hook；等待与恢复必须来自匹配 `ask_user` 的工具 Hook，并经同一事件 Bridge 落盘。
- 安装和卸载只能处理带 DevStation 标识的文件；同路径的用户文件必须保留并报告冲突。
- Electron 重启后可接回同一个 PowerShell PID，并重建可见终端内容。
- 宿主连接先完成协议版本握手；断连后旧的 Renderer 所有权立即失效。
- 主动结束能把真实退出结果反馈到 UI；没有 PTY 和客户端时宿主自动退出。

`test:terminal:packaged` 使用隔离临时 Profile 验证打包产物，不访问开发者数据。它覆盖同一 PTY/Host PID 的跨应用重启接回和受控回收；NSIS 安装、升级与卸载矩阵仍属于 M7。

## 覆盖率策略

全局最低阈值为：行 60%、语句 55%、函数 50%、分支 45%。数据库、Git、RPC、Renderer Data Store、导航状态和终端核心模块使用独立阈值；具体数值以 `vitest.config.ts` 为准。

覆盖率不能替代场景价值。新增测试前先说明它防止的故障；无法关联到用户风险、数据风险或架构边界的断言不应加入。

## 随版本演进

每个阶段按同一顺序维护防护网：

1. 在计划中明确新增不变量与失败模式。
2. 优先在最低成本层覆盖，跨进程事实交给 E2E。
3. 对已发生缺陷增加回归测试。
4. 能力稳定后再提高对应模块阈值。
5. 删除与现状冲突、只验证实现细节或长期无价值的测试。

当前缺口：Main/Preload 安全配置定向测试、NSIS 安装升级卸载矩阵，以及更早历史数据库升级矩阵。
