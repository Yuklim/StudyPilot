# TASK-029：资料标题可空（阶段1b：存库可空 + 界面占位展示）

```toml
schema_version = 2
id = "TASK-029"
status = "IN_ACCEPTANCE"
risk = "L3"
risk_reason = "放宽 LearningResource 关键字段 title 为非空到可空，新增 0003 数据库迁移，改动标准 openapi 的 LearningResource 与三个 Create schema 的 required/nullable 及 ResourcePatch 可清空语义，跨后端、数据库、契约文档与前端展示；属架构/契约、迁移、重大跨模块。"
risk_flags = ["migration", "public-api", "major-cross-module", "business", "tests"]
owner = "coordinator"
base = "ed36a222f0ed930bfa97dcac1c3a47a33999ff15"
allowed_paths = [
  "backend/src/studypilot/infrastructure/database/models.py",
  "backend/src/studypilot/infrastructure/database/resource_store.py",
  "backend/src/studypilot/infrastructure/database/connection.py",
  "backend/src/studypilot/infrastructure/database/__init__.py",
  "backend/src/studypilot/modules/resources/contracts.py",
  "backend/migrations/env.py",
  "backend/migrations/versions/0003_resource_title_nullable.py",
  "backend/tests/support.py",
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
  "frontend/src/features/resources/ResourceState.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/features/resources/FilePages.test.tsx",
  "frontend/src/features/resources/ResourceEditor.test.tsx",
  "frontend/src/features/resources/ResourceDeletion.test.tsx",
  "frontend/src/features/resources/files.test.ts",
  "frontend/src/features/resources/api.test.ts",
  "frontend/src/api/client.ts",
  "frontend/src/api/client.test.ts",
  "frontend/src/features/taxonomy/ClassificationPages.test.tsx",
  "frontend/e2e/resource-pages.spec.ts",
  "frontend/e2e/resource-edit-pages.spec.ts",
  "frontend/e2e/file-pages.spec.ts",
  "frontend/e2e/learning-pages.spec.ts",
  "frontend/e2e/notes-pages.spec.ts",
  "frontend/e2e/taxonomy-pages.spec.ts",
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
- allowed_paths 增补（用户 2026-09-05 两次批准）：登记时遗漏了本任务必然连带的文件——(1) 后端 FK-OFF 迁移支撑 4 个：`database/connection.py` 新增 `migration_connection()`（migrations env.py / database __init__ / tests support.py 接线），使 Alembic 在 SQLite `PRAGMA foreign_keys=OFF` 下运行：0003 的 batch_alter 重建需 DROP 旧表，FK ON 会级联删子表（notes/progress/files/tags）；运行时连接仍默认 FK ON，行为不变，仅结构性重构；(2) 前端纯标签/占位同步 6 个：`ResourceState.tsx`（进度条 aria-label 对 null 标题用占位，避免 "null 的学习进度"）、`ClassificationPages.test.tsx`（共享添加表单「标题（必填）」→「标题」的 Testing Library 精确标签同步）、`frontend/e2e/{file,learning,notes,taxonomy}-pages.spec.ts`（Playwright 标签同步，避免 `npm run test:e2e` 被本任务标签改名新增弄红）。(1) 为迁移安全必要支撑，(2) 为标签/占位同步，均不扩大产品范围。
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

- 实现 SHA/变更摘要（base ed36a22 起，均在本任务 allowed_paths 内，含用户批准增补）：
  - `408f80e` feat(backend)：models.py `LearningResource.title` 列可空 + `bounded_length("title",0,200)` CHECK；contracts.py `CreateBase.title` 可选/显式 null（空白仍 422）、`ResourcePatch` 允许显式 null 清空标题；resource_store.py 按 title 排序时 null 固定排最后（决胜 id asc）；0003 迁移（含 FK-OFF 支撑：connection.py `migration_connection()`、migrations/env.py、database/__init__.py、tests/support.py `migrate()` 接线，运行时连接仍默认 FK ON）。
  - `922b1cb` docs(contracts)：openapi `LearningResource`/三个 Create/`ResourcePatch` 的 title 变 `["string","null"]` 并移出 required；中文契约 2.3 排序/4.1 字段/5 创建/1.3 交付放宽同步。
  - `2c90b74` feat(frontend)：api.ts/client.ts title 可空、createFileResource/uploadSnapshot 放空；新增 resourceTitle.ts「未命名资料」占位并应用到 Form/Editor/Library/Detail/Deletion/State；相关单测/e2e 同步并新增 WEB 无标题快存、编辑器清空标题用例。
  - `15f9929`/`dd01b6e` docs(tasks)：allowed_paths 增补（用户 2026-09-05 两次批准，见上）。
  - `6b4f867` test(backend)：ruff format test_migrations（第 125 行包装）。
- 检查（命令均真实运行、输出见 check 记录）：`check_task.py --candidate` 在候选 `6b4f867` 全绿——backend ruff format/check、mypy 60 源文件、pytest **484 passed**、`uv build`、openapi 快照校验、frontend prettier/eslint/tsc/**331 vitest**/vite build、governance validate + ruff + 23 单测。product_fingerprint=`1d68cdaa07a5c79338954f02bfd2d14c7ede634fe726dda6a954a7ddae1b50a6`。环境：本地 macOS/SQLite、候选对应干净工作树（运行前临时移出未跟踪 HANDOFF 件并复位）。
- e2e（`frontend npm run test:e2e` 定向）：`resource-edit-pages.spec.ts` 6/6 绿（含新增「编辑器清空标题保存未命名资料」）；`resource-pages.spec.ts` 剔除 1 条 main 既有红大测试后 3/3 绿（含新增「WEB 无标题快存→详情与资料库行均显示未命名资料」，按 id 定位避免共享库 strict-mode）。
- 已知限制/未完成项（与 TASK-029 无关的 **main 基线** e2e 红，已在 frontend=main 复现一致确认，非本任务回归，建议后续独立小任务修复）：
  1) `resource-pages.spec.ts`「real UI saves WEB and PASTE…」：main 即红——未展开 `<details>` 即填隐藏的 来源名称/保存原因；即便展开到达资料库，另见 320px `.view-switch`（卡片/列表切换）横向溢出（right=338）。本任务只做标签改名所需同步，不改其流程。
  2) `file-pages.spec.ts`「file page saves an original…」：main 即红——同样填折叠 details 内的 保存原因（选填）。
  3) `scaffold.spec.ts` 两条：main 即红——主要导航「学习记录」链接点击超时；320px 全页 overflow 断言失败（`.view-switch` 布局族）。
  ——以上 4 条在「main-frontend + 本任务 backend」与「纯 main-frontend」上复现结果一致，判定为既有基线问题。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

（本区仅允许写回状态/EVIDENCE/候选与独立报告原文；目标/风险/路径/检查/实现与测试记录在标记区外。）

- 状态登记：TASK-029 IN_PROGRESS→IN_ACCEPTANCE（2026-09-05 与 TASK-025/026/028 MERGED 状态一并写入本分支控制面提交）。
- 候选 SHA：`6b4f867`（实现+测试冻结，check_task 全 4 profiles `CHECKS PASS`，product_fingerprint=`1d68cdaa…`）。本证据提交为 docs 证据写回，不递归审查。
- 独立 Review（reviewer 子 Agent，2026-09-05，只读 Read/Grep/Glob，报告原文）：
  > 结论 **PASS** —— 无越界、迁移安全（FK-OFF 仅限迁移连接、运行时 FK 语义不变）、完成条件 1-6 均有实现与测试绑定，已知 e2e 红为 main 基线问题而非本任务回归；仅保留下述非阻断记录项。
  > 范围合规：40 个改动文件全部落在 allowed_paths（含用户两次批准增补）内，无越界。
  > 非阻断记录项：① backend FILE 无标题上传缺少一条「multipart 不带 title → 201 且 title=null」后端直测（WEB/PASTE 已覆盖、DB 三源同路径，风险低，建议后续补）；② 0003 downgrade 遇未命名行以原始 IntegrityError 失败（NOT NULL 无法凭空造标题），与 0002 先例一致且在迁移 docstring 声明，结构性限制非缺陷。
- 独立 Acceptance：待独立只读 Acceptance（第二个 reviewer 型只读实例）核对完成条件与跨模块/运行证据后回填原文；不以自审充数。
<!-- EVIDENCE:END -->
