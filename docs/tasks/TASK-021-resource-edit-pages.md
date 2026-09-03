# TASK-021：资料编辑页面

```toml
schema_version = 2
id = "TASK-021"
status = "IN_PROGRESS"
risk = "L3"
risk_reason = "接入已批准的资料编辑接口，包含粘贴原文覆盖、冲突/未知保存结果保护及交付元数据；不改后端、模型或公共协议。"
risk_flags = ["business", "critical-data", "tests"]
owner = "frontend_worker"
base = "dcbc5d8a97065c6f4802f3b8fb9d22e9a8d70fc0"
allowed_paths = ["frontend/src/features/resources/api.ts", "frontend/src/features/resources/api.test.ts", "frontend/src/features/resources/fixtures.ts", "frontend/src/features/resources/ResourceDetail.tsx", "frontend/src/features/resources/ResourceEditor.tsx", "frontend/src/features/resources/ResourceEditor.test.tsx", "frontend/src/api/client.ts", "frontend/src/styles.css", "frontend/e2e/resource-edit-pages.spec.ts", "README.md", "docs/contracts/API与数据契约基线.md", "docs/contracts/openapi-v1.json", "docs/tasks/TASK-020-resource-edit-backend.md", "docs/tasks/TASK-021-resource-edit-pages.md", "docs/tasks/任务索引.md"]
checks = ["frontend", "contracts"]
```

## 需求与范围

- 用户“已合并”承接 TASK-020 结束时约定的资料编辑页面。已核实 PR #25 于 2026-09-03T11:44:31Z 合并为 base，工作区干净。依据需求 5.2/5.3/5.4/5.6/5.7、既定契约 2.4/4.1/5/10 ResourcePatch；只补核心资料管理，不开发复习/统计。
- 主 Agent 是唯一 frontend_worker，并串行维护任务与交付说明。不额外派 Worker；L3 最后一次独立实际只读 Review，再由另一独立只读 Acceptance 核对证据。沿用用户“使用其他模型”的授权临时使用可用模型，不修改默认模型配置或兑换额度。
- 详情页默认保持随手心得优先，资料编辑需主动展开。编辑标题、来源名称、保存原因/简介、主要主题；WEB 可改链接、PASTE 可改纯文本原文并明确无修订历史，FILE 原件只读。只发送实际改变字段及读取时的 expected_version；无修改不发请求。
- 失败保留草稿；旧版本冲突、未知保存结果、失效版本必须读取最新内容并明确核对后才再次保存，不自动重试、不静默覆盖。只读核对失败不恢复写入。等待操作防重复提交，离开组件忽略迟到结果；同份资料刷新时保留心得和资料草稿。
- 草稿仅当前页面内存；离开/刷新会丢失，取消需明确放弃。主题选择复用已有搜索分页组件。不修改标签管理、学习历史/进度、心得业务逻辑或后端；不新增自动保存、富文本、解析、删除、文件替换、版本历史。
- 中文契约仅 1.3 交付说明、OpenAPI 仅顶层 x-delivery-profile，标准 paths/schemas/security 与可用操作集合不变。README 更新页面使用说明；TASK-020 仅补真实合并事实。前端嵌套规则中 TASK-002 脚手架限定为历史范围，本次按已合并契约与本任务授权接入现有接口。
- 禁止所有未列路径，尤其后端、数据库、依赖/锁、治理/Agent 配置和真实个人资料。无并行写入。

## 完成条件

1. 三来源资料元数据可在页面修改、重开后保留；WEB/PASTE 的同类型原始内容可改，FILE 不提供替换控件；null 清空/省略不变/标题 trim/原文空白与纯文本语义符合契约。
2. 版本、字段长度与 URL 检查有效；缺失/畸形响应和只读加载失败受控；保存等待防重入。冲突及已提交但响应丢失均保留草稿、禁止盲重试，核对当前服务器内容后才明确重提。
3. 修改资料不改变心得、学习历史、进度、标签或原件；详情刷新不会丢失当前心得草稿。移动端 320/390 和桌面可用、无横向溢出；无外联、持久化草稿/令牌或用户正文日志。
4. 统一前端检查/构建与契约校验通过；新增组件/客户端测试和真实隔离后端 Chromium 联测覆盖主流程及关键失败。既有浏览器回归通过；后端源码不变，复用 TASK-020 的 466 单元测试，不默认重跑。
5. 已提交最终候选经独立实际只读 Review 和另一独立 Acceptance；证据如实绑定候选、用户保留最终合并权。

## 上下文包

根/前端 AGENTS、intake/implement/review/acceptance Skills、上述需求与契约章节；资源 api/detail/query、分类 Browser 和既有心得恢复模式按需读取，不全仓反复扫描。
检查：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-021-resource-edit-pages.md --worktree`；`cd frontend && npm run test:e2e`。仅使用隔离临时数据库/文件及合成数据；测试截图仅忽略的 test-results。

## 实现与测试

- 待实现并记录真实命令、SHA、输入指纹、结果与限制。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- IN_PROGRESS；未开始独立 Review/Acceptance，不预写通过。
<!-- EVIDENCE:END -->
