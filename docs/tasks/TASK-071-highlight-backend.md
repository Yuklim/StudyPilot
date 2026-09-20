# TASK-071：高亮锚点的后端存储与接口（阅读器高亮第一步）

```toml
schema_version = 2
id = "TASK-071"
status = "READY"
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

- 实现 SHA/变更摘要：待填
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：待填
- 已知限制/未完成项：待填

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-19 用户选定第三部分＝高亮能存住，形态＝高亮可单独存在、可选配心得 → 登记 TASK-071（后端）；前端为 TASK-072。
<!-- EVIDENCE:END -->
