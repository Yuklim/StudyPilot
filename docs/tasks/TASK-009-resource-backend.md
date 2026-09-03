# TASK-009：网页与粘贴资料后端

```toml
schema_version = 2
id = "TASK-009"
status = "IN_PROGRESS"
risk = "L3"
risk_reason = "首次启用资料持久化及原子创建事务，含敏感原文、初始进度和标签关联；复用既定契约但需验证数据完整性及错误不泄露。"
risk_flags = ["critical-data", "sensitive-storage", "public-api", "tests"]
owner = "resource_worker"
base = "910e85b3164704e02664f1420eee65e509467e63"
allowed_paths = ["backend/src/studypilot/api/resources.py", "backend/src/studypilot/modules/__init__.py", "backend/src/studypilot/modules/resources/**", "backend/src/studypilot/application/__init__.py", "backend/src/studypilot/application/resources.py", "backend/src/studypilot/infrastructure/database/resource_store.py", "backend/src/studypilot/infrastructure/security/local_access.py", "backend/src/studypilot/main.py", "backend/tests/test_resources.py", "frontend/e2e/local-access.spec.ts", "frontend/e2e/resources.spec.ts", "README.md", "docs/tasks/TASK-008-local-access-foundation.md", "docs/tasks/TASK-009-resource-backend.md", "docs/tasks/任务索引.md"]
checks = ["backend", "frontend", "governance"]
```

## 需求与范围

- 用户要求“已合并，下一步”；已核实 PR #13 MERGED，合并提交为 base。承接 TASK-008 明确的资料后端下一步。
- 依据：已批准契约第 2.1～2.3、4.1/4.2/4.4～4.7/4.10、5、7、10 节及 OpenAPI 的 createResource/listResources/getResource；架构 6.1、7.2 添加资料及阶段 B。需求、契约、模型、迁移均不改。
- 唯一写入者：主 Agent兼任 resource_worker，串行实现资料用例及其必要存储/API 适配；coordinator 同一主 Agent维护任务/索引。没有额外实现 Worker。L3 最后各一位实际只读独立 Reviewer、Integration Owner。
- 实现 POST JSON WEB/PASTE、GET 列表（既定搜索/筛选/排序/分页）、GET 详情。只保存链接，不抓取网页；粘贴内容原样保留，不解析/执行。支持引用既有 Topic/Tag；不新增分类管理接口。
- 初始进度仅通过存储适配建立 TASK-005 已定义的默认行（UNREAD/0/version=1），与新资料及标签关联同事务；这是资料创建必要完整性初始化，不实现学习状态转换、进度更新或学习记录。查询仅组合只读投影，不传可变 ORM 对象跨模块；taxonomy 保留分类及关联所有权，resources 只写自己的 topic_id。
- 安全中间件仅向可信 request state 暴露其生成的 request_id，供业务错误复用；不改既有授权判定。数据库仅在通过安全和输入校验后的业务请求显式打开，始终关闭；不自动建表/迁移，不操作用户已有数据作测试。
- 前端只改/增加真实浏览器测试，不改页面和 API 客户端。旧“未实现路由返回404”测试改到明确不存在的路径，保留原强度。界面表单和真实数据接入是下一任务。
- 非目标：FILE 上传/下载、PATCH、删除、分类 CRUD、学习/笔记/复习/统计写入、AI、公网部署、依赖升级、治理/Agent 配置变更。当前 multipart 返回 415，不能把部分接口实现冒称完整资料管理。
- 仅更新 TASK-008 status/EVIDENCE/索引合并事实；不重写历史。无并行写入；所有未列入路径禁止修改。

## 完成条件

1. WEB/PASTE 创建 201，详情持久可读，字段/UUID/UTC/初始进度符合契约；重启应用后数据仍在。URL 真解析，无网络抓取，拒绝凭据/片段；未知字段、类型/边界、互斥和重复标签严格校验。
2. 全部必要创建步骤原子提交；缺失主题/标签、格式错误、存储错误无半成品，失败不回显正文/URL/路径/SQL/令牌，错误编号与响应头相同。原安全拒绝、health、未授权不读体/建库保持有效。
3. 列表仅摘要，无 URL/粘贴正文/文件哈希或内部存储键；搜索仅三个批准字段并遵守 Unicode 规范化；AND/OR、默认排除归档、READY 文件可见性、分页稳定决胜和时间/进度边界可验证。详情组合只读进度/标签/复习/原件，不因读取更新版本或时间。
4. 自动后端/前端/治理检查及真实 Chromium 的保存→刷新→列表→详情通过；仅临时已迁移数据库和合成数据，含令牌的浏览器测试关闭 trace。页面仍明确未接入，不伪装可操作。
5. README 准确说明后端能力、需显式建库和局限；冻结候选、测试绑定、独立 Review/Acceptance 有真实证据；最终合并由用户执行。

## 上下文包

根/后端/前端 AGENTS.md、V2 task-intake/implement/review/stage-acceptance Skills；上述契约/架构段落；现有 database/models.py、connection.py、main.py、安全中间件和共用测试夹具。只读必要接口/字段，不重读全部历史。

检查：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-009-resource-backend.md --worktree`；`cd frontend` 后 `npm run test:e2e`。不引入依赖或扩大检查脚本权限。

## 实现与测试

- 尚未实现/测试，不声称 PASS。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 2026-09-03：IN_PROGRESS；登记完成，独立 Review/Acceptance 待实现后执行。只用主 Agent实现，避免机械交接；保留真实独立判断。
<!-- EVIDENCE:END -->
