# DevStation 测试体系

测试防护网保护四类事实：功能正确、跨进程契约、架构边界和可交付产物。测试应覆盖真实风险，不以数量或覆盖率本身作为目标。

## 门禁

| 命令                     | 用途                                           | 触发时机             |
| ------------------------ | ---------------------------------------------- | -------------------- |
| `npm run verify:fast`    | 类型、Lint、格式、依赖方向、单元与组件测试     | 本地频繁执行         |
| `npm run verify:pr`      | fast + 覆盖率 + Electron E2E + 真实 PTY smoke  | 跨进程或用户链路变更 |
| `npm run verify:nightly` | PR 门禁 + 依赖、许可证、安全审计、Windows 构建 | 定时与发布前         |
| `npm run verify:release` | nightly + 打包态终端生命周期                   | 发布候选             |

`test:terminal` 只验证真实 PTY，不绑定任何 Agent CLI，保证结果确定。Agent 适配通过固定命令契约、供应商数据适配测试和显式启用的本机 smoke 验证。

## 分层职责

- 单元测试：迁移、Repository、输入边界、启动命令、PTY 宿主和 OpenCode Session 定位。
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
- 新 OpenCode Session 只绑定当前目录、本次启动后出现的顶层会话。
- 已保存原生 ID 时，冷启动使用 OpenCode 官方 resume 参数。
- Electron 重启后可接回同一个 PowerShell PID，并重建可见终端内容。
- 宿主连接先完成协议版本握手；断连后旧的 Renderer 所有权立即失效。
- 主动结束能把真实退出结果反馈到 UI；没有 PTY 和客户端时宿主自动退出。

`test:terminal:packaged` 使用隔离临时 Profile 验证打包产物，不访问开发者数据。它覆盖同一 PTY/Host PID 的跨应用重启接回和受控回收；NSIS 安装、升级与卸载矩阵仍属于 M6。

## 覆盖率策略

全局阈值用于发现防护网倒退；关键模块使用独立高阈值。当前 `TerminalManager` 要求 100% 行/函数、100% 语句和至少 95% 分支覆盖。

覆盖率不能替代场景价值。新增测试前先说明它防止的故障；无法关联到用户风险、数据风险或架构边界的断言不应加入。

## 随版本演进

每个阶段按同一顺序维护防护网：

1. 在计划中明确新增不变量与失败模式。
2. 优先在最低成本层覆盖，跨进程事实交给 E2E。
3. 对已发生缺陷增加回归测试。
4. 能力稳定后再提高对应模块阈值。
5. 删除与现状冲突、只验证实现细节或长期无价值的测试。

当前缺口：Main/Preload 安全配置定向测试、OpenCode Hook 契约、NSIS 安装升级卸载矩阵，以及历史数据库升级矩阵。
