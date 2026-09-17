# TASK-068：阅读器「记下这段」引文写心得 + 「记为学习进度」一键带入 + TASK-067 遗留小项

```toml
schema_version = 2
id = "TASK-068"
status = "READY"
risk = "L2"
risk_reason = "阅读器交互的普通业务实现：选中正文→引文进心得草稿（纯前端文本拼接，不存高亮、不改渲染器）；「记为学习进度」只是把本机阅读位置百分比预填进既有学习状态表单，写入仍走用户按「保存学习记录」的既有链路（契约不变、校验不变）；两个 TASK-067 可选项修正。跨 resources/notes/learning 三个 feature 目录但都是前端内部调用，按 business 归 L2：独立只读 Review；验收 N/A。"
risk_flags = ["business"]
owner = "coordinator"
base = "0e954c6d41f4a6ff8b1e55b5ecb17bb2e0d4c4ea"
allowed_paths = [
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ResourceToolbar.tsx",
  "frontend/src/features/resources/ReaderQuote.tsx",
  "frontend/src/features/resources/ReaderQuote.test.tsx",
  "frontend/src/features/resources/quoteSelection.ts",
  "frontend/src/features/resources/readerPosition.ts",
  "frontend/src/features/resources/ResourceToolbar.test.tsx",
  "frontend/src/features/resources/ReaderOutline.test.tsx",
  "frontend/src/features/notes/NotesPanel.tsx",
  "frontend/src/features/notes/NotesPanel.test.tsx",
  "frontend/src/features/learning/LearningPanel.tsx",
  "frontend/src/features/learning/LearningPages.test.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/reader-layout.spec.ts",
  "frontend/e2e/reader-notes-sidebar.spec.ts",
  "docs/tasks/TASK-068-quote-note-progress.md",
  "docs/tasks/TASK-067-reader-toc-layout.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-17 用户确认 Pencil 三栏草图（TASK-067）时一并确认了草图里的「记下这段」浮动胶囊与右栏心得编辑框的引文块；同日追加「也可以把这个进度同步到这条资料的学习进度中」，主 Agent 指出契约里进度只由学习记录推进，用户选定**「一键写入（推荐）」**：「阅读器显示已读到 N%；进度按钮旁加『记为学习进度』，点一下用现有学习记录接口写入，不改契约、进度含义不变、用户可控」。用户「开始」（2026-09-17）。`?` 快捷键面板与 ⌘ 系快捷键按用户「快捷键先不做」不做。

### 目标

1. **记下这段**（新 `ReaderQuote`）：在 `.snapshot-rendered` 内选中文字（非空、≤2000 字）时，在选区上方浮出胶囊「✎ 记下这段」；点击 → 打开右栏「心得」Tab，把 `> 引文（按行加 > ）` + 空行 追加到心得写作框草稿末尾（草稿非空时先空一行），并聚焦写作框、光标在末尾；选区清除。不存高亮、不改渲染器、不给正文加锚点（草图的「点击回到原文」不做）。窄屏（<1280px）同样可用（浮层态心得区）。Esc 或点别处收起胶囊。
2. **记为学习进度**：阅读器从 TASK-067 的位置记忆里得到当前阅读百分比（滚动时更新）；当它 > 当前学习进度 `progress_percent` 时，顶栏状态徽章旁出现按钮「记为学习进度 N%」；点击 = 打开既有「学习状态与进度」面板并**预填**：学习后进度 = N，状态 = 未开始→学习中（其它状态保持），本次总结 = 「阅读到 N%（阅读器位置）」；**写入仍由用户按「保存学习记录」**，校验与冲突确认不变。用户点保存后徽章与进度线随既有 `changed` 刷新。
3. TASK-067 遗留：F1 目录显隐的 `localStorage` 写移到事件处理器（与 `App.tsx` 约定一致）；F3 删除资料成功后 `clearPosition(resourceId)`。

### 非目标

不存高亮/选区到后端；不改契约、后端、`snapshotMarkdown.ts`；不做快捷键；不做自动写进度；不改心得整页编辑器 `/notes/*`；不改资料库页。

### 禁止范围

所有未列入 allowed_paths 的路径。

### 顺带登记

TASK-067 登记为 MERGED（用户 2026-09-17 已合并 PR #75，merge `0e954c6`）。

## 完成条件

1. RTL：正文里 `getSelection` 命中非空文本 → 胶囊出现；点击 → 右栏心得 Tab 打开、写作框值末尾为 `> 引文` 段、写作框获得焦点；正文外的选区不出胶囊；空选区/清除后胶囊消失；草稿已有内容时引文以空行分隔追加。
2. RTL：阅读百分比 > 学习进度时出现「记为学习进度 N%」，点击后学习面板展开且「学习后进度」= N、状态 = 学习中（自未开始）、总结预填；百分比 ≤ 学习进度时按钮不出现；用户按保存后走既有 `createRecord`（用例断言请求体 progress_after=N）。
3. RTL：删除资料成功后本机位置键被清；目录显隐写存储不在 updater 内（读代码 + 既有用例仍过）。
4. e2e（1440×900）：选中正文一段 → 点「记下这段」→ 侧栏心得框含 `> ` 引文并聚焦 → 保存 → 心得列表出现；滚到 60% → 「记为学习进度」→ 面板预填 → 保存 → 徽章变「学习中 · N%」、进度线变宽。
5. 既有单测/e2e 全过；`check_task` frontend PASS；`git diff --check` 0。
6. L2：独立只读 Reviewer 审最终 diff → PASS。

## 上下文包

- 规则：AGENTS.md V2、frontend/AGENTS.md。
- 源：`ResourceDetail.tsx`（右栏 Tab/`openNotesTab`/`focusRequest`/位置记忆 effect/`afterDeletion`）；`NotesPanel.tsx:27-95`（`draft`/`focusRequest` 单调 token 模式——引文请求照此做 `quoteRequest` token）；`ResourceToolbar.tsx:170-180`（状态徽章）、`:342-356`（LearningPanel 挂载）；`LearningPanel.tsx:10-30`（RecordForm 的 percent/after/summary 初值）、`:281-306`（props）；`readerPosition.ts`（`percentOf`、`clearPosition`）。
- 设计：Pencil 草图「阅读器 /resources/:id」工作副本的浮动胶囊与右栏引文块。
- 检查：`frontend/` 内 lint / typecheck / vitest / playwright 全套；`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-068-quote-note-progress.md --candidate <sha>`。

## 实现与测试

- **实现**（SHA 见 EVIDENCE）：
  - `quoteSelection.ts`：`readSelection`（选区锚点/焦点都在 `.snapshot-rendered` 内、非空、≤2000 字）、`toQuote`（逐行 `> `）。`ReaderQuote.tsx`：监听 `selectionchange`/scroll/resize/Esc，视口定位胶囊「✎ 记下这段」，`mousedown` 阻止默认以保住选区，点击 → `onQuote` + 清选区。
  - `NotesPanel.tsx`：新 prop `quoteRequest {token, quote}`，**渲染期**消费（与 `shown` 同一模式，避免 effect 内 setState）：草稿去尾空白 + 空行 + 引文 + 空行；`deleting/pending` 时作废、`available=false` 留待；effect 里聚焦并把光标放末尾。
  - `LearningPanel.tsx`：新 prop `prefillPercent` → `RecordForm` 初值：进度 = N、未开始→学习中、总结「阅读到 N%（阅读器位置）」；归档态不预填。校验/确认/保存链路不变。
  - `ResourceToolbar.tsx`：`readingPercent` prop；> 学习进度且非归档时在徽章旁渲染「记为学习进度 N%」，点击 `openPrefilled` → 学习面板（key 含 prefill 以重新初始化）。
  - `ResourceDetail.tsx`：`takeQuote`（切心得 Tab、开右栏、token+1）；`readingPercent` 随位置记忆的恢复/滚动更新（整数变化才 setState，cleanup 置 null）；F1 目录显隐写存储移到事件处理器；F3 `afterDeletion` 先 `clearPosition`。
  - `styles.css`：胶囊样式；`.reader-record-progress` 仅 ≥1280px 显示（见下）。
- **测试**：新 `ReaderQuote.test.tsx` 7 例（胶囊只对正文内非空选区出现/标题选区不出/Esc 与空选区收起；引文追加、切 Tab、聚焦、光标末尾、清选区、连续两段；`toQuote` 多行与 >2000 忽略；「记为学习进度」仅在领先时出现、预填、未写入、用户保存后请求体 progress_after=N 且按钮消失；学习进度已领先不出；恢复位置后立即用记住的百分比；删除资料清位置键）。e2e 新增 1 条（选中段落 → 胶囊 → 草稿 `> …` 并聚焦 → 保存进列表；滚到 1200 → 「记为学习进度 N%」→ 表单预填 → 保存 → 徽章「学习中 · N%」、进度线比例 ≈ N/100、按钮消失）。
- 本地（`frontend/`，2026-09-17）：`format:check` / `lint` / `typecheck` exit 0；`vitest run` **654 passed**（29 文件）；`playwright test` 全套 **66 passed**（原 65 + 1）。
- **实测发现并修正**：首轮全套 e2e 2 条 `reader-immersive` 变红——窄屏（320/390px）顶栏加了「记为学习进度」文字按钮后随首次滚动折成三行（57→151px），触发布局位移，浮层态心得区聚焦把阅读位置拽走 749px。修正：该按钮只在 ≥1280px 显示（草图与用法本就是桌面场景；阅读位置照记，回到宽屏再写）。
- 已知限制：引文不带回原文锚点（草图的「点击回到原文」未做）；窄屏无「记为学习进度」入口。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：
- Review：
- Acceptance：L2 N/A。
- 最终状态/风险/用户操作：
- 日期与决定日志：2026-09-17 用户「开始」；「记为学习进度」实现为预填既有表单 + 用户按保存（主 Agent 判断：既有表单的时长/总结/冲突确认校验不宜绕过，仍是"点一下"进入、一次保存写入）。
<!-- EVIDENCE:END -->
