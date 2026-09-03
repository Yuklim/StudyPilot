# TASK-022：资料安全删除后端

```toml
schema_version = 2
id = "TASK-022"
status = "IN_PROGRESS"
risk = "L3"
risk_reason = "实现资料整体删除，涉及不可逆数据删除、删除确认令牌、数据库级联、文件 trash 隔离和公共 API 可用能力清单。"
risk_flags = ["business", "critical-data", "security", "sensitive-storage", "public-api", "deletion", "tests"]
owner = "resource_worker"
base = "2df99dc44399db053f30653cf7803f2cedced108"
allowed_paths = ["backend/src/studypilot/api/resources.py", "backend/src/studypilot/application/resources.py", "backend/src/studypilot/infrastructure/database/resource_store.py", "backend/src/studypilot/modules/resources/contracts.py", "backend/tests/test_resource_deletion.py", "backend/tests/test_taxonomy.py", "README.md", "docs/contracts/API与数据契约基线.md", "docs/contracts/openapi-v1.json", "docs/tasks/TASK-021-resource-edit-pages.md", "docs/tasks/TASK-022-resource-safe-delete-backend.md", "docs/tasks/任务索引.md"]
checks = ["backend", "contracts"]
```

## 需求与范围

- 用户已合并 TASK-021 后授权“下一步”，承接既定计划：资料安全删除后端。依据需求 5.3、契约 1.3、2.2、2.4、4.3、4.12、7、8、9、10 及 OpenAPI 已冻结的 `previewResourceDeletion` / `deleteResource` 标准操作。
- 主 Agent 是唯一 resource_worker，从 TASK-021 合并提交 `2df99dc44399db053f30653cf7803f2cedced108` 建分支。TASK-021 合并事实仅补状态和索引；不重写历史证据。
- 目标：后端提供删除影响预览和确认删除。预览不删除资料，返回安全计数、资料版本、`impact_revision`、5 分钟一次性确认令牌；服务端只存令牌摘要。确认删除只接受 `X-StudyPilot-Deletion-Token`，事务内重算影响，变化时令牌作废并返回当前安全摘要；一致时删除资料及关联数据，Topic/Tag 本体保留，READY 原件先移入同卷 trash，由现有对账按宽限回收。
- 影响集合绑定资料版本、OriginalFile、Note、StudyRecord、ActiveReviewPlan、ReviewRecord、ResourceTag，并额外绑定 LearningProgress 版本以防当前学习状态变化后仍误删；响应不暴露正文、笔记、磁盘路径、完整文件名、令牌原文、SQL 或堆栈。
- 非目标：不做删除页面、回收站/撤销、批量删除、资料类型更换、文件替换、复习/统计/AI、迁移或模型新增；不删除 Topic/Tag 本体；不操作真实用户资料。
- 禁止范围：所有未列入 allowed_paths 的路径，尤其前端页面、数据库迁移、依赖/锁、治理/Agent 配置、真实运行数据。无并行写入。

## 完成条件

1. WEB/PASTE/FILE 资料可先预览再用一次性令牌确认删除；预览只创建确认记录，不删除资料或原件；确认成功返回 204，资料详情/列表/下载均不可再访问，Topic/Tag 本体保留。
2. 影响计数覆盖原件、心得、学习历史、复习计划/记录和标签关联；`impact_revision` 绑定稳定全集，不只比较数量。预览后任一绑定对象或资料版本变化会拒绝旧令牌，返回不含新令牌/过期时间的当前影响摘要。
3. 删除令牌缺失、重复、绑定其他资料、重放、过期均按契约返回；令牌只存摘要，错误不泄漏用户正文、路径、完整文件名、令牌或内部异常。
4. FILE 删除先把 READY 原件移入 trash；文件移动失败不提交数据库；移动后数据库提交失败可由现有对账恢复；提交成功后无引用 trash 按 24 小时宽限回收。
5. 安全前置仍在读取请求体、数据库和文件前生效；新增接口不放宽本地令牌、Origin、Fetch Metadata、CORS 头白名单或既有下载保护。
6. 后端检查、契约检查和新增后端测试通过；不宣称删除页面已实现。L3 需独立实际只读 Review 和另一独立只读 Acceptance，最终合并仍由用户决定。

## 上下文包

根 AGENTS、backend/AGENTS、task-intake/implement/review/acceptance Skills；需求 5.3；契约 1.3、2.2、2.4、4.3、4.12、7、8、9、10；后端资源 API/application/store、文件 storage/service、资源/文件/更新测试夹具。

检查：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-022-resource-safe-delete-backend.md --worktree`。必要时定向运行 `cd backend && uv run pytest tests/test_resource_deletion.py`，最终以统一检查记录为准。

## 实现与测试

- 实现 SHA/变更摘要：待填。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：待填。
- 已知限制/未完成项：删除页面尚未接入；无回收站/撤销；trash 仍按现有对账宽限清理。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- IN_PROGRESS；实现中。
<!-- EVIDENCE:END -->
