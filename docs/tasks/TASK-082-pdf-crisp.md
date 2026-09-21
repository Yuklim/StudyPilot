# TASK-082：PDF 在高分屏上按真实像素渲染，不再糊

```toml
schema_version = 2
id = "TASK-082"
status = "READY"
risk = "L2"
risk_reason = "只改 `PdfPageView` 的 canvas 画布尺寸与 `styles.css` 一条规则，不动公共契约、不动数据含义、不动后端。不命中 risk-policy.json 的 high_risk_paths。**不定 L1 的理由是它改变内存特征**：按 devicePixelRatio 渲染会让每张 canvas 的像素数变成原来的 dpr²（Retina 上 4 倍），一份大文档同时渲染多页时可能吃爆内存或撞上浏览器的 canvas 面积上限——需要一位独立 Reviewer 盯住这个代价与所设的上限是否合理。执行链：1 Worker → 自动检查 → 1 独立只读 Reviewer。"
risk_flags = ["business"]
owner = "coordinator"
base = "7bce666fa3ee547acc777a50cc7f25c57fec31c1"
allowed_paths = [
  "frontend/src/features/resources/PdfReader.tsx",
  "frontend/src/features/resources/PdfReader.test.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/pdf-reader.spec.ts",
  "docs/tasks/TASK-080-capture-pdf.md",
  "docs/tasks/TASK-081-pdf-reader-toolbar.md",
  "docs/tasks/TASK-082-pdf-crisp.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-21 用户合并 PR #88 与 #89 后：「都合并了，**为什么现在的 pdf 阅读感觉有点糊？**」

### 登记前已查清的根因（实测，不是推断）

`PdfReader.tsx` 的 `PdfPageView` 这样设画布：

```ts
const viewport = target.getViewport({ scale })
node.width = Math.floor(viewport.width)      // ← 画布按 **CSS 像素** 开
node.height = Math.floor(viewport.height)
```

而 `styles.css` 的 `.pdf-page canvas { width: 100%; height: 100% }` 又把它拉伸到同样大的
**CSS 尺寸**。于是每个 CSS 像素只有 1 个采样点；用户这台是 Retina（`devicePixelRatio = 2`），
浏览器把它放大 2 倍显示——**这就是「糊」**。

真实浏览器实测（Edge，1440×900，`deviceScaleFactor: 2`，资料 `18b37e2b-…`）：

| 档位 | 画布尺寸 | 显示尺寸 | 每 CSS 像素采样数 | 应有 | 像素利用率 |
| --- | --- | --- | --- | --- | --- |
| 默认 100% | 612×792 | 610×789 | **1** | 2 | **50%** |
| 适合宽度（219%） | 1342×1736 | 1340×1733 | **1** | 2 | **50%** |

即 PDF 一直按屏幕能力的**一半**在渲染，与缩放档位无关。

**这是 TASK-073 就带着的缺陷**，不是 TASK-081 引入的：081 只改了版式，没碰渲染。但 081 把 PDF
从 500px 高、居中一小块放大到铺满视口，且「适合宽度」从失准修复后变成 219%，**同样的糊被放大到
显眼**——用户因此在合并后才感觉到。如实写明归属，不含糊。

### 目标

1. **按设备像素渲染**：画布尺寸 = 显示尺寸 × `devicePixelRatio`，CSS 显示尺寸不变。
   Retina 上每 CSS 像素采样数从 1 回到 2（实测复核，数字写回）。
2. **给画布设一个像素预算**，超出时按比例降密度而不是无上限地开：
   - 浏览器对 canvas 面积有硬上限（Safari 约 16.7M 像素），撞上会直接画不出来；
   - 内存：一张画布约 `像素数 × 4` 字节，而阅读器同时渲染视口上下各 2 页（共 5 张）。
   降密度时**不得低于 1**（低于 1 就比现在还糊）。
3. **`devicePixelRatio` 变化时重渲染**：把窗口拖到外接的非高分屏上，不该一直糊着。
4. 渲染以外的行为一律不变：连续滚动、按需渲染与释放、页码跳页、缩放、适合宽度、位置记忆、
   三种失败分因。
5. 顺带把 **TASK-080 与 TASK-081 登记为 MERGED**（用户 2026-09-21 合并 PR #88 → merge `b69fde5`、
   PR #89 → merge `7bce666`），并补上 **TASK-081 缺失的索引行**——081 当时因 080 持有索引而延后
   （AGENTS.md §5「延后的索引行最迟在把任务标记为 MERGED 时补齐」）。

### 非目标 / 禁止范围

- 不改版式、不改工具条（TASK-081 刚定）。
- 不改 PDF 的取字节、失败分因、位置记忆逻辑。
- 不做文字层选择/搜索/高亮（TASK-073 的非目标仍然有效）。
- 不引入新依赖，不动 pdf.js 版本。

### 主 Agent 登记的实现决定（非用户决定，Review 可挑战）

- **像素预算暂定 10,000,000**：适合宽度档实测需要 9.3M，刚好放得下、保持完全清晰；更高缩放时
  按 `sqrt(预算 / 需要)` 降密度。这个数字实现时要连同真实内存一起复核，Review 可要求调整。
- **不改 `NEAR_PAGES`**：先量出按 dpr 渲染后的真实内存再决定要不要动它，不预先削功能。
- **`devicePixelRatio` 用 `matchMedia('(resolution: …)')` 监听**而不是轮询。

## 完成条件

- Retina（`deviceScaleFactor: 2`）下每 CSS 像素采样数 = 2，像素利用率 100%；非高分屏下仍为 1
  （不浪费）。两档实测数字写回。
- 画布像素数不超过所设预算；超预算时密度按比例下降且 **≥ 1**。有用例。
- 拖到不同像素比的屏幕上会重渲染。有用例。
- 渲染以外行为不变，`PdfReader.test.tsx` 既有用例全绿，`e2e/pdf-reader.spec.ts` 3 条通过。
- 真实浏览器复核：按 dpr 渲染后的内存占用实测并写回；确认没有撞上浏览器 canvas 上限。
- `check_task.py` 必要检查 PASS（frontend）。
- L2：1 位独立只读 Reviewer 审最终 diff。
- TASK-080、TASK-081 登记为 MERGED，081 的索引行补齐，`validate_governance.py` PASS。

## 上下文包

- 实现：`PdfReader.tsx` 的 `PdfPageView`（约 340–400 行）、`styles.css` 的 `.pdf-page canvas`。
- 根因与实测见上。
- 检查：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-082-pdf-crisp.md --worktree`。

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
- 日期与决定日志：2026-09-21 用户合并 #88/#89 后反馈「pdf 阅读感觉有点糊」→ 主 Agent 读渲染代码
  定位到画布按 CSS 像素开、在 Retina 上被放大 2 倍 → 真实 Edge 实测确认像素利用率 50% → 登记 TASK-082。
<!-- EVIDENCE:END -->
