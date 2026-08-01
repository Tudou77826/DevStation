# DevStation Agent 工作指引

## 阅读顺序

1. 阅读 `docs/STATUS.md`，确认当前能力、边界和风险。
2. 阅读 `docs/CODE_MAP.md`，定位目标代码、共享契约和测试。
3. 只读取与任务有关的实现和测试；未来范围再查 `docs/PLAN.md`。

代码、测试、数据库 Schema 和构建配置是实现事实的唯一来源。文档用于定位和解释边界，不用于替代代码细节。

## 架构边界

- Renderer 只负责 UI 和前端状态，通过 Preload 白名单访问桌面能力。
- Preload 只做受约束的桥接，不承载业务逻辑。
- Main 负责 SQLite、Git、PTY、文件系统和 Electron 安全边界。
- Shared 只保存跨进程契约，不依赖 Electron、Node 或 React。
- 禁止跨层反向依赖；以 `.dependency-cruiser.cjs` 为准。

## 验证

- 局部开发至少运行相关测试。
- 提交前运行 `npm run verify:fast`。
- 跨进程、持久化或用户链路变更运行 `npm run verify:pr`。
- 缺陷修复必须在最接近根因的层级增加回归测试。

## 文档影响

| 变化                               | 同步更新                             |
| ---------------------------------- | ------------------------------------ |
| 新增或移除用户能力                 | `docs/STATUS.md`、`docs/CODE_MAP.md` |
| 修改进程边界、核心数据流或模块职责 | `docs/STATUS.md`、`docs/CODE_MAP.md` |
| 修改质量门禁或测试原则             | `docs/TESTING.md`                    |
| 修改未来范围、顺序或验收条件       | `docs/PLAN.md`                       |
| 局部重构且外部能力和边界不变       | 通常无需更新文档                     |

文档与相关代码在同一变更中提交。一个事实只在一份文档中完整维护，其他位置使用链接；当前事实直接覆盖，历史交给 Git。
