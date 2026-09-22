# TASK-088：PDF 阅读器补上目录、阅读进度线与「记为学习进度」，向网页阅读器看齐

```toml
schema_version = 2
id = "TASK-088"
status = "READY"
risk = "L2"
risk_reason = "普通业务实现：把网页阅读器已有的三件东西补到 PDF 上——左栏目录（改从 pdf.js 书签大纲来）、顶栏阅读进度线、「记为学习进度 N%」。只动前端组件与样式，**不改后端、不改契约、不加迁移、不碰学习记录的写入链路**（「记为学习进度」仍走既有的 `createResourceStudyRecord`，一个字段都不改）。不命中 risk-policy.json 的 high_risk_paths。执行链：1 Worker → 自动检查 → 1 独立只读 Reviewer；独立验收 N/A。"
risk_flags = ["business"]
owner = "coordinator"
base = "435f769528f0cc7b981ff59d5fbfe9faa76944ec"
allowed_paths = [
  "frontend/src/features/resources/PdfReader.tsx",
  "frontend/src/features/resources/PdfReader.test.tsx",
  "frontend/src/features/resources/ReaderOutline.tsx",
  "frontend/src/features/resources/ReaderOutline.test.tsx",
  "frontend/src/features/resources/outline.ts",
  "frontend/src/features/resources/pdfOutline.ts",
  "frontend/src/features/resources/pdfOutline.test.ts",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ResourceToolbar.tsx",
  "frontend/src/features/resources/ResourceToolbar.test.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/pdf-reader.spec.ts",
  # 到期收尾（合并 PR #95 后的登记）
  "docs/tasks/TASK-087-pdf-text-layer.md",
  "docs/tasks/TASK-088-reader-parity.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-21 用户：「**开始优化 pdf 阅读器体验，要求 pdf 阅读器与网页阅读器操作、视图没有太大区别**」。
主 Agent 回源码核出两者的实际差异并列表上报后，用户选定：

- **范围**：「**目录 + 进度线 + 记为学习进度**」——即上报表里前三行；
  **滚动形态统一不做**（要重做 TASK-073/081/083 稳下来的滚动几何，回归风险高）。
- **PDF 没有书签大纲时**：「**不显示左栏**」（与网页正文里没有 h2/h3 时一致）。

2026-09-22 用户合并 PR #95 后：「**开始做 TASK-088**」。

### 上报过的差异表（本任务只动标 ✅ 的三行）

| | 网页正文阅读器 | PDF 阅读器 | 本任务 |
| --- | --- | --- | --- |
| 左侧目录栏 | 有（h2/h3，滚动高亮、点击跳转） | 没有 | ✅ 补 |
| 顶栏阅读进度线 | 有 | 没有 | ✅ 补 |
| 「记为学习进度 N%」 | 有 | 没有（`readingPercent` 恒为 null） | ✅ 补 |
| 右栏「高亮」Tab、「标下来」 | 有 | 没有 | ❌ 下一个 L3（要改契约 §4.15） |
| 缩放 / 适合宽度 | 没有 | 有 | ❌ 不动 |
| 滚动形态 | 整页滚动 | 内层容器滚动 | ❌ 用户选定不做 |

### 目标

1. **PDF 左栏目录**：从 pdf.js 的书签大纲（`getOutline()`）生成，条目解析到页码
   （`getDestination(id)` → `getPageIndex(ref)`）；点击跳到那一页；滚动时高亮当前所在条目。
   **没有书签就不显示左栏**（用户选定）。顶栏那个「目录」按钮对 PDF 同样生效。
2. **顶栏阅读进度线**：PDF 也有，取值＝`(当前页序 + 页内比例) / 总页数`。
3. **「记为学习进度 N%」**：PDF 上同样出现（仍是既有那条链路：预填 → 用户点 → 写学习记录）。
4. **两栏长得一样**：目录栏复用网页那套 DOM 与样式，只是跳转方式不同（元素 vs 页码）。
5. 到期收尾：TASK-087 记录与索引行登记 MERGED（PR #95，merge `435f769`）。

### 非目标 / 禁止范围

- **不做高亮**（PDF 的「标下来」与右栏「高亮」Tab）：要改契约 §4.15、加迁移，属下一个 L3 任务。
  用户 2026-09-22 已提出「PDF 没有仅高亮、加了心得高亮也不保存」，**已登记为 TASK-089 的来源**，
  不在本任务里顺手做——那会把 L2 变成 L3 且混淆两件事的证据。
- 不改后端、不改契约、不加迁移、不改学习记录的写入语义与校验。
- 不统一滚动形态、不给网页阅读器加缩放、不做 PDF 页缩略图。
- 不改网页阅读器既有的目录/进度线/「记为学习进度」行为（回归用例守住）。

### 主 Agent 登记的决定（Review 可挑战）

- **`ReaderOutline` 改成展示组件**：现在它直接 `item.element.scrollIntoView()` 并监听 `window`
  滚动。改为接收 `items`（只有 `key/level/text`）、`current`、`onJump(index)`，
  由网页侧与 PDF 侧各自算 current 与跳转。这样两边视觉完全一致，逻辑各归各处。
- **PDF 的当前条目按页码判**：取「页码 ≤ 当前页」的最后一条。比按像素位置判简单且稳。
- **进度百分比的口径**：`(page - 1 + 页内比例) / 总页数`，取整。与网页侧「滚动百分比」不是同一
  套算法，但**用户看到的含义一致**（读到整份的百分之几）；网页那套一个字不动。
- **书签解析失败时当作没有目录**：坏 `dest`、解析抛错、大纲为空，都退回「不显示左栏」，
  不显示半个坏目录。

## 完成条件

- 打开一份**有书签**的 PDF：左栏出现目录，形态与网页阅读器一致；点条目跳到对应页；
  滚动时当前条目高亮跟着走；顶栏「目录」按钮能开关它。
- 打开一份**没有书签**的 PDF：左栏不出现（与网页无 h2/h3 时一致），正文占满。
- PDF 顶栏出现阅读进度线；读到一半时出现「记为学习进度 N%」，点了之后按既有链路写入学习记录。
- 网页阅读器的目录、进度线、「记为学习进度」行为一字不变（既有用例全绿即为证）。
- 新增单测：书签 → 目录条目的解析（含坏 `dest`、空大纲、嵌套子条目）、当前条目按页码判、
  进度百分比计算；e2e 用带书签的夹具验「左栏出现 → 点条目 → 页码变了」。
- TASK-087 记录 status 与索引行均为 MERGED。
- `check_task.py` 必要检查 PASS；L2：1 独立只读 Reviewer 审最终 diff。

## 上下文包

- 已核实的现状：`outline.ts` 的 `collectOutline` 只认 `.snapshot-rendered`；
  `ReaderOutline.tsx` 绑死 `item.element` 且监听 `window` 滚动；
  `ResourceDetail.tsx` 的 `readingPercent` 只由 `.snapshot-rendered` 的滚动算，PDF 恒为 null；
  `ResourceToolbar.tsx:271` 的「记为学习进度」按 `readingPercent > progress.progress_percent` 显示。
- pdf.js API（已核）：`getOutline()`、`getDestination(id)`、`getPageIndex(ref)`。
- **PDF 在内层容器 `.pdf-reader-pages` 里滚，`scroll` 不冒泡**——当前条目的跟随要用捕获阶段监听
  （TASK-087 在 `ReaderQuote` 上踩过一次）。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-088-reader-parity.md --worktree`。

## 实现与测试

- 待填。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：N/A（L2）
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-21 用户要求「pdf 阅读器与网页阅读器操作、视图没有太大区别」→ 主 Agent
  列出差异表 → 用户选定范围「目录 + 进度线 + 记为学习进度」与「无书签时不显示左栏」；
  2026-09-22 用户合并 PR #95 后说「开始做 TASK-088」，同轮提出「PDF 没有仅高亮、加了心得高亮也
  不保存」——**该项登记为 TASK-089 的来源，不并入本任务**。
<!-- EVIDENCE:END -->
