# TASK-035：标签批量关联操作（清空关联 + 合并到另一个标签）

```toml
schema_version = 2
id = "TASK-035"
status = "IN_REVIEW"
risk = "L3"
risk_reason = "新增两个公共 API 操作（`detachAllTagResources`、`mergeTag`）与一个新错误码，属「公共 API 契约」这一 L3 判入条件。二者都是**批量写**：一次请求可删除或移动任意多条 `resource_tags` 关联，且 `mergeTag` 还会删除源标签本身 —— 这是本仓库此前没有过的写入形态（既有关联端点一次只动一条），事务边界、并发守卫与失败回滚都必须新设计。合并还涉及一处关键数据语义：目标标签已有的关联不得产生重复主键，源标签的 FK 是 `ON DELETE RESTRICT`，因此删除源标签前必须确保其关联已全部移走或删除，顺序错了会在数据库层报错而非给出可理解的响应。无数据库 schema 变更、无迁移。"
risk_flags = ["public-api", "critical-data", "business", "tests"]
owner = "coordinator"
base = "113f765052ecc73de7e81b4b2c3a181f3a3a9dac"
allowed_paths = [
  "backend/src/studypilot/modules/taxonomy/contracts.py",
  "backend/src/studypilot/api/taxonomy.py",
  "backend/src/studypilot/application/taxonomy.py",
  "backend/src/studypilot/infrastructure/database/taxonomy_store.py",
  "backend/tests/test_taxonomy.py",
  "docs/contracts/openapi-v1.json",
  "docs/contracts/API与数据契约基线.md",
  "frontend/src/api/client.ts",
  "frontend/src/features/taxonomy/api.ts",
  "frontend/src/features/taxonomy/api.test.ts",
  "frontend/src/features/taxonomy/ClassificationManager.tsx",
  "frontend/src/features/taxonomy/ClassificationPages.test.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/taxonomy-pages.spec.ts",
  "docs/tasks/TASK-035-tag-bulk-relink.md",
  "docs/tasks/TASK-034-taxonomy-usage.md",
  "docs/tasks/TASK-033-tag-usability.md",
  "docs/tasks/TASK-032-tag-postfill.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

- 用户授权：2026-09-06 用户在 PR #39（TASK-034）合并后要求「先把 B 做完再讨论 A（阅读器方向）」。主 Agent 列出 B 中真正还开着的四项（B1 批量解绑、B2 标签合并、B3 OR 筛选、B4 跨路径并发覆盖）并说明 B1/B2 同源、B4 需推翻既有契约规则应单独谈，用户选定**「先做 B1+B2」**。B3 与 B4 明确不在本次范围。
- 需求依据：`项目需求说明.md:146`「创建和使用多个自定义标签」。TASK-034 让「哪些标签在用、用了几份」变得可见之后，缺的是**清理手段** —— 看得见僵尸标签却只能逐份解除。
- 复核过的现状事实（主 Agent 亲自在基线 `113f765` 核实）：
  1. 关联写入只有单条路径：`taxonomy_store.py:162 attach()` / `:174 detach()`，各自 `validate_parents` 后动一行；对外是 `PUT/DELETE /api/v1/resources/{rid}/tags/{tid}`（`api/taxonomy.py:178-191`）。**没有任何端点能一次处理多条关联。**
  2. 因此「把某标签从 N 份资料上摘掉」在客户端是 N 次请求且无原子性；「改名撞到已有标签」直接 `409 DUPLICATE_TAG`（`taxonomy_store.py:43-49`），没有「合并到已有标签」的路径。
  3. `ResourceTag` 复合主键 `(resource_id, tag_id)`（`models.py:249-254`），因此合并时目标标签已有的资料**不能再插一行**，否则主键冲突。
  4. `ResourceTag.tag_id` 的外键是 `ON DELETE RESTRICT`（`models.py:252`），且 `taxonomy_store.py:85-91 delete()` 在有引用时主动抛 `409 TAXONOMY_IN_USE`。所以合并必须**先移走关联、再删源标签**，顺序错了会在数据库层失败。
  5. 计数能力已就绪（TASK-034）：`usage()` 一次聚合、`references()` 单查，`resource_count` 已在分类端点响应里。
  6. 破坏性操作在本仓库已有既定重模式：资料删除走「`POST /resources/{id}/deletion-preview` → 5 分钟一次性 256 位令牌 → 专用头确认 → 重算 `impact_revision`，变化即 `409 DELETION_IMPACT_CHANGED`」（契约 `:485-488`）。

### 目标

1. **清空某标签的全部关联（B1）**：`POST /api/v1/tags/{tag_id}/detach-all`，operationId `detachAllTagResources`。请求体 `{expected_resource_count}`；一次事务内删除该标签的全部 `resource_tags` 行；**标签本身保留**（用户随后可自行删除或继续使用）。响应 200 `TagUsageEnvelope`，其 `resource_count` 为 0。
2. **把一个标签合并进另一个（B2）**：`POST /api/v1/tags/{tag_id}/merge`，operationId `mergeTag`。请求体 `{target_tag_id, expected_version, expected_resource_count}`；一次事务内：把源标签的每条关联移到目标标签（目标已有该资料的直接丢弃源行，不重复插入）、删除源标签的全部关联、**删除源标签本身**。响应 200 `TagUsageEnvelope`，为**目标**标签的最新投影（含合并后的 `resource_count`）。
3. **并发守卫（本任务的关键设计决定）**：两个操作都必须携带 `expected_resource_count` —— 即调用方在界面上看到的份数。服务端在同一事务内重算，不符即 `409 TAXONOMY_USAGE_CHANGED`，`details` 只含 `resource_count`（当前真实值），**不写入任何数据**。
   理由：这是批量写，一次可影响任意多条关联，而 TASK-034 刚让份数在界面上常态可见 —— 用户是对着一个数字做决定的，那个数字必须参与守卫。选它而不套用资料删除的「预览 + 一次性令牌」重模式，是因为后者为**级联删除资料及其原件/心得/历史**设计（不可逆、影响集合复杂，故需 `impact_manifest` 与 256 位令牌）；本任务只动关联行，不删任何资料、不动正文，且清空后可重新逐个加回，可逆性完全不同。用份数做守卫是与风险相称的最小充分手段。此取舍写入契约，供后续复评。
   `mergeTag` 另需 `expected_version`（源标签会被删除，与既有 `deleteTag` 的强版本前置一致）。
4. **资料版本不因此递增**：两个操作都只写 `resource_tags`，不推进任何 `LearningResource.version` —— 与既有幂等关联端点一致。契约需写明这一点，并明确它与 TASK-032 已登记的「跨路径并发覆盖」是同一类已知取舍（B4，本任务非目标）。
5. **前端**：分类管理页的标签卡片/删除面板提供「清空关联」与「合并到…」两个入口；两者都先展示将影响的份数、要求二次确认，并把界面上的份数作为 `expected_resource_count` 提交；`409 TAXONOMY_USAGE_CHANGED` 如实提示「份数已变化」并引导重新读取，不自动重试。
6. **契约同步**：openapi 新增两个操作、两个请求 schema、新错误码 `TAXONOMY_USAGE_CHANGED`；中文契约同步交付状态段、操作清单、错误码表、4.7 ResourceTag 段（批量路径与既有幂等单条路径并存的说明）、以及第 3 点的取舍理由。

### 非目标 / 禁止范围

- **不做 B3 OR 筛选**：多 `tag_id` 仍为 AND，契约 `:146` 不动。
- **不做 B4 跨路径并发覆盖的修复**：那需要让幂等关联端点递增资料版本，会推翻契约「幂等标签关联不需要版本前置条件」并破坏 TASK-032 的明示非目标；本任务不碰，其登记的遗留项保持不变。
- **不为主题做对应操作**：主题与资料是一对多（`LearningResource.topic_id`），「批量重分配主题」是写 `resources` 的另一类操作，且契约 `:491` 明确要求逐份调用 resources 修改；本任务只做标签。
- 不改 `Tag`/`Topic`/`TagUsage`/`TopicUsage` 的字段，不改 `resource_count` 语义与聚合实现。
- 不改既有 `attachResourceTag`/`detachResourceTag` 的语义与幂等性，不改 `deleteTag` 的 `TAXONOMY_IN_USE` 行为。
- 不改数据库 schema、不加迁移、不加索引。
- 不引入「预览 + 一次性令牌」模式，不改资料删除的既有流程。
- 不做标签改名去重的自动引导（改名撞名仍 `409 DUPLICATE_TAG`；合并是独立操作，由用户显式发起）。
- 不动 `ClassificationPicker`/`ClassificationBrowser`/`ResourceTagEditor`/`TagCreateField`/`ResourceLibrary`。
- 不动未列路径。

- 依赖/前置条件：TASK-034 已由用户合并（PR #39，merge `113f765`）。无迁移依赖。
- 并行：否，单写入者 `coordinator`（主 Agent 亲自充当 Worker，不授予自审权；L3 的 Review 与 Acceptance 均由独立只读子 Agent 执行）。
- 状态收尾与记录订正并入本任务控制面提交：
  - 把 TASK-034 由 `ACCEPTED` 标 **MERGED**（merge `113f765`、PR #39）。
  - **订正三处已过期的遗留登记**（这些遗留项已被后续任务实际解决，但原记录仍写着「仍在」，会误导后来者）：TASK-033 记录里的 F3、F4 与「管理页仍无标签使用量」已由 TASK-034 交付；TASK-032 记录里的「编辑页不支持就地新建标签」已由 TASK-033 交付。仅在各自 EVIDENCE 区补注「已由 TASK-0xx 解决」，不改其目标、风险、路径、检查与实现记录。

## 完成条件

1. `POST /api/v1/tags/{id}/detach-all` 携带正确的 `expected_resource_count` 时，删除该标签的全部关联、标签本身保留、响应 `resource_count` 为 0；相关资料本身（标题、主题、其他标签、心得、学习记录）一律不变。
2. `detach-all` 在标签本无关联（计数 0）且 `expected_resource_count` 为 0 时成功且无副作用。
3. `POST /api/v1/tags/{src}/merge` 把源标签的关联移到目标标签：原本只有源的资料获得目标标签；**原本已有目标的资料不重复、不报错**；合并后源标签的全部关联消失且源标签本身被删除；目标标签的 `resource_count` 等于合并后去重的真实份数。
4. 合并不改变任何资料的其他数据（标题、主题、其他标签、心得、学习记录、原件）。
5. `expected_resource_count` 与服务端实算不符时返回 `409 TAXONOMY_USAGE_CHANGED`，`details` 只含当前 `resource_count`，且**数据库无任何写入**（关联数、标签数、资料版本全部不变）。
6. `merge` 的 `expected_version` 与源标签当前版本不符时返回 `409 VERSION_CONFLICT`，无写入。
7. 源标签或目标标签不存在 → `404 TAG_NOT_FOUND`，无写入；`target_tag_id` 等于源 → `422 VALIDATION_ERROR`，无写入。
8. 两个操作都不推进任何 `LearningResource.version`；有测试断言合并/清空前后相关资料的 `version` 不变。
9. 中途失败（例如注入提交期异常）时整体回滚：关联、标签、资料三者全部保持操作前状态。
10. openapi 新增两个操作与其请求 schema、`TAXONOMY_USAGE_CHANGED` 进入相关 `x-error-codes`；`Tag`/`Topic`/`TagUsage`/`TopicUsage`/`ResourceProjection` 的既有引用一字未动；`check_task` 的 OpenAPI 结构/引用/operationId 检查通过。
11. 《API与数据契约基线》同步：交付状态段、操作清单、错误码表、4.7 段落（批量路径与幂等单条路径并存、资料版本不递增、以及为何用份数守卫而非确认令牌的取舍理由）。
12. 前端：分类管理页可对某标签「清空关联」与「合并到…」；两者先显示将影响的份数并二次确认；`TAXONOMY_USAGE_CHANGED` 有可理解提示且不自动重试；有前端测试覆盖成功路径与该 409 路径。
13. `cd backend && ruff format --check . && ruff check . && mypy . && pytest` 全绿（基线 500，只增不减）；`cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build` 全绿（基线 356，本任务后应 >356）；`npm run test:e2e` 全绿（基线 39），并新增至少一条走真实后端的合并或清空用例。
14. `check_task.py --task docs/tasks/TASK-035-tag-bulk-relink.md --candidate <SHA>` CHECKS PASS，记录 product_fingerprint。
15. L3 执行链完整：独立只读 Reviewer 审 `113f765..candidate` 完整 diff；独立只读 Acceptance（独立于实现者与 Reviewer 的第三个只读实例）核对上述完成条件与跨模块证据。两者原文写回 EVIDENCE 区。

## 上下文包

根 `AGENTS.md` + `backend/AGENTS.md` + `frontend/AGENTS.md` + 本记录。

要改的文件见 `allowed_paths`。只读参照（不改）：`taxonomy_store.py:149-179`（`validate_parents`/`association`/`attach`/`detach` 的既有单条写法）、`:80-94 usage()` 与 `:96-104 references()`（计数）、`:85-91 delete()`（`TAXONOMY_IN_USE` 与 FK RESTRICT 的双重屏障）、`models.py:242-254`（`ResourceTag` 复合主键与 FK 行为）、`application/taxonomy.py:23-30 transaction()` 与各处 `IntegrityError`/`StaleDataError` 的分类写法、`api/taxonomy.py:81-115`（`command_body`/`version_header` 的既有解析）、`frontend/src/features/taxonomy/useOperation.ts`（一次一个操作、失败不重试）。

契约章节：`docs/contracts/API与数据契约基线.md:130`（`TAXONOMY_IN_USE`）、`:164`（版本规则）、`:275-284`（4.7 ResourceTag，含 TASK-032 追加的整组替换与并发说明）、`:485-488`（资料删除的预览/令牌模式，本任务据此说明为何不套用）、`:491`（引用保护与「不静默级联」）、`:565-570`（taxonomy 错误码表）。

准确命令：
- `cd backend && ruff format --check . && ruff check . && mypy . && pytest`
- `cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build`
- `cd frontend && npm run test:e2e`
- `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-035-tag-bulk-relink.md --candidate <SHA>`

跑长检查前后各记一次共享工作树中未跟踪文件的 sha256 与 mtime（本机存在用户并行会话写入同一工作树的先例，TASK-034 期间曾两次发生，其中一次导致 `inputs changed during checks`）。

不做全仓扫描。

## 实现与测试

- 实现 SHA/变更摘要：`e4b4401`，相对基线 `113f765` 共 12 个代码/契约文件（加任务记录与索引，`check_task` 记 files=17）。无迁移、无数据库 schema 变更。
  - `modules/taxonomy/contracts.py`：新增 `BulkCommand`（只含 `expected_resource_count`，docstring 写明它为何存在）及其两个子类 `TagDetachAll`、`TagMerge`。
  - `infrastructure/database/taxonomy_store.py`：新增 `check_usage()`（重算并与期望值比对，不符抛 `TAXONOMY_USAGE_CHANGED` 409 且此前未做任何写入）、`detach_all()`、`merge()`。`merge()` 的顺序是本任务最需要小心的一处：先查出目标已持有的资料集合 → 逐条把源关联迁到目标（**目标已有的直接丢弃源行，不重复插入**，因为 `(resource_id, tag_id)` 是复合主键）→ `flush()` 让所有关联删除落库 → 再删除源标签 → 再 `flush()`。倒过来会撞上 `ResourceTag.tag_id` 的 `ON DELETE RESTRICT`，在数据库层报错而不是给出可理解的响应；代码里对这两点各留了一行注释。
  - `application/taxonomy.py`：两个事务包装；`merge` 沿用既有的 `IntegrityError`/`StaleDataError` → 新事务重新分类（先查版本、再查份数）→ 否则 `UNKNOWN_ERROR` 的写法，**不重放批量写**。
  - `api/taxonomy.py`：把既有 `command_body` 里的 content-type 与 JSON 解析抽成 `json_body()`，新增 `bulk_body()` 复用它（避免把这段校验复制第二遍）；新增两条 POST 路由与 `TAXONOMY_USAGE_CHANGED` 的中文文案。既有四个模型的解析路径逐字未变。
  - `docs/contracts/openapi-v1.json`：新增两个操作、两个请求 schema（`TagDetachAll`/`TagMerge`）、一个 409 响应组件 `TaxonomyUsageConflict`。核对过：操作总数 44 且 operationId 唯一、无悬空 `$ref`、`Tag`/`Topic`/`TagUsage`/`TopicUsage`/`ResourceProjection` 的既有定义与引用一字未动。
  - `docs/contracts/API与数据契约基线.md`：6 处 —— 交付状态段、操作清单新增一行、错误码表新增 `TAXONOMY_USAGE_CHANGED`、操作表新增两行、逐操作错误码新增两行，以及 4.7 段的三段说明（批量路径不推进资料版本因而与 TASK-032 登记的跨路径并发属同类取舍；为何用份数守卫而不套用第 9 节的「预览 + 一次性令牌」；合并的去重、删除顺序与自合并 422）。
  - 前端：`api/client.ts` 注册新错误码与文案；`taxonomy/api.ts` 新增 `detachAllTagResources()`/`mergeTag()`（后者额外校验响应确实是**目标**标签的投影，不是刚被删掉的源）；`ClassificationManager.tsx` 新增独立的 `TagBulkPanel`（不塞进既有的创建/编辑/删除表单分支），卡片上按 `kind === 'tags'` 给出「合并到…」、并仅在 `resource_count > 0` 时给「清空关联」。
- 一处实现中的自我修正：给 openapi 加内容时，第一版用 `json.load`/`json.dumps` 整体重写文件，把 428 行的既有排版压成了一行（`git diff` 显示 1 增 427 删）。这会让 diff 完全无法审查。已回退，改用与 TASK-032/034 相同的字符串手术，最终 diff 为**纯新增 11 行**。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：
  - `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-035-tag-bulk-relink.md --candidate e4b4401` → **CHECKS PASS**。base=`113f765`、risk=L3、stages=(worker, review, acceptance)、files=17、profiles=**backend,contracts,frontend**、product_fingerprint=`442379cc048fd15f5bbcaa58caa81a53a94e3db36cba06c86e587f4ba54611e3`。
  - `cd backend && ruff format --check .`（65 files already formatted）/ `ruff check .`（All checks passed）/ `mypy .`（Success: no issues found in 64 source files）/ `pytest` → **505 passed**，基线 **500**，净增 5。
  - `cd frontend && npm run format:check && lint && typecheck && test && build` 全绿；vitest **360 passed**，基线 **356**，净增 4。
  - `npm run test:e2e` → **40 passed**，基线 **39**，净增 1（真实后端上完成一次跨两份资料的合并，其中一份两个标签都有，验证去重）。
  - 环境：本地 macOS（Darwin 25.5.0）、Python 3.13.9 / pytest 8.4.2、Node 24、Vitest 4.1.11、Playwright chromium、Vite 8.2.2。
  - 未运行：无迁移相关检查 —— 本任务无 schema 变更，`check_task` 自动选组也未选该组；不以旧 PASS 冒充。
  - 共享工作树监测（按上下文包要求）：跑长检查前后各记一次未跟踪文件 `docs/research/阅读器与标注能力调研.md` 的哈希与 mtime，两次均为 `f56cad6b3b3561ebc34ab9e0d69fcf8dce8616934f08978f2f1bdb87118253f3` / 25904 字节 / `Sep 5 23:21`。**本次检查期间没有发生并发写入**（TASK-034 期间曾两次发生，其中一次导致 `inputs changed during checks`）。运行 `check_task` 时按既有做法把该未跟踪目录临时移出、跑完原样放回，未删除或修改。
- 获授权但未改动的路径（授权非义务）：`frontend/src/features/taxonomy/api.test.ts`、`frontend/src/styles.css` —— 新面板复用既有 `classification-editor`/`classification-browser`/`resource-actions` 类，无需新样式；新增的 API 调用由 `ClassificationPages.test.tsx` 经真实组件路径覆盖，未另写单元测试。
- 已知限制/未完成项：
  - 两个操作都**不推进资料版本**，因此与 TASK-032 登记的跨路径并发覆盖属同一类已知取舍：批量操作之后，仍持旧 `version` 的 `tag_ids` 整组替换不会因此报 409。已写入契约 4.7，B4 是本任务明示的非目标。
  - 合并只支持一对一（源 → 目标）。多选批量合并、以及「改名撞名时提示合并」的自动引导都未做。
  - 主题没有对应操作（一对多关系，且契约要求逐份改 `resources`）—— 本任务明示非目标。
  - `expected_resource_count` 守卫的是**份数**而非具体集合：若期间恰好一增一减、总数不变，守卫不会拦下。这是与风险相称的取舍（本机单用户；要精确到集合就需要第 9 节那套 `impact_revision` 级别的机制），已在契约中登记。
  - 前端合并面板的目标选择走分页浏览器，标签很多时需搜索翻页；未做 typeahead。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填。
- Review：L3 独立只读 Reviewer，待填。
- Acceptance：L3 独立只读 Integration/Acceptance，待填。
- 最终状态/风险/用户操作：待填。
- 非阻断遗留项：待填。
- 日期与决定日志：2026-09-06 用户在 PR #39 合并后要求先做完 B 再讨论阅读器方向；主 Agent 拉全遗留清单后指出 B 实际只剩四项、其中 B1/B2 同源、B4 需推翻既有契约规则，用户选定先做 B1+B2。同日主 Agent 在基线 `113f765` 亲自复核 6 项现状事实（含 `ResourceTag` 复合主键与 `ON DELETE RESTRICT` 决定的操作顺序）后登记为 L3；并入 TASK-034 的 MERGED 状态收尾，以及三处已过期遗留登记的订正。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
