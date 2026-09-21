# TASK-083：PDF 占位页被 flex 压扁，导致后半本永远不渲染

```toml
schema_version = 2
id = "TASK-083"
status = "READY"
risk = "L2"
risk_reason = "改动本体只有一条 CSS 声明，但它修的是阅读器**滚动几何**的地基：占位页被压扁后，JS 侧按「每页高 + 间距」算出的偏移量与真实 DOM 对不上，连带影响页码判定、跳页与位置记忆。改一行的同时要验这三样是否随之回正，需要一位独立 Reviewer 核对「是否真的只修了这一处、没有别的东西在依赖那个错误的几何」。不命中 risk-policy.json 的 high_risk_paths。执行链：1 Worker → 自动检查 → 1 独立只读 Reviewer。"
risk_flags = ["business"]
owner = "coordinator"
base = "168830e5b2947f92677bea1dbd18489b30f51512"
allowed_paths = [
  "frontend/src/features/resources/PdfReader.tsx",
  "frontend/src/features/resources/PdfReader.test.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/pdf-reader.spec.ts",
  "docs/tasks/TASK-082-pdf-crisp.md",
  "docs/tasks/TASK-083-pdf-page-boxes.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-21 用户：「（这份 PDF）**同时只能出现前 7 页内容**。告诉我是怎么回事，不要急着开始做。」
主 Agent 查清根因并汇报后，用户：「已合并，……**解决新任务吧**。」

### 根因（实测，不是推断）

`.pdf-reader-pages` 是 `display: flex; flex-direction: column`，而 flex 子项默认 `flex-shrink: 1`。
内容总高超过容器时浏览器会**压扁**子项：已渲染的页里有 canvas 撑着不缩，**没渲染的占位页里
只有一个页码文字，于是塌成 17px**——而它本该是 792px。

「先量出每页尺寸、占好位子」这句设计（TASK-073）因此在**没渲染的那些页上完全失效**。

真实 Edge 实测（1440×900，`deviceScaleFactor: 2`，15 页的 `1706.03762`）：

```
各页高度: [791, 791, 791, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17]
总可滚高度: 2834px   ← 应约 12136px
滚到底时页码显示: 3   ← 应为 15
```

连锁后果就是用户看到的现象：占位页没占住位置 → 总滚动高度只有该有的约四分之一 →
滚到底时程序以为在第 3 页 → 「只渲染视口上下各 2 页」这条规则**永远算不到第 7 页之后** →
后 8 页一辈子不会画出来。

**在浏览器里直接验证过解法**（只加样式、未改代码）：给 `.pdf-page` 加 `flex-shrink: 0` 后

```
各页高度: 全部 792
总可滚高度: 12136px
滚到底: 渲染第 13/14/15 页，页码显示 15
```

**归属**：这是 **TASK-073 就带着的缺陷**，不是 TASK-081/082 引入的。已在 `b69fde5`
（TASK-081 合并**之前**）上跑同一测试复核，表现一模一样（那时滚到底能到第 7 页，
与用户说的数字吻合）。如实写明，不含糊成「优化」。

### 目标

1. **占位页占住它该占的高度**：15 页全部 792px，总滚动高度约 12136px，滚到底能渲染到最后一页。
2. **顺带核实同一根因的连带影响并如实处置**：JS 侧的 `offsets` 按「每页高×scale + 16」算，
   而真实 DOM 此前是塌的——**页码判定、跳页、位置记忆三样都建立在这个错误的几何上**。
   修正几何后逐一实测：若随之回正，记录数字；若仍不对，属本任务范围，一并修。
3. **补一条真能看住它的守卫**：这是布局缺陷，jsdom 量不出高度，**单测天然抓不到**——
   必须落在 e2e（真实 Chromium）里，断言「滚到底能到最后一页」。

### 非目标 / 禁止范围

- 不改渲染密度（TASK-082 刚定）、不改工具条版式（TASK-081 刚定）。
- 不改 PDF 的取字节与失败分因。
- 不改 `NEAR_PAGES`——后半本不渲染的原因是几何错了，不是这个窗口太小。

### 主 Agent 登记的实现决定（非用户决定，Review 可挑战）

- **用 `flex-shrink: 0` 而不是改成 `display: block`**：容器的 `align-items: center`（页面水平居中）
  与 `gap: 16px`（页间距，且 JS 的 `offsets` 正是按这个 16 算的）都依赖 flex 布局，换掉代价更大。
- **e2e 用真实的多页夹具**：现有 `e2e/pdf-reader.spec.ts` 的夹具只有 2 页，**压不出这个缺陷**
  （2 页时内容高度未必超出容器）。需要一份页数足够多的合成 PDF。

## 完成条件

- 15 页夹具/真实论文：所有占位页高度等于其 `size.height × scale`，总滚动高度与之相符。实测数字写回。
- 滚到文档末尾能渲染最后一页，页码显示最后一页。**e2e 有断言**（jsdom 抓不到，必须真浏览器）。
- 页码判定、跳页、位置记忆三样实测正确（离开再回来落在原处）。数字写回。
- TASK-073/081/082 既有行为不变：`PdfReader.test.tsx` 全绿、`e2e/pdf-reader.spec.ts` 原有 3 条通过。
- `check_task.py` 必要检查 PASS（frontend）。
- L2：1 位独立只读 Reviewer 审最终 diff。
- **按用户 2026-09-21 的新指令：本次不主动推 PR**，先把结果交给用户检查，确认后再推。

## 上下文包

- 实现：`styles.css` 的 `.pdf-page` / `.pdf-reader-pages`；`PdfReader.tsx` 的 `offsets`、
  `locatePage`、`scrollTopFor`（在 `pdfPosition.ts`）。
- 根因与解法验证见上。
- 检查：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-083-pdf-page-boxes.md --worktree`。

## 实现与测试

- 实现 SHA：待填。
- 命令与结果：待填。
- 已知限制/未完成项：待填。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-21 用户报「只能出现前 7 页」→ 主 Agent 实测定位到占位页被 flex 压成 17px、
  并在浏览器里验证 `flex-shrink: 0` 可解 → 复核确认缺陷属 TASK-073 而非新近两次改动 → 用户「解决新任务吧」
  → 登记 TASK-083。
<!-- EVIDENCE:END -->
