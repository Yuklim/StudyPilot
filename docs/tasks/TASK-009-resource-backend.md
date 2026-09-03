# TASK-009：网页与粘贴资料后端

```toml
schema_version = 2
id = "TASK-009"
status = "IN_REVIEW"
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

- 实现 SHA：`66e14bdf31b1fba05c5b032a298cdcfdb030a61b`。16 文件，已自检范围；三个资料接口、纯命令校验、应用事务及私有 SQLAlchemy 适配器，安全中间件仅增加可信 request_id state。无模型/迁移/依赖/页面业务修改。查询先 SQL 筛选，普通列表直接 SQL 计数/分页；Unicode 搜索只加载必要元数据匹配，正文/URL 延迟加载。
- 环境：macOS arm64，既有 Python 3.13.9/pytest 8.4.2、Node 24/npm 11、Vitest 4.1.11、Playwright/Chromium（TASK-008 同一安装）。pytest 使用自动隔离的临时路径；E2E 使用临时已迁移库与 15173/18000 端口，不读取真实资料。
- 完整 `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-009-resource-backend.md --worktree`：exit=0/CHECKS PASS，16 文件，product_fingerprint=`78025e1025ce2c353b04078751e0b9ccc88187ed6e3245bbd3c67805e45dc9ee`。后端 Ruff 格式/lint、mypy（29 文件）、187 项 pytest、离线源码包/wheel 构建；前端格式/lint/类型、46 项 Vitest、生产构建；治理校验及 23 项单测全部通过。治理单测中的 fake-test/missing-tool 是验证失败处理的模拟，不是实际检查失败。
- 完整 `cd frontend` 后 `npm run test:e2e`：exit=0，8/8 Chromium PASS（11.6 秒）。真实共享客户端经代理保存 WEB/PASTE → 刷新 → 搜索列表 → 详情；原 7 项安全/页面/移动布局测试保留，旧未知路由断言移至 `/api/v1/unknown`。安全和资料套件 trace 关闭，临时令牌只留浏览器内存。未增加页面功能，因此不重复视觉选型/截图评审。
- 条件 1/2：新增 `test_resources.py` 72 项，创建/读取/应用重启、UUIDv4/UTC/默认进度、主题/标签引用；格式/类型/长度/来源互斥/URL解析/NaN/非法查询在建库前拒绝；故障注入证明资料+进度+标签关联回滚，已有 Tag 保留；错误无敏感回显、request_id 头体一致。既有安全和 health 115 项全部保留通过。
- 条件 3：Unicode NFKC/大小写/空白规范化搜索，正文/URL不参与搜索且不出摘要；筛选组合与进度/日期边界、缺失筛选ID空页、归档默认隐藏、分页稳定决胜及四种排序正反向、只读时间/版本不变；READY/PENDING/FAILED文件可见性及文件摘要/详情字段隔离。最大 1,000,000 字符原文正常持久化。
- 条件 4/5：上述完整检查及真实浏览器证据；README 同步后端已实现/界面未接入、显式迁移、单机范围与搜索成本。任务冻结前保留全部测试和完成条件，之后仅写回独立证据。
- 真实失败与修正：初始 Ruff 将故意测试 NFKC 的全角字母标为歧义字符，精确行注明测试用途；mypy 初始两项类型标注/变量复用问题已修正。定向测试依次 66/67 通过，补充分页输入与最大原文/排序后最终完整 72 项新测通过；没有降低断言、隐藏失败或新增依赖。
- 已知边界：只完成 JSON WEB/PASTE 创建和三接口，不支持 FILE 创建、元数据修改/删除、分类管理或界面表单。Unicode 搜索内存匹配适合当前个人/低流量场景，不声称适合海量资料。初始默认进度不是学习功能；不自动建表，无公网认证。独立 Review/Acceptance 待执行。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 2026-09-03：IN_REVIEW。完整检查通过，主 Agent已完成一次自检；沿用获授权的 GPT-5.4 medium 实际只读运行器，不改默认 Agent 配置。独立 Review/Acceptance 待执行。
<!-- EVIDENCE:END -->
