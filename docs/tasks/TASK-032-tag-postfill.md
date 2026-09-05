# TASK-032：标签可后补（资料修改页标签入口 + `ResourcePatch` 支持 `tag_ids`）

```toml
schema_version = 2
id = "TASK-032"
status = "IN_PROGRESS"
risk = "L3"
risk_reason = "本任务放宽已批准的公共契约：为 `ResourcePatch` 新增 `tag_ids`（整组替换语义），同时改动 openapi-v1.json 与《API与数据契约基线》的对象定义、操作清单、错误码与版本规则叙述。属「架构/公共 API 契约」与「跨模块」（resources 写入路径首次批量写 taxonomy 的 resource_tags 关联）两项 L3 判入条件。另有一处关键数据语义决定：标签集合实际变化时资料 version 必须 +1，而 tag 关联不在 resource 行上、不会被 SQLAlchemy 自动标脏，实现若遗漏会让乐观并发在标签维度失效（前端拿到过期 version）。无数据库 schema 变更、无迁移。据此判 L3，不因「不加迁移」降级。"
risk_flags = ["contract", "public-api", "cross-module", "business", "tests"]
owner = "coordinator"
base = "e2ab283df095c82704cd16033fc9fe2c66476f58"
allowed_paths = [
  "backend/src/studypilot/modules/resources/contracts.py",
  "backend/src/studypilot/infrastructure/database/resource_store.py",
  "backend/tests/test_resource_updates.py",
  "docs/contracts/openapi-v1.json",
  "docs/contracts/API与数据契约基线.md",
  "frontend/src/features/resources/ResourceEditor.tsx",
  "frontend/src/features/resources/api.ts",
  "frontend/src/features/resources/ResourceEditor.test.tsx",
  "frontend/src/features/resources/fixtures.ts",
  "frontend/e2e/resource-edit-pages.spec.ts",
  "docs/tasks/TASK-032-tag-postfill.md",
  "docs/tasks/TASK-031-e2e-baseline-green.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

- 用户授权：2026-09-05 用户在 PR #36（TASK-031）合并后确认下一任务为「标签可后补」，范围按主 Agent 建议的 A1+A2 划定，并要求在登记前由主 Agent 亲自复核调研结论。
- 需求依据（权威原文）：`项目需求说明.md:123`「主题、标签、来源说明等可后补」、`:340`「填写必要的资料信息，主题、标签和原因可后补」、`:146`「创建和使用多个自定义标签」。
- 复核过的现状事实（主 Agent 亲自在基线 `e2ab283` 核实，非转述调研）：
  1. `frontend/src/features/resources/ResourceEditor.tsx` 共 375 行，`grep -i tag` **零命中** —— 资料修改页可改标题/来源名称/保存原因/主要主题/同类型来源内容，唯独没有任何标签入口。
  2. `backend/src/studypilot/modules/resources/contracts.py` 的 `ResourcePatch`（`extra="forbid"`）字段为 `expected_version/title/source_name/save_reason/topic_id/source_url/pasted_content`，**无 `tag_ids`**；同名 openapi schema（`docs/contracts/openapi-v1.json` `ResourcePatch`，`additionalProperties:false`、`minProperties:2`）同样无 `tag_ids`。
  3. 对照：创建路径已支持标签 —— `contracts.py` 的 `CreateBase.tag_ids`（`max_length=20` + `distinct_tags` 去重校验），openapi `WebResourceCreate`/`PasteResourceCreate`/`FileResourceCreate` 三个 schema 均含 `tag_ids`（`maxItems:20`、`uniqueItems:true`），中文契约 `:369` 亦已写明。**创建能带标签、修改不能改标签**，正是「可后补」断裂处。
  4. 现有替代路径是 taxonomy 的逐个幂等端点 `PUT/DELETE /api/v1/resources/{rid}/tags/{tid}`（`backend/src/studypilot/api/taxonomy.py:178-191`），前端仅在资料详情页 `ResourceTagEditor.tsx` 使用；改 N 个标签 = N 次请求，无事务原子性，且与「修改资料」表单不在同一处。
  5. `TAG_NOT_FOUND`（404）错误码已存在且已在契约错误码表、后端 `api/resources.py:27`、前端 `api/client.ts:75` 全链路覆盖，**本任务不新增错误码**。
  6. `resource_store.update()`（`resource_store.py:192-206`）用 `model_dump(exclude_unset=True)` 实现「省略即不改」，逐字段比对后赋值，由 ORM 版本列在真正有脏字段时才 +1 —— 这就是契约 `:164`「无变化的幂等请求不加版本」的现有落地方式。

### 目标

1. **契约**：`ResourcePatch` 新增可选 `tag_ids`，语义为**整组替换**（提交的数组即修改后的完整标签集合）：
   - 省略 `tag_ids` = 完全不动现有标签；
   - `[]` = 清空全部标签；
   - 显式 `null` **拒绝**（`422 VALIDATION_ERROR`）—— 清空用 `[]` 表达，不引入第二种写法；
   - 约束与创建路径一致：最多 20 个、不得重复（重复 → `422`）；
   - 含未知标签 → `404 TAG_NOT_FOUND`，且**不修改任何数据**（与 `topic_id` 的 `TOPIC_NOT_FOUND` 同处理位置、同事务语义）。
2. **版本语义**（本任务的关键数据决定，必须显式实现而非依赖 ORM 自动标脏）：标签集合与现值**不同**时，资料 `version` +1；**相同**时按契约 `:164` 不加版本。`tag_ids` 与其他字段在**同一事务、同一次 PATCH** 内生效，`version` 至多 +1（不因「改了标题又改了标签」加 2）。
3. **共存**：taxonomy 的逐个幂等 `PUT/DELETE .../tags/{tid}` 端点与资料详情页 `ResourceTagEditor` **保持不变**，两条路径共存；契约需写明「幂等关联端点不需版本前置条件，PATCH 批量替换走资料版本」。
4. **前端**：资料修改页 `ResourceEditor` 增加标签选择，随 PATCH 一次提交；沿用该页既有的版本冲突/未知结果处理（重读核对后明确重提，不静默重试），冲突时标签选择与其他草稿字段一并保留；冲突核对面板同时展示最新已保存的标签，便于比对。标签区复用只读的 `ClassificationBrowser`（该页既有主题选择已在用），以复选框 + 已选 chip 呈现，上限 20；**不使用 `ClassificationPicker`** —— 该组件把主题与标签绑在一起，而编辑页已有独立的「更改主要主题」控件，套用会出现两套主题控件，属于重构既有交互，超出本任务范围。
5. **契约文档同步**：`openapi-v1.json` 的 `ResourcePatch` schema 与 `updateResource` 的 `x-error-codes`（补 `TAG_NOT_FOUND`）、`API与数据契约基线.md` 的 `updateResource` 交付行（`:59`）、`ResourcePatch` 字段规则（`:616`）、错误码表（`:556`）、版本规则叙述（`:164`）同步更新，保持中英双份一致。

### 非目标 / 禁止范围

- 不做「输入即创建标签」/ typeahead-create（调研 B 项）—— 留待后续任务。
- 不让列表/详情的标签 chip 可点筛选、不加标签 OR 筛选、不把筛选条件写进 URL（调研 C 项）。多 `tag_id` 的 AND 语义（`resource_store.py:399-404`、契约 `:146`）**保持不变**。
- 不在分类管理页显示标签使用数量、不做批量解绑或标签合并（调研 D 项）。
- 不改 `Tag` 数据模型（不加颜色/描述/分组）——契约 `:273` 明确「颜色不属于已确认需求」（调研 E 项）。
- 不改 `ResourceTag` 关联模型与 `association_version` 固定 1 的约束、不改数据库 schema、**不新增迁移**。
- 不删除或改动既有 `attachResourceTag`/`detachResourceTag` 端点及其幂等语义、不改 `ResourceTagEditor.tsx`、不改 `ClassificationPicker.tsx`、不改创建表单 `ResourceForm.tsx`。
- 不改后端 `application/resources.py`、`api/resources.py`（现有 `update_resource` 转发与错误映射已足够，`TAG_NOT_FOUND` 文案已在位）——若实现中发现确需改动，属新影响，须回来重分级并扩 `allowed_paths`，不得就地越界。
- 不改学习/心得/原件相关任何路径；不改治理门禁；不动未列路径。

- 依赖/前置条件：TASK-031 已由用户合并（PR #36，merge `e2ab283`）。无迁移依赖、无未合并契约依赖。
- 并行：否，单写入者 `coordinator`（主 Agent 亲自充当 Worker，不授予自审权 —— L3 的 Review 与 Acceptance 均由独立只读子 Agent 执行）。
- 状态收尾并入本任务控制面提交（用户既有做法）：本记录的首个 docs 提交同时把 TASK-031 由 `ACCEPTED` 标 **MERGED**（记录状态行 + 索引行，合并提交 `e2ab283`、PR #36）。仅动状态与合并事实，不碰其目标、风险、路径、检查、实现与测试记录。

## 完成条件

1. `PATCH /api/v1/resources/{id}` 省略 `tag_ids` 时，资料现有标签集合逐个不变（有测试断言关联行未增删）。
2. 提交 `tag_ids` 为现有集合的真子集/超集/完全不同集合时，结果等于提交值本身（整组替换），且 `version` +1 恰好一次。
3. 提交 `tag_ids: []` 清空全部标签，资料仍可读、`resource_tags` 行被删除、`Tag` 本身**不被删除**（FK RESTRICT 不受影响）。
4. 提交与现值**完全相同**的 `tag_ids`（顺序不同也算相同）且无其他字段变化时，`version` **不变**（对齐契约 `:164`）。
5. 同时修改 `title` 与 `tag_ids` 时，两者在同一事务生效，`version` 只 +1。
6. 提交含不存在 tag 的 `tag_ids` → `404 TAG_NOT_FOUND`，且资料的标题、主题与原有标签集合**全部未变**（回滚证据）。
7. 提交重复 tag / 超过 20 个 / 显式 `null` → `422 VALIDATION_ERROR`，不写入。
8. `expected_version` 不匹配时，即便 `tag_ids` 合法也返回 `409 VERSION_CONFLICT`，标签不变。
9. 既有 `PUT/DELETE .../tags/{tid}` 的幂等行为与既有测试**一条不改、全部仍绿**。
10. 前端：资料修改页可增删标签并随保存一次提交；版本冲突后重读核对，标签草稿保留；新增前端测试覆盖「改标签保存成功」与「冲突后草稿保留」两条路径。
11. `openapi-v1.json` 与 `API与数据契约基线.md` 双份同步且互不矛盾；`check_task.py` 的 OpenAPI 结构/引用/operationId 检查通过。
12. `cd backend && ruff format --check . && ruff check . && mypy . && pytest` 全绿（pytest 数量只增不减）；`cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build` 全绿（vitest 基线 337 passed，本任务后应 >337）；`cd frontend && npm run test:e2e` 全绿（基线 36 passed）。
13. `check_task.py --task docs/tasks/TASK-032-tag-postfill.md --candidate <SHA>` CHECKS PASS，记录 product_fingerprint。
14. L3 执行链完整：独立只读 Reviewer（`.claude/agents/reviewer.md`，仅 Read/Grep/Glob）审 `e2ab283..candidate` 完整 diff 并给结论；独立只读 Acceptance（独立于实现者与 Reviewer 的第二个只读实例）核对上述完成条件与跨模块证据。两者原文写回 EVIDENCE 区。

## 上下文包

根 `AGENTS.md` + `backend/AGENTS.md` + `frontend/AGENTS.md` + 本记录。

只读参照（不改）：`backend/src/studypilot/api/taxonomy.py:170-191`（幂等端点）、`backend/src/studypilot/infrastructure/database/resource_store.py:94-99`（创建时 `validate_taxonomy` 校验 tag 存在）、`:112-113`（批量建关联）、`:140-157`（列表投影 tags）、`:399-404`（AND 筛选）、`frontend/src/features/taxonomy/ClassificationPicker.tsx`（选择器接口）、`frontend/src/features/resources/ResourceForm.tsx:64,78,273`（创建表单如何用选择器并提交 `tag_ids`）、`frontend/src/features/resources/ResourceDetail.tsx:83-95` 与 `features/taxonomy/ResourceTagEditor.tsx`（详情页既有路径，保持不变）。

需求/契约章节：`项目需求说明.md:123,146,340`；`docs/contracts/API与数据契约基线.md:59`（updateResource 交付行）、`:164`（版本规则）、`:263-284`（Tag / ResourceTag 对象）、`:369`（创建带 tag_ids）、`:373`（ResourcePatch 来源字段互斥）、`:503`（操作表）、`:556`（updateResource 错误码）、`:616`（ResourcePatch 字段规则）。

准确命令：
- `cd backend && ruff format --check . && ruff check . && mypy . && pytest`
- `cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build`
- `cd frontend && npm run test:e2e`
- `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-032-tag-postfill.md --candidate <SHA>`

不做全仓扫描。

## 实现与测试

- 实现 SHA/变更摘要：待填。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：待填。
- 已知限制/未完成项：待填。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填。
- Review：L3 独立只读 Reviewer，待填（身份、权限证据、base/candidate、findings 或 No findings、结论）。
- Acceptance：L3 独立只读 Integration/Acceptance，待填（身份、权限证据、条件→证据、结论）。
- 最终状态/风险/用户操作：待填。
- 非阻断遗留项：待填。
- 日期与决定日志：2026-09-05 用户在 PR #36 合并后授权本任务，范围定为 A1+A2；同日主 Agent 在基线 `e2ab283` 亲自复核 6 项现状事实后登记为 L3（放宽公共契约 + 跨模块 + 版本语义决定），并入 TASK-031 的 MERGED 状态收尾。
- 2026-09-05 实现阶段两处任务记录更正（均在冻结候选之前，非证据写回改授权）：① `allowed_paths` 原写 `backend/tests/test_resources.py`，实测 `updateResource` 的测试在 `backend/tests/test_resource_updates.py`（`test_resources.py` 只测创建与查询），按实际影响改为后者，路径数量不变、不扩大范围；② 目标 4 原写「复用 `ClassificationPicker`」，实现时发现该组件同时承载主题选择，而编辑页已有独立主题控件，套用会产生两套主题 UI，遂改为在编辑页内用只读 `ClassificationBrowser` 自建标签区，`ClassificationPicker.tsx` 保持不改（仍在禁止范围内）。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
