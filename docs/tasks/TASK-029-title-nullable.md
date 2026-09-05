# TASK-029：资料标题可空（阶段1b：存库可空 + 界面占位展示）

```toml
schema_version = 2
id = "TASK-029"
status = "IN_PROGRESS"
risk = "L3"
risk_reason = "放宽 LearningResource 关键字段 title 为非空到可空，新增 0003 数据库迁移，改动标准 openapi 的 LearningResource 与三个 Create schema 的 required/nullable 及 ResourcePatch 可清空语义，跨后端、数据库、契约文档与前端展示；属架构/契约、迁移、重大跨模块。"
risk_flags = ["migration", "public-api", "major-cross-module", "business", "tests"]
owner = "coordinator"
base = "ed36a222f0ed930bfa97dcac1c3a47a33999ff15"
allowed_paths = [
  "backend/src/studypilot/infrastructure/database/models.py",
  "backend/src/studypilot/infrastructure/database/resource_store.py",
  "backend/src/studypilot/modules/resources/contracts.py",
  "backend/migrations/versions/0003_resource_title_nullable.py",
  "backend/tests/test_resources.py",
  "backend/tests/test_resource_updates.py",
  "backend/tests/test_resource_deletion.py",
  "backend/tests/test_files.py",
  "backend/tests/test_database.py",
  "backend/tests/test_migrations.py",
  "docs/contracts/API与数据契约基线.md",
  "docs/contracts/openapi-v1.json",
  "frontend/src/features/resources/api.ts",
  "frontend/src/features/resources/resourceTitle.ts",
  "frontend/src/features/resources/ResourceForm.tsx",
  "frontend/src/features/resources/ResourceEditor.tsx",
  "frontend/src/features/resources/ResourceLibrary.tsx",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ResourceDeletion.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/features/resources/FilePages.test.tsx",
  "frontend/src/features/resources/ResourceEditor.test.tsx",
  "frontend/src/features/resources/ResourceDeletion.test.tsx",
  "frontend/src/features/resources/files.test.ts",
  "frontend/src/features/resources/api.test.ts",
  "frontend/src/api/client.ts",
  "frontend/src/api/client.test.ts",
  "frontend/e2e/resource-pages.spec.ts",
  "frontend/e2e/resource-edit-pages.spec.ts",
  "docs/tasks/TASK-025-layout-simplification.md",
  "docs/tasks/TASK-026-import-simplification.md",
  "docs/tasks/TASK-028-classification-search-compact.md",
  "docs/tasks/TASK-029-title-nullable.md",
  "docs/tasks/任务索引.md",
]
checks = ["backend", "frontend", "contracts", "governance"]
```

## 需求与范围

- 用户 2026-09-05 明确指令做「阶段1b 标题可空」，语义已拍板：title 存库可空（0003 迁移）；create/PATCH 均可省略或清空标题；服务端不自动生成伪标题落库；界面统一占位「未命名资料」（仅 UI）；按 title 排序时无标题(null)固定排最后。
- 依据《项目需求说明》5.1/5.2/7.1（资料信息可后补）与契约 2.3 排序、4.1 LearningResource 字段、5 资料来源创建、10 操作清单、11 schema 要点。现状 title 在 6 处被强制必填：DB NOT NULL + `length BETWEEN 1 AND 200` CHECK、create 校验 min_length=1、PATCH 禁止显式 null、openapi 4 schema required、表单/编辑器必填、契约 4.1 字段表。
- 目标：`title` 可空贯穿存/取/改/显——DB 0003 放宽；create 缺省 title 或显式 null → 存 null；PATCH 显式 null = 清空标题（省略 = 不改，与 source_name/save_reason 一致）；列表/详情/删除确认/编辑器等展示处对 null 用统一占位；title 升/降序 null 固定排最后（决胜 id asc）；`q` 搜索对 null 标题无匹配（现状已安全）。
- 契约（真实标准契约变更，走完整检查，不走 evidence-only）：openapi `LearningResource.title` 与三个 Create schema `title` 变 `["string","null"]` 并移出 required；`ResourcePatch.title` 变 `["string","null"]` 且注明「省略=不改，null=清除」；中文契约 2.3/4.1/5/1.3 与示例、三向追踪同步。
- 前端：类型/解析 title 可空；表单与编辑器允许留空/清空（WEB/PASTE/FILE 一视同仁，FILE/PASTE 自动带出逻辑保留）；展示处统一占位。
- 禁止未列路径；不做：服务端自动生成标题落库、Note(心得)标题/打标签/资源后贴资料、URL 联网抓取 `<title>`、openapi `x-delivery-profile.stage` 等顺手项。
- 状态收尾（用户已选「并入下任务控制面」）：本分支首个 docs 提交一并把 TASK-025/026/028 的 MERGED 状态登记（记录+索引）带入 main；旧 `task-status-t025-t026-merging`、`task-status-t028-merging` 两纯文档分支不再单独并。

## 完成条件

1. 0001→0003 迁移对已有库无损；`learning_resources.title` 可空；既有有标题行不改写；compare_metadata/alembic check 一致；downgrade 可反转。
2. 资源 create 缺省 title（或显式 null）→ 201 且响应 title=null，列表/详情可读；提供 title 仍「去首尾空白后 1～200」，`""`/纯空白 → 422；FILE/PASTE/WEB 三来源一致。
3. PATCH：省略 title 不改；显式 `null` 清空标题（version+1）；`""` → 422；`source_url`/`pasted_content` 仍不可清空（原语义不变）。
4. 资料列表按 `title` 升/降序时无标题(null)固定排在有标题之后、决胜 id 升序；`q` 搜索在含 null title 数据下不异常且不命中 null 标题。
5. openapi 4 处 schema 与 required 集合、ResourcePatch 说明同步；中文契约 2.3/4.1/5/1.3 与「必填」表述不再自相矛盾。
6. 前端：表单可无标题保存（WEB 快存场景）、编辑器可将标题清空并保存；列表/详情/删除确认/编辑器对 null 标题显示「未命名资料」；类型 title 可空；前端与后端测试全绿，涉及表单/展示交互跑 Chromium e2e。

## 上下文包

根/后端/前端规则、本任务与上述需求/契约章节；既有 resources 后端（modules/resources/contracts.py、application、api/resources.py、api/file_upload.py、resource_store.py）、0002 迁移 batch alter 先例、models.bounded_length（`length(col) BETWEEN min AND max` 命名 `{col}_length`）、test_migrations compare_metadata。前端 ResourceForm/ResourceEditor/ResourceLibrary/ResourceDetail/ResourceDeletion/api.ts(client.ts uploadSnapshot)。按需读，不全仓扫描。

准确命令：
- `cd backend && .venv/bin/pytest tests/test_resources.py tests/test_resource_updates.py tests/test_files.py tests/test_database.py tests/test_migrations.py tests/test_resource_deletion.py`
- `cd backend && uv run alembic upgrade head && uv run alembic check`
- `cd frontend && npm run test`
- `cd frontend && npm run test:e2e`（资源/编辑相关 spec；Playwright 临时 SQLite）
- `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-029-title-nullable.md --worktree`

## 实现与测试

- 实现 SHA/变更摘要：实施中（登记后按计划推进）。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：待实施后回填。
- 已知限制/未完成项：待实施后回填。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

（本区仅允许写回状态/EVIDENCE/候选与独立报告原文；目标/风险/路径/检查/实现与测试记录在标记区外。）

- 状态登记：TASK-029 IN_PROGRESS（2026-09-05 与 TASK-025/026/028 MERGED 状态一并写入本分支控制面提交）。
<!-- EVIDENCE:END -->
