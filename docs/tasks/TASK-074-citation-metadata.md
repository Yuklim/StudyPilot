# TASK-074：文献元数据进契约（Zotero 式抓取的第一块）

```toml
schema_version = 2
id = "TASK-074"
status = "MERGED"
risk = "L3"
risk_reason = "新增一张用户数据表与三个公共接口，并改动删除确认协议的影响集合：命中架构/公共 API/迁移/关键数据模型多项高风险标志，取最高按 L3 走。执行链：Worker → 自动检查 → 独立只读 Reviewer → 独立只读 Integration/Acceptance。"
risk_flags = ["architecture", "public-api", "migration", "critical-data"]
owner = "resource_worker"
base = "92a476404eced01d2c2957946227f7c07a620dce"
allowed_paths = [
  "backend/src/studypilot/modules/citations/__init__.py",
  "backend/src/studypilot/modules/citations/contracts.py",
  "backend/src/studypilot/infrastructure/database/models.py",
  "backend/src/studypilot/infrastructure/database/citation_store.py",
  "backend/src/studypilot/infrastructure/database/resource_store.py",
  "backend/src/studypilot/application/citations.py",
  "backend/src/studypilot/api/citations.py",
  "backend/src/studypilot/main.py",
  "backend/migrations/versions/0008_resource_citations.py",
  "backend/tests/test_citations.py",
  "backend/tests/test_resource_deletion.py",
  "backend/tests/test_migrations.py",
  "backend/tests/test_taxonomy.py",
  "docs/contracts/API与数据契约基线.md",
  "docs/contracts/openapi-v1.json",
  "docs/tasks/TASK-074-citation-metadata.md",
  "docs/tasks/任务索引.md",
]
checks = ["backend", "contracts"]
```

## 需求与范围

### 用户授权

2026-09-20 用户提出复刻 Zotero 的文献抓取能力，主 Agent 指出「作者/年份/DOI/期刊放哪」是必须先定的岔口：现有资料字段只有 标题/来源地址/来源名称/保存原因/主题/标签，没有文献元数据；不进契约就只能塞进「保存原因」或标签，搜不出结构、将来做引文导出还得回来补。用户答「**元数据进契约，开始吧**」。同日用户另行授权本任务与 TASK-073（前端 PDF 阅读器）并行。

### 目标

1. **新表 `resource_citations`**（迁移 `0008_resource_citations`，owner `resources`，与资料 1:1）：
   - `resource_id` FK → `learning_resources.id`，`ON DELETE CASCADE`，**唯一**（一份资料至多一条）；
   - `item_type`：CHECK 取值 `JOURNAL_ARTICLE` / `PREPRINT` / `CONFERENCE_PAPER` / `BOOK` / `BOOK_CHAPTER` / `THESIS` / `REPORT` / `WEBPAGE` / `OTHER`，默认 `OTHER`；
   - `authors`：JSON 数组，元素为字符串（**顺序即作者顺序**），可空；至多 100 个，单个至多 200 字符；空数组视为未填，存 NULL；
   - `issued_year`：int，可空，1000～2200；`issued_date`：字符串，可空，≤32（原样保留页面上写的日期，不做解析）；
   - `container_title`（期刊/会议/书名）≤500、`volume`/`issue`/`pages` 各 ≤50、`publisher` ≤200、`doi` ≤200、`isbn` ≤32，均可空；
   - `abstract`：文本，可空，≤20000；
   - `version` / `created_at` / `updated_at`，沿用既有 `Identified`/`Created`/`Versioned` 基类与命名约定。
2. **三个接口**，形态**完全照抄正文快照那三个**（`getResourceSnapshot`/`putResourceSnapshot`/`deleteResourceSnapshot`，见 `api/snapshots.py` 与契约 4.13）：
   - `GET /api/v1/resources/{resource_id}/citation` → 200 `Citation`；没有则 404 `CITATION_NOT_FOUND`；
   - `PUT /api/v1/resources/{resource_id}/citation` → 首次写入 201、整份替换 200 且必须带 `expected_version`（缺失 428、不符 409）；**整份替换**语义，不做字段级合并；
   - `DELETE /api/v1/resources/{resource_id}/citation` → 204，强版本头 `If-Match`。
   - 前置条件：资料必须存在且可读（与 `note_store.require_resource` 同一条规则），否则 404 `RESOURCE_NOT_FOUND`。
3. **删除确认协议同步**：`DELETION_IMPACT_KEYS` 增加 `citation_count`（0 或 1），清单增加 `citations` 条目（id + version），契约第 9 节第 2 条的令牌绑定集合写入 Citation。
4. **契约同步六处**：第 1 节「当前可用操作」表新增一行；2.3 白名单**不需要**加行（该资源没有列表接口，如你认为需要请在报告里说明理由）；新增实体小节 **4.16 Citation（resources 所有）**（字段表 + 为什么单独一张表 + 整份替换语义 + 与 `source_url`/`title` 的关系）；第 9 节令牌绑定集合；第 10 节操作清单三行；交付说明段追加一句。
5. **openapi-v1.json** 同步：新增 `Citation`/`CitationWrite`/`CitationEnvelope` schema、`citations` tag、一个 path 三个 operation、`x-delivery-profile.available_operations` 增加三项、`DeletionImpact` 增加 `citation_count`。

### 非目标 / 禁止范围

- **不碰前端与扩展**（`frontend/**`、`extension/**`）：显示与编辑界面、浏览器连接器都是后续任务（TASK-075/076）。
- 不改 `learning_resources` 表与既有资料接口语义；不动快照、原件、心得、高亮、学习、复习、分类任何既有接口。
- 服务端**不出网**：不解析 DOI、不查 Crossref、不校验 DOI 是否真实存在。元数据全部由调用方提供。
- 不做引文格式导出（BibTeX/CSL）——那是另一个任务。
- 不做按作者/DOI 的搜索与排序（本次只存与读；`authors` 是 JSON，不建索引）。
- 所有未列入 `allowed_paths` 的路径。

## 完成条件

- 三个接口按契约工作：首次 PUT 201、替换 200 且版本推进、`expected_version` 缺失 428 / 不符 409、DELETE 用 `If-Match`、GET 在没有时 404 `CITATION_NOT_FOUND`、资料不存在 404 `RESOURCE_NOT_FOUND`、跨资料取不到。
- 字段校验各有用例：`item_type` 非法值 422；`authors` 超 100 个 / 单个超 200 字符 / 非字符串元素 422，空数组存成 NULL 读回为 null；`issued_year` 越界 422；各字符串字段超长 422；未知字段 422（`extra="forbid"`）。
- 删除资料：`citation_count` 进影响预览与清单，级联删除有用例（参照 `test_resource_deletion.py` 里既有的依赖夹具写法）。
- 迁移 `0008` 升级可建表、降级可回滚；`test_migrations.py` 的 head 与表数同步（当前 head 是 `0007_highlights`，表数 15）；`compare_metadata` 仍为空。
- `test_taxonomy.py` 的交付目录用例同步（当前断言 `len(available) == 40`，新增三个 operation 后应为 43，并补一条集合断言）。**只许改计数与新增集合断言，不许放宽其他断言。**
- OpenAPI 模型校验通过；契约文档六处同步。
- `python3 scripts/governance/check_task.py --task docs/tasks/TASK-074-citation-metadata.md --worktree` → CHECKS PASS。

## 实现与测试

### 实现 SHA

- 登记：`344dcdf`（任务记录 + 索引行）
- 实现：`690849f`（后端 + 契约 + openapi + 测试）

### 变更摘要

- 新模块 `modules/citations/contracts.py`：`ITEM_TYPES` 九种、`CitationError`、`CitationPut`（`extra="forbid"`、`strict=True`；所有可写字符串去首尾空白且 1～上限，清空用显式 `null`；`authors` 至多 100 个、单个 1～200、`[]` 经校验器归一为 `None`；`issued_year` 1000～2200；`expected_version` 可空 ≥1）。
- 新表模型 `ResourceCitation`（`models.py`）：`UNIQUE(resource_id)` + FK `ON DELETE CASCADE`，`item_type` CHECK 九值默认 `OTHER`，各字符串/年份 CHECK，`authors` 为 `JSON(none_as_null=True)`，沿用 `Identified`/`Created`/`Versioned`。
- 新迁移 `0008_resource_citations`（down_revision `0007_highlights`）：建表；降级直接 drop（同 0004/0005/0007 形态）。
- 新存储 `citation_store.py`：`require_resource` 复用 note_store 的可读规则；`put` 为**整份替换**（`model_dump(exclude={"expected_version"})` 逐字段赋值，值相同不赋值以免空推版本）；首次写带 `expected_version` → 404 `CITATION_NOT_FOUND`，已有不带 → 428，不符 → 409（`details.current_version`）。
- 新应用层 `application/citations.py`：单事务、`StaleDataError` 不回放，改用新事务重读分类为 409。
- 新 API `api/citations.py`：照抄 `api/snapshots.py` 的 `failure/guarded/respond/identity/command_body/version_header`；GET/PUT/DELETE 三个端点，`main.py` 注册路由。
- 删除确认协议：`DELETION_IMPACT_KEYS` 增 `citation_count`（位于 `snapshot_asset_count` 之后），`_deletion_snapshot` 增 `citations` 清单条目（id + version），因此文献信息一增一改都会改变 `impact_revision`。
- 契约文档同步：1.3 交付说明段追加一句 + 「当前可用操作」新增一行；2.2 新增 `CITATION_NOT_FOUND`；4.12 关系表新增 LearningResource—ResourceCitation 行；新增 **4.16 Citation（resources 所有）**；第 9 节第 2 条绑定集合写入 Citation；第 10 节新增三行；10.1 错误码矩阵新增三行。
- `openapi-v1.json`：新增 `Citation`/`CitationWrite`/`CitationEnvelope` schema、`citations` tag、`ResourceOrCitationNotFound` 响应、一个 path 三个 operation；`x-delivery-profile.available_operations` 40 → 43；`DeletionImpact` 增 `citation_count`。
- 测试：新增 `tests/test_citations.py`（23 例）；`test_resource_deletion.py` 夹具加一条文献信息并断言 `citation_count` 与级联清零；`test_migrations.py` head/表数同步（`0008_resource_citations`、16）并新增 0008 升降级用例；`test_taxonomy.py` 交付目录计数 40 → 43 并新增三项集合断言（未放宽任何既有断言）。

### 命令与真实退出结果

于 `690849f` 的工作树（内容与该提交一致）：

- `cd backend && uv run ruff format --check .` → `93 files already formatted`，exit 0
- `uv run ruff check .` → `All checks passed!`，exit 0
- `uv run mypy` → `Success: no issues found in 83 source files`，exit 0
- `uv run pytest -q` → `593 passed in 16.86s`（基线 569 → 593，新增 24 例），exit 0
- `python3 scripts/governance/check_task.py --task docs/tasks/TASK-074-citation-metadata.md --worktree` → backend 五项（format/check/mypy/pytest/`uv build --offline`）与 contracts（OpenAPI 模型校验）全部 exit 0，末行 **CHECKS PASS**

### 判别性验证（各撤销一次实现，确认用例变红后已还原）

1. **整份替换而非字段合并**：`citation_store.put` 改为 `model_dump(..., exclude_unset=True)` → `test_writing_again_replaces_the_whole_record_instead_of_merging` FAILED（`item_type` 仍是 `JOURNAL_ARTICLE`）。
2. **`authors` 空数组存 NULL**：`drop_empty` 改为 `return value` → `test_authors_keep_their_printed_order_and_an_empty_list_means_unfilled` FAILED（读回 `[]`）。
3. **影响计数**：删掉 `citation_count=0 if citation is None else 1` → `test_citation_change_invalidates_a_pending_deletion_token` 与 `test_preview_and_delete_cascades_resource_data_but_keeps_taxonomy` 双双 FAILED。
4. **级联删除**：0008 的 FK 改 `ondelete="RESTRICT"` → `test_deleting_the_citation_or_the_resource_leaves_the_other_side_intact` 与上述删除用例 FAILED。

四处改动均已还原，还原后全套 593 passed。

### 已知限制与偏离登记

- **`owner` 字段**：intake 写的是 `backend_worker`，但 `scripts/governance/validate_governance.py` 的 `AGENTS` 白名单没有这个角色，`check_task.py` 会以 `unknown task writer` 直接失败。按《角色与模块边界》第 27 行「资料、主题、标签…相关功能」改为 `resource_worker`（本表 owner 为 `resources`），索引行同步。目标、路径、风险、完成条件一字未改。
- **空串语义**：可写字符串字段的清空只接受显式 `null`，`""` 与纯空白返回 422——与既有 `LearningResource.title` 同一条规则，避免「没填」出现两种写法；`authors` 的 `[]` 是任务明确要求的例外（归一为 NULL）。已写入 4.16。
- **`authors` 无数据库层 CHECK**：数元素个数要靠方言相关的 JSON 函数，按字节长度近似则既误伤合法姓名（转义膨胀）又管不住个数；形状由唯一写入者 `modules/citations/contracts.py` 把守。理由已写入 4.16 与模型 docstring。
- **契约改了八处而非六处**：除 intake 列的五处（2.3 确认不需要，见下）外，另加 2.2 错误码表（新增稳定码 `CITATION_NOT_FOUND` 必须登记）、4.12 关系/删除语义表（快照当年也加了行）、10.1 逐 operation 错误码矩阵（该节声明「每个 operation」都有行）。
- **2.3 白名单确认不加行**：文献信息没有列表接口，不接受 `page`/`sort`/`q`，2.3 是分页/搜索/排序白名单，加行会凭空承诺一个不存在的列表。
- **openapi 的 `previewResourceDeletion` 示例**：该示例自 TASK-071 起就缺 `highlight_count`，与 `DeletionImpact` 的 `required` 对不上；本次在同一处补 `citation_count` 时一并补齐 `highlight_count`，使示例可校验。属最小修正，如判定越界可回退这一处。
- **10.1 开头「上一张 40 行操作表」的行数是旧数**（本次改动前第 10 节已有 56 行，现 59 行），非本次引入，未改动，记录于此。
- 本次未动前端与扩展，未做引文导出、按作者/DOI 检索，服务端仍不出网（`test_snapshots.py::test_backend_makes_no_outbound_network_calls` 覆盖全部 `src/**`，含新模块）。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：**`f81e3c3`**（登记 `344dcdf` → 实现 `690849f` → 证据 `f81e3c3`；`f81e3c3` 相对 `690849f` 只多一次任务记录写回，故 `690849f` 上跑出的检查覆盖候选的全部代码与契约内容）。
- Review：L3 独立只读 Reviewer（`.claude/agents/reviewer.md`），**PASS**。权限证据：声明「仅持有 `Read`/`Grep`/`Glob`，无 Write/Edit/Bash，运行器层面真实只读」。核对方式：读 `.git/worktrees/agent-.../logs/HEAD` 确认分支自 `92a4764` 起只有三个提交、范围与任务单一致，再逐文件读 worktree 最终内容，并用主仓目录的 `backend/**`（并行任务 TASK-073 不碰后端）作 base 代理逐行比对。原文要点：
  > 模型↔迁移逐项一致：17 列、12 条 CHECK（含 `item_type` 九值、年份 1000–2200、各长度）、FK `ON DELETE CASCADE`、`UNIQUE(resource_id)`、`op.f` 命名均对齐；降级只 drop 新表；`learning_resources` 及其余表与 base 逐字节相同。
  > PUT 确为整份替换（全字段赋值，等值不赋值以免空推版本，符合契约 2.4「无变化不加版本」）；428/409/`If-Match`/`StaleDataError` 新事务重读不回放，与快照同语义。
  > 删除协议自洽：`citation_count`、manifest `citations`、契约第 9 节绑定集合、openapi `DeletionImpact` 四处一致；级联经「FK 改 RESTRICT」的判别性验证证实真实发生。
  > 契约四方说法一致；2.3 不加行的理由成立（无列表接口）。`test_taxonomy` 仅 40→43 + 新增集合断言，`test_migrations` 仅 head/表数 15→16 + 新增 0008 升降级用例，**未放宽任何断言**。无 `frontend/**`、`extension/**` 改动，未越 `allowed_paths`。
  > findings（均可记录）：`authors` 无 DB 层形状 CHECK（store 是唯一写入方，已写入 4.16 与 docstring）；首写并发撞唯一约束会 500 而非 409（与既有快照同款，非本任务引入）；未测原件非 READY 时 404（同代码在 note/highlight 处已覆盖）。
- Acceptance：L3 独立只读 Integration/Acceptance（另一实例，独立于 Worker 与 Reviewer，无前序上下文），**PASS**（1 项非阻断）。权限证据同上（仅三个只读工具，未写入任何文件）。原文要点：
  > 完成条件八条逐条对账全部满足并给出行号：三接口状态码与前置条件、24 组字段校验 422 + 12 组 DB CHECK、**整份替换非合并**（只发 `doi` 时其余字段全清、`item_type` 回 `OTHER`）、**`authors` 空数组存 NULL**（`JSON(none_as_null=True)` + 校验器 + 用例）、**级联删除与影响计数**、迁移升降级与 `compare_metadata==[]`、交付目录 40→43（与主目录基线逐行比对，原有断言一字未放宽）、测试文件无 `skip`/`xfail`/注释断言且 569→593 与 24 例自洽。
  > 跨模块：contracts/store/API/models/迁移/openapi 的九种 `item_type`、各字段长度、409/428/404 语义完全一致；契约八处与 openapi 六处互相吻合。
  > 需求对账：字段覆盖 作者（有序）/年份/日期/期刊书名/卷期页/DOI/ISBN/出版者/摘要，足以支撑 Zotero 式复刻；`backend/src` 内仅 allowed 文件提及 citation，未动前端/扩展/既有接口语义；`test_snapshots.py` 的「整个 `src/**` 不出网」扫描对新模块同样成立。
  > 三处偏离逐条核实属实且可接受：`owner` 改 `resource_worker`（`validate_governance.py` 的 AGENTS 白名单确无 `backend_worker`，且与《角色与模块边界》及表 owner `resources` 相符，目标/路径/风险未动）；契约实改八处（已逐条定位）；顺手补 openapi 一处示例缺失字段（同文件同段的最小修正）。
- 最终状态/风险/用户操作：**MERGED**——2026-09-20 用户已合并 PR #81，merge `48f232e`。索引行因 TASK-073/074 并行时让出索引持有权而延后，由 TASK-077 的控制面提交补上（状态登记同）。此前为 ACCEPTED，等用户合并 PR。风险低：新增一张 1:1 表与三个新端点，既有接口与表一字未动；服务端仍不出网。用户操作：合并 PR，合并后本机库由启动脚本升到 0008。**界面上看不到变化**——文献字段的显示与编辑、浏览器连接器都在后续任务。
- 非阻断遗留项：
  - **（验收 findings，交下个碰契约的任务）** `docs/contracts/openapi-v1.json` 的 `deleteResource` 409 `impactChanged` 示例里，`impact` 仍只有 7 个键，缺本次新增的 `citation_count` 与 TASK-071 的 `highlight_count`；而 `DeletionImpact` 要求 9 键且 `additionalProperties: false`。只影响照示例编码的读者，运行时返回是正确的（有用例断言）。机器检查发现不了（contracts 检查只做 OpenAPI 模型校验，不校验 example）。Reviewer 与验收都判断「不值得为此重新冻结」，随 TASK-075（扩展连接器，必碰契约）补上。
  - **（记录）** `authors` 在数据库层没有元素个数/长度 CHECK，依赖 `modules/citations/contracts.py` 作为唯一写入方（已写入 4.16 与模型 docstring）。重评触发：出现第二个写入路径。
  - **（记录）** 首次 PUT 的并发竞争会撞 `UNIQUE(resource_id)` 得到 500 而不是 409；与既有快照同款，本机单用户下概率可忽略。
  - **（记录）** 分支名 `agent/backend_worker/...` 与改后的 `owner = resource_worker` 不一致（脚本不校验分支名，不影响检查与合并）。
  - **（记录）** 任务索引里本任务的摘要写「契约六处」，实为八处；正文已如实登记。
  - **（2026-09-20 合并前处置，用户当场选定）** 本分支**撤回了自己在 `docs/tasks/任务索引.md` 里加的那一行**，该文件回到与基线 `92a4764` 一字不差的状态。原因：TASK-073 先合并，main 上的索引在同一个锚点插了 073 行并把 072 改成 MERGED，与本分支的插入行相邻重叠，PR 必然冲突；而 `git merge origin/main` 由 `.claude/settings.json` 的 deny 规则兜底禁止 Agent 执行。撤回后 main 的改动单边生效，PR 无冲突。**本任务的索引行、以及 TASK-073/074 的 MERGED 状态，一并由下一个已授权任务的控制面提交补登记**（按总则第 5 节「状态登记可并入下一个已授权任务的控制面提交」）。代码、契约、迁移、测试一行未动，L3 的 Review 与验收结论仍覆盖这些内容。
  - **（待办，交下个任务）** 上面这条暴露的是结构性问题：索引表「最新在上」，任何两个并行任务都在同一锚点插行，必冲突。三条候选改法（并行时只让一个任务持有索引 / 并行前用一个控制面 PR 先登记两行 / 给索引配 `merge=union` 并补「任务号唯一、每个 TASK 文件恰一行」的校验）属治理改动，需单独开任务与独立审查，本任务不顺手改。
- 日期与决定日志：2026-09-20 用户「元数据进契约，开始吧」→ 登记 TASK-074（与 TASK-073 并行）。
<!-- EVIDENCE:END -->
