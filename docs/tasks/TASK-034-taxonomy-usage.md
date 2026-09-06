# TASK-034：分类使用情况（列表显示使用数量 + 查看使用该分类的资料 + 收尾 TASK-033 的 F3/F4）

```toml
schema_version = 2
id = "TASK-034"
status = "IN_PROGRESS"
risk = "L3"
risk_reason = "目标 1 放宽已批准的公共契约：分类页端点（listTopics/listTags/getTopic/getTag/createTopic/createTag/updateTopic/updateTag）的响应对象新增 `resource_count`。这不是给现有 `Tag`/`Topic` schema 加字段就能了事 —— 二者被 `ResourceProjection.tags` 内嵌复用（openapi 中 `ResourceProjection.properties.tags.items.$ref = Tag`，且 `Tag` 为 `additionalProperties:false`），直接加必填字段会让每份资料响应违反契约，并迫使资料列表为每个内嵌标签算 N+1 次计数。因此必须引入新的响应 schema 并改动多个既有 schema 的引用指向，属「公共 API 契约」这一 L3 判入条件。另有一处性能语义决定：分页列表的计数必须用一次聚合查询得出，不能对 20 个分类各查一次。目标 2、3 为纯前端小改动，随最高风险并入。无数据库 schema 变更、无迁移。"
risk_flags = ["public-api", "business", "tests", "small-ui"]
owner = "coordinator"
base = "1a72eb9dabe0ead15a46cdc8b5634e00cbc8a1ec"
allowed_paths = [
  "backend/src/studypilot/infrastructure/database/taxonomy_store.py",
  "backend/src/studypilot/application/taxonomy.py",
  "backend/tests/test_taxonomy.py",
  "docs/contracts/openapi-v1.json",
  "docs/contracts/API与数据契约基线.md",
  "frontend/src/features/taxonomy/api.ts",
  "frontend/src/features/taxonomy/api.test.ts",
  "frontend/src/features/taxonomy/ClassificationManager.tsx",
  "frontend/src/features/taxonomy/fixtures.ts",
  "frontend/src/features/taxonomy/ClassificationPages.test.tsx",
  "frontend/src/features/resources/ResourceLibrary.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/taxonomy-pages.spec.ts",
  "docs/tasks/TASK-034-taxonomy-usage.md",
  "docs/tasks/TASK-033-tag-usability.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

- 用户授权：2026-09-06 用户在 PR #38（TASK-033）合并后指定下一任务为「D 和 F 一起做」。主 Agent 说明 D 实际裂为三块、其中 D2（列表显示使用数量）需改公共契约并因此判 L3、D3（批量解绑）需另行设计，用户在三个方案中选定**「包含 D2，一个 L3 任务」**。D3 明确不在本次范围。
- 需求依据：`项目需求说明.md:146`「创建和使用多个自定义标签」与 `:396`「必要的主题、标签、搜索、筛选和排序，使资料能再次找到」—— 分类要能长期维护，就得看得见哪些在用、哪些是僵尸。
- 复核过的现状事实（主 Agent 亲自在基线 `1a72eb9` 核实）：
  1. `taxonomy_store.py:19` 的 `FIELDS = ("id","name","version","created_at","updated_at")`，`project()`（`:22-26`）只多给 Topic 一个 `description`。**列表与详情都不含任何使用量。**
  2. 计数能力已存在但只服务于删除：`taxonomy_store.py:74-82` 的 `references(kind, identity)`（topic 数 `LearningResource.topic_id`，tag 数 `ResourceTag.tag_id`），仅由 `delete()`（`:85-91`）在拒绝删除时调用。
  3. 删除受阻时**计数已经回到前端**：`409 TAXONOMY_IN_USE` 带 `details.resource_count`（`application/taxonomy.py:74`、`taxonomy_store.py:89`），前端 `classificationError`（`taxonomy/api.ts:136-141`）已把它渲染成「仍有 N 份资料使用这个分类」。但只有文字，**没有去看这 N 份资料的入口**。
  4. 而「看这 N 份资料」的目的地在 TASK-033 之后已经存在：`/resources?tag_id=<id>` 与 `/resources?topic_id=<id>` 都是可直接跳转的地址。
  5. **`Tag`/`Topic` schema 是共用的**：`openapi-v1.json` 中 `ResourceProjection.properties.tags.items.$ref = "#/components/schemas/Tag"`，同时 `TagPage.data.items` 与 `TagEnvelope.data` 也指向 `Tag`；`Tag` 为 `additionalProperties:false`、五个字段全 required。资料侧的内嵌投影另有自己的字段表（`resource_store.py:64` 的 `TAG_FIELDS`），与 taxonomy 侧同形。
  6. 前端 `Classification` 类型与 `classification()` 解析器（`taxonomy/api.ts:10-14`、`:39-61`）逐字段白名单校验，未知字段会被丢弃、缺字段不报错 —— 新增字段必须同步这里才会进入界面。
  7. TASK-033 的两条非阻断遗留仍在：`ResourceLibrary.tsx` 的 `apply()` 无条件 `setLookupFailed(false)`（F3）；`readApplied` 对 `sort`/`source_type`/`learning_status`/`q` 不做白名单或长度校验（F4）。

### 目标

1. **分类使用数量（D2，契约变更）**：分类页端点的响应对象新增 `resource_count`（非负整数，含义与既有 `TopicAnalytics.resource_count` 一致：使用该分类的资料份数；tag 数关联行、topic 数 `topic_id` 指向它的资料）。
   - **契约形状**：新增 `TopicUsage` / `TagUsage` 两个 schema（= 原 `Topic` / `Tag` 的全部字段 + 必填 `resource_count`），把 `TopicPage`/`TopicEnvelope`/`TagPage`/`TagEnvelope` 的引用改指向它们。**`Tag`/`Topic` 原 schema 保持一字不动**，`ResourceProjection.tags` 继续引用 `Tag` —— 资料响应里的内嵌标签**不带**使用量，不受本次影响。
   - **覆盖范围**：list / detail / create / update 四类分类响应都带 `resource_count`（保持同一 schema 的一致性）；新建的分类计数为 0。
   - **性能**：分页列表必须用**一次聚合查询**（按选中的 id 分组）得出全部计数，禁止对每个分类各调一次 `references()`；单条响应可直接用 `references()`。
2. **查看使用该分类的资料（D1，纯前端）**：
   - 分类管理页每张卡片显示使用数量；数量 > 0 时提供链接到 `/resources?topic_id=<id>` 或 `/resources?tag_id=<id>`；数量为 0 时显示「暂无资料使用」且不给链接。
   - 删除受阻（`409 TAXONOMY_IN_USE`）时，除既有文字提示外，同样提供这条链接，让用户能直接去处理那 N 份资料。
3. **收尾 TASK-033 的 F3（纯前端）**：`ResourceLibrary` 的「地址里有读不到名称的分类」告警不再是**存储状态**，改为从 `applied` + `names` **派生** —— 只要该 id 还在筛选条件里且解析失败，提示就一直在；翻页或再次应用筛选不会把它抹掉，移除该条件后自动消失。修的是「谁负责维护这个布尔量」的结构问题，不是在 `apply()` 里打补丁。
4. **收尾 TASK-033 的 F4（纯前端）**：`readApplied` 对 `sort`、`source_type`、`learning_status` 做白名单校验、对 `q` 做长度校验；非法值回落到默认（等同该维度未指定）而不是原样发给后端，并让用户看到「地址里有读不懂的筛选条件，已忽略」这类提示。合法维度不受影响。

### 非目标 / 禁止范围

- **不做 D3 批量解绑**：没有任何端点能一次把某标签从 N 份资料上摘除，客户端循环 N 次请求且无原子性；需要单独的契约与事务设计，本任务明确排除。
- 不做标签合并/重命名去重引导。
- 不改 `Tag`/`Topic` 原 schema 的任何字段，不改 `ResourceProjection`/`ResourceSummary`/`ResourceDetail` 及资料侧的 `TAG_FIELDS` 内嵌投影。
- 不改数据库 schema、不加迁移、不加索引（`ix_resource_tags_tag_id` 已存在；`LearningResource.topic_id` 的计数走既有查询，本任务不为性能新增索引）。
- 不改分类的创建/改名/删除**语义**（唯一性、乐观版本、`TAXONOMY_IN_USE` 拒绝删除、FK RESTRICT 一律不动），只在响应里多带一个只读字段、在界面上多一个链接。
- 不改标签的 AND 筛选语义、不做 OR 筛选。
- 不改 `ClassificationPicker`/`ClassificationBrowser`/`ResourceTagEditor`/`TagCreateField` 的交互（选择器与详情页标签管理**不显示**使用量——那里是在选标签，不是在做维护）。
- 不动 TASK-032 的 `tag_ids` 整组替换、不动 TASK-033 的 URL 筛选映射本身（F3/F4 只在其上做前述两处修正）。
- 不动未列路径。

- 依赖/前置条件：TASK-033 已由用户合并（PR #38，merge `1a72eb9`）。无未合并依赖、无迁移依赖。
- 并行：否，单写入者 `coordinator`（主 Agent 亲自充当 Worker，不授予自审权；L3 的 Review 与 Acceptance 均由独立只读子 Agent 执行）。
- 状态收尾并入本任务控制面提交：本记录的首个 docs 提交同时把 TASK-033 由 `ACCEPTED` 标 **MERGED**（记录状态行 + 索引行，merge `1a72eb9`、PR #38）。仅动状态与合并事实。

## 完成条件

1. `GET /api/v1/tags` 与 `GET /api/v1/topics` 的每个列表项都含 `resource_count`，数值与实际使用份数一致（含 0）。
2. `GET /api/v1/tags/{id}`、`POST`、`PATCH` 的响应同样含 `resource_count`；新建的分类为 0；主题侧同理。
3. 分页列表的计数由**一次聚合查询**得出：有测试证明查询次数不随页内分类数量增长（例如 20 个分类的一页不会产生 20 次计数查询）。
4. `resource_count` 语义正确：tag 计关联行数、topic 计 `topic_id` 指向它的资料数；一份资料带同一标签只计一次；删除资料或解除关联后计数下降。
5. 资料响应（列表与详情）里内嵌的 `tags` **不含** `resource_count`，形状与本任务修改前逐字节一致，既有资料测试全绿。
6. `openapi-v1.json` 新增 `TopicUsage`/`TagUsage`，四个 envelope/page 改指向它们，`Tag`/`Topic` 与 `ResourceProjection` 的引用未变；`check_task.py` 的 OpenAPI 结构/引用/operationId 检查通过；模型↔契约一致性测试（若存在同类断言）全绿。
7. 《API与数据契约基线》同步：对象定义、操作清单、分类端点说明写明新字段与其只读、非用户可写性质，并说明为何资料内嵌标签不带该字段。
8. 分类管理页每张卡片显示使用数量；> 0 时链接到 `/resources?topic_id=<id>` / `?tag_id=<id>`，点击后资料库确实按该分类筛选；= 0 时显示「暂无资料使用」且无链接。
9. 删除受阻时的 `409` 提示旁出现同一条链接，文字仍如实包含份数。
10. F3：地址里带读不到名称的分类 id 时，翻到第二页、再次应用筛选后提示**仍在**；把该条件移除后提示消失。有测试覆盖翻页后仍在这一分支。
11. F4：`?sort=bogus`、`?source_type=BOGUS`、`?learning_status=BOGUS`、超长 `q` 均回落为默认且给出「已忽略」提示，发给后端的查询串不含这些非法值；合法值不受影响；页面不崩溃。
12. `cd backend && ruff format --check . && ruff check . && mypy . && pytest` 全绿（pytest 基线 497，只增不减）；`cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build` 全绿（vitest 基线 350，本任务后应 >350）；`npm run test:e2e` 全绿（基线 38）。
13. `check_task.py --task docs/tasks/TASK-034-taxonomy-usage.md --candidate <SHA>` CHECKS PASS，记录 product_fingerprint。
14. L3 执行链完整：独立只读 Reviewer 审 `1a72eb9..candidate` 完整 diff；独立只读 Acceptance（独立于实现者与 Reviewer 的第三个只读实例）核对上述完成条件与跨模块证据。两者原文写回 EVIDENCE 区。

## 上下文包

根 `AGENTS.md` + `backend/AGENTS.md` + `frontend/AGENTS.md` + 本记录。

要改的文件见 `allowed_paths`。只读参照（不改）：`backend/src/studypilot/api/taxonomy.py`（路由与错误映射）、`backend/src/studypilot/infrastructure/database/resource_store.py:64`（资料侧 `TAG_FIELDS`，用于确认内嵌投影不受影响）、`frontend/src/features/taxonomy/ClassificationBrowser.tsx`（`render` 契约与 `revision`）、`frontend/src/features/taxonomy/useOperation.ts`。

契约章节：`docs/contracts/API与数据契约基线.md:130`（`TAXONOMY_IN_USE`）、`:160`（主题统计的 `resource_count` 既有用法，供命名与语义对齐）、`:263-284`（Tag / ResourceTag 对象）、`:491`（引用保护）、`:565` 与 `:570`（删除错误码）、`:624`（TopicAnalytics 字段）。

准确命令：
- `cd backend && ruff format --check . && ruff check . && mypy . && pytest`
- `cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build`
- `cd frontend && npm run test:e2e`
- `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-034-taxonomy-usage.md --candidate <SHA>`

不做全仓扫描。

## 实现与测试

- 实现 SHA/变更摘要：待填。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：待填。
- 已知限制/未完成项：待填。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填。
- Review：L3 独立只读 Reviewer，待填。
- Acceptance：L3 独立只读 Integration/Acceptance，待填。
- 最终状态/风险/用户操作：待填。
- 非阻断遗留项：待填。
- 日期与决定日志：2026-09-06 用户在 PR #38 合并后要求「D 和 F 一起做」；主 Agent 复核后说明 D 裂为三块（D1 免费、D2 需改公共契约故 L3、D3 需另行设计），用户选定包含 D2 的单一 L3 任务、D3 排除。同日主 Agent 在基线 `1a72eb9` 亲自复核 7 项现状事实（含 `Tag` schema 被资料响应共用这一关键约束）后登记为 L3，并入 TASK-033 的 MERGED 状态收尾。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
