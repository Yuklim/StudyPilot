# TASK-089：PDF 上的高亮——能只标不写，写了心得也能配上

```toml
schema_version = 2
id = "TASK-089"
status = "READY"
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

- 待填。

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
