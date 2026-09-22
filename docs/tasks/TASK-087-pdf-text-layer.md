# TASK-087：PDF 上能选中文字，并把选中的话「记下这段」写进心得

```toml
schema_version = 2
id = "TASK-087"
status = "READY"
risk = "L2"
risk_reason = "普通业务实现：给 PDF 每页叠一层 pdf.js 文字层（可选中/可复制），并让既有 `ReaderQuote`（TASK-068）在 PDF 上生效。只动前端渲染与交互，**不改后端、不改契约、不存高亮、不加迁移**；不命中 risk-policy.json 的 high_risk_paths。顺带两项已到期的收尾（TASK-086 的 MERGED 登记、删 popup.ts 一句陈旧注释）也只是登记与注释。执行链：1 Worker → 自动检查 → 1 独立只读 Reviewer；独立验收 N/A。"
risk_flags = ["business"]
owner = "coordinator"
base = "198efc839a0a7f5a0f84b5be9aa1b86a1f96ba6d"
allowed_paths = [
  "frontend/src/features/resources/PdfReader.tsx",
  "frontend/src/features/resources/PdfReader.test.tsx",
  "frontend/src/features/resources/ReaderQuote.tsx",
  "frontend/src/features/resources/ReaderQuote.test.tsx",
  "frontend/src/features/resources/quoteSelection.ts",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/pdf-reader.spec.ts",
  # 到期收尾（用户 2026-09-21「安排进下一次任务一起做」）
  "extension/src/popup/popup.ts",
  "docs/tasks/TASK-086-docs-catchup.md",
  "docs/tasks/TASK-087-pdf-text-layer.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-21 用户：「**如果 pdf 的采集和阅读都没有问题了，是不是可以开始做 pdf 的批注、心得功能了**」。
主 Agent 核查后说明：现在的 PDF 阅读器**只渲染 canvas、没有文字层**，没有选区就没有锚点；
而高亮还要改契约（§4.15 要求「必须有 READY 正文快照」，PDF 是 FILE 资料、没有快照）。
据此给出三步拆法并请用户定，用户选：

- **推进节奏**：「**先做第 1 步，验过再说**」——只做文字层 + 让「记下这段」在 PDF 上可用。
- **锚点方案**（为后续任务定调，本任务不实现）：「**文本锚点：页码 + 原文 + 前后文**」。

同一轮用户另说「（TASK-086 的收尾）**安排进下一次任务一起做吧**」。

### 目标

1. **PDF 每页叠一层 pdf.js 文字层**：可以用鼠标选中、复制，浏览器自带的页内查找也能命中。
2. **「记下这段」在 PDF 上生效**：选中一段 → 浮出胶囊 → 把这段以 Markdown 引用（`> …`）
   追加进右栏心得草稿并聚焦写作框。这条链路的组件（`ReaderQuote` / `quoteSelection`）
   TASK-068 已经做好，本任务只把它的「正文根」从 `.snapshot-rendered` 扩到 PDF 文字层。
3. **PDF 上的胶囊只有「记下这段」，没有「标下来」**——高亮在 PDF 上还没有落点，
   给一个点了会失败的按钮比不给更糟。
4. 到期收尾：TASK-086 记录与索引行登记 MERGED；删掉 `extension/src/popup/popup.ts:55`
   注释里那半句「**前提是 TASK-084 先合并**」（TASK-084 已于 `f0c5e21` 合并）。

### 非目标 / 禁止范围

- **不做高亮**：不取锚点、不落库、不上色、不放开 PDF 的「高亮」Tab。那要改契约 §4.15
  （加 `page_index`、放宽「必须有快照」的前置条件）+ 一次迁移，是下一个 L3 任务。
- **不改后端、不改契约、不加依赖**（`pdfjs-dist 5.4.149` 已经带 `TextLayer`）。
- 不做 PDF 内的搜索界面、不渲染 PDF 自带的批注/链接层（`AnnotationLayer`）、不做画线框选。
- **不做 OCR**：扫描件/图片型 PDF 本来就没有文本，选不中是它的性质，不是本任务的缺陷。
- 不改网页正文阅读器上「记下这段」与「标下来」的既有行为。

### 主 Agent 登记的决定（Review 可挑战）

- **文字层与 canvas 同生命周期**：只给视口附近（`near`）的页渲染，离开即随 canvas 一起卸载。
  代价是选中后滚很远，选区会被浏览器丢掉；换成常驻会把大文档的 DOM 撑爆，不值。
- **不引入 `pdfjs-dist/web/pdf_viewer.css`**：只写本项目需要的最小规则（容器定位 +
  `--scale-factor` + span 透明）。引入整包 viewer 样式会带进一大批与本站设计冲突的规则。
- **跨页选区照原样交给浏览器**：`selection.toString()` 会把两页的文字拼起来，中间可能少一个
  换行。这属于已知限制，不在本任务里做跨页拼接的特殊处理。

## 完成条件

- PDF 页上可以用鼠标选中文字并复制；选中时浮出胶囊，**只有「记下这段」一个按钮**。
- 点「记下这段」后，选中的文字以 `> ` 引用追加进右栏心得草稿并聚焦写作框（与网页正文一致）。
- 网页正文阅读器的胶囊**仍是两个按钮**，行为一字不变（回归用例守住）。
- 文字层与 canvas 对齐：改变缩放、「适合宽度」、以及在高分屏/普通屏之间移动窗口后仍然对齐。
- 新增前端单测覆盖：文字层随 `near` 挂载/卸载、PDF 模式下胶囊只出一个按钮、引文进草稿；
  e2e 在既有 PDF 夹具上验证「选中 → 记下这段 → 心得草稿里出现引文」。
- TASK-086 记录 status 与索引行均为 MERGED（`validate_governance.py` 会校验一致性）；
  `popup.ts` 那半句已删。
- `check_task.py` 必要检查 PASS。
- L2：1 独立只读 Reviewer 审最终 diff；独立验收 N/A。

## 上下文包

- 现状事实（已核实）：`PdfReader.tsx` 的注释写明「只读。不做选中、标注、文本层搜索」；
  每页只渲染 `<canvas>`（`PdfPageView`，`near` 决定是否渲染）；`pdfjs-dist 5.4.149` 导出
  `TextLayer` 与 `setLayerDimensions`。
- `ReaderQuote.tsx` 现在写死「选区必须整个落在 `.snapshot-rendered` 里」；
  `ResourceDetail.tsx:508` 把 `readerMain` 传给它。
- 契约 §4.15（高亮锚点与「必须有快照」的前置条件）——本任务**只读不改**，供理解边界。
- 检查：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-087-pdf-text-layer.md --worktree`
  （用 `backend/.venv/bin/python` 跑）。

## 实现与测试

- 待填。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：N/A（L2）
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-21 用户问「是不是可以开始做 pdf 的批注、心得功能」→ 主 Agent 核查现状
  （无文字层、高亮需改契约）后给出三步拆法 → 用户选「先做第 1 步，验过再说」+ 锚点用文本锚点
  → 登记 TASK-087；同轮用户把 TASK-086 的两项收尾并入本任务。
<!-- EVIDENCE:END -->
