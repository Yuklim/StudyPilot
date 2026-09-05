# TASK-030：心得「后贴资料」（独立心得后贴绑定 + 绑定心得解除回独立）

```toml
schema_version = 2
id = "TASK-030"
status = "IN_PROGRESS"
risk = "L3"
risk_reason = "真实放宽标准 Note 契约与操作清单：`Note.resource_id` 由「绑定资料时必有且不可改」改为可经专用 attach/detach 操作版本化移动（独立心得→绑定、绑定→独立）；openapi 新增两个操作与两个 schema，x-delivery-profile.available_operations +2；跨后端 note_store/application/api、契约文档与前端心得/资料页。无数据库迁移（resource_id 列 0002 已可空）。属公共 API/契约语义变更 + 跨模块。"
risk_flags = ["public-api", "major-cross-module", "business", "tests"]
owner = "coordinator"
base = "dea241a315f406d63a15c6b866edad5b3e376183"
allowed_paths = [
  "backend/src/studypilot/modules/notes/contracts.py",
  "backend/src/studypilot/infrastructure/database/note_store.py",
  "backend/src/studypilot/application/notes.py",
  "backend/src/studypilot/api/notes.py",
  "backend/tests/test_notes.py",
  "backend/tests/test_taxonomy.py",
  "backend/tests/support.py",
  "docs/contracts/openapi-v1.json",
  "docs/contracts/API与数据契约基线.md",
  "frontend/src/features/notes/api.ts",
  "frontend/src/features/notes/NotesPanel.tsx",
  "frontend/src/features/notes/ResourceAttachPicker.tsx",
  "frontend/src/features/notes/api.test.ts",
  "frontend/src/features/notes/NotesPanel.test.tsx",
  "frontend/e2e/notes-pages.spec.ts",
  "docs/tasks/TASK-030-note-attach.md",
  "docs/tasks/TASK-029-title-nullable.md",
  "docs/tasks/任务索引.md",
]
checks = ["backend", "frontend", "contracts", "governance"]
```

## 需求与范围

- 用户 2026-09-05 授权做「心得后贴资料」，产品语义已拍板：范围=后贴+解除（对称）；入口=后贴只在顶层「我的心得」页、解除在资料详情「记录与理解」区（绑定心得只在那里可见，对称必然落点）；成功后留在原页、该条移出当前列表、给可点击成功提示（后贴→资料详情；解除→我的心得）；移动是版本化写（expected_version、version+1、content 不变、冲突/未知沿用不回放与重读核对）。
- 依据《项目需求说明》5.6/5.7/7.2（心得随手写、与资料关联后能找回）与契约 §1.3 note 操作表、§4.8 Note 字段表（`resource_id` 行「绑定资料时必有且不可改」）。现状：note 的 PATCH 只允许改 content，`Note.resource_id` 在 openapi 标 readOnly、NoteCreate/NotePatch 用 extra=forbid 拒收，note_store docstring「A note never moves between scopes in this task」——先记后贴场景无路可走。
- 目标：新增两个专用版本化操作——`attachNote`（顶层 `POST /api/v1/notes/{note_id}/attach`，body `{resource_id, expected_version}`，把当前独立心得绑定到可读目标资料）与 `detachNote`（`POST /api/v1/resources/{resource_id}/notes/{note_id}/detach`，body `{expected_version}`，把该绑定心得解除回独立）。均 200 返回 `NoteEnvelope`（version+1）；`NoteCreate`/`NotePatch` 字段不动（请求体仍拒直接写 resource_id）；不做绑定→另一资料的直改（解除+后贴两步显式完成）。契约 §4.8、§1.3、openapi 同步。
- 禁止未列路径。不做：`NotePatch`/`NoteCreate` 直接写 resource_id、绑定资料间直改、跨 scope 汇总全部心得页、资料详情浏览/挂接独立心得、心得打标签/标题/资料后贴资料、openapi `x-delivery-profile.stage`/`standard_schema_scope` 字段值改动。不编辑《项目需求说明》（属既有 5.6/5.7 落地，非需求变更）。
- 依赖/前置条件：TASK-029 已由用户合并（PR #35，merge `dea241a`，0003 迁移已上线）。无迁移依赖。
- 状态收尾并入本任务控制面提交（用户既有做法）：登记 TASK-030 的首个 docs 提交一并把 TASK-029 由 ACCEPTED 标 MERGED（记录状态行 + 任务索引行）。

## 完成条件

1. `POST /api/v1/notes/{note_id}/attach`：独立心得(resource_id null) attach 到可读目标资料 → 200 且 data.resource_id=目标、version=旧+1、content 不变；之后该条移出顶层 /notes、出现在 /resources/{rid}/notes；`getStandaloneNote` 404、`getResourceNote` 200。目标资源不存在 / FILE 非 READY → 404 RESOURCE_NOT_FOUND；attach 一条已绑定心得 → 404 NOTE_NOT_FOUND；版本不符 → 409 VERSION_CONFLICT(带 current_version)；缺 expected_version → 428；body 坏 uuid/坏版本 → 422；非 JSON → 415。
2. `POST /api/v1/resources/{resource_id}/notes/{note_id}/detach`：绑定心得 detach → 200 且 data.resource_id=null、version+1、content 不变；之后该条移出该资源、出现在顶层 /notes；跨资源寻址/已独立 → 404 NOTE_NOT_FOUND；其余错误码同条件 1。
3. 并发/失败：双线程同时 attach 同一独立心得恰一成功、另一被分类（404/冲突），不回放、DB 最终一致；事务失败回滚不重放（沿用 event.listen 模式）。
4. 契约：openapi 新增 `NoteAttach`/`NoteDetach` schema、`attachNote`/`detachNote` 两 path/operation 进 `available_operations`、client_policy 补「后贴/解除」句；中文契约 §1.3 叙事与可用表 + §4.8 `resource_id` 行不再「不可改」。后端 Pydantic 模型 ↔ openapi schema 一致性、操作进 available_operations 的契约测试同步；`test_taxonomy.py` 的 `len(available)` 33→35。
5. 前端：独立心得卡有「后贴到资料」（可搜索资料就地选目标，成功后该条移出列表 + 可点提示链到该资料详情）；绑定心得卡有「解除绑定」（成功移除 + 可点提示链到我的心得）；冲突/未知/404 走刷新重读、不自动重放；类型/解析正确（返回 note 的 resource_id 与请求 scope 无关，按移动目标校验）。vitest 与 notes e2e 覆盖后贴/解除真 UI 流。

## 上下文包

根/后端/前端规则、本任务；既有 notes 后端四文件（contracts.py、application/notes.py、api/notes.py、note_store.py）与 `resources/contracts.py`（`ResourcePatch.topic_id: UUID | None` strict 先例）、标签 attach/detach（taxonomy PUT/DELETE）仅作参照；前端 `features/notes/{api.ts,NotesPanel.tsx,NotesPage.tsx}`、`features/resources/api.ts`（listResources/resourceTitle）、`ResourceLibrary.tsx`/`ClassificationPicker.tsx` 交互参照；契约 §1.3/§4.8/§2.1/§2.3 与 openapi 对应 schema/path。按需读，不全仓扫描。

准确命令：
- `cd backend && .venv/bin/pytest tests/test_notes.py tests/test_taxonomy.py`
- `cd frontend && npm run test`
- `cd frontend && npm run test:e2e`（notes-pages spec；Playwright 临时 SQLite；注意 main 基线 4 条红与 030 无关、单列）
- `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-030-note-attach.md --candidate <SHA>`

## 实现与测试

- （实现 SHA/变更摘要、检查记录、指纹、e2e、已知限制在此区随实现写回。）

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：
- Review（L3 独立只读）：
- Acceptance（L3 独立只读）：
- 最终状态/风险/用户操作：
- 日期与决定日志：2026-09-05 用户授权做「心得后贴资料」并拍板三项产品语义（后贴+解除对称、入口仅我的心得/解除落资料详情、成功留原页+可点提示）；本任务方案经用户 ExitPlanMode 批准后开始实现。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
