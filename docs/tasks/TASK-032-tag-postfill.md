# TASK-032：标签可后补（资料修改页标签入口 + `ResourcePatch` 支持 `tag_ids`）

```toml
schema_version = 2
id = "TASK-032"
status = "MERGED"
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

- 候选 SHA：`8115bca`（冻结候选，含需求、实现与测试证据）。代码实现 SHA `d3e038c`，Review 修订 SHA `e138ef6`（契约表述与 openapi 404 组件）+ `8115bca`（e2e 定位方式）。`b69ba60` 是本任务**第一轮** Review 的候选，已被本候选取代；`4fb84ab` 只写本记录 EVIDENCE 区。
  - `check_task.py --task docs/tasks/TASK-032-tag-postfill.md --candidate 8115bca` → **CHECKS PASS**（exit=0）。STATIC PASS base=`e2ab283df095c82704cd16033fc9fe2c66476f58` input=`8115bca90047f82b9165d6e039ed42c0908f5028`、risk=L3、stages=('worker', 'review', 'acceptance')、files=12、profiles=backend,contracts,frontend、product_fingerprint=`216b5544b4fce57473c2c1d819e10a10770f1d6590543a59ce26106a4f9ac990`（契约文件在 Review 修订中改动，旧指纹 `25c9f9dd…` 只代表 `87badda`，已不代表本候选）。
  - 组内 11 项全部 exit=0：backend `ruff format --check`（65 files already formatted）、`ruff check`（All checks passed!）、`mypy src tests`（Success: no issues found in 60 source files）、`pytest`（**497 passed in 10.77s**）、`uv build --offline`；根目录 OpenAPI 3.1 模型校验（`OpenAPI.model_validate_json`，覆盖本次重命名的响应组件）；frontend `format:check`、`lint`、`typecheck`、`test --run`（**339 passed / 16 文件**）、`build`。
  - Review 修订后另单独重跑 `cd frontend && npm run test:e2e` → **37 passed (25.3s)**（e2e 不在 check_task 组内；本次修订唯一受影响的检查就是它）。运行 check_task 前把未跟踪的 HANDOFF 文件临时移出以满足干净工作树要求，检查后原样放回。
  - 供无 Bash 的只读子 Agent 直接 Read 的导出（主 Agent 已逐字节核对与对应 `git diff` 一致）：`TASK-032-full-diff.patch`（`e2ab283..b69ba60`，727 行）、`TASK-032-incremental-diff.patch`（`b69ba60..8115bca`，84 行）。

- Review（L3 独立只读 Reviewer，第一轮完整审查 `e2ab283..b69ba60`，结论 **CHANGES_REQUIRED**）：身份 `.claude/agents/reviewer.md`，`tools: Read, Grep, Glob`，运行器层无 Bash、无写工具——独立于实现者（主 Agent 亲自充当 Worker）。报告原文：

  > ## 只读证明与范围
  >
  > - 我在运行器层面只有 `Read`/`Grep`/`Glob`，无 `Write`/`Edit`/`Bash`；未修改、未提交任何文件。
  > - 基线 `e2ab283` → 候选 `b69ba60`。已完整读取导出的最终 diff（728 行，12 文件）并核对调用链源文件：`resource_store.py`（`update`/`_replace_tags`/`validate_taxonomy`/`_projections`）、`contracts.py`、`application/resources.py`、`models.py`（`Versioned`/`ResourceTag`）、`ResourceEditor.tsx`、`ClassificationBrowser.tsx`、两份契约相关行、三处测试。
  > - 范围合规：12 个文件全部在 `allowed_paths` 内；禁止清单（`ResourceTagEditor.tsx`、`ClassificationPicker.tsx`、`ResourceForm.tsx`、`api/resources.py`、`application/resources.py`、迁移、`styles.css`）**均未出现在 diff 中**。TASK-031 的改动只有 toml `status` 与其 EVIDENCE 区的状态行，未碰其目标/风险/路径/检查/实现测试。
  >
  > ## 核心正确性核验（无 findings 的部分）
  >
  > - **TAG_NOT_FOUND 早于任何写入**：`resource_store.py:199-203` 在 `for field, value in changes.items()` 赋值之前调用 `validate_taxonomy`；此时会话内无脏对象，autoflush 无副作用；`_transaction` 用 `sessionmaker.begin()`，异常整体回滚。完成条件 6 成立。
  > - **版本至多 +1**：`Versioned.updated_at` 有 `onupdate`，但 `onupdate` 只在行已被 UPDATE 时生效，故 `_replace_tags:229` 的显式赋值是必需的。赋值发生在**第一次 flush 之前**（后续删除用的 `select` 触发 autoflush 时一次性冲出 UPDATE，之后对象已 clean，`attach_tags` 的 flush 与末尾 `flush()` 不再产生第二次 UPDATE）。列改动 + 标签改动、纯增、纯删、纯清空四种路径都只有一次 `version_id_col` 递增。`no_autoflush` 只包住第一次读是恰当的：若包住第二次读反而会把 UPDATE 推迟到 `attach_tags` 的 flush，仍是一次，但当前写法与注释自洽。
  > - **集合相同不加版本**：`current == wanted` 早返回，顺序无关、重复已被校验器挡掉、空集正确落到 `[] == set()`。测试用 `unchanged.json()["data"] == current` 全对象比较（连 `updated_at` 一起），断言强度足够。
  > - **唯一约束/FK**：`ResourceTag` 复合主键 `(resource_id, tag_id)`；删除集 `current - wanted` 与插入集 `wanted - current` 互斥，同一 flush 内 SQLAlchemy 先 insert 后 delete 也不会撞键。`tags.id` 的 `ondelete="RESTRICT"` 不受影响，测试断言了清空关联后 Tag 仍在。
  > - **省略 vs 显式 null**：`tag_ids` 默认 `None` 且 pydantic v2 默认不校验默认值，故省略不触发 `replacement_tags`，显式 null 触发 → 422；`model_fields_set` 使 `changes.pop("tag_ids", None)` 的 `None` 唯一对应"省略"。`editable_fields` 用 `model_fields_set`，`{"expected_version":1,"tag_ids":[]}` 合法，与 openapi `minProperties:2` 一致。
  > - **测试未被弱化**：`test_invalid_patch_before_database` 删掉的 `{"tag_ids": []}` 正是本次经授权放宽的行为（原先靠 `extra="forbid"` 拒绝），替换为 `None`/`"not-a-list"`/`["not-a-uuid"]` 三条更严格形状，且 `[]` 的合法效果由新测试断言（清空 + version+1 + 表内无残留行）。参数净增 2，无断言被移除。前端两条 vitest 与新 e2e 都绑定真实输入/输出（PATCH body、version 差、按 id 读回被解绑的 tag），不是形式通过。
  >
  > ## Findings
  >
  > **F1（必须修复，仅契约文字，无需改代码）— 新写入的 4.7 段落对并发保护的表述与实现不符**
  > `docs/contracts/API与数据契约基线.md:249`：「…整组替换必须携带 `expected_version`，并发修改会得到 `409 VERSION_CONFLICT` 而不是静默覆盖，**因此不重新引入本段要避免的丢失**。」
  > - 触发条件：同一用户在资料详情页（或另一标签页）用 `PUT/DELETE .../tags/{tid}` 加/删一个标签——该路径按 2.4 与本任务非目标**不改资料 `version`**（`application/taxonomy.py:80-99` 只写 `ResourceTag`）；随后编辑页用未过期的 `expected_version` 提交 `tag_ids`。
  > - 实际影响：不会 409，整组替换**静默覆盖**对方那次关联变更——正是该段原文要避免的"整组标签覆盖造成并发丢失"。本机单用户、双入口、可重新添加，数据可恢复，影响轻微；但契约把它写成"不会发生"，是公共契约层面的事实性错误，后续实现者/审查者会据此误判防护强度。
  > - 安全修复方向（成本≈一句话）：把该结论句改为如实表述，例如「针对并发的**资料写**（含另一次 PATCH）会得到 409；但幂等关联端点无版本前置条件，其与整组替换的交叉并发仍可能被后写的整组替换覆盖，属已知取舍」，并在任务记录的非阻断遗留项中登记该残余风险。不建议改代码（让 attach/detach 递增资料版本会改动本任务明确的非目标与既有幂等语义）。
  >
  > **F2（非阻断，可顺手同 F1 一起修）** `docs/contracts/openapi-v1.json:92` 的 `updateResource` 已加 `TAG_NOT_FOUND`，但其 404 仍指向 `#/components/responses/ResourceOrTopicNotFound`（`:403`，描述"资料或其引用的主题不存在"，examples 只有 resource/topic）。触发：客户端只看 404 响应描述会漏掉 TAG_NOT_FOUND。影响：文档完整性，代码/错误码表/前端文案（`frontend/src/api/client.ts:75`、`api.ts:344`）都已覆盖，无行为差异。修复：新增或复用一个含 tag 示例的 404 响应组件。
  >
  > **F3（非阻断）** `docs/tasks/任务索引.md` 的 TASK-032 行写 `IN_PROGRESS`，而记录 toml 为 `IN_REVIEW`。§6 允许同任务索引行更新，建议下次写回时对齐。
  >
  > **F4（非阻断，测试稳健性）** `frontend/e2e/resource-edit-pages.spec.ts:513` 用 `getByRole('checkbox', { name: added.name })` 在 `ClassificationBrowser` 中直接找复选框，而该组件固定 `page_size=20`、`sort=name`（`ClassificationBrowser.tsx:26,28`），整轮 e2e 共用一个后端且其他 spec 也建标签。触发：全套标签数超过 20 且新标签排到第二页时该用例找不到复选框。影响：**响亮失败**而非静默通过，不会掩盖缺陷；修复方向：先用该组件的"搜索标签"框过滤再勾选。
  >
  > **观察（不计为缺陷）** 任务记录在冻结前自行改过两处授权面内容：`allowed_paths` 把 `test_resources.py` 换成 `test_resource_updates.py`，目标 4 由 `ClassificationPicker` 改为 `ClassificationBrowser`（记录 `:140` 已披露）。二者都是收窄/纠正而非扩权，且发生在证据写回之前，不违反 §6；但属实现者自改授权，请用户/Acceptance 知悉。
  >
  > ## 覆盖与缺口
  >
  > - 已审：完整最终 diff + 上述调用链全文，含创建路径（`:94-114`）与列表投影（`:140-157`）的语义对照——创建走 `validate_taxonomy` + `attach_tags`，PATCH 复用同一校验与插入函数，语义一致。
  > - 未能验证（无 Bash）：① 导出 patch 与 `git diff e2ab283..b69ba60` 的逐字节一致性，依赖主 Agent 声明；② `d3e038c..b69ba60` 是否确实无代码改动。二者不影响首次审查结论，因为我审的是最终 diff 全文，且其中不含意外文件。
  > - 未复跑测试：新增断言经逐条核对确与被测行为绑定，无重复执行必要；`pytest 497`/`vitest 339`/`e2e 37`/`check_task CHECKS PASS` 采信记录。
  > - 未覆盖：F1 描述的跨路径并发（幂等端点 × 整组替换）无测试，也不建议为此补测试，只需契约如实描述。
  >
  > ## 剩余风险
  >
  > 低。主要残余是 F1 的跨路径并发覆盖（单机单用户、可恢复）；标签数量多时编辑页需翻页（已在记录中作为非目标登记）。
  >
  > ## 结论
  >
  > **CHANGES_REQUIRED** —— 仅需修正 F1 的一处契约表述（并登记该残余风险），建议顺带处理 F2/F3；代码与测试无需改动。修订后可按 V2 做 `b69ba60..new_candidate` 的增量复审，我可继承本次对代码与测试的全部覆盖结论。

- Review 修订（主 Agent 作为唯一写入者执行，均在 `allowed_paths` 内，未改后端源码、前端源码与单元测试逻辑）：
  - F1 → `e138ef6`。`API与数据契约基线.md` 4.7 的结论句改写为如实表述：整组替换与另一次**资料写**并发确会 409；但幂等端点只写关联行、不推进资料 `version`，因此在它之后、仍持旧 `version` 的一次整组替换会整体覆盖那次单个增删且**不报 409**，明确记为「已知取舍（本地单用户、两处入口，重新增删即可恢复），不是已消除的风险」。主 Agent 已独立复核 `taxonomy_store.attach/detach`（`taxonomy_store.py:139-157`）确实只 `session.add/delete(ResourceTag)`、从不触碰 Resource 行，Reviewer 的触发路径属实。按 Reviewer 建议**不改代码**——让 attach/detach 递增资料版本会改动本任务明确的非目标与既有幂等语义。
  - F2 → `e138ef6`。`ResourceOrTopicNotFound` 重命名为 `ResourceTopicOrTagNotFound`，描述改为「资料、其引用的主题或其 tag_ids 引用的标签不存在。」，新增 `tag` 示例，message 用 `backend/src/studypilot/api/resources.py:27` 的真实文案「所选标签不存在。」。该组件此前仅 `updateResource` 引用，重命名后无悬空引用、无未使用组件。
  - F3 → `e138ef6`。`任务索引.md` 的 TASK-032 行 `IN_PROGRESS` → `IN_REVIEW`。
  - F4 → `8115bca`。e2e 勾选前先用「搜索标签」框按全名过滤并点「查找标签」，移除「新标签必在第一页」的假设。
  - Reviewer「观察」项（实现者在冻结前自改过 `allowed_paths` 与目标 4 的措辞）不作为缺陷处置，原样保留在下方决定日志中，供用户与 Acceptance 知悉。

- Review（第二轮增量复审 `b69ba60..8115bca`，同一 Reviewer，结论 **PASS**）：报告原文：

  > ## 增量复审（`b69ba60..8115bca`）
  >
  > **只读证明**：仍只有 `Read`/`Grep`/`Glob`，无写工具、无 Bash；本次未创建或修改任何文件。
  >
  > **继承的旧覆盖（显式声明）**：我对 `e2ab283..b69ba60` 的完整最终 diff 及调用链的审查结论继续有效，具体继承——`resource_store.update()/_replace_tags()` 的校验顺序与单次版本递增、`ResourcePatch.tag_ids` 的省略/null/重复/上限语义、`resource_tags` 删除+插入的键互斥与 FK RESTRICT、`ResourceEditor` 的 `sameTags`/仅变化才发送/冲突草稿保留、后端与前端新增测试的断言绑定。本增量的 5 个文件中**没有任何后端源码、前端源码或单元测试逻辑**改动（只有 e2e 的定位方式、两份契约文本、任务记录与索引），故上述覆盖无需重做。
  >
  > **范围**：5 个文件全部在 `allowed_paths` 内，无越界、无禁止清单文件。
  >
  > ## 逐项核验
  >
  > - **F1（已修复，表述与实现一致）** `API与数据契约基线.md:249` 新句三个断言逐条对得上代码：幂等端点只写 `ResourceTag`、不推进资料 `version`（`application/taxonomy.py:80-99`）；整组替换与另一次资料写并发确会 409（`check_version` + `version_id_col`，`application/resources.py:52-60` 的 StaleDataError→409 分类）；交叉并发下持旧 `version` 的整组替换整体覆盖且不报 409——这正是我上轮追踪的路径。定性为「已知取舍…不是已消除的风险」，与《风险分级》对本机单用户场景的判断一致。**无新的不实断言**；未过度声明前端的缓解（编辑页未改标签时不发 `tag_ids`），也未与 2.4 冲突。
  > - **F2（已修复，无悬空引用）** 独立 grep 验证：`ResourceOrTopicNotFound` 全仓 **0 命中**；`ResourceTopicOrTagNotFound` 恰 2 处 = 定义（`openapi-v1.json:403`）+ 唯一 `$ref`（`:91`，`updateResource` 的 404）。无其他 operation 引用过旧组件，故无破坏、无孤儿组件。新增 `tag` 示例 message「所选标签不存在。」与 `backend/src/studypilot/api/resources.py:27` 的真实文案一致，未捏造。其余 `TagNotFound`/`TopicOrTagNotFound`/`ResourceOrTagNotFound` 未被波及。
  > - **F3（已修复）** 索引 TASK-032 行 → `IN_REVIEW`，与记录 toml 一致；仅动本任务行，属 §6 允许范围。
  > - **F4（已修复，且未引入新不稳定）** `ClassificationBrowser` 的 `labels.tags='标签'`（`taxonomy/api.ts:5`），故 `searchbox` 可及名恰为「搜索标签」、按钮「查找标签」，与新选择器一致；该页此时只展开了标签浏览器（`chooseTopic` 为 false），不会与「搜索主题」歧义。后端 `taxonomy_store.page:106-114` 是**先在全量行上做归一化子串过滤、再分页**，加上 `normalized_name` 唯一，按全名搜索必得唯一结果且落在第 1 页；`exact: true` 排除子串型同名碰撞。翻页假设被彻底移除，未引入新的时序依赖。
  > - **`4fb84ab` 的 EVIDENCE 纪律** 该提交对 TASK-032 记录的 5 行改动全部落在 `<!-- EVIDENCE:BEGIN/END -->` 之间（候选 SHA、Review、Acceptance、最终状态、非阻断遗留项），toml、目标、非目标、完成条件、上下文包、「实现与测试」段**一字未动**。未借证据写回变更授权/风险/路径/检查。合规。
  >
  > ## Findings
  >
  > **No blocking findings.**
  >
  > 非阻断记账项（供主 Agent 下次写回时处理，不需为此再冻结一次候选）：
  > 1. `docs/tasks/TASK-032-tag-postfill.md` EVIDENCE 区在 `8115bca` 上仍写「候选 SHA：`b69ba60`」「Review：待执行」，与实际冻结候选 `8115bca` 及本轮已完成的 Review 不符——属正常的下一次证据写回内容，但 Acceptance 阅读时需知实际候选为 `8115bca`。
  > 2. 同处应补记 `check_task.py --candidate 8115bca` 的新 `product_fingerprint`（契约文件已变，旧指纹 `25c9f9dd…` 不再代表本候选）；主 Agent 已说明正在取回。
  > 3. 上轮登记的两项残余风险照旧：交叉并发覆盖（现已如实写入契约 4.7，建议在任务记录非阻断遗留项中也留一行）、编辑页不支持就地新建标签/标签区分页浏览（本任务明确非目标）。
  >
  > ## 覆盖与缺口
  >
  > - 已审：完整增量 diff（84 行、5 文件）+ 受影响上下文（`ClassificationBrowser` 搜索路径与 `labels`、`taxonomy_store.page` 的过滤/分页顺序、`application/taxonomy.py` 的 attach/detach 写入面、openapi 全仓引用图）。
  > - 机械证据：本增量唯一受影响的检查是 e2e，已重跑 **37 passed**；format/lint/typecheck 全绿；后端零改动，`87badda` 的 `pytest 497 passed` 仍绑定未变的被测代码，无需重跑（不属于「拿旧 SHA 充数」）。`check_task --candidate 8115bca` CHECKS PASS 采信，其中的引用完整性我已独立 grep 复核。
  > - 缺口（同上轮）：无 Bash，未能自证导出 patch 与 `git diff b69ba60..8115bca` 逐字节一致，采信主 Agent 声明；但增量内容自洽且无意外文件。
  >
  > ## 剩余风险
  >
  > 低。仅余已在契约中如实记录的跨路径并发覆盖（本机单用户、可恢复）与本任务明示的非目标限制。
  >
  > ## 结论
  >
  > **PASS**（针对新候选 `8115bca`；含上述三项已明确处置的非阻断记账项，不等于零问题）。

- Acceptance（L3 独立只读 Integration/验收，候选 `8115bca`，结论 **PASS**）：身份为第三个 `.claude/agents/reviewer.md` 实例（`tools: Read, Grep, Glob`，无 Bash、无写工具），无上下文继承，独立于实现者（主 Agent）与 Reviewer。报告原文：

  > ## 只读证明与核对对象
  >
  > - 我的工具白名单只有 `Read` / `Grep` / `Glob`；无 `Write`/`Edit`/`Bash`。本次未创建、修改、提交任何文件。
  > - 基线 `e2ab283` → **冻结候选 `8115bca`**。变更面读自导出的 `TASK-032-candidate-diff.patch`（12 文件）；**代码/契约/测试的事实核对我直接 Read 工作区文件**（= 候选内容，`fcb3266` 只动文档），不依赖该 patch 的可信度。
  > - 未复跑任何检查（L3 Acceptance 不默认重跑；我也无 Bash）。机械数字采信记录，但已核对其内部自洽性。
  >
  > ## 14 条完成条件逐条核对
  >
  > | # | 证据位置 | 结论 |
  > | --- | --- | --- |
  > | 1 省略 tag_ids 不动标签 | `resource_store.py:195,199`（`exclude_unset` + `pop(...,None)`，`tag_ids is None` 时不进 `_replace_tags`）；`test_resource_updates.py` 新测「只改标题」步：`tag_names==["长期","面试"] and version==4` | 满足（断言经响应投影而非直接查 `resource_tags` 行；投影由 join 派生，等价） |
  > | 2 子集/超集/异集整组替换、version 恰好 +1 | 同测试链：`[]→{入门,面试}` v1→2；`{入门,面试}→{面试,长期}` v2→3；`{长期,面试}→{入门}` v4→5；`{入门}→[]` v5→6，逐步钉死版本值 | 满足 |
  > | 3 `[]` 清空、资料可读、行删除、Tag 保留 | `current["tags"]==[]`、`session.scalars(select(ResourceTag)).all()==[]`、`GET /tags total_items==3`、`GET path == current` | 满足（唯一的行级断言在此） |
  > | 4 同集合（乱序）不加版本 | `unchanged.json()["data"] == current` 全对象比较（含 version/updated_at）；`resource_store.py:223` `current==wanted` 早返回 | 满足 |
  > | 5 title + tag_ids 同事务、version 只 +1 | `together` 步：title 变更 + `tags==["入门"]` + `version==5`（从 4）；实现用 `no_autoflush` + 提前赋 `updated_at` 收敛为单次 UPDATE | 满足 |
  > | 6 未知 tag → 404 且不写入 | `resource_store.py:199-206` 校验在赋值循环**之前**（`check_version`→源类型→`validate_taxonomy`→赋值）；测试用 `{title:"不能部分保存", tag_ids:[uuid4()]}` → 404 TAG_NOT_FOUND，末尾 `GET == before`（全响应等值，覆盖标题/主题/标签/版本） | 满足 |
  > | 7 重复 / >20 / 显式 null → 422 不写入 | `contracts.py` `tag_ids: list[UUID] \| None = Field(max_length=20)` + `replacement_tags`（null 拒绝、去重）；测试三种形状均 422 VALIDATION_ERROR，末尾全响应等值；`test_invalid_patch_before_database` 另加 `None`/`"not-a-list"`/`["not-a-uuid"]` 触库前拒绝 | 满足 |
  > | 8 版本不匹配 → 409，标签不变 | `update()` 第 194 行 `check_version` 先于一切；测试 `{expected_version:1, tag_ids:[]}` → 409 且 `details.current_version==2`（`error()` 助手强断言 code/details/request_id），随后全响应等值 | 满足 |
  > | 9 既有 `PUT/DELETE .../tags/{tid}` 一条不改 | base..candidate 中后端测试仅 `test_resource_updates.py` 一个文件；幂等端点测试在 `backend/tests/test_taxonomy.py:239-263,333-340,393-408`，**未出现在 diff** | 满足 |
  > | 10 前端改标签保存 + 冲突草稿保留 | `ResourceEditor.test.tsx:144`（PATCH body `{tag_ids:[tagId], expected_version:1}`，且回到原集合时保存按钮 disabled）、`:166`（409→重读→草稿仍「标签：未添加」、最新面板显示服务端新标签→最终 body `{tag_ids:[], expected_version:3}`）；e2e `resource-edit-pages.spec.ts` 新用例（真实 PUT 建关联→页面移除一个/勾选一个→`after.version===before.version+1`、按 id 读回被解绑 tag 仍存在、`pageerror` 为空） | 满足 |
  > | 11 双份契约同步且互不矛盾 | openapi `ResourcePatch.tag_ids`（`type:array`→null 不合法、`maxItems:20`、`uniqueItems:true`、整组替换描述）；`x-error-codes` 增 `TAG_NOT_FOUND`；404 组件改名 `ResourceTopicOrTagNotFound`（我独立 grep：旧名在 openapi **0 命中**，新名定义+唯一 `$ref`，无悬空/孤儿）；中文契约 `:59/:164/:284/:556/:616` 与后端逐条对应（省略/`[]`/null-422/上限 20/去重/404 不写入/集合变化才 +1/必须带 expected_version）；`:506-507` 幂等端点段落未被改动 | 满足（后端实现、openapi、中文契约三方无矛盾） |
  > | 12 全套检查全绿、数量只增不减 | 后端 497（基线 493 = +2 新测试 +2 参数，与 diff 中恰好 2 个新 `def test_` 和参数表 1→3 自洽）；vitest 339（基线 337，我 grep `ResourceEditor.test.tsx` 恰 11 个 `it` 中 2 个为新增，27→29 自洽）；e2e 37（基线 36，恰 1 个新 `test`）。三项均只增不减 | 满足（见 O3） |
  > | 13 `check_task --candidate 8115bca` CHECKS PASS + 指纹 | EVIDENCE 记录 exit=0、base/input 全 SHA、files=12、profiles=backend,contracts,frontend、`product_fingerprint=216b5544…`（并明确旧指纹 `25c9f9dd…` 只代表 `87badda`） | 满足 |
  > | 14 L3 执行链 | Reviewer 两轮报告**原文**均在 EVIDENCE 区，含只读证明（`.claude/agents/reviewer.md`，仅 Read/Grep/Glob、无 Bash）、独立于实现者的声明、第一轮 CHANGES_REQUIRED + 第二轮针对 `8115bca` 的 PASS 及显式继承范围；Acceptance = 本报告（第三个只读实例） | 满足（待主 Agent 原文写回后闭合） |
  >
  > ## 跨模块 / 治理核对
  >
  > - **路径**：12 个改动文件全部在 `allowed_paths` 内。禁止清单 `ResourceTagEditor.tsx`、`ClassificationPicker.tsx`、`ResourceForm.tsx`、`api/resources.py`、`application/resources.py`、`styles.css`、迁移目录、`test_resources.py`、`test_taxonomy.py` 在 base..candidate diff 中**零出现**。
  > - **证据写回纪律（`fcb3266`）**：我把候选内 TASK-032 记录全文（patch 中的 143 行）与工作区当前文件逐段比对——toml 仅 `status` `IN_REVIEW→IN_ACCEPTANCE`；`risk/risk_reason/risk_flags/base/allowed_paths/checks` 与「需求与范围/目标/非目标/完成条件/上下文包/实现与测试」**逐字未变**；新增约 100 行全部落在 `<!-- EVIDENCE:BEGIN/END -->` 内。索引行 `IN_ACCEPTANCE` 与 toml 一致。`4fb84ab` 的同类核对由 Reviewer 完成（5 行全在标记区内），我采信。
  > - **两处自改授权面**：② 目标 4 改用只读 `ClassificationBrowser` 属**收窄**（`ClassificationPicker.tsx`/`ClassificationBrowser.tsx` 均未改动，已核实不在 diff）；① `allowed_paths` 用 `test_resource_updates.py` 换 `test_resources.py` 是**等价替换而非扩权**（路径数不变，`test_resources.py` 实际一字未动），发生在冻结之前且已披露。二者不违反 §6，但属唯一写入者自行调整授权面，请用户合并时知悉。
  > - **前端跨模块闭环**（我独立核对，非采信）：`ResourceEditor.tsx:159-176` 对 404 `TAG_NOT_FOUND` 不进入 recovery、保留草稿、经 `api.ts:344`+`client.ts:75` 显示「这个标签已不存在，请重新选择。」，与既有 `TOPIC_NOT_FOUND` 行为一致；openapi 新增的 tag 示例 message「所选标签不存在。」与 `api/resources.py:27` 真实文案一致。
  > - **非阻断遗留项**：跨路径并发覆盖（幂等端点不推进资料 `version`）已如实写入契约 4.7 并在 EVIDENCE 登记为「已知取舍、不是已消除的风险」。按《风险分级与检查规则》实际风险判据：触发需本机单用户在两个入口交叉操作，影响是一次单标签增删被覆盖、重新增删即恢复，修复成本需改动本任务明示的非目标与既有幂等语义 → **可记录后继续，不阻断**。
  >
  > ## Findings
  >
  > **No blocking findings.** 非阻断观察（无需重新冻结候选）：
  >
  > - **O1** 条件 1 的「关联行未增删」是经响应投影断言，行级 `select(ResourceTag)` 断言只出现在清空场景。等价，不建议补测。
  > - **O2** 严格的「非空真子集」替换（只删不增且剩余非空）无直接单测；空集真子集、混合增删、纯清空均已覆盖，且三者共用同一套集合运算（`current-wanted` / `wanted-current`），无实际风险。
  > - **O3** `mypy .`（64 files）的证据绑定 `87badda`，候选 `8115bca` 的 check_task 跑的是 `mypy src tests`（60 files）。因 `87badda..8115bca` **无任何 Python 改动**（增量仅 e2e `.ts`、两份契约、任务记录/索引），前者仍绑定候选的 Python 内容，不属「拿旧 SHA 充数」；仅供知悉。
  > - **O4** `frontend/src/features/resources/fixtures.ts` 在 `allowed_paths` 内但未改动（允许非要求），无影响。
  >
  > ## 剩余风险与结论
  >
  > 剩余风险低：仅余已在公共契约中如实记录的跨路径并发覆盖，以及本任务明示的非目标（不支持就地新建标签、标签区 20/页分页、两处入口分列）。不阻断交付。
  >
  > **结论：PASS**（针对候选 `8115bca`；含上述 4 项已处置的非阻断观察，不等于零问题）。合并仍须由用户本人执行。

- 最终状态/风险/用户操作：status=**MERGED**。L3 执行链已完整闭合：实现 + 自动检查（`check_task --candidate 8115bca` CHECKS PASS）+ 独立只读 Reviewer 两轮（CHANGES_REQUIRED → 修订 → 针对 `8115bca` 的 PASS）+ 独立只读 Acceptance（PASS，逐条核对 14 条完成条件与跨模块证据）。剩余风险低，无阻断项。分支 `agent/coordinator/TASK-032-tag-postfill` 目前**仅在本地**，未推送、未开 PR——**需要用户操作**：由用户本人决定并执行推送/开 PR/合并，Agent 不合并、不向 main 推送。合并后本记录状态改 MERGED 的登记按既有做法并入下一个已授权任务的控制面提交。（候选 `8115bca` 已由用户本人于 2026-09-05 16:22Z 执行合并，PR #37，merge commit `b6ab87e`；本状态登记按既有做法并入 TASK-033 的控制面提交。）
- 非阻断遗留项：① **跨路径并发覆盖**——幂等关联端点 `PUT/DELETE .../tags/{tid}` 不推进资料 `version`，其后一次持旧 `version` 的 `tag_ids` 整组替换会覆盖那次单个增删且不报 `409`；已如实写入契约 4.7，本机单用户、重新增删即可恢复，按《风险分级与检查规则》判为可记录后继续。②【已由 TASK-033 解决：新增共享 `TagCreateField`，三处写入侧入口均支持就地新建并选用】编辑页不支持就地新建标签（调研 B 项）、标签区为 20/页的分页浏览、两条标签入口分处「修改资料」与「资料详情」两页——均为本任务明确的非目标。
- 日期与决定日志：2026-09-05 用户在 PR #36 合并后授权本任务，范围定为 A1+A2；同日主 Agent 在基线 `e2ab283` 亲自复核 6 项现状事实后登记为 L3（放宽公共契约 + 跨模块 + 版本语义决定），并入 TASK-031 的 MERGED 状态收尾。
- 2026-09-05 `risk_flags` 更正：原写 `["contract", "public-api", "cross-module", ...]`，其中 `contract`/`cross-module` 不在 `docs/governance/risk-policy.json` 的合法取值内（check_task 报 `missing or unknown risk flags`），按策略文件改为 `["public-api", "major-cross-module", "critical-data", "business", "tests"]`。等级仍为 L3，理由未变；`critical-data` 对应 risk_reason 里已写明的乐观并发/版本语义影响。
- 2026-09-05 实现阶段两处任务记录更正（均在冻结候选之前，非证据写回改授权）：① `allowed_paths` 原写 `backend/tests/test_resources.py`，实测 `updateResource` 的测试在 `backend/tests/test_resource_updates.py`（`test_resources.py` 只测创建与查询），按实际影响改为后者，路径数量不变、不扩大范围；② 目标 4 原写「复用 `ClassificationPicker`」，实现时发现该组件同时承载主题选择，而编辑页已有独立主题控件，套用会产生两套主题 UI，遂改为在编辑页内用只读 `ClassificationBrowser` 自建标签区，`ClassificationPicker.tsx` 保持不改（仍在禁止范围内）。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
