# TASK-032：标签可后补（资料修改页标签入口 + `ResourcePatch` 支持 `tag_ids`）

```toml
schema_version = 2
id = "TASK-032"
status = "IN_REVIEW"
risk = "L3"
risk_reason = "本任务放宽已批准的公共契约：为 `ResourcePatch` 新增 `tag_ids`（整组替换语义），同时改动 openapi-v1.json 与《API与数据契约基线》的对象定义、操作清单、错误码与版本规则叙述。属「架构/公共 API 契约」与「跨模块」（resources 写入路径首次批量写 taxonomy 的 resource_tags 关联）两项 L3 判入条件。另有一处关键数据语义决定：标签集合实际变化时资料 version 必须 +1，而 tag 关联不在 resource 行上、不会被 SQLAlchemy 自动标脏，实现若遗漏会让乐观并发在标签维度失效（前端拿到过期 version）。无数据库 schema 变更、无迁移。据此判 L3，不因「不加迁移」降级。"
risk_flags = ["public-api", "major-cross-module", "critical-data", "business", "tests"]
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

- 实现 SHA/变更摘要：`d3e038c`（代码与契约）+ `87badda`（risk_flags 更正，仅任务记录）。相对基线 `e2ab283` 共 12 个文件。
  - `backend/src/studypilot/modules/resources/contracts.py`（+12）：`ResourcePatch` 新增 `tag_ids: list[UUID] | None = Field(default=None, max_length=20)` 与 `replacement_tags` 校验器（null → 拒绝、重复 → 拒绝）。既有 `editable_fields` 校验器用 `model_fields_set`，因此 `tag_ids` 自动算作「至少一个可修改字段」，未改该校验器。
  - `backend/src/studypilot/infrastructure/database/resource_store.py`（+34 −5）：`update()` 先从 `changes` 取出 `tag_ids`（`model_dump(exclude_unset=True)` 保证「省略即不改」），与 `topic_id` 一起走既有 `validate_taxonomy`（未知标签 → `TAG_NOT_FOUND` 404，抛在任何写入之前）；新增私有 `_replace_tags()` 做整组替换。
  - `frontend/src/features/resources/api.ts`（+2）：`ResourceChanges` 增加 `tag_ids: string[]`。
  - `frontend/src/features/resources/ResourceEditor.tsx`（+63）：新增 `tags`/`chooseTags` 状态（初值取自 `initial.tags`）、`sameTags()` 按 id 集合比较（顺序无关）、仅在集合真的不同才写入 `changes.tag_ids`；标签区用只读 `ClassificationBrowser kind="tags"` 渲染复选框 + 已选 chip，提交前校验上限 20；冲突核对面板的 `<dl>` 增加「标签」一项展示最新已保存集合。复用既有 `resource-topic-edit` 类，**未改 `styles.css`**。
  - `docs/contracts/openapi-v1.json`（+4 −4 字段级）：`ResourcePatch` 增 `tag_ids`（`maxItems:20`、`uniqueItems:true`、说明整组替换语义）；`updateResource` 的 `x-error-codes` 增 `TAG_NOT_FOUND`。
  - `docs/contracts/API与数据契约基线.md`（6 处）：交付状态段增 TASK-032 段落；`updateResource` 交付行、版本规则（`tag_ids` 走资料版本、必须带 `expected_version`）、4.7 幂等说明、`ResourcePatch` 字段规则、`updateResource` 错误码表。
  - 测试：`backend/tests/test_resource_updates.py`（+108 −1）、`frontend/src/features/resources/ResourceEditor.test.tsx`（+51 −1）、`frontend/e2e/resource-edit-pages.spec.ts`（+44）。
- 实现过程中发现并修正的两个真实缺陷（均由新测试先失败暴露，不是事后补叙）：
  1. **版本被加了两次**。首版把 `resource.updated_at = utc_now()` 放在 `attach_tags()` 之后，而 `attach_tags()` 内部有 `flush()`：一次同时改标题与标签的 PATCH 会先冲出标题的 UPDATE（version→5），再冲出 updated_at 的 UPDATE（version→6）。测试断言 `version == 5` 实测得到 6。
  2. **autoflush 造成同样的双次 UPDATE**。把赋值提到前面后仍是 6 —— 根因是 `_replace_tags()` 读当前关联集合的那条 `select` 触发 autoflush，把同一 PATCH 的列改动提前冲成独立 UPDATE。最终用 `with self._session.no_autoflush:` 包住该读，全流程收敛为单次 UPDATE、单次版本递增。两处都在代码里留了说明注释。
- 既有断言的处置（未删除、未弱化）：`test_invalid_patch_before_database` 的参数表原有一条 `{"tag_ids": []}`，断言该请求在触库前被拒 —— 这正是本任务经授权放宽的行为。按新契约把这一条替换为三条**更严格**的形状（`None`、`"not-a-list"`、`["not-a-uuid"]`），它们仍必须在触库前 `422`；`tag_ids: []` 的合法路径由新测试断言其真实效果（清空标签、version+1）。参数总数 +2，无断言被移除。`test_missing_resources_and_contract` 的 `set(ResourcePatch.model_fields) == set(schema["properties"])` 未改，靠同步 openapi 恢复为绿 —— 该断言本身即模型↔契约一致性的看门人。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：
  - `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-032-tag-postfill.md --candidate 87badda` → **CHECKS PASS**。base=`e2ab283`、input=`87badda`、risk=L3、stages=(worker, review, acceptance)、files=12、profiles=**backend,contracts,frontend**、product_fingerprint=`25c9f9dd674b48fa0762d27a8a8f8ea948b98e0be99162f16cf8b36529c88139`。组内含 backend ruff format/lint、mypy、pytest 与 frontend format:check/lint/typecheck/vitest/build，全部 exit=0。
  - `cd backend && ruff format --check .`（65 files already formatted）/ `ruff check .`（All checks passed）/ `mypy .`（Success: no issues found in 64 source files）/ `pytest` → **497 passed**。基线为 **493 passed**（实测：把 `test_resource_updates.py` 换回 `e2ab283` 版本后 `pytest --collect-only` 得 493，随后原样还原）；净增 4 = 2 条新测试 + 参数表净增 2 条。
  - `cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build` 全绿；vitest **339 passed / 16 文件**，基线 337，净增 2（均在 `ResourceEditor.test.tsx`，该文件 27→29）。
  - `cd frontend && npm run test:e2e` → **37 passed (24.7s)**，基线 36，净增 1。运行前把未跟踪的 HANDOFF 文件临时移出以满足干净工作树要求，检查后原样放回。
  - 环境：本地 macOS（Darwin 25.5.0）、Python 3.13.9 / pytest 8.4.2、Node 24、Vitest 4.1.11、Playwright chromium、Vite 8.2.2。
  - 未运行：无迁移相关检查 —— 本任务不含数据库 schema 变更，`check_task` 自动选组也未选迁移组；不以旧 PASS 冒充。
- 已知限制/未完成项：
  - 新增 e2e 用例最初两处红都是**用例自身**的问题，已修正并记录：① 用 `Promise.all` 并发 POST 两个标签触发后端 500（隔离 SQLite 串行写），改为串行创建；② 断言 `GET /tags` 的 `total_items === 3`，但整轮 e2e 共用一个后端、其他 spec 也会建标签，改为按 id 读回被移除的标签以证明「解除关联不删除标签本身」。产品代码未因此改动。
  - 编辑页标签区未做「输入即创建标签」，仍需先去分类管理页新建（调研 B 项，本任务非目标）。
  - 标签区展开后是分页浏览器（20/页），标签很多时需翻页；与详情页既有 `ResourceTagEditor` 的体验一致，未在本任务改善。
  - 整组替换与逐个幂等端点两条路径并存，界面上分别在「修改资料」与「资料详情」两处；本任务按非目标要求未合并这两处入口。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：`b69ba60`（含需求、实现与测试证据；代码实现 SHA `d3e038c`，`d3e038c..b69ba60` 仅为 risk_flags 更正与本记录的证据写回，不含代码改动。`check_task.py --candidate 87badda` CHECKS PASS，base=`e2ab283`、files=12、profiles=backend,contracts,frontend、product_fingerprint=`25c9f9dd674b48fa0762d27a8a8f8ea948b98e0be99162f16cf8b36529c88139`、risk=L3 stages=(worker, review, acceptance)）。base..candidate 的完整 diff 已导出到 scratchpad 的 `TASK-032-full-diff.patch`（727 行），供无 Bash 的只读 Reviewer 直接 Read。
- Review：**待执行**。2026-09-05 主 Agent 尝试派发失败：本次会话以 `/Users/yuklimching` 为启动目录，项目级 `.claude/agents/reviewer.md` 未注册（`Agent type 'reviewer' not found`）；当时可用的 Agent 类型中最接近只读的 `Explore` **带 Bash**，不构成运行器层面的只读证明，按《风险分级与检查规则》「权限与独立性」不得充当独立 Reviewer。用户决定：在 StudyPilot 目录下重开会话以注册 reviewer Agent 后再审。接手会话应对 `e2ab283..b69ba60` 做首次完整 Review。
- Acceptance：**待执行**，在 Review 之后，由独立于实现者与 Reviewer 的第二个只读实例核对 14 条完成条件与跨模块证据。
- 最终状态/风险/用户操作：status=**IN_REVIEW**。实现与自动检查已完成且全绿，L3 执行链剩 Review 与 Acceptance 两步。分支 `agent/coordinator/TASK-032-tag-postfill` 目前**仅在本地**，未推送、未开 PR。
- 非阻断遗留项：见「实现与测试」的已知限制段（编辑页不支持就地新建标签、标签区分页浏览、两条标签入口分处两页），均为本任务明确的非目标，不阻断交付。
- 日期与决定日志：2026-09-05 用户在 PR #36 合并后授权本任务，范围定为 A1+A2；同日主 Agent 在基线 `e2ab283` 亲自复核 6 项现状事实后登记为 L3（放宽公共契约 + 跨模块 + 版本语义决定），并入 TASK-031 的 MERGED 状态收尾。
- 2026-09-05 `risk_flags` 更正：原写 `["contract", "public-api", "cross-module", ...]`，其中 `contract`/`cross-module` 不在 `docs/governance/risk-policy.json` 的合法取值内（check_task 报 `missing or unknown risk flags`），按策略文件改为 `["public-api", "major-cross-module", "critical-data", "business", "tests"]`。等级仍为 L3，理由未变；`critical-data` 对应 risk_reason 里已写明的乐观并发/版本语义影响。
- 2026-09-05 实现阶段两处任务记录更正（均在冻结候选之前，非证据写回改授权）：① `allowed_paths` 原写 `backend/tests/test_resources.py`，实测 `updateResource` 的测试在 `backend/tests/test_resource_updates.py`（`test_resources.py` 只测创建与查询），按实际影响改为后者，路径数量不变、不扩大范围；② 目标 4 原写「复用 `ClassificationPicker`」，实现时发现该组件同时承载主题选择，而编辑页已有独立主题控件，套用会产生两套主题 UI，遂改为在编辑页内用只读 `ClassificationBrowser` 自建标签区，`ClassificationPicker.tsx` 保持不改（仍在禁止范围内）。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
