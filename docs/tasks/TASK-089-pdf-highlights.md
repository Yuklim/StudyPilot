# TASK-089：PDF 上的高亮——能只标不写，写了心得也能配上

```toml
schema_version = 2
id = "TASK-089"
status = "ACCEPTED"
risk = "L3"
risk_reason = "改公共契约（§4.15 高亮锚点加 `page_number`、放宽「必须有 READY 正文快照」的写入前置条件、新增一个错误码）+ 一次迁移 0009（`highlights` 加列、换索引）+ 关键数据模型 + 跨后端/前端。命中 risk-policy.json 的 `docs/contracts/**`、`backend/**/models/**`、`backend/**/migrations/**`。执行链：1 Worker → 自动检查 → 独立只读 Reviewer → 独立只读 Integration/Acceptance。"
risk_flags = ["public-api", "migration", "critical-data"]
owner = "coordinator"
base = "d4e41dc81e81b439be8ac64dc8ebfb43c55c15ad"
allowed_paths = [
  "docs/contracts/API与数据契约基线.md",
  "docs/contracts/openapi-v1.json",
  "backend/migrations/versions/0009_highlight_page.py",
  "backend/src/studypilot/infrastructure/database/models.py",
  "backend/src/studypilot/infrastructure/database/highlight_store.py",
  "backend/src/studypilot/application/highlights.py",
  "backend/src/studypilot/api/highlights.py",
  "backend/src/studypilot/modules/highlights/contracts.py",
  "backend/tests/test_highlights.py",
  # 登记补正（实现中发现）：迁移必然把 head 推到 0009，而 test_migrations.py 里硬编码了当前
  # head 与「非空库拒绝降级」的用例，不同步就是 3 条红；同时给 0009 补一条降级守卫用例。
  "backend/tests/test_migrations.py",
  "frontend/src/features/resources/PdfReader.tsx",
  "frontend/src/features/resources/PdfReader.test.tsx",
  "frontend/src/features/resources/ReaderQuote.tsx",
  "frontend/src/features/resources/ReaderQuote.test.tsx",
  "frontend/src/features/resources/ReaderHighlights.tsx",
  "frontend/src/features/resources/ReaderHighlights.test.tsx",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/highlights.ts",
  "frontend/src/features/resources/highlights.test.ts",
  "frontend/src/features/resources/highlightAnchor.ts",
  "frontend/src/features/resources/highlightAnchor.test.ts",
  "frontend/src/styles.css",
  "frontend/e2e/pdf-highlights.spec.ts",
  # 登记补正（实现中发现）：TASK-073/087 的 e2e 里有两条断言把「PDF 没有高亮 Tab」「PDF 胶囊没有
  # 标下来」写成了守卫——那正是本任务要改掉的行为，两条必须反转，否则本任务永远是红的。
  "frontend/e2e/pdf-reader.spec.ts",
  # 顺手：修 CI 偶发抖动的那条既有测试（PR #96 抖过一次，同提交 push 运行是绿的）
  "frontend/src/features/resources/ResourceDeleteDialog.test.tsx",
  # 到期收尾（合并 PR #96 后的登记）
  "docs/tasks/TASK-088-reader-parity.md",
  "docs/tasks/TASK-089-pdf-highlights.md",
  "docs/tasks/任务索引.md",
]
checks = ["backend", "frontend", "contracts"]
```

## 需求与范围

### 用户授权

- 2026-09-22 用户（合并 PR #96 前）：「**我发现现在的 pdf 没有仅高亮的功能，而且加了心得之后高亮也
  不会保存，这个要修改**」；合并 #96 后：「**开始做 TASK-089**」。
- 锚点方案是用户 2026-09-21 在 TASK-087 登记时就选定的：「**文本锚点：页码 + 原文 + 前后文**」。
- 2026-09-22 登记时问的一个决定：**PDF 选区跨了两页时「标下来」怎么处理** → 用户选
  「**跨页时不给「标下来」，只留「记下这段」**」。

### 现状（已核实，写入前的事实）

- TASK-087 给 PDF 叠了文字层，但胶囊只有「记下这段」（`canMark={false}`），右栏没有「高亮」Tab。
  「加了心得高亮也不会保存」的根子在此：PDF 上没有高亮这个对象，心得只能孤立存在。
- 后端 `highlight_store.create` 先 `require_snapshot`（READY 快照），PDF 是 FILE 资料、没有快照，
  写入会得到 `404 SNAPSHOT_NOT_FOUND`。`highlights` 表没有页码，默认按 `start_offset` 排。
- 前端锚点（`highlightAnchor.ts`：`anchorFrom` / `locate` 四级降级 / `rangeFor`）全部按「一个容器
  的纯文本」工作，与容器是什么无关——**PDF 只要把容器换成那一页的 `.pdf-text-layer`，整套可原样复用**。
- 上色用 CSS Custom Highlight API，现有 `::highlight(studypilot-mark)` 设了 `color: var(--ink)`；
  文字层的字是透明的，照用会把 DOM 文字画在 canvas 的字上面——错位的双重文字。

### 目标

1. **契约 §4.15**：高亮加可空列 `page_number`（≥1；`null` = 锚在正文快照里，非空 = 锚在 PDF 第 N 页
   的文字层里，偏移按**页内**纯文本算）。写入前置条件放宽为「**有可锚定的文本**」：
   `page_number` 为空 → 仍须 READY 快照（不变）；`page_number` 非空 → 须有 READY 且
   `media_type = application/pdf` 的原件，否则 `404 PDF_NOT_FOUND`（新错误码）。
   默认排序改为文中顺序 = `page_number`（空值在前）→ `start_offset` → `id`。
   **服务端仍不解释内容**：不校验页码是否超出总页数、不读 PDF、不出网。
2. **迁移 0009**：`highlights` 加 `page_number INTEGER NULL` + CHECK `page_number IS NULL OR page_number >= 1`；
   索引 `ix_highlights_resource_start` 改为 `(resource_id, page_number, start_offset, id)`。
   降级：删列、还原索引（SQLite 走 batch 重建）。
3. **后端**：`HighlightCreate` / `Highlight` 响应加 `page_number`；store 的前置条件与排序照 1；
   openapi 同步；`test_highlights.py` 补 PDF 路径（含「快照资料给了页码 → 422」「PDF 资料没给页码 →
   `SNAPSHOT_NOT_FOUND`」「没有 PDF 原件却给了页码 → `PDF_NOT_FOUND`」「排序：页码优先」）。
4. **前端**：
   - PDF 上的胶囊恢复**两个按钮**；「标下来」按页取锚点（`anchorFrom(那一页的文字层, range)` +
     `page_number`）；**选区跨页时「标下来」不出现、只留「记下这段」并提示**（用户选定）。
   - 「记下这段」在 PDF 上也走 `takeQuoteAndMark`：引文进草稿 + 标高亮 + 心得保存后自动配对
     （跨页时退回只引文）。**这就是用户说的「加了心得高亮也要保存」**。
   - 右栏「高亮」Tab 对 PDF 放开；列表按页码排，条目显示「第 N 页」；点条目跳到那一页
     （复用 TASK-088 交上来的 `goTo`）。
   - 重定位按页：`PdfReader` 把已渲染的文字层按页号报上来（渲染完成后才报，卸载时撤），
     `ReaderHighlights` 对每条高亮在它那一页的容器里跑四级定位。**那一页还没渲染 ≠ 孤立**：
     只有那一页已渲染仍找不到才判「原文位置已找不到」。
   - 上色用单独的高亮名 `studypilot-mark-pdf`，**只给底色、不给字色**，配合文字层已有的
     `mix-blend-mode: multiply`。
5. 顺手：`ResourceDeleteDialog.test.tsx` 两处「负向 `waitFor` 后接同步正向断言」改为 `findByRole`
   （PR #96 CI 抖过一次，同提交 `push` 运行是绿的，本机 5 次全绿）。
6. 到期收尾：TASK-088 记录与索引行登记 MERGED（PR #96，merge `d4e41dc`）。

### 非目标 / 禁止范围

- 不做 PDF 的框选/几何矩形高亮、不做扫描件/旋转页上的高亮（那两类没有文字层，TASK-087 已登记）。
- 不改 `notes` 表与心得接口；不改删除影响预览（`highlight_count` 已含 PDF 高亮，级联不变）。
- 不做跨页高亮的拆分或合并（用户选定「跨页不给标」）。
- 不改网页正文阅读器的高亮行为（回归用例守住）。

### 主 Agent 登记的决定（Review 可挑战）

- **列名叫 `page_number`（1 起）而不是 `page_index`**：与 pdf.js 的 `pageNumber`、前端位置记忆里的
  `page` 一致；「index」会让人以为 0 起。主 Agent 在此前几轮汇报里口头说过 `page_index`，
  以本记录为准。
- **新增错误码 `PDF_NOT_FOUND`** 而不是复用 `SNAPSHOT_NOT_FOUND`：两者的修法完全不同（一个要先存
  正文，一个是资料类型不对），合并成一个会让前端没法给出准确提示。
- **不校验 `page_number` ≤ 总页数**：服务端从不读 PDF（与「不解释正文」同一条原则）；越界的页码
  在前端表现为「那一页不存在 → 孤立」，不丢数据。
- **`page_number` 与资料类型的一致性在写入时校验**（快照资料给页码 → 422 `VALIDATION_ERROR`，
  PDF 资料不给页码 → `SNAPSHOT_NOT_FOUND`）：一条高亮要么锚在快照、要么锚在某一页，不允许
  两可。

## 完成条件

- 契约 §4.15 与操作表已改（字段、前置条件、错误码、排序），openapi 同步，`contracts` 检查 PASS。
- 迁移 0009 `upgrade`/`downgrade` 都能跑；`backend` 检查 PASS，新增用例覆盖上面第 3 条列的四种情形。
- PDF 上：选中一页内的文字 → 胶囊两个按钮 → 「标下来」后右栏「高亮」Tab 出现该条并上色；
  刷新后仍上色；「记下这段」→ 心得保存后与高亮配对；选区跨页 → 只有「记下这段」。
- 网页正文阅读器的高亮行为一字不变（`reader-highlights` e2e 与既有单测全绿）。
- 新增 e2e `pdf-highlights.spec.ts`：标下来 → 列表 + 上色 → 刷新仍在；跨页无「标下来」；
  点列表条目跳页。
- `ResourceDeleteDialog.test.tsx` 那两处已改；TASK-088 已登记 MERGED。
- `check_task.py` 必要检查 PASS；L3：独立只读 Reviewer + 独立只读 Integration/Acceptance。

## 上下文包

- 契约：§4.15（本任务要改）、§2.3 排序、§10 操作表；`docs/contracts/openapi-v1.json` 的
  `Highlight*` schema 与 `/highlights` 路径。
- 后端：`highlight_store.py`（`require_snapshot` / `create` / `list`）、`models.py:448`、
  `modules/highlights/contracts.py`、`api/highlights.py` 的 `MESSAGES`、`tests/test_highlights.py`。
- 前端：`highlightAnchor.ts`（原样复用）、`ReaderHighlights.tsx`（`rendered` 容器 → 按页容器）、
  `ReaderQuote.tsx`（`canMark` 要能按选区判）、`ResourceDetail.tsx`（`mark`/`takeMark`/
  `takeQuoteAndMark`、「高亮」Tab 的 `!pdfOriginal` 门）、`PdfReader.tsx`（文字层渲染完成的时机）。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-089-pdf-highlights.md --worktree`。

## 实现与测试

- 实现 SHA：`bd3d600`。
- **命令与结果**（都在这条实现上跑）：
  - `check_task.py --task docs/tasks/TASK-089-pdf-highlights.md --worktree` → **CHECKS PASS**，
    `files=25`
    `product_fingerprint=43588deaaa82c5f2c71f783793462fc1c2fcd7901b75aea0fd98548ef95b94e9`，
    `profiles=backend,contracts,frontend`。
  - 后端 `uv run pytest` → **596 passed**（改前 593；`test_highlights` +2、`test_migrations` +1）；
    `ruff check` / `ruff format --check` / `mypy --strict` 全过。
  - 迁移 0009 在临时库上 `upgrade head → downgrade 0008 → upgrade head` 三步都跑过，
    `.schema highlights` 里 `page_number INTEGER`、`ck_highlights_page_number_positive`、
    新索引 `(resource_id, page_number, start_offset, id)` 都在。
  - 前端 `npm run test -- --run` → **825 passed（37 个文件）**（改前 817；`highlights` +2、
    `ReaderHighlights` +3、`PdfReader` +1、`ReaderQuote` +2）；`typecheck`（`tsc -b`）、`lint`、
    `prettier --check` 全过。
  - e2e：`pdf-highlights`（新，3 条）+ `reader-highlights`（网页高亮回归，3 条）+ `pdf-reader`（7 条）
    → **13 passed**。
  - `contracts` 检查（`OpenAPI.model_validate_json`）PASS。
- **目视**（一次性脚本，不入库）：PDF 页上选中一行后胶囊是两个按钮；「标下来」后那一行以淡黄底色
  画在 canvas 的字**下面**（字仍清晰、没有双重文字）；右栏「高亮」Tab 出现条目、带「第 1 页」标。

### 落点

1. **契约 + openapi**：§4.15 字段表加 `page_number` 一行、前置条件段改写、分层锚点段补一句；§2.3
   排序行写明 `start_offset` 这个排序名如今的实际次序；操作表两行；错误码总表加 `PDF_NOT_FOUND`；
   操作清单里 `createResourceHighlight` 那行补 TASK-089 一句。openapi 的 `Highlight`/`HighlightCreate`
   schema、两条路径的描述与 `x-error-codes`、404 响应示例、所有示例里补 `page_number: null`、tag 描述。
   **openapi 是按原格式逐行改的**：第一次我用 `json.dumps(indent=2)` 整份重写，把「一路径一行」的
   紧凑格式炸成了 1 万行 diff——立刻回滚，改成「只解析并重写要改的那几行、按该行原有的分隔符
   风格序列化」，最终 diff 是 6 行。
2. **后端**：`HighlightCreate.page_number: int | None = Field(default=None, ge=1)`；模型加列、CHECK、
   索引；store 的 `require_anchor_target(resource_id, page_number)` 分三路（无页码 → 快照；有页码但
   资料有快照 → 422；有页码 → READY 的 `application/pdf` 原件否则 `PDF_NOT_FOUND`）；`page()` 的
   `start_offset` 排序改为 `(page_number NULLS FIRST/LAST, start_offset, id)`（显式写 nulls，不靠数据库
   默认）；`MESSAGES` 加一条。
3. **迁移 0009**：`batch_alter_table` 加列 + CHECK + 换索引；降级先数 `page_number IS NOT NULL` 的行，
   有就 `RuntimeError` 拒绝（按页锚定的高亮在 0008 以下没有去处，删列等于把它悄悄改成指向空处的
   快照锚点）。
4. **前端**：
   - `highlights.ts`：响应校验把 `page_number` 当**必有字段**（缺了或不是正整数 → `INVALID_RESPONSE`），
     `createHighlight(…, pageNumber)` 只在非空时发这个字段。因此三个测试文件的高亮夹具都补了
     `page_number: null`——严格校验的代价，值得。
   - `ReaderQuote.canMark: boolean | ((range) => boolean)`：谓词形态按当前选区判；判否时只留「记下这段」
     并显示「跨页只能记下这段」。
   - `ResourceDetail`：`pageOfRange(range)` 找选区所在的那一页（两端都在同一 `.pdf-text-layer` 里才算），
     `mark()` 在 PDF 上用那一页当容器、带 `page_number` 创建；`pdfLayers: Map<页号, 元素>` 由
     `PdfReader.onTextLayer` 维护；「高亮」Tab 与面板的 `!pdfOriginal` 门都拆掉；`takeQuoteOnly`
     删除——PDF 与网页走同一条 `takeQuoteAndMark`，跨页时 `mark()` 早退、引文照进草稿。
   - `PdfReader`：`onTextLayer(page, layer|null)` 在 `TextLayer.render()` 完成后报、effect 清理时撤；
     报早了里面还没有 span，定位会把每条都判成孤立。
   - `ReaderHighlights`：`pages` 模式按每条的页号取容器；`locatable` 按条判——**那一页没渲染只是
     「还没看」**，不是孤立，且给「跳到第 N 页」；孤立文案分两版；注册表名 `studypilot-mark-pdf`；
     排序按 `(page_number, start_offset)`，孤立的仍排最后。
   - `styles.css`：`::highlight(studypilot-mark-pdf)` 只给底色；胶囊提示与页码标两条小样式。
5. **顺手三处**：`ResourceDeleteDialog.test.tsx` 抖动修复；`pdf-reader.spec.ts` 两条反转（登记补正）；
   `test_migrations.py` head 推到 0009 + 新增 0009 守卫用例（登记补正）。

### 过程中的两次登记补正与两次自己栽的跟头

- **补正 1**：`backend/tests/test_migrations.py` 不在首次登记的路径里——迁移必然推 head，那文件里
  硬编码了 `0008` 的三处断言，不同步就是 3 条红。**补正 2**：`frontend/e2e/pdf-reader.spec.ts` 同样
  漏登记——TASK-073/087 把「PDF 没有高亮 Tab」「胶囊没有标下来」写成了守卫，正是本任务要改的行为。
  两处都在实现中发现、先补登记再改。
- **跟头 1**：openapi 整份重排（见落点 1），回滚后按原格式改。
- **跟头 2**：新写的 0009 迁移用例第一版 `MigrationContext.configure(engine.connect())` 没关连接，
  后面的 batch 重建撞上 SQLite 锁（`database is locked`），单跑偶尔过、全量跑必挂；改成
  `with engine.connect() as connection:` 并把 `pytest.raises` 放到 session 外层，连跑 3 次全绿。

### 第二轮：处置独立 Review 的四条（F1 补 e2e、F2 改文案、F3/F4 登记）

Review 结论是 PASS，另给一条须处置与三条可选/风险：

- **F1（须处置）**：完成条件写了「e2e 验点列表条目跳页」，而 `pdf-highlights.spec.ts` 只有三条，跳页只在
  单测里断言了 `onJumpPage(9)` 被调用。**补的是 e2e 而不是改措辞**：仓库里有 12 页夹具 `sample-long.pdf`，
  第 9 页在 ±2 页的渲染窗口之外——经接口在第 9 页造一条高亮，打开阅读器停在第 1 页：第 9 页没有
  文字层、那条**不判孤立**、注册表里**没有上色**、列表给「跳到第 9 页」；点它 → 页码变 9 → 渲染完
  在那一页里定位上色（`painted() === ['StudyPilot page 9']`）→ 按钮让位给「跳到正文」。
  `pdf-highlights` 现在 **4 条**。
- **F2（可选，采纳）**：选区一端落在同一页的页外空隙时同样判不可标，而胶囊固定写「跨页只能记下这段」，
  文案失真。改成「**选区跨页或落到页外，只能记下这段**」——两种情况都是「没有整个落在同一页的
  文字层里」。单测与 e2e 的文案断言同步。
- **F3（剩余风险，登记）**：一份资料同时有 READY 快照与 READY 的 PDF 原件时（只能绕过 UI 直接
  `putResourceSnapshot` 造出来），阅读器仍给「标下来」而后端返回 422「输入不符合要求」。UI 不可达，
  不阻断，见「已知限制」。
- **F4（可选，登记）**：PDF 上 `exact` 是跨行 span 直接拼接的，列表引文里行尾行首会粘连；定位不受影响。
  见「已知限制」。

### 已知限制 / 未完成项

- **跨页选区不能标高亮**（用户选定），只能记下这段。
- **服务端不校验 `page_number` ≤ 总页数**：越界页码在前端表现为永远「还没渲染」（不会被判孤立、
  也不会上色），列表里显示「跳到第 N 页」但跳不到。不丢数据，但界面上看不出「这条指向不存在的页」。
- **PDF 上的高亮定位只在那一页渲染时进行**：视口外的页没有文字层，那几条不上色也不判孤立；
  滚过去就有。
- **右栏读心得只取一页 100 条**（TASK-072 既有），PDF 同样。
- **同时有快照与 PDF 原件的资料**（UI 造不出来）：阅读器给「标下来」，后端按契约回 422。
- **PDF 上跨行选区的引文会粘连**：文字层的行是各自的 span，`exact` 直接拼接、行间没有空格或换行；
  只影响列表里引文的可读性，不影响定位。
- 扫描件、旋转页没有文字层（TASK-087 已登记），自然也没有高亮。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：**最终候选 `1db78a3`**（base `d4e41dc`）。三次冻结：`745296d`（首次送审 → PASS + F1 须处置）
  → `7de63e6`（补 e2e + 改文案 → 增量复核 PASS / No findings；**独立验收 PASS 就是针对它**）
  → `1db78a3`（验收可选项：一处 prop 注释同步到改过的提示文案，**纯注释、无行为变化**——
  Reviewer 与验收都明确说过这类增量不需再开一轮，据此不再送审）。
- Review（独立只读 Reviewer，两轮，**报告原文**）：

  > ## TASK-089 独立只读审查（首次审查，base `d4e41dc` → candidate `745296d`）
  >
  > **只读证明**：本 Agent 仅授予 Read/Grep/Glob，无 Write/Edit/Bash；未改任何文件。无 Bash 因此不能 `git` 核对 SHA、不能复跑检查，审的是导出的 `01-full.patch`（25 文件）+ 工作区源码调用链。
  >
  > **审查范围**：完整 diff；`highlightAnchor.ts`/`quoteSelection.ts`/`snapshot_store.py`/`PdfReader.tsx` 413-423/`CapturePage.tsx` 作为调用链。
  >
  > **逐项核对（无问题）**
  > - 契约 §4.15/§2.3/操作表/错误码表 ↔ openapi ↔ `require_anchor_target` 三路、`page()` 显式 nulls_first/last、`PDF_NOT_FOUND` 条件：一致。openapi 仅 6 行变动（tags、两条 path、两条 schema、`HighlightTargetNotFound`），无误伤。
  > - 迁移 0009：`env.py` 配了 `target_metadata`，batch 内 CHECK 名经 naming_convention 得 `ck_highlights_page_number_positive`，与 `models.py` 对应；索引列序一致；降级守卫形状同 0006；用例连接已用 `with` 关闭。
  > - 前端：`anchorFrom`/`rangeFor` 同用 `mapText`（`<br>` 两边都不计），偏移一致；`registryName` 清理正确；`orphans` 按条计；`goTo` 无书签也会在 `onOutline` 交出。
  > - 不该变的：网页 `canMark` 仍是布尔 `true`；`takeQuoteAndMark`/`pendingNote` 10 分钟时限未动；`highlight_count` 未动。
  > - 记录数字：25 文件、后端 +3、前端 +8、e2e 3+3+7=13、`test_migrations` 三处 0008、openapi 6 行——均与 diff 相符。
  >
  > **Findings**
  > - **F1（须处置，记录层面）** `docs/tasks/TASK-089-pdf-highlights.md:129-130` 完成条件写「新增 e2e … 点列表条目跳页」，但 `frontend/e2e/pdf-highlights.spec.ts` 三条是「标下来+刷新 / 跨页 / 配对」，跳页仅有单测断言 `onJumpPage(9)` 被调用。两页夹具在 `NEAR_PAGES` 窗口内造不出「未渲染页」，e2e 难补；实际应订正完成条件措辞。该改动在 EVIDENCE 区外 → 形成新候选，我可做增量复核。
  > - **F2（可选）** `ResourceDetail.tsx:350-360` 选区一端落在页间空隙/`.pdf-page` 容器（同页非跨页）时同样判不可标，胶囊固定提示「跨页只能记下这段」，文案失真。
  > - **F3（记录为剩余风险）** 资料同时有 READY 快照与 READY PDF 原件（仅能绕过 UI 直接 `putResourceSnapshot` 达成），阅读器仍给「标下来」而后端返回 422「输入不符合要求」。UI 不可达，不阻断。
  > - **F4（可选）** PDF 上 `exact` 为跨行 span 直接拼接，列表引文会行尾行首粘连；定位不受影响。
  >
  > **结论：PASS**（针对 `745296d` 的代码、契约、迁移与测试）；F1 需主 Agent 在验收前处置（订正措辞或补 e2e，任一都产生新候选）。剩余风险：F3；检查数字采信记录，未能复跑。

  > ## TASK-089 增量复核（`745296d..7de63e6`，base 仍 `d4e41dc`）
  >
  > **只读证明**：同前，仅 Read/Grep/Glob，无写工具、无 Bash。
  >
  > **覆盖与继承**：审了 `02-incremental.patch` 全部 4 文件 150 行，并核对 `PdfReader.tsx:39`（`NEAR_PAGES = 2`）、`:405-423`（`jump` 经 `onOutline` 交出，无书签也交）、夹具 `frontend/e2e/fixtures/sample-long.pdf` 存在且非本次新增、`getByLabel('页码')` 与 `pdf-reader.spec.ts` 同一控件。增量未触及后端/契约/迁移/`ResourceDetail`/`ReaderHighlights`，**继承首轮对 `745296d` 的全部结论**（契约三路一致、迁移命名与守卫、定位与注册表、不该变的部分）；结论针对 `7de63e6`。
  >
  > **F1 核验（`pdf-highlights.spec.ts:193-228`）**
  > - 「未渲染 ≠ 孤立」：`toContainText('第 9 页')` 先等列表真正载入，之后再数 `.reader-highlight-orphan === 0`，顺序正确；第 9 页无文字层的断言在此之前已成立。**真验到了。**
  > - `painted() === []` 那步：因为这条高亮只在第 9 页、页未渲染，无论列表是否载入它都为空——不是竞态造成的假过，但单独看是弱断言；与跳页后 `['StudyPilot page 9']` 的正向 poll 合起来才构成「跳页后定位上色」的证据，**成立**。`跳到正文` 出现 = `range` 非空，再加孤立数 0，闭环。
  > - 唯一的抖动风险：点「跳到第 9 页」若早于 `onOutline` 交出 `goTo`（默认是空函数），页码不会变、poll 超时 → 测试**失败而非假过**；实际大纲在文档载入后即读，窗口极小。可选：把 click 放进 `expect.poll` 重试。
  >
  > **F2**：文案「选区跨页或落到页外，只能记下这段」覆盖两种判否情形，单测/e2e 同步。
  > **记录第二轮段**：与增量 diff 逐条相符（补 e2e 而非改措辞、4 条、F3/F4 进已知限制）；「仓库里有 12 页夹具」属实。检查数字无法复跑，采信。
  >
  > **Findings**：No findings（上面的抖动风险为可选建议，不阻断）。
  >
  > **剩余风险**：F3（快照+PDF 双持资料，UI 不可达）、F4（引文粘连），已登记。
  >
  > **结论：PASS**（`7de63e6`），可转独立验收。

- 主 Agent 对 Review 的处置：F1 补 e2e、F2 改文案、F3/F4 登记（见「第二轮」）。第二轮那条可选建议
  （把「跳到第 9 页」的 click 放进 `expect.poll`）**未采纳**：Reviewer 自己判定失败形态是「红而非假过」，
  窗口极小；先留着，若 CI 抖到它再收紧。
- Acceptance（独立只读 Integration/Acceptance，独立于实现者与 Reviewer，核 `d4e41dc..122294b`，**报告原文**）：

  > ## TASK-089 独立只读 Integration/Acceptance（base `d4e41dc` → 候选 `7de63e6`，记录提交 `122294b`）
  >
  > **只读证明**：本 Agent 仅授予 Read/Grep/Glob，无写工具、无 Bash；未改任何文件。无 git，因此 SHA 归属、指纹链与「`122294b` 只改记录与索引」**无法独立核实**，只能核导出的 patch（25 文件，与首轮 Reviewer 所见文件集一致）、工作区源码、两张截图。
  >
  > **核对范围**：`03-final-full.patch` 全部非 openapi 段 + openapi 源文件定向 grep；`highlight_store.py`/`api/highlights.py`/`models.py` 命名约定/`env.py`；`ResourceDetail.tsx` 380–425、`ReaderHighlights.tsx`、`ReaderQuote.tsx`；e2e 三个 spec 计数；夹具存在性；索引行。
  >
  > **完成条件逐条**
  > 1. 契约/openapi/后端三方一致：**达成**。`page_number` 语义、三路前置（`require_anchor_target`：无页码→`require_snapshot`；有页码且资料有 READY 快照→422；否则 `require_pdf`→`PDF_NOT_FOUND` 404）、`MESSAGES` 有文案、openapi `x-error-codes`/schema/`HighlightTargetNotFound` 示例均含 `PDF_NOT_FOUND`；排序 `page_number nulls_first → start_offset → id` 显式写出；错误码总表有行。
  > 2. 迁移 0009：**达成**。upgrade/downgrade 与 `models.py`（列、CHECK `page_number_positive` 经 `ck_%(table)s_%(constraint_name)s` 得 `ck_highlights_page_number_positive`、索引列序）对得上；`env.py` 有 `target_metadata`；降级守卫「存在 `page_number IS NOT NULL` 行即 `RuntimeError`」；`test_0009_…` 用例真实走了 up→拒绝→删行→down→up，且 0006/非空库两条既有用例也经过 0009 降级，印证「三步都跑过」。
  > 3. 用户两件事：**达成**。胶囊两按钮（截图 1）、「高亮」Tab 放开并显示「第 1 页」（截图 2）；`takeQuoteAndMark` 对 PDF 生效，e2e 第 3 条断言 `[[1,true]]` 配对。
  > 4. 跨页不给标：**达成**。`canMark` 谓词形态、`pageOfRange` 两端同一 `.pdf-text-layer`、e2e 第 2 条断「标下来」为 0 且引文仍进草稿。
  > 5. 网页阅读器未改坏：**达成**。网页 `canMark={true}` 布尔、`takeQuoteAndMark`/`pendingNote`/10 分钟时限未动；`reader-highlights` 3 条在 e2e 计数内。
  > 6. 证据自洽：**部分可核**。文件数 25 ✓；后端 593+3、前端 817+8、e2e 4+3+7=14 算术一致 ✓；`test_migrations` 三处 0008、openapi ±6 行、`ResourceDeleteDialog` 两处、`pdf-reader.spec` 两条反转均与 diff 相符 ✓；指纹与 SHA 绑定无法复核，采信记录。
  > 7. L3 执行链：两轮 Review 原文完整写回、F1–F4 逐条对应（F1 补第 4 条 e2e 已在 diff；F2 文案已改并有单测/e2e 断言；F3/F4 进已知限制）；索引行与记录 status 均 `IN_ACCEPTANCE` ✓。
  > 8. 非阻断遗留：跨页不能标、不校验页码上限、只在渲染页定位、双持资料 422、引文粘连均已登记 ✓。
  >
  > **Findings**
  > - 可选（注释漂移，不阻断）：`frontend/src/features/resources/ReaderQuote.tsx:44` 的 prop 注释仍写「跨页只能记下这段」，而实际文案（第 105 行）已按 F2 改为「选区跨页或落到页外，只能记下这段」。本仓库明确在意注释与代码不符，建议顺手改；不形成新候选也可，登记即可。
  > - 其余 No findings。
  >
  > **结论：PASS**（针对 `7de63e6`）。
  >
  > **剩余风险与下一步**：F3（快照+PDF 双持，UI 不可达）、F4（引文粘连）、越界页码永远「还没渲染」；Reviewer 提的「跳到第 9 页」click 竞态未收紧，若 CI 抖再处理。给用户：可推 PR 并合并；合并后按 §5 把 089 的 MERGED 登记并入下个任务的控制面提交。

- 主 Agent 对验收的处置：那条可选项**已改**（`1db78a3`，纯注释）。验收说明 SHA/指纹链它无法独立核实
  ——主 Agent 在此补一句可核的事实：`git diff 7de63e6..1db78a3` 只有 `ReaderQuote.tsx` 一行注释。
- 最终状态/风险/用户操作：**ACCEPTED**（L3 执行链走完：实现 → 每轮机械检查 → 独立只读 Reviewer 两轮
  （F1 补 e2e、F2 改文案、F3/F4 登记）→ 独立只读 Integration/Acceptance PASS → 一处纯注释同步）。
  风险：改了契约、数据模型与迁移；降级在有按页高亮时会拒绝（有意为之）；最坏情况是 PDF 上某条高亮
  定位不到——按设计只在那一页渲染时判、不会丢数据。
  **等待用户操作**：请在自己库里的 arXiv 论文上试「标下来」、「记下这段 → 保存心得 → 配对」、跨页选区；
  确认后由你决定推 PR 与合并。合并后 089 的 MERGED 登记按 §5 并入下一个任务的控制面提交。
- 非阻断遗留项：
  1. **跨页选区不能标高亮**（用户选定），只能记下这段。
  2. **服务端不校验 `page_number` ≤ 总页数**：越界页码在前端永远显示「还没渲染」（不判孤立、不上色），
     列表给「跳到第 N 页」但跳不到。
  3. **PDF 高亮只在那一页渲染时定位**：视口外的页不上色也不判孤立，滚过去就有。
  4. **同时有快照与 PDF 原件的资料**（UI 造不出来）：阅读器给「标下来」，后端按契约回 422（Review F3）。
  5. **PDF 上跨行选区的引文会粘连**（Review F4），只影响列表可读性。
  6. e2e「跳到第 9 页」的点击若早于 `goTo` 交出会红而非假过（Review 可选建议，未收紧）。
  7. 右栏读心得只取一页 100 条（TASK-072 既有）。
- 日期与决定日志：2026-09-22 用户提出「PDF 没有仅高亮、加了心得高亮也不保存」→ 合并 #96 后
  「开始做 TASK-089」→ 登记时问跨页选区的处理，用户选「跨页不给标下来，只留记下这段」。
<!-- EVIDENCE:END -->
