# TASK-003 交接报告

## 1. 结果

- 状态：`COMPLETE`
- 负责人角色：`architecture_owner`
- 分支：`agent/architecture-owner/TASK-003-api-data-contract-r2`
- 比较基线 SHA：`3b911834f2e44edd5bd25500b60275640e34a676`
- 交接前实现提交 SHA：`0e4ec3f29c41f533e30d37d921a86e7b0ad49252`

`coordinator` 提交本报告后，所得提交才是冻结候选。本报告不引用未来的候选 SHA。

## 2. 已完成内容

- 建立中文 API 与数据契约权威文档，覆盖 TASK-003 全部 32 项要求。
- 建立 OpenAPI 3.1.0 JSON 快照。
- 冻结 35 个具体 HTTP 操作，覆盖本地会话 bootstrap、WEB/FILE/PASTE 三类资料创建、资料查询/修改/删除、Topic/Tag 与标签关联、Note、单资料及全局 StudyRecord、复习、统计和 READY 原始文件下载。
- 冻结 11 个核心对象的字段、类型、可空性、读写性、限制、敏感性、所有者、关系和不变量。
- 冻结五种学习状态、复习联动、进度历史事务、RFC 3339/UTC 时间点、本地日期、分页、筛选、排序及乐观并发规则。
- 冻结 Host、Origin、Fetch Metadata、本地令牌、CORS、预检和安全前置拒绝顺序。
- 冻结文件识别、25 MiB 上限、上传状态机、崩溃恢复、对账和下载协议。
- 冻结删除影响全集、5 分钟一次性令牌、重算、重放拒绝和 trash 恢复协议。
- 提供需求 5.1～5.10、架构 6～9/11、中文契约和 OpenAPI 的三向追踪表。
- 完成首轮正式只读复审提出的 3 个 P1、7 个 P2 和 1 个 P3 修订，且没有增加产品范围。
- 删除影响变化错误不再返回新令牌；复习归档语义统一；资料摘要不再暴露来源 URL 或粘贴正文，详情按三种来源判别。
- 增加 OriginalFile 稳定版本、核心状态条件 schema、逐 operation 错误矩阵和成功示例、SourceUrl 安全约束及 ALL 复习列表空日期稳定排序。

## 3. 未完成或未包含内容

按任务非目标，未实现：

- 数据库表、SQLAlchemy 模型或 Alembic 迁移；
- FastAPI 路由、中间件或业务代码；
- React 页面、客户端类型或调用代码；
- 测试夹具、CI 或端到端测试；
- 正文解析、恶意文件扫描、账户、多用户、云、AI、RAG 或 Agent。

## 4. 修改文件

| 文件 | 修改原因 | 所属任务要求 |
| --- | --- | --- |
| `docs/contracts/API与数据契约基线.md` | 中文含义权威、字段字典、状态/时间/安全/文件/删除规则及追踪 | 1～29、32 |
| `docs/contracts/openapi-v1.json` | 机器可读的 OpenAPI 3.1 HTTP 快照 | 1、5～10、13、18～21、25、27、29～32 |

未修改任何任务单、索引、源码、配置、需求、架构或治理文件。

## 5. 用户可见行为变化

无运行行为变化。本任务只冻结后续开发共同遵守的接口与数据含义。

## 6. 契约、数据或需求变化

### 6.1 中文契约与 OpenAPI 对应

| 中文契约 | OpenAPI |
| --- | --- |
| 第 2 节统一 HTTP、错误、分页、并发 | `ErrorResponse`、`PageMeta`、公共 responses/parameters |
| 第 3 节枚举 | 6 个枚举 schema |
| 第 4 节对象与关系 | 11 个核心对象 schema、条件约束及来源安全组合投影 |
| 第 5 节三来源创建 | `/api/v1/resources` POST 和三个创建 schema |
| 第 6 节学习、复习、时间 | StudyRecord/Review paths 和 schemas |
| 第 7 节本地安全 | `LocalToken`、Host/Origin/Fetch 参数、403 示例 |
| 第 8 节上传下载 | multipart 请求、OriginalFile、download 二进制媒体类型 |
| 第 9 节确认删除 | deletion-preview、DELETE、DeletionPreview 与不含新令牌的 409 当前影响摘要 |
| 第 10 节操作总表 | 20 paths、35 operations、唯一 operationId |
| 第 12 节三向追踪 | paths/schemas 与需求、架构逐项映射 |

### 6.2 需求与架构追踪

- 需求 5.1：resources POST、OriginalFile、上传状态机；
- 需求 5.2：LearningResource、LearningProgress、Topic、Tag、ReviewPlan；
- 需求 5.3：资料列表/详情/PATCH/删除/download；
- 需求 5.4：搜索筛选、Topic/Tag CRUD、ResourceTag；
- 需求 5.5：五状态、进度、StudyRecord 单事务；
- 需求 5.6：Note CRUD，明确区别 AI 内容；
- 需求 5.7：单资料及全局 StudyRecord；
- 需求 5.8：review 列表、安排、暂停、完成、历史；
- 需求 5.9：overview/topic analytics；
- 需求 5.10：所有页面需要的 API 入口；
- 架构第 6 节：对象和操作标明模块所有者；
- 架构第 7 节：资源组、错误和删除协议；
- 架构第 8 节：11 个概念对象及关系；
- 架构第 9 节：本地访问、隐私和文件安全；
- 架构第 11 节：契约第 12 节完成双向追踪。

### 6.3 技术细化决定

以下均属于已批准范围内的技术细化：

- UUID v4 对象标识；
- 页码分页默认 20、最大 100，白名单排序追加 ID 稳定决胜项；
- NFKC、大小写及空白规范化搜索/唯一性；
- 整数版本号和 `If-Match`；
- 25 MiB 上传上限；
- PDF、DOC、DOCX、Markdown、TXT 保守识别规则；
- 上传 PENDING 超时 10 分钟，启动时及每 60 秒文件对账；
- 孤儿和 trash 至少 24 小时宽限；
- 删除确认令牌有效 5 分钟；
- 默认开发 UI `127.0.0.1:5173`、后端 `127.0.0.1:8000`；
- 复习日期采用本地日历语义，时间点统一 UTC；
- Topic/Tag 规范化名称唯一；
- 单标签 PUT/DELETE 关联采用幂等操作。
- `REVIEW_DUE` 归档保留 SCHEDULED 计划和 due_date，但所有复习列表排除归档资料；恢复后原计划重新可见；
- `scope=ALL` 中空 due_date 无论升降序均固定排在有日期计划之后；
- SourceUrl 只允许 http/https，拒绝 userinfo 和 fragment，并作为敏感字段处理；
- OriginalFile 每次实际状态或存储元数据变化递增 version，并参与删除影响绑定；
- 35 个 operation 使用逐项响应状态和稳定 `x-error-codes` 矩阵。

## 7. 验证证据

| 命令或检查 | 结果 | 说明 |
| --- | --- | --- |
| `git diff --check` | PASS | 按任务单要求检查完整工作区，无空白错误 |
| `python3 -m json.tool docs/contracts/openapi-v1.json >/dev/null` | PASS | JSON 语法有效 |
| `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python -c 'from pathlib import Path; from fastapi.openapi.models import OpenAPI; OpenAPI.model_validate_json(Path("docs/contracts/openapi-v1.json").read_text())'` | PASS | OpenAPI 模型可解析 |
| `PYTHONDONTWRITEBYTECODE=1 python3 scripts/governance/validate_governance.py` | PASS | 30 项治理语义不变量通过 |
| `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest scripts/governance/test_validate_governance.py` | PASS | 3 个测试通过 |
| 复审 11 项专项语义断言 | PASS | 35 operations、12 个请求体操作、74 schemas；令牌、投影、条件、错误、示例、排序、URL 和标签均被断言 |
| OpenAPI 引用、标识和安全参数交叉检查 | PASS | 20 paths、35 个唯一 operationId、432 个引用全部可解析；Host、令牌、Origin、Fetch Metadata、403/500 全覆盖 |
| Markdown—OpenAPI 双向映射 | PASS | 路径、方法、响应状态及 `x-error-codes` 一致 |
| `git diff --name-only e121e28..0e4ec3f` 允许路径检查 | PASS | 只有两份授权契约文件 |
| 敏感信息模式扫描 | PASS | 未发现私钥、OpenAI/GitHub token、JWT、用户主机路径或非示例邮箱 |
| 需求/架构人工追踪 | PASS | 需求 5.1～5.10 与架构 6～9、11 均有承载或明确延期 |

自定义检查早期曾因 Git 中文路径转义、把 `example.test` 安全反例误识别为邮箱、把“11 个其他请求体操作”误算为请求体操作总数，以及标题文本匹配过严而失败；修正只读检查逻辑后全部 PASS，均非契约缺陷。

## 8. 未执行检查

- 后端、前端和端到端测试：按任务单，本任务不修改运行代码，因此不要求执行。
- 第三方 OpenAPI CLI linter：仓库未提供该工具；已由 JSON 解析、引用检查、自定义结构检查和现有 FastAPI OpenAPI 模型完成验证。

## 9. 已知限制与风险

- OpenAPI 不能完整表达数据库事务、安全拒绝先后顺序、文件崩溃恢复和对账；这些规则由中文契约第 6～9 节权威规定，并通过 `x-contract-section` 从操作描述指向。
- `DELETE /reviews/{resource_id}` 使用 JSON 请求体传递返回学习状态和两个版本号；后续客户端和代理测试必须覆盖。
- 恶意文件扫描明确延期；当前只承诺保守格式识别、附件下载和 `nosniff`。
- 当前契约仅适用于本地单用户运行，不能作为公网身份认证方案。

## 10. 建议审查重点

- WEB/FILE/PASTE 互斥和 ResourceSummary/Detail 投影；
- 五状态矩阵与 ReviewPlan 联动；
- `PATCH` 省略和显式 null；
- 时间点、日期、本地周及跨日统计；
- Host/token/Origin/Fetch Metadata 前置拒绝；
- 上传各崩溃点及 READY 门槛；
- 删除影响全集、409 新预览、重放和 trash 恢复；
- Markdown 与 OpenAPI 的枚举、字段、状态码和 35 个 operationId 一致性。
