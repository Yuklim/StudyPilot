# TASK-071：高亮锚点的后端存储与接口（阅读器高亮第一步）

```toml
schema_version = 2
id = "TASK-071"
status = "MERGED"
risk = "L3"
risk_reason = "新增一张用户数据表 `highlights`（0007 迁移）、一个新后端模块与四个公共接口，并给资料删除的影响预览新增 `highlight_count` 与清单条目。命中架构/公共 API/迁移/关键数据模型四项高风险标志中的多项，取最高按 L3 走：Worker → 自动检查 → 独立只读 Reviewer → 独立只读 Integration/Acceptance。这是用户数据（用户读文章时亲手标的段落），删除与级联语义必须一次定准。"
risk_flags = ["architecture", "public-api", "migration", "critical-data"]
owner = "coordinator"
base = "b10fa92931a247356a801eb6b5bb71ece924f26f"
allowed_paths = [
  "backend/src/studypilot/modules/highlights/__init__.py",
  "backend/src/studypilot/modules/highlights/contracts.py",
  "backend/src/studypilot/infrastructure/database/models.py",
  "backend/src/studypilot/infrastructure/database/highlight_store.py",
  "backend/src/studypilot/infrastructure/database/resource_store.py",
  "backend/src/studypilot/application/highlights.py",
  "backend/src/studypilot/api/highlights.py",
  "backend/src/studypilot/main.py",
  "backend/migrations/versions/0007_highlights.py",
  "backend/tests/test_highlights.py",
  "backend/tests/test_resource_deletion.py",
  "backend/tests/test_migrations.py",
  "backend/tests/test_taxonomy.py",
  "backend/tests/support.py",
  "docs/contracts/API与数据契约基线.md",
  "docs/contracts/openapi-v1.json",
  "docs/开发与运行.md",
  "docs/tasks/TASK-071-highlight-backend.md",
  "docs/tasks/TASK-070-note-title-search.md",
  "docs/tasks/任务索引.md",
]
checks = ["backend", "contracts"]
```

## 需求与范围

### 用户授权

2026-09-19 用户在「接下来做什么」的三块里选定**第三部分（阅读器方向）**，并在范围追问中选定：

1. 先做的是「**高亮能存住**」——现在「记下这段」只把文字拷进心得，文章里看不出标过；
2. 一条高亮的形态＝「**高亮可单独存在，可选配心得**」（选中→标下来就是一条高亮，想写再给它配一段心得）。

用户原话选项说明里已写明这会动后端与契约（L3），并说明我会拆成后端/前端两个任务，后端先走。本任务只做后端；渲染、重定位、界面属 TASK-072。

### 目标

1. **新表 `highlights`**（迁移 `0007_highlights`，owner `highlights`）：一条高亮 = 一段**分层锚点**（`docs/research/阅读器与标注能力调研.md` 5.1 的 W3C Web Annotation 模型）+ 可选的一条心得。字段：
   - `resource_id`（FK → `learning_resources`，`ON DELETE CASCADE`，必填，建索引）；
   - `exact`（高亮原文，1～2000 字符，与 TASK-068 引文上限同口径）；
   - `prefix` / `suffix`（前后文各 0～200 字符，可空，用于同一段文字多次出现时消歧）；
   - `start_offset` / `end_offset`（降级锚点，`>= 0` 且 `end_offset > start_offset`）；
   - `note_id`（FK → `notes`，`ON DELETE SET NULL`，可空，**唯一**：一条心得最多配一条高亮）；
   - `version` / `created_at` / `updated_at`（沿用既有 `Identified`/`Created`/`Versioned` 基类与命名约定）。
2. **五个接口**（新模块 `highlights`，错误码沿用既有风格；登记时写的是「四个」，实现时补上了详情读取——它是列表/写入的自然配套，测试与前端按 id 复核都要用，仍在本任务的 `allowed_paths` 与同一批契约改动内）：
   - `GET /api/v1/resources/{resource_id}/highlights`：分页；默认按**文中顺序** `start_offset,id`，排序白名单 `start_offset`/`created_at`；无搜索筛选。
   - `POST /api/v1/resources/{resource_id}/highlights`：`HighlightCreate`（锚点五个字段 + 可选 `note_id`）；201。
   - `PATCH /api/v1/resources/{resource_id}/highlights/{highlight_id}`：`HighlightPatch` **只改 `note_id`**（给 `null` 即解绑）+ `expected_version`；锚点不可改（换了锚点就是另一条高亮）。
   - `GET /api/v1/resources/{resource_id}/highlights/{highlight_id}`：单条详情；200。
   - `DELETE /api/v1/resources/{resource_id}/highlights/{highlight_id}`：`If-Match` 强版本头；204。
3. **前置条件**：资料必须存在且可读；该资料必须已有 **READY 的正文快照**（高亮锚定的是快照正文），否则 `404 SNAPSHOT_NOT_FOUND`（与 `snapshot_store.py` 既有用法同码）。`note_id` 必须指向**同一份资料**下的心得，否则 `404 NOTE_NOT_FOUND`；已被别的高亮占用则 `409`。
4. **资料删除**：`highlight_count` 进删除影响预览的 `impact` 与清单（`DELETION_IMPACT_KEYS` + manifest），随资料级联删除；契约 9 节与 openapi 的影响 schema 同步。
5. **契约同步**：新增实体小节（Highlight，含字段表与 owner）、2.3 列表白名单新增一行、10 节操作清单新增四行、能力对照表补一行、交付说明段追加一句；`openapi-v1.json` 新增 `Highlight`/`HighlightCreate`/`HighlightPatch`/`HighlightPage` schema 与四个 operation。
6. 顺带把 **TASK-070 登记为 MERGED**（用户 2026-09-19 合并 PR #78，merge `b10fa92`）。

### 非目标 / 禁止范围

- **不碰前端**：渲染（CSS Custom Highlight API）、选区取锚点、重定位与孤立标注展示、删除对话框显示高亮数，全部属 TASK-072。
- 服务端**不解释正文**：不校验 `exact` 是否真的出现在快照里、不做重定位、不改写正文、不出网。锚点是否还对得上由前端在渲染时判断（孤立状态**不落库**，正文换回来高亮就该回来）。
- 不存颜色/标签/表情：本次只有「一条高亮」这一种形态（见下「主 Agent 登记的实现决定」）。
- 不改 `notes` 表与既有笔记接口语义；不改快照、文件、学习、复习、分类任何既有接口；不进资料统一搜索。
- 不做 PDF/Word 阅读、不做边注布局（用户已知的后续方向，未授权）。
- 所有未列入 `allowed_paths` 的路径。

### 依赖

无；基线为已合并的 main `b10fa92`。并行：否（主 Agent 亲自实施，唯一写入者）。前端 TASK-072 依赖本任务合并后的契约。

### 主 Agent 登记的实现决定（非用户决定，Review 可挑战）

- **锚点存原文 + 前后文 + 偏移**，不存 DOM 路径、不存渲染结果：调研 5.1 的结论，换渲染实现不会整批失效。
- **重定位放前端**：后端不碰正文语义（与快照「服务端不抓取、不解析」一致），前端本来就要把匹配结果变成 `Range` 才能上色。
- **锚点不可变**：`PATCH` 只开放 `note_id`。让锚点可改会出现「同一条高亮指向完全不同的话」，历史含义会被悄悄改写。
- **单色**：不存颜色列。多色是可后加的可空列（与 TASK-036 对「可空列事后添加成本相同」的既有判断一致），现在加会连带 UI 取色与迁移。
- **`note_id` 放在 highlights 这一侧且唯一**：`notes` 表一个字段都不用动；删心得只把高亮解绑（`SET NULL`），不连带删掉用户标的那段话。
- **owner 用新模块 `highlights`**：高亮是用户手写的标注数据，与「资料」「心得」都不是同一回事；契约里按新 owner 记。

### 登记后的路径修订（实施中，写入前记录）

`backend/tests/test_taxonomy.py` 追加进 `allowed_paths`：该文件里有一条「交付目录与实际路由一致」的用例，断言 `x-delivery-profile.available_operations` 的**总数**（35）。新增五个操作必然改动这个数字，不改它就等于让这条既有用例失效。改动限于该用例的计数与新增五个 operationId 的集合断言，不放宽其他断言。

## 完成条件

- 四个接口按契约工作：创建/列表（默认文中顺序、两种排序白名单、分页字段正确）/改绑与解绑（版本推进、`expected_version` 不符 409、缺失 428）/删除（`If-Match`，204）。
- 前置条件：资料不存在 404 `RESOURCE_NOT_FOUND`；资料无快照或快照 FAILED → 404 `SNAPSHOT_NOT_FOUND`；`note_id` 指向别的资料的心得或独立心得 → 404 `NOTE_NOT_FOUND`；`note_id` 已被另一条高亮占用 → 409；跨资料取 id → 404。
- 字段校验：`exact` 空/超 2000 → 422；`prefix`/`suffix` 超 200 → 422；`end_offset <= start_offset` → 422；负偏移 → 422；未知字段/未知查询参数 → 422。
- 删除心得 → 该高亮仍在，`note_id` 变 `null`（有用例）；删除资料 → 高亮一并消失，且删除预览的 `impact.highlight_count` 与清单条目数与实际一致（有用例）。
- 迁移：`0007_highlights` 升级可建表、降级可回滚，`test_migrations.py` 通过；表约束（CHECK/FK/UNIQUE/索引）与模型一致。
- OpenAPI 校验通过，五个 operation 与实现一致；契约文档五处同步（2.3 白名单、4.15 新实体节、9 节令牌绑定集合、10 节操作行、交付说明段）。
- `check_task.py` 必要检查 PASS（backend + contracts）；交付目录用例（`test_taxonomy.py` 的 delivery catalog）同步包含五个新 operationId。
- L3：独立只读 Reviewer + 独立只读 Integration/Acceptance 各出结论。

## 上下文包

- 规则：`AGENTS.md`（V2）第 4/6 节、`backend/AGENTS.md`。
- 调研依据：`docs/research/阅读器与标注能力调研.md` 5.1（分层选择器与降级顺序）、5.2（渲染方式，前端任务用）、1.2/1.4（哪些是已确认、哪些仍是建议）。
- 既有形态照抄对象：`infrastructure/database/note_store.py`（前置资料校验、版本检查、分页）、`snapshot_store.py`（`SNAPSHOT_NOT_FOUND` 用法）、`models.py` 的 `ContentSnapshot`/`SnapshotAsset`/`Note`（约束与 owner 写法）、`migrations/versions/0005_snapshot_assets.py`（迁移写法与命名约定）、`resource_store.py:78-86,325-360`（`DELETION_IMPACT_KEYS` 与清单）、`api/notes.py`（端点与错误映射）。
- 契约：`docs/contracts/API与数据契约基线.md` 2.3、2.4（乐观并发）、4.8（Note）、4.13/4.14（快照与资产）、9（删除）、10（操作清单）；`openapi-v1.json`。
- 检查：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-071-highlight-backend.md --worktree`。

## 实现与测试

- 实现 SHA：`a66639b`（控制面登记 `24c081f`）。变更摘要：
  - **模型与迁移**：`models.py` 新增 `Highlight`（`Identified`/`Created`/`Versioned`）——`exact` 1～2000、`prefix`/`suffix` ≤200 可空、`start_offset >= 0 AND end_offset > start_offset`、`note_id` 唯一且 `ON DELETE SET NULL`、`resource_id` `ON DELETE CASCADE`、复合索引 `(resource_id, start_offset, id)`、owner `highlights`。`0007_highlights` 建表/回滚，命名约定与 0005 一致；`test_migrations.py` 的 head 与表数（14→15）同步，`compare_metadata` 仍为空（模型与迁移一致）。
  - **模块**：`modules/highlights/contracts.py`（`HighlightError`/`HighlightCreate`/`HighlightPatch`/`HighlightQuery`）。`exact` **不去首尾空白**——空白是选区的一部分，去掉会移动锚点。`end_offset > start_offset` 用 `model_validator(mode="after")`。
  - **存储层**：`highlight_store.py`——`require_resource`（与 notes 同一条可读规则）、`require_snapshot`（必须有 READY 快照，否则 `SNAPSHOT_NOT_FOUND`）、`require_note`（必须同资料下的笔记；已被别的高亮占用则 `NOTE_ALREADY_HIGHLIGHTED` 409，改绑到自己已持有的那条不算冲突）、`find`/`check_version`/`create`/`detail`/`rebind`/`delete`/`page`（默认 `start_offset,id`）。
  - **应用与 API**：`application/highlights.py`（事务 + `StaleDataError` 分类，不重放写）、`api/highlights.py`（五个端点、`If-Match`、错误码到中文消息的映射），`main.py` 注册路由。
  - **删除影响**：`resource_store.py` 的 `DELETION_IMPACT_KEYS` 增加 `highlight_count`，清单增加 `highlights` 条目（id + version）；契约 9 节第 2 条的令牌绑定集合同步写入 Highlight。
  - **契约**：`API与数据契约基线.md` 新增 4.15 节（字段表 + 分层锚点/服务端不解释正文/孤立不落库/锚点不可变/独立于心得/本阶段边界）、2.3 白名单新增一行、10 节新增五行、9 节绑定集合、交付说明段追加一句；`openapi-v1.json` 新增 `Highlight`/`HighlightCreate`/`HighlightPatch`/`HighlightEnvelope`/`HighlightPage` 五个 schema、三个 response 组件（`HighlightTargetNotFound`/`ResourceOrHighlightNotFound`/`HighlightNoteConflict`）、`highlights` tag、两个 path 共五个 operation，`x-delivery-profile.available_operations` 增加五项、`DeletionImpact` 增加 `highlight_count`。**改动按既有紧凑单行格式插入**（一次整份重排会产生 468 行无意义 diff，已回退重做）。
- 新测试：`tests/test_highlights.py` 8 例——锚点原样存回且可无心得独立存在（字段集合固定）；写入前置（资料 404 / 无快照 404 / 无快照仍可列出空页）；边界值 9 组 422 + 两个上限值 201；心得绑定→改绑→解绑（版本推进、409/428、`PATCH` 改锚点被拒）；心得必须同资料（别处的心得、独立心得、不存在的 id 各 404）且一条心得只配一条高亮（409；改绑到自己那条不算冲突）；删心得后高亮仍在且 `note_id` 为空；列表按文中顺序 + `-created_at` + 分页 + 越界空页 + 三种 422；跨资料隔离与按版本删除（428/409/204）。`test_resource_deletion.py` 的依赖夹具加入一条绑定心得的高亮，影响计数断言加 `highlight_count: 1`，级联后断言表为空。`test_taxonomy.py` 的交付目录用例同步（35→40 + 五个 operationId 集合断言）。
- 命令与结果（本机 macOS 25.5.0，backend `uv` 虚拟环境 Python 3.13，工作区在 `a66639b`）：
  - `ruff check src tests` / `ruff format --check` / `mypy`（76 源文件）均 0；`pytest -q` **569 passed**（TASK-070 时 561，+8）。
  - `python3 scripts/governance/check_task.py --task docs/tasks/TASK-071-highlight-backend.md --worktree` → **CHECKS PASS**，`profiles=backend,contracts`（含 `uv build --offline` 与 OpenAPI 模型校验 exit=0）。
- 已知限制/未完成项：
  - **界面上看不到任何变化**：选区取锚点、上色渲染、重定位与孤立提示、删除对话框显示高亮数，都在 TASK-072。
  - 服务端不校验 `exact` 是否仍能在快照正文里找到，也不做重定位；坏锚点（前端传错偏移、正文已整份替换）要到阅读器渲染时才暴露。这是契约 4.15 明写的分工，不是遗漏。
  - `highlight_count` 已进影响预览，但前端删除对话框目前只显示 `note_count`，要等 TASK-072 才会把高亮数摆出来。在前端能创建高亮之前，这个差距对用户不可见。

### Review 必修与采纳项的修正（第二候选）

- **F1（必须）** `openapi-v1.json` 的 `updateResourceHighlight`：`x-error-codes` 补上实现确实会返回的 `RESOURCE_NOT_FOUND`（坏 UUID 与资料不可读两条路径），并把 404 从 `HighlightTargetNotFound` 换成新增的 `HighlightOrNoteNotFound`——`rebind` 不调 `require_snapshot`，原组件里的 `SNAPSHOT_NOT_FOUND` 示例在 PATCH 永不出现。
- **F2（必须）** 契约第 1 节「当前可用操作」表补高亮一行（此前只在 `x-delivery-profile` 与第 10 节出现，与快照、资产、attach/detach 等历次新增的体例不一致）。
- **F3（必须）** 4.15 节「本阶段的边界」里的「四个接口」改为「五个接口（列表/新增/详情/改绑解绑/删除）」，与 10 节五行、openapi 五 operation 一致。
- **F4（可记录→采纳，改了代码）** `HighlightPatch.note_id` 由「默认 None」改为**必填可空**：`null` 是解绑，省略是 `422`。原写法下 TASK-072 一个漏字段的 PATCH 会静默解开用户配好的心得；前端还没写，现在定死最便宜。契约 4.15 字段表与「锚点不可变」段、openapi `HighlightPatch.required` 同步。
- **F8（测试缺口→已补）** 三处：`exact` 首尾空白原样保留（空白是选区的一部分，去掉会移动锚点）；快照为 FAILED 时写入同样 `SNAPSHOT_NOT_FOUND`（用 session 置成捕获失败该有的字段组合，写入 API 不接受该状态）；PATCH 省略 `note_id` 为 422 且绑定不变。**判别性已验**：`note_id` 改回带默认值 → 第三例红；`require_snapshot` 去掉 READY 条件 → 第二例红。
- 第二候选重跑：`ruff`/`mypy` 0、`pytest -q` **569 passed**、`check_task.py --worktree` **CHECKS PASS**（backend + contracts）。
- **未改、按建议记录的 Review 项**见下方非阻断遗留项。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：**`45f2495`**（代码 `7ccccb8`；`45f2495` 只写本记录，`git diff --stat 7ccccb8 45f2495` 仅该文件 10 行增补，工作树与候选无差异，主 Agent 已核）。演进：实现 `a66639b`/首轮候选 `2908f9d` → Review 必修与采纳项 `7ccccb8`/最终候选 `45f2495`。
- Review：L3 独立只读 Reviewer（`.claude/agents/reviewer.md`），两轮，最终 **PASS**。权限证据：两轮均声明「只有 `Read`/`Grep`/`Glob`，无写工具、无 Bash，运行器层面真实只读」；无法跑 `git diff`，首轮按 `allowed_paths` 逐个通读工作树最终状态，把 `Highlight` 与 `0007_highlights` 按 `Base.metadata.naming_convention` 逐条对名核算，并用全仓 `grep -i highlight` 圈定改动半径（17 个文件，无前端、未越 `allowed_paths`）。
  - **首轮**（`b10fa92..2908f9d`）**CHANGES_REQUIRED**，三条必修全在契约文档层、代码无需改动：openapi 的 `updateResourceHighlight` 漏 `RESOURCE_NOT_FOUND` 且其 404 组件含 PATCH 永不出现的 `SNAPSHOT_NOT_FOUND`；契约第 1 节「当前可用操作」表缺高亮行；4.15 的「四个接口」与实际五个矛盾。另有 F4（`PATCH` 省略 `note_id` 等于静默解绑）等五条可记录/可选项。同轮确认通过：模型↔迁移逐项一致（5 个 CHECK、唯一约束、两个 FK 与 `SET NULL`/`CASCADE`、复合索引、PK/版本约定）、降级干净、未动 `notes`/`learning_resources`、`compare_metadata` 仍为空、表数 14→15；删除语义自洽（影响键、manifest、`impact_revision`、9 节令牌绑定集合，级联与解绑各有判别性用例）；并发/版本与 notes 同语义；跨资料取 id 与坏 UUID 均 404。
  - **第二轮增量**（`2908f9d..45f2495`）**PASS，No findings**：「PATCH 的 `x-error-codes` 已含 `RESOURCE_NOT_FOUND`，404 改指新 `HighlightOrNoteNotFound`（资料/高亮/笔记三例，无 `SNAPSHOT_NOT_FOUND`）；POST 仍用 `HighlightTargetNotFound`、GET/DELETE 仍用 `ResourceOrHighlightNotFound`，三者各自正确。契约能力行与『五个接口』措辞已补。`note_id: UUID | None` 无默认＝必填可空，契约字段表、4.15 正文与 `HighlightPatch.required` 三方一致；`command_body` 仍先判 `expected_version` 缺失为 428，故 `{}` 是 428、`{"expected_version":n}` 是 422，与 notes 同语义。F8 三例均有判别性，省略 `note_id` 那例还断言了随后 GET 的绑定未变，不是只看状态码。」
  - Reviewer 明确同意 F5/F6/F7 只记录不改：F5 要改 `notes` 语义（本任务非目标）且只造成可恢复的悬挂绑定；F6 契约已写明；F7 本机单用户下概率可忽略。
- Acceptance：L3 独立只读 Integration/Acceptance（`.claude/agents/reviewer.md` 的另一实例，独立于实现者与本任务 Reviewer，无前序上下文），**PASS**（3 条非阻断）。权限证据：声明「只持有 `Read`/`Grep`/`Glob`，无写工具、无 Bash，无法 git 或改文件」；核对对象是分支尖端工作树，并读 `.git/HEAD`/`.git/logs/HEAD` 确认 `45f2495` 之后只有一次证据写回提交。原文要点：
  > 完成条件六组逐条满足并给出行号：五接口（`api/highlights.py:119-178` + 三组用例）；前置条件（`highlight_store.py:48-95` + 无快照/FAILED/心得归属用例）；字段校验（`contracts.py:28-91` + 9 组 422 与两个上限）；删心得保留高亮（`models.py:487` SET NULL + 用例）与删资料级联计数（`resource_store.py` 的 impact 与 manifest **同出一个 `marks` 列表，结构上不可能不一致**）；迁移与模型逐条一致，`test_migrations.py` 钉死 head、表数 15 与 `compare_metadata==[]`；契约六处与 openapi（两 path 五 operation、五 schema、三 response、tag、`DeletionImpact.highlight_count`、`x-delivery-profile` 恰 40 项）一致。
  > 需求与范围：全仓 `grep -i highlight` **前端零命中**，`notes` 表与 `note_store` 语义未动，字段集合被用例钉死（无颜色等未授权能力）。路径修订如实：`test_taxonomy.py` 只改计数并加断言，原有各子集与媒体类型断言全在，**未放宽**。
  > 证据真实性：tests 目录无 `skip`/`xfail`/注释断言；569=561+8 与 8 个新用例自洽；`check_task.py` 确实跑 OpenAPI 模型校验。
  > 另核实：前端两个 `deletionImpact` 校验器（`api/client.ts:154-173`、`features/resources/api.ts:118-137`）按固定键遍历、忽略未知键，**新增 `highlight_count` 不会打断现有删除对话框**；F5 经代码核实为真（`note_store.py:154-164` 的 detach 只改 `resource_id`，不管高亮）。
  > Findings（非阻断）：① 任务索引行仍 READY 且写「四个接口」；② openapi 的 `deleteResourceHighlight` 409 指向带 `NOTE_ALREADY_HIGHLIGHTED` 示例的组件，而 DELETE 只会 `VERSION_CONFLICT`；③ 0007 降级缺一句「丢弃数据即撤销本意」的说明。
- 验收项处置（形成第三候选 `55a14ac`）：①②③ 全部修正——索引行改 IN_ACCEPTANCE/「五个接口」；DELETE 的 409 改指现成的 `VersionConflict`（`x-error-codes` 本就正确，未动）；`0007_highlights.downgrade()` 补 docstring，行为未改。`check_task.py --worktree` 复跑 **CHECKS PASS**。同一 Reviewer 第三次增量复审 `45f2495..55a14ac` **PASS，No findings**：「DELETE 现为 404 `ResourceOrHighlightNotFound` / 409 `VersionConflict` / 428 `PreconditionRequired`，三个引用与 `highlight_store.delete`（只有 `find` + `check_version`）逐条对应；`HighlightNoteConflict` 现只剩 POST/PATCH 引用，两者确实可返回该码；降级只加 docstring，两行未变。」
- 最终状态/风险/用户操作：**MERGED**——2026-09-19 用户已合并 PR #79，merge commit `0522381`（登记并入 TASK-072 控制面）。风险低：新增表与新增端点，既有接口与 `notes` 语义一字未动；`q is None` 式的既有路径不受影响；两轮 Review + 三次增量 + 独立验收均 PASS。**交付时界面无变化**——高亮要等 TASK-072 才看得见。用户操作：合并 PR，合并后本机库会由启动脚本升到 0007。
- 非阻断遗留项：
  - **F5（记录 → 交 TASK-072）** `attachNote`/`detachNote` 能把一条已被高亮绑定的心得移出该资料，留下违反 4.15「`note_id` 须同资料」的**悬挂绑定**。修它要改 notes 的移动语义（本任务非目标），且后果可恢复（重新绑回即可，不丢数据）。TASK-072 需处理：读取高亮时若其 `note_id` 指向的心得已不在本资料，按「没有配心得」展示并允许重新配。重评触发：TASK-072 落地时一并处理。
  - **F6（记录）** 删除心得由数据库的 `SET NULL` 触发，**不推进** `highlight.version`（4.15 已写明）。旧版本客户端手里的高亮仍显示原 `note_id`，直到它重新读取。单用户本机下无实际影响。
  - **F7（记录）** `require_note` 的占用检查是 SELECT-then-INSERT，两个并发请求抢同一条心得时靠 `UNIQUE(note_id)` 兜底，会得到 500 而不是 409。本机单用户、且需同一毫秒内两次写才触发。重评触发：出现多写入方（如扩展与页面同时写）时改为捕获 `IntegrityError` 转 409。
  - **（记录）** `highlight_count` 已进删除影响预览，但前端删除对话框目前只显示 `note_count`；在 TASK-072 让用户能创建高亮之前，这个差距对用户不可见。
- 日期与决定日志：2026-09-19 用户选定第三部分＝高亮能存住，形态＝高亮可单独存在、可选配心得 → 登记 TASK-071（后端）；前端为 TASK-072 → 实现 `a66639b` → 两轮 Review（首轮 CHANGES_REQUIRED，三条必修全在契约文档层）+ 独立验收 PASS → 最终候选 `55a14ac` → ACCEPTED → 2026-09-19 用户合并 PR #79，MERGED。
<!-- EVIDENCE:END -->
