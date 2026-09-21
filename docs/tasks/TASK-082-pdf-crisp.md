# TASK-082：PDF 在高分屏上按真实像素渲染，不再糊

```toml
schema_version = 2
id = "TASK-082"
status = "ACCEPTED"
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

- 实现 SHA：登记在 `4de4043`（含 TASK-080/081 的 MERGED 登记与 081 的索引行补齐），实现随后。
- 命令与结果：`check_task.py` → **CHECKS PASS**（5 条，frontend 组）。
  `PdfReader.test.tsx` **13 项**全绿（新增 6 条）；`e2e/pdf-reader.spec.ts` **3 passed**。

### 落点

1. **`pixelDensity(cssW, cssH, ratio)`**：返回这一页该按多少倍密度画。取 `devicePixelRatio`，
   但**不低于 1**（低于 1 比不做还糊），且受 `MAX_CANVAS_PIXELS` 约束——超预算时按面积开方降，
   保证 `w*h ≤ 预算`。
2. **`PdfPageView` 先按 CSS 尺寸量页、再按 `scale × density` 要视口**，画布开到设备像素；
   **不设内联 CSS 尺寸**——显示尺寸由既有的 `.pdf-page canvas { width/height: 100% }` 锁在页框上，
   两边都写会在缩放时各自舍入、互相打架。
3. **`useDevicePixelRatio`** 用 `matchMedia('(resolution: Xdppx)')` 监听（不是轮询）：该查询在当前
   像素比下为真，一变就失配触发 change；变化后重新订阅新值。`ratio` 进渲染 effect 的依赖，
   于是换屏会重画。

### 实测（真实 Edge，1440×900，资料 `18b37e2b-…`）

| 屏幕 | 档位 | 画布 | 显示 | 每 CSS 像素采样数 | 像素利用率 |
| --- | --- | --- | --- | --- | --- |
| **Retina（dsf 2）** | 默认 100% | 1224×1584 | 610×789 | 2.01 | 50% → **100%** |
| | 适合宽度 | 2684×3473 | 1340×1734 | 2.00 | 50% → **100%** |
| | 适合宽度再放大 60% | 2779×3597 | 1705×2207 | 1.63 | **81%**（预算生效，平滑降密度） |
| **普通屏（dsf 1）** | 默认 100% | 612×792 | 610×789 | 1.00 | **100%**（不多画一个像素） |
| | 适合宽度 | 1342×1736 | 1340×1733 | 1.00 | **100%** |

### 内存：代价量清楚了，没有藏

按 dpr 渲染意味着每张画布的像素数变成 dpr² 倍。实测（Retina、适合宽度、跳到文档中部使
上下各 2 页都在渲染）：

- **同时 5 张画布，每张 2684×3473（9.3M 像素），画布内存合计 178 MB**；JS 堆 22 MB。
- 预算把单张钉在 10M 像素，因此**最坏情况有界**：约 `5 × 10M × 4B ≈ 200 MB`。
- 文档开头/结尾只有 3 页在渲染，实测 107 MB。

这是这次修复的真实代价。**没有顺手削 `NEAR_PAGES`**（登记时就写明要先量再决定）：
削到 1 能把上限降到约 120 MB，但快速滚动时会看见白页。倾向保留现状并把数字明写，
若用户日后反馈内存吃紧，再单开任务做「远处的页按低密度画、成为当前页时再重画」。

### Review（L2 独立只读，一轮）：**PASS**，3 条非阻断，全部已处理

- **F1**：`pixelDensity` 的 JSDoc 写「保证 `w*h ≤ 预算`」是过头话——`density` 下不穿 1，CSS 面积
  自身超预算时画布仍会超。**已改成如实表述**并写进「已知限制」。
- **F2**：注释称 `useSqueezeLayout` 做了同样的 `addListener` 兼容，**实际它没有**。已改正
  （兼容分支本身正确且对 Safari <14 必要，只是出处写错）。
- **F3**：订阅后缺一次即时同步。分数像素比或老 Safari 上 `(resolution: Xdppx)` 可能恒不匹配、
  `change` 永不触发，订阅静默失效。**已补 `onChange()` 一次**；不会循环——同值时 React 直接 bail。

Reviewer 另行确认的几点：`getViewport` 调两次是纯矩阵构造、无 I/O；`ratio` 只在换屏时变，
缩放/滚动的 effect 触发次数与改前一致；`getContext` 替身只绕过早退，画布尺寸仍由被测代码算、
掩盖不了尺寸错误，且 e2e 的 `painted()` 用真 `getImageData` 守住「真画了东西」；
**内存取舍成立，不要求削 `NEAR_PAGES`**（判据：只有出现渲染进程 OOM、目标含 iOS Safari 这类
canvas 配额很紧的环境、或同屏多个阅读器实例时才必须降，三条都不成立）；登记类改动与合并事实
逐项属实。

### 用例与变异验证

新增 6 条：`pixelDensity` 的四条（跟随屏幕 / 不低于 1 / 不超预算 / 适合宽度这一档必须完全清晰）、
画布真的按设备像素开且不写内联尺寸、像素比变化会重画。变异验证：
- 退回 `getViewport({ scale })`（按 CSS 像素开）→ 画布尺寸那条变红；
- 从渲染 effect 的依赖里去掉 `ratio` → 像素比变化那条变红。

**jsdom 的坑记一笔**：它没装 canvas 包，`getContext` 返回 `null`，尺寸那段会被早退跳过——
断言会打在 jsdom 默认的 300×150 上而**看起来只是数字不对**。这两条用例因此给 `getContext`
加了替身；真实绘制仍由 e2e 在 Chromium 里看。

### 已知限制 / 未完成项

- **内存 178 MB / 上限约 200 MB**（见上），未做「按距离分级密度」的优化。
- **预算 10M 是照「适合宽度」这一档定的**：更大的屏幕（4K 全屏）上这一档会超预算、密度降到 2 以下。
  实测的 1440 宽正好放得下；更宽的屏没有实测条件。
- `devicePixelRatio` 的变化只在 `matchMedia` 可用时跟随；jsdom 与极老的浏览器上退化为首帧取值一次。
- **预算不是无条件上界**（独立 Review F1）：`density` 下不穿 1，所以当页面**本身的 CSS 面积**就
  超过 10M 时（大幅面 PDF × 高缩放，例如 A1 页配 `MAX_SCALE 3` 可达 36M），画布仍等于 CSS 面积、
  仍会超预算，Safari 上可能撞 16.7M 硬上限。**这一档旧代码同样如此，本次不比旧行为更差**；
  学习类资料几乎都是 A4/Letter（`MAX_SCALE` 下约 4.4M，远在预算内），故记录后继续。
- **分数像素比下换屏可能不跟随**（独立 Review F3）：Windows 125%/150% 或浏览器缩放会给出
  `1.5`、`1.7999999523162842` 这类值，`(resolution: Xdppx)` 可能恒不匹配、`change` 永不触发。
  已补一次订阅后的即时同步兜底，失败模式退回「不跟随换屏」，不比改前更差。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- **最终候选 SHA**：见本分支最后一次实现提交（Review 修正后）。首轮候选 `adbdd03`。
- **Review**：L2 独立只读 Reviewer 一轮，**PASS**，3 条非阻断（F1 注释过头话、F2 注释不实、
  F3 缺一次即时同步）**全部已处理**，详见上文「Review」一节。
- **最终状态：ACCEPTED**，等待用户合并（只有用户本人可以合并）。
- **剩余风险**：① 4K 全屏「适合宽度」会降到 2 倍以下（无实测条件）；② 分数像素比下换屏可能
  不跟随（已补兜底，失败模式不比改前差）；③ 大幅面 PDF × 高缩放仍可能超预算（旧代码同样如此）；
  ④ Retina 下画布内存最坏约 200 MB（实测 178 MB），未做按距离分级密度。
- **需要用户做的事**：在自己的 PDF 上看一眼字是否变锐（尤其「适合宽度」这一档）；
  若觉得内存吃紧（浏览器变卡、风扇转），告诉我，我再做「远处的页按低密度画」那一步。
- **非阻断遗留项**：
  1. 按距离分级密度（可把最坏内存从约 200 MB 降到约 120 MB，代价是切页时要重画）。
  2. 4K/超宽屏上的预算未实测。
  3. `pixelDensity` 与 `MAX_CANVAS_PIXELS` 为用例而导出，生产代码并不从外部调用它们。
- 日期与决定日志：2026-09-21 用户合并 #88/#89 后反馈「pdf 阅读感觉有点糊」→ 主 Agent 读渲染代码
  定位到画布按 CSS 像素开、在 Retina 上被放大 2 倍 → 真实 Edge 实测确认像素利用率 50% → 登记 TASK-082。
<!-- EVIDENCE:END -->
