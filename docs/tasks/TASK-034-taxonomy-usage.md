# TASK-034：分类使用情况（列表显示使用数量 + 查看使用该分类的资料 + 收尾 TASK-033 的 F3/F4）

```toml
schema_version = 2
id = "TASK-034"
status = "IN_REVIEW"
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

- 实现 SHA/变更摘要：`67b6145`，相对基线 `1a72eb9` 共 12 个代码/契约文件（加上任务记录与索引，`check_task` 记 files=15）。
  - **契约形状（本任务的 L3 核心）**：`openapi-v1.json` 新增 `TopicUsage`（原 Topic 六字段 + `resource_count`）与 `TagUsage`（原 Tag 五字段 + `resource_count`），并把 `TopicPage.data.items`、`TopicEnvelope.data`、`TagPage.data.items`、`TagEnvelope.data` 四处引用改指向它们。**`Topic`/`Tag` 原 schema 的 required 与 properties 一字未动**；`ResourceProjection.properties.tags.items` 仍是 `Tag`；`TopicAnalytics.topic` 仍是 `Topic`。已用脚本逐项打印核对这六处指向。
  - `taxonomy_store.py`：`project(record, resource_count)` 增加第二个参数并输出该字段；新增 `usage(kind, identities)` —— **一次 GROUP BY 查询**得出整页计数（topic 按 `LearningResource.topic_id`、tag 按 `ResourceTag.tag_id`），缺席的 id 补 0；`page()` 改用它，`detail()`/`update()` 用既有 `references()` 单查，`create()` 直接给 0（刚建的分类不可能被引用）。
  - `ClassificationManager.tsx`：新增 `usageHref()` 与 `UsageLink`；列表卡片显示「N 份资料在用」（链接到 `/resources?topic_id=…` 或 `?tag_id=…`）或「暂无资料使用」（纯文本、无链接）；删除确认面板在计数 > 0 时给出「查看这 N 份资料」同款链接 —— 摆在动手之前，`409` 出现时它就在提示正上方。
  - `taxonomy/api.ts`：`Classification` 增加 `resource_count`，`classification()` 用既有 `integer()` 校验（缺失或非法即 `INVALID_RESPONSE`）。
  - `ResourceLibrary.tsx`（收尾 TASK-033）：**F3** 把 `lookupFailed` 从存储状态改为派生 —— `unreadable` 由 `applied` 与 `names` 算出，只要坏 id 还在筛选条件里提示就在，翻页与再次应用都不会抹掉它，移除该条件后自动消失；删掉了 `useState` 与三处 `setLookupFailed`。**F4** 把内联的排序选项提为模块级 `SORTS`（下拉与校验共用同一份，避免两处漂移），`readApplied` 对 `sort`/`source_type`/`learning_status` 做白名单、对 `q` 做 200 字长度校验，非法值回落为「未指定」并记入 `ignored`，界面提示「网址里的 X 读不懂，已忽略」，**不把未校验的值转发给后端**。
  - 《API与数据契约基线》同步 6 处：交付状态段、4.5 Topic 与 4.6 Tag 对象表各加一行字段（写明只读、不可写入、只出现在 Usage schema、不出现在资料内嵌引用中）、两条操作清单行、引用保护段（说明该计数与 `409` 的 `details.resource_count` 同义，只是不必等到删除失败才看得到）。
- 既有断言的处置（未删除、未弱化，两处都是契约变更的必然结果）：
  1. `test_lifecycle_projection_versions_and_restart` 断言投影字段集合**精确等于**某个集合 —— 正是这条守门断言保证不会有字段悄悄漏进契约。按授权补上 `resource_count`，并**加强**为同时断言新建时其值为 0。
  2. `test_write_commit_failure_preserves_all_existing_state` 原先拿「建库时的快照」与失败操作后的状态比对。新增字段后该快照天然过期（快照取于创建引用资料之前，计数 0 → 1，是正确行为不是 bug）。改为**在失败操作之前重新取快照**并逐一比对 —— 这比原写法**更强**（断言的是「跨失败操作状态不变」，而不是「与很久以前相同」），并额外断言了快照本身的计数为 1 / 0。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：
  - `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-034-taxonomy-usage.md --candidate 67b6145` → **CHECKS PASS**。base=`1a72eb9`、risk=L3、stages=(worker, review, acceptance)、files=15、profiles=**backend,contracts,frontend**、product_fingerprint=`e8fc7a873374f186e23ddc63d09fe613e978cbe0bca3a63cc64ffa480be2083b`。
  - `cd backend && ruff format --check .`（65 files already formatted）/ `ruff check .`（All checks passed）/ `mypy .`（Success: no issues found in 64 source files）/ `pytest` → **500 passed**，基线 **497**，净增 3。
  - `cd frontend && npm run format:check && lint && typecheck && test && build` 全绿；vitest **356 passed / 16 文件**，基线 **350**，净增 6。
  - `npm run test:e2e` → **39 passed**，基线 **38**，净增 1。
  - 环境：本地 macOS（Darwin 25.5.0）、Python 3.13.9 / pytest 8.4.2、Node 24、Vitest 4.1.11、Playwright chromium、Vite 8.2.2。
  - 未运行：无迁移相关检查 —— 本任务不含数据库 schema 变更，`check_task` 自动选组也未选该组；不以旧 PASS 冒充。
- 检查期间的一次外部干扰（如实记录）：首次运行 `check_task` 返回 `FAIL: inputs changed during checks`。排查发现**不是本任务的改动** —— 运行期间另一个会话在共享工作树里写入了未跟踪的 `docs/research/阅读器与标注能力调研.md`（该文件自述「在 TASK-034 分支外单独写入，未提交，不构成任何任务的实现证据」）。这违反 AGENTS.md §3「共享目录同一时刻一个写入者」。处理：**不删除、不修改**该文件；确认本机各会话均已 idle 后，按对待本会话未跟踪 HANDOFF 的同样做法临时移出、跑完检查、原样放回，并以 sha256 前后比对证明其逐字节未变（`7f579c8fccbb5f37ee60175c27a2ff8391a4ffa352d992e3567a4e798646f7e5`）。该文件仍未跟踪地留在工作树中，去留由用户决定；本任务未引用它、未把它算作任何证据。
- 两条测试的变异验证（均由主 Agent 本人执行，**未经独立第三方复核**，等级如实标注）：
  1. 「一次聚合查询」那条（`test_listing_counts_use_one_grouped_query_regardless_of_page_size`）：把 `page()` 临时改回逐个 `references()` 后，计数查询数由 1 变 20、用例转红；恢复后转绿。
  2. 「读不懂的筛选值一律忽略」那条（`ignores filter values in the address it cannot understand, and says so`）：把 `readApplied` 里 `allowed()` 的白名单判断临时删掉、改为原样返回后，用例转红；恢复后转绿，且 `git diff` 确认工作树与候选零差异。变异点选在 `ResourceLibrary.tsx`（本任务允许路径内），未触碰任何 allowed_paths 之外的文件。
  两条都证明断言可真实失效，不是形式通过。
- 已知限制/未完成项：
  - `create()` 直接返回 0 而非查询。在「刚插入的分类不可能已被引用」这一前提下成立；若将来出现「创建即绑定」的复合操作，此处需改为实查。
  - 计数是**响应时快照**，不做实时推送；界面上的数字可能落后于另一处刚发生的增删，重新读取即更新。
  - 分类选择器与资料详情的标签管理**不显示**计数（本任务非目标）：那里是在选标签，不是在做维护。
  - 未做 D3 批量解绑、未做标签合并 —— 本任务明示的非目标。
  - F4 只校验 `sort`/`source_type`/`learning_status`/`q` 四项；`page` 的非法值仍按既有行为静默回落到 1，未纳入「已忽略」提示。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填。
- Review 第一轮（L3 独立只读，`1a72eb9..bc090fb`）：**PASS**，含 3 条非阻断项。

  派发与身份：本实现会话以 home 目录启动、项目级 `.claude/agents/reviewer.md` 未注册（已实测复制到用户级 `~/.claude/agents/` 后当场重试仍 `Agent type 'reviewer' not found`，注册表在会话启动时一次性构建），故由同机在项目目录下启动的会话 `studypilot-05` 代为派发。**执行审查的是该文件定义的只读实例（`tools: Read, Grep, Glob`，运行器层无 Bash、无写工具），全新实例、无上下文继承、与审 TASK-033 的实例不是同一个、独立于实现者。**

  外部核实（派发会话以 Bash 提供，Reviewer 无 Bash 不能自证）：
  > `TASK-034-full-diff.patch` 与 `git diff 1a72eb9..bc090fb` 逐字节一致（971 行、15 文件）；工作树 HEAD 正是候选 `bc090fb`；`docs/research/阅读器与标注能力调研.md` 未被 git 跟踪、不在候选 diff 里、sha256 = `7f579c8fccbb5f37ee60175c27a2ff8391a4ffa352d992e3567a4e798646f7e5`（与实现者报告一致）。

  报告原文：
  > ## 只读证明
  > 本实例工具白名单仅 `Read`/`Grep`/`Glob`，无 `Write`/`Edit`/`NotebookEdit`、无 `Bash`。本次未写入、未提交、未推送任何文件。
  >
  > ## 覆盖
  > 审查对象：`1a72eb9..bc090fb` 完整最终 diff（导出件与 git diff 逐字节一致，为派发会话已核实的外部事实），15 文件 971 行；并对关键点回读工作树（HEAD=候选）交叉验证。机械检查：**NOT_RUN**（无 Bash），仅做自洽核对：pytest 497→500 = 新增 3 个后端用例；vitest 350→356 = ResourcePages +3、ClassificationPages +3；e2e 38→39 = 新增 1 条。数字与 diff 自洽，但我未复跑，不声称验证。范围：15 个文件全部在 `allowed_paths` 内；`application/taxonomy.py` 与 `taxonomy/api.test.ts` 获授权但未改动（授权非义务）。未越界。
  >
  > ## 七个重点的独立结论
  > **1. 契约形状**：独立 grep 证实 `#/components/schemas/Tag"` 仅剩 2 处（`ResourceProjection`、`ResourceSummaryProjection`），`#/components/schemas/Topic"` 仅剩 1 处（`TopicAnalytics`）；`TopicUsage`/`TagUsage` 只被四个 page/envelope 引用，而这四个只被 `/topics`、`/tags` 的 8 个操作引用，`ResourceTagEnvelope` 未被波及（已核对它不是 `TagEnvelope` 的子串误配）。无遗漏引用。两个 Usage 的必填字段与 `project()` 实际输出逐字段一致；中文契约 4.5/4.6/9 节与操作清单表述与 openapi 一致。
  > **2. 计数语义**：`usage()`、既有 `references()`、409 的 `details.resource_count` 三者同源同义，契约里「同义」的说法成立。`ResourceTag` 主键为 (resource_id, tag_id)，幂等 attach 不重复计数，测试直接覆盖。`create()` 返 0 的前提成立：客户端不能自带 id（已有 422 断言），`store.create` 全仓仅被一处调用，无「创建即绑定」复合路径；并发下他人无法引用尚未返回的新 id。且 `test_lifecycle` 的 `GET == POST body` 把「硬编码 0」与「实查 references()」钉在一起，防止二者漂移。
  > **3. N+1**：`page()` 一次 `GROUP BY`，缺席 id 由字典补零（语义等价于 LEFT JOIN，且对 NULL topic_id 天然排除）；空集提前返回，`project(row, counts[row.id])` 不会 KeyError；搜索与非搜索两个分支都在切片后才计数，分页边界正确。守门测试的匹配条件真实可失效：列表总数查询不含 `resource_tags`，逐条 `references()` 则会含。
  > **4. 两处既有断言**：均**不是**放宽。(a) 字段集合精确等式仍在，仅按授权补字段并**加**断言 `resource_count == 0`。(b) 快照改为「失败操作前重取」且在 `event.listen` 之前取，逐路径比对，另加值断言；旧写法在正确实现下必然失败。唯一被牺牲的是「POST 响应体 == 后续 GET」这条附带性质，而它在同文件另一处仍被独立断言。无阻断。
  > **5. F3**：`unreadable` 由 `applied` 过滤 `names[id] === ''` 派生；成功解析写 `name || ' '`、失败写 `''`，两者可区分，判据准确；`useState` 与三处 setter 已全部删除（grep 全仓无残留），无重复计算或双源。
  > **6. F4**：白名单与后端 `ResourceQuery` 逐项对齐 —— `SORTS` 的 8 个值 == `Literal[...]` 的 8 个值；`Object.keys(sourceLabels)` == WEB/PASTE/FILE；`statusLabels` == 五个状态；`q` 200 字 == 后端 `max_length=200`。非法值不进入 `query`（`query` 只由已清洗的 `applied` 组装），确实不转发。下拉与校验共用同一 `SORTS`。两条提示是各自独立的 `role="alert"` 段落，条件互不覆盖，不会互相抹除。
  > **7. 范围与叙述**：记录的「12 代码/契约 + 3 文档 = 15」与实际一致；「删掉 useState 与三处 setter」属实；未发现夸大的能力声明或被删除的既有断言。
  >
  > ## Findings（均为非阻断，`可记录后继续`）
  > 1. `docs/tasks/TASK-034-taxonomy-usage.md:128` —— 小标题写「**两条**测试的变异验证」，其下只列出一条。影响：证据描述与实际不符（并未虚报第二条的结果，只是计数悬空），等级低。最小修正：改为「一条」或补上第二条。
  > 2. `docs/tasks/任务索引.md:24` 记 `IN_PROGRESS`，而记录 TOML 已是 `IN_REVIEW`。仅索引可读性，随证据写回同步即可。
  > 3. `frontend/src/features/taxonomy/ClassificationManager.tsx:79` —— 删除面板的「查看这 N 份资料」链接依据列表快照的 `resource_count`。触发：列表加载后、点删除前该分类被别处引用（本机单用户，概率低）。此时 409 文案仍如实给出份数，但缺链接；用户点「放弃草稿，载入最新版本」刷新后链接出现，可恢复。完成条件 9 的常规路径已满足。建议仅记录，不修。
  >
  > 无安全、隐私、越权、数据损坏问题；`resource_count` 为聚合数字，不含用户正文；无新路由绕过安全中间件，前端仍只调同源 `/api`。
  >
  > ## 缺口与剩余风险
  > 我未执行任何命令，实跑证据对我是 NOT_RUN，其复核属 Acceptance 环节。「一次聚合查询」的变异验证由实现者自述、未经第三方复核；我的同向判断来自独立读测试代码，不依赖其自述。完成条件 10 的后半段「移除该条件后提示消失」无直接用例，但由派生式实现结构性保证；条件原文只要求覆盖「翻页后仍在」，已覆盖。`topic_id`/`tag_id` 的格式在 URL 侧仍不做白名单（本任务 F4 明示只含四项），属既有行为与已登记非目标。
  >
  > ## 结论
  > **PASS**（含上述 3 条已明确处置建议的非阻断项，非 No findings）。

- 第一轮 findings 的处置：
  - **F1 已修，且选了更实的一条路**。Reviewer 给了两个选项（改成「一条」，或在 EVIDENCE 区记一行更正）。我两个都没选，而是**把缺的第二条变异验证真正补做了**：临时删掉 `readApplied` 中 `allowed()` 的白名单判断 → 「读不懂的筛选值一律忽略」那条用例转红；恢复后转绿，并以 `git diff` 确认工作树与候选零差异。变异点选在 `ResourceLibrary.tsx`（本任务允许路径内），未触碰 allowed_paths 之外的文件。「实现与测试」段现在的「两条」是实数。理由：Reviewer 指出的是「证据描述与事实不符」，把描述改小虽然也诚实，但补齐事实才真正提高了证据强度。
  - **F2 已修**：`任务索引.md` 的 TASK-034 行由 `IN_PROGRESS` 改为 `IN_REVIEW`，与记录 TOML 一致。
  - **F3 记录接受，不修**（见下方非阻断遗留项）。
  - 一处需要 Reviewer 知情的说明：修 F1 改动的是「实现与测试」段（EVIDENCE 标记区**外**），因此形成新候选而非证据写回；这正是 §6 所要求的路径，不是借证据写回变更标记区外内容。
- Review 第二轮（增量）：**待执行**。
- Acceptance：**待执行**，在 Review 第二轮之后，由独立于实现者与两轮 Reviewer 的第三个只读实例执行。
- Acceptance：L3 独立只读 Integration/Acceptance，待填。
- 最终状态/风险/用户操作：status=**IN_REVIEW**（第一轮 PASS，F1/F2 已处置，等待同一 Reviewer 对增量做复审，之后再做独立 Acceptance）。分支 `agent/coordinator/TASK-034-taxonomy-usage` 目前仅在本地，未推送、未开 PR。
- 非阻断遗留项：
  - **删除面板链接依据列表快照**（Reviewer Finding 3，`ClassificationManager.tsx`）：列表加载后、点删除前若该分类被别处引用，此时 409 文案仍如实给出份数，但「查看这 N 份资料」链接不出现；点「放弃草稿，载入最新版本」刷新后即出现，可恢复。暂不修的理由：要消除它就得在打开删除面板时再查一次分类详情，为本机单用户下概率很低的时序问题增加一次请求与一处加载态，收益不抵成本。责任角色 coordinator；若将来分类页面向多人协作或引入实时刷新，需重评。
  - `create()` 直接返回 0 而非实查：前提是「刚插入的分类不可能已被引用」，Reviewer 已独立确认该前提成立（客户端不能自带 id、`store.create` 全仓单一调用点、无「创建即绑定」复合路径）。若将来出现创建即绑定的复合操作，此处需改为实查。
  - 计数是响应时快照，不做实时推送；数字可能落后于另一处刚发生的增删，重新读取即更新。
  - F4 只校验 `sort`/`source_type`/`learning_status`/`q` 四项；`page` 非法值仍静默回落到 1，`topic_id`/`tag_id` 的格式仍不在 URL 侧校验 —— 均为本任务明示范围。
  - 未做 D3 批量解绑、未做标签合并、分类选择器与详情页标签管理不显示计数 —— 本任务明示的非目标。
- 日期与决定日志：2026-09-06 用户在 PR #38 合并后要求「D 和 F 一起做」；主 Agent 复核后说明 D 裂为三块（D1 免费、D2 需改公共契约故 L3、D3 需另行设计），用户选定包含 D2 的单一 L3 任务、D3 排除。同日主 Agent 在基线 `1a72eb9` 亲自复核 7 项现状事实（含 `Tag` schema 被资料响应共用这一关键约束）后登记为 L3，并入 TASK-033 的 MERGED 状态收尾。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
