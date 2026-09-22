# TASK-089：PDF 上的高亮——能只标不写，写了心得也能配上

```toml
schema_version = 2
id = "TASK-089"
status = "IN_REVIEW"
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

- 候选 SHA：待填
- Review：待填
- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-22 用户提出「PDF 没有仅高亮、加了心得高亮也不保存」→ 合并 #96 后
  「开始做 TASK-089」→ 登记时问跨页选区的处理，用户选「跨页不给标下来，只留记下这段」。
<!-- EVIDENCE:END -->
