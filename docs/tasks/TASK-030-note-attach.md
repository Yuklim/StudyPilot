# TASK-030：心得「后贴资料」（独立心得后贴绑定 + 绑定心得解除回独立）

```toml
schema_version = 2
id = "TASK-030"
status = "MERGED"
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

- 后端实现：`modules/notes/contracts.py` 新增 `NoteAttach`（resource_id: UUID、expected_version: int ≥1）与 `NoteDetach`（expected_version；均 extra=forbid、strict），`NoteCreate`/`NotePatch` 未改；`note_store.py` 顶部 docstring 去掉「A note never moves between scopes in this task.」并写明两 scope 可由专用 attach/detach 双向移动，新增 `attach(note_id, resource_id, expected)`（先 `require_resource` 目标可读——不存在或 FILE 非 READY → RESOURCE_NOT_FOUND，再 `standalone` 当前必须仍独立 → 否则 NOTE_NOT_FOUND，`check_version` 守卫后写 resource_id、flush、project）与 `detach(resource_id, note_id, expected)`（`find` 当前必须仍绑定该资源，写 resource_id=None、flush、project），均单事务、content 不变、ORM version_id_col 自动 version+1/updated_at；`application/notes.py` 复用 mutate 分类新增 `attach`（mutate_standalone）与 `detach`（mutate），并发已被贴走/改版 → 新读 404/409/UNKNOWN、永不重放；`api/notes.py` 泛化 move_body 解析（非 JSON→415、坏 JSON→400、缺 expected_version→428、模型校验失败→422），`standalone_router` 增 `POST /{note_id}/attach`、绑定 `router` 增 `POST /{note_id}/detach`，均 200 `{"data": Note}`，路由注释同步。
- 契约实现：openapi-v1.json 手编新增 `NoteAttach`/`NoteDetach` schema、`attachNote`（`POST /api/v1/notes/{note_id}/attach`）与 `detachNote`（`POST /api/v1/resources/{resource_id}/notes/{note_id}/detach`）两 path/operation（含 200/400/403/404/409/415/422/428/500 与安全参数、x-contract-section）、`available_operations` +2 达 35、client_policy 补「后贴/解除」句；`Note.resource_id` 保持 readOnly。中文契约基线 §1.3 叙事追加句 + 可用表两行、§4.8 resource_id 行改写为可经 attach/detach 双向移动（NoteCreate/NotePatch 请求体仍不得直接写）、§4.8 影响集外移动句、§10 操作清单两行。
- 前端实现：`notes/api.ts` 抽出 `noteAt(value, expectedResourceId)`（null===null 成立，list/get/save 旧 scope 强校验不变）与 `movedNote` 守卫（id/content/created_at 不变、version=旧+1），新增 `attachNote(note, resourceId)`（POST `/notes/{id}/attach` body {resource_id, expected_version}）与 `detachNote(note)`（POST `/resources/{rid}/notes/{id}/detach`）；新 `ResourceAttachPicker.tsx` 搜索可读资料就地选目标；`NotesPanel.tsx` 独立卡「后贴到资料」（可展开搜索、成功后 revision+1 移出列表 + 可点提示链到资料详情）、绑定卡「解除绑定」（confirm 后 detach、成功 + 可点提示链到「我的心得」），失败走 noteError +「状态可能已变化」刷新重读不自动重放。
- 测试记录：
  - `backend/tests/test_notes.py` 新增 attach 成功+守卫、attach 拒绝不可读资源、detach 成功+守卫、`stage×move` 回滚不重放、`move` 并发单胜者（Barrier+monkeypatch NoteStore.check_version）共 8 组；契约形状测试扩展 NoteAttach/NoteDetach + attachNote/detachNote 进 available_operations；`test_taxonomy.py` `len(available)` 33→35。命令：`backend/.venv/bin/pytest tests/test_notes.py tests/test_taxonomy.py` → 101 passed；全量 `backend/.venv/bin/pytest` → 493 passed。
  - `frontend/src/features/notes/api.test.ts` 增 attach/detach 路径/body/scope 无关返回校验（含坏响应与越界输入拒发）；`NotesPanel.test.tsx` 增后贴成功/解除成功/后贴失败刷新（各用例断言成功链接 href、列表移除、body）。命令：`frontend npm run test`（vitest）→ 16 文件 337 passed（此前基线 331）；`npm run format:check && npm run lint && npm run typecheck` 全绿；`npm run build` 由 check_task 复跑。
  - e2e：`frontend/e2e/notes-pages.spec.ts` 增真 UI 往返「独立心得→后贴到资料→资料详情见该心得→解除绑定→回我的心得仍独立」（自清残留独立心得以自洽）。命令：`npx playwright test e2e/notes-pages.spec.ts` → 7 passed。
  - 契约：`OpenAPI.model_validate_json`（backend/.venv）通过；`check_task.py` contracts 组复跑。
- 已知限制/单列：main 基线 e2e 4 条红与本任务无关（在 main 上即红，见 TASK-029/030 验收时单列证据），不复跑为 PASS。无必要检查失败、无基线内新增失败。实现期间一次 NotesPanel vitest 偶发同步断言时序（失败后刷新窗口行短暂卸载）→ 改 findByText 后 3× 稳定绿。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：`e9da290d54be47ef230a9ad5988aafea01807c8a`（`check_task.py --candidate HEAD` 四组全过 CHECKS PASS：base=dea241a、files=17、product_fingerprint=`54cdcb9809b5b04523085db59accfb7d1088c3d889a7f7f669d969180d25c99d`、profiles=backend,contracts,frontend,governance、stages=worker/review/acceptance）。
- Review（L3 独立只读，真实只读 reviewer 实例，仅 Read/Grep/Glob）：**PASS**。原文：
  > 结论：PASS。审查覆盖与只读确认：仅用 Read/Grep/Glob，未修改任何文件/未运行测试，工作树=候选 e9da290d；已复核后端 note_store/application/api/contracts、测试、openapi、中文契约、前端 api/NotesPanel/ResourceAttachPicker、前后端测试与 e2e。无 git，未能核对 base..candidate 确切文件清单与索引/TASK-029 状态行（控制面文档，非功能代码）。未发现阻断：NoteCreate/NotePatch 未改且 extra=forbid、Note 保持 readOnly 可空；作用域守卫（attach 先 require_resource 再 standalone+check_version；detach 经 find 限定同资源）无越权路径；version_id_col+flush 触发 version+1、并发 StaleDataError→mutate 分类新读不回放、回滚事件测试 calls==1；删除影响集按 resource_id 计数独立心得永不误入；错误体收敛无 PRIVATE/SQL//private/Traceback 泄漏；前端 noteAt/movedNote 按目标 scope 强校验、越界拒发、失败刷新不自动重放；openapi 操作/错误码/example/schema 一致、available_operations=35、operationId 无重复。非阻断可记录建议：① test_notes.py 未直接测 attach/detach 的 expected_version 非法类型与 resource_id:null→422（共用 move_body+Pydantic strict 路径，风险低）；② 无 attach 进/detach 出 deletion-preview.note_count 的回归断言（计数按 resource_id 天然正确，e2e 已覆盖 bound=1，可后续补）；③ NotesPanel 编辑中点「后贴/解除」放弃草稿后草稿仍留在编辑器（无丢失，仅文案/行为不一致，可选优化）。剩余风险仅可选建议与未能 git 核对清单的局限。
- Acceptance（L3 独立只读，全新只读 reviewer 实例，独立于实现者与 Review 实例）：**PASS**。原文：
  > 结论：PASS（附可记录建议）。逐项完成条件落点：① attach `note_store.py:125-138` require_resource→standalone→check_version、`api/notes.py:257-266` POST /notes/{id}/attach 经 move_body(NoteAttach)、错误码 404/409(current_version)/428/422/415 齐备，测试 test_notes.py:656-735 成功/守卫/不可读资源；② detach `note_store.py:140-150` find→check_version→置 null、`api/notes.py:191-200`、测试 test_notes.py:742-795；③ 并发/失败 application 复用 mutate 分类不回放（application/notes.py:85-91,110-134）、测试 test_notes.py:800-881 回滚不回放+Barrier 单胜者；④ 契约 openapi attachNote/detachNote operationId 唯一、schema required 与 Pydantic 一致、available_operations 恰 35、Note.resource_id 仍 readOnly、中文契约 §1.3/§4.8/§10 同步、client_policy 句；⑤ 前端 api.ts:179-220 路径/body/scope 无关校验、NotesPanel.tsx:427-465 独立卡后贴与 :450-458 绑定卡解除、ResourceAttachPicker 就地搜索、api.test.ts:166-211、NotesPanel.test.tsx:260-335、e2e notes-pages.spec.ts:307-359 真 UI 往返。运行证据诚实清单：凭阅读确认实现/测试落点、错误码、schema/操作计数、TASK-029 MERGED（TASK-029-title-nullable.md:6 与索引:25）与 base=dea241a、改动均在 allowed_paths；NOT_RUN（仅见记录未复跑）后端 493/101、vitest 337、e2e 7、check_task CHECKS PASS、main 基线 4 红等。无法独立核对 git base..candidate 文件清单（无 git）。可记录非阻断项：① note_store.py:133-134 目标不可读与心得非独立两错误同时成立时返回 RESOURCE_NOT_FOUND（openapi 描述与实现顺序一致，测试仅覆盖单条件，确定性行为非缺陷）；② ARCHIVED 非 FILE 资料仍可被 attach（require_resource 不查 learning_status），与既有 create 绑定心得同语义，非本任务新引入。
- 最终状态/风险/用户操作：status=**MERGED**（L3 公共 API/契约语义+跨模块；独立只读 Review 与独立只读 Acceptance 均 PASS）。候选 `e9da290d` 经 PR #35 由**用户本人于 2026-09-05 合并**进 main，merge commit `849dc1fa93d02ef90a2e4ec63931afff3e88a9fb`（Agent 只推送任务分支与建 PR，未合并、未推 main）。本 MERGED 状态登记随 TASK-031 控制面提交带入 main。两条报告的非阻断建议均为可记录项，不阻断交付。
- 日期与决定日志：2026-09-05 用户授权做「心得后贴资料」并拍板三项产品语义（后贴+解除对称、入口仅我的心得/解除落资料详情、成功留原页+可点提示）；本任务方案经用户 ExitPlanMode 批准后开始实现。2026-09-05 实现/契约/前端完成，候选 `e9da290d` 冻结（check_task 四组 CHECKS PASS，指纹 54cdcb…，notes e2e 7 绿，main 基线 4 红单列与 030 无关）；同日 L3 独立只读 Review（reviewer 实例）PASS、独立只读 Acceptance（全新 reviewer 实例）PASS，状态置 ACCEPTED 待用户合并。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
