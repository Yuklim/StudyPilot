# TASK-088：PDF 阅读器补上目录、阅读进度线与「记为学习进度」，向网页阅读器看齐

```toml
schema_version = 2
id = "TASK-088"
status = "IN_REVIEW"
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
  # 登记补正（实现中发现）：完成条件写了「e2e 用带书签的夹具验」，却漏了夹具本身的路径。
  # 现有两份夹具都没有书签，验不了目录，所以新造一份。
  "frontend/e2e/fixtures/sample-outline.pdf",
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

- 实现 SHA：`9efecdc`。
- **命令与结果**：
  - `check_task.py --task docs/tasks/TASK-088-reader-parity.md --worktree` → **CHECKS PASS**，
    `files=12`
    `product_fingerprint=04298e966fb45e9efdf8de3056ce8d2b696bab2884fc4891170ef6ab935a7533`，
    `profiles=frontend`。
    **这次二进制夹具没有卡住检查器**：新夹具是手写的未压缩 PDF，整份都是 ASCII（中文书签
    按 PDF 规范存成 UTF-16BE 的十六进制串），因此能按 UTF-8 读出来。TASK-086 那几张 PNG 则
    读不出来，只能人工核验——差别在文件本身，不是检查器变了。
  - `frontend npm run test -- --run` → **816 passed（37 个文件）**（改前 801，新增 15 条：
    `pdfOutline` 11 条 + `PdfReader` 4 条）。
  - `npx playwright test e2e/pdf-reader.spec.ts` → **7 passed**（原 5 条 + 新增 2 条）；
    `reader-layout` + `reader-immersive` → **16 passed**（网页阅读器那栏没被碰坏）。
  - `npm run typecheck`（`tsc -b`）、`npm run lint`、`prettier --check` → 通过。

### 落点

1. **`pdfOutline.ts`（新）**：`readPdfOutline` 把书签树铺成两层；每条的目标按三种形态解析
   （具名 → `getDestination`、显式数组 → 第一项是页引用、或直接给 0 起页序号）。
   **任何一条解析不出页码就丢掉**，不显示点了没反应的目录项；整棵树读不出来就返回 `[]`。
   另有 `currentBookmark`（当前条目按页码判）与 `readingPercentOf`（进度百分比）。
2. **`ReaderOutline` 改成纯展示组件**：收 `items`/`current`/`onJump`/`hint`，
   原来长在组件里的「窗口滚动算当前节」挪进 `outline.ts` 的 `useOutlineCurrent`（网页专用）。
   两种阅读器因此**共用同一套 DOM 与样式**，只有「点了去哪」不同。
3. **`PdfReader` 交两样东西上去**：`onOutline(items, goTo)` 与 `onProgress(percent, page)`。
   左栏长在 `ResourceDetail` 的三栏布局里，而页码/滚动容器/`goTo` 长在阅读器里——
   所以交出去的是**数据 + 一个跳转函数**，而不是把那一栏搬进阅读器。
   跳转函数用 ref 包成稳定引用，否则 `goTo` 随缩放变化会让大纲被反复重读。
4. **`ResourceDetail` 合流**：`outlineRows`/`outlineAt` 按是不是 PDF 选一边；
   目录状态**连同它属于哪份资料一起存**（`{ id, items, goTo }`），换一份 PDF 时旧目录不会
   继续画着——不用 effect 清空，因为项目的 lint 禁止在 effect 里同步 setState。
5. **网页那套位置记忆 effect 在 PDF 上早退**。这不只是省事：它的 cleanup 会
   `setReadingPercent(null)`，而 PDF 侧只在百分比**变化**时才上报，被抹掉后进度线要等用户
   再滚一段才回来。
6. **新夹具 `sample-outline.pdf`**：四页、三条顶层书签（第二条带一个子条目 `2.1 细节`），
   标题是中文。用一次性脚本生成（不入库），结构手写：`/Outlines` + `/First`/`/Last`/`/Next`/
   `/Prev`/`/Parent`/`/Count`，目标用 `[页对象 /XYZ 0 400 0]`。
   **生成后用 pdf.js 实地验过**：`numPages 4`，三条顶层 + 一条子条目，页码 1/2/3/4，中文标题
   解码正确。

### 过程中发现的一件事：`npx tsc --noEmit` 在这个仓库里什么都不检查

根 `tsconfig.json` 是 `{ "files": [], "references": [...] }`——**直接跑 `npx tsc --noEmit` 会
立刻退出 0**。真正的类型门是 `npm run typecheck`（`tsc -b`），`check_task.py` 跑的也是它。
本任务中途正是靠 `check_task.py` 才暴露出 4 处类型错（`report` 用在声明前、`Doc` 与
`OutlineDoc` 的 `getOutline` 签名不兼容等）。
**TASK-087 的记录里写过「`npx tsc --noEmit` → 通过」，那句话是空的**——当时真正起作用的
同样是 `check_task.py` 里的 `npm run typecheck`（它也确实咬住过一次 4 处错）。结论没错，
但引用的命令名不对，在此更正；那份记录已随 PR #95 合并，不追改。

### 第二轮：处置独立 Review 的四条（F1/F2 修了、F3 更正事实、F4 采纳三条）

**F3 是本任务登记时就写错的一件事实，必须先说清**：差异表里那行「顶栏阅读进度线：网页有 /
PDF 没有」**不成立**。`ResourceToolbar.tsx:444` 的 `.reader-progress` 是**无条件渲染**的，
基线上 PDF 页就有这条线，且它画的是 `progress.progress_percent`（**学习进度**，不是阅读位置）
——注释里原本就写着这一点，是我没读到。本任务真正补上的是 `readingPercent` 那条信号，
它驱动的是 `:271` 的**「记为学习进度 N%」**。
连带后果：新增 e2e 里 `expect(page.locator('.reader-progress')).toBeVisible()` 是**空断言**
（把整个 `onProgress` 删掉它也照样过），已删除；旁边「记为学习进度 N%」那条才是真守卫。
差异表与「目标 #2」的措辞按 §6 不在送审后改动，以本段为准。

**F1（修）**：「第一次打开给个起点」的 effect 声明在恢复位置之后、同一次提交里紧随其后执行，
无条件 `report(1, 0)` 会把刚恢复的「读到 50%」立刻覆盖回 0%。浏览器里下一帧的 scroll 多半
会纠正（只是闪一下），但恢复后 `scrollTop` 仍是 0 的短文档不会有那次 scroll，
「记为学习进度」就得等用户滚动才出现。改成只在 `reported.current.percent === -1` 时才报。
**原单测守不住这条**（`toHaveBeenCalledWith` 在「先报 50 又被 0 覆盖」时照样绿），已收紧为
断言**最后一次**调用是 `[50, 2]`。

**F2（修）**：进度上报只按整数百分比去重，却同时承载页码。一份 200 页的书里相邻几页常落在
同一个百分比上 → 页码不往上报 → 左栏当前条目滞后好几页；极端情况下点一条近处的书签，
页跳了而高亮不动（夹具只有 4 页，e2e 永远命不中）。去重键改为 `(percent, page)`。
**新增单测并做了反证**：三页文档里第 1 页最底（scrollTop 815）与第 2 页最顶（816）都是 33%、
页码分别是 1 和 2，两次都必须报；把去重退回「只按百分比」后这条**立刻失败**。

**F4**：① 「目录连同资料 id 一起存」的归因不准——`Screen.tsx:118` 以 `resourceId` 为 key 挂载
详情页，换资料整棵重挂、state 本就清空，这层判断是**双保险**而非必需，注释已改写；
② `useOutlineCurrent` 提上来后变成常挂，收起或窄屏时仍在每次滚动里量所有 h2/h3——
改成目录没显示时传一个常量空表；③ `report`/`onScroll` 里的 `ratio` 遮蔽了外层的设备像素比
`ratio`，改名 `within`；④ 书签串行 `await`（数百条时左栏出现偏慢）与 ⑤ 父条目解析失败而子
条目成功时会留下「没有父级的三级条目」——这两条只记录，见「已知限制」。

- 第二轮的检查：`check_task.py` → **CHECKS PASS**，`files=12`
  `product_fingerprint=4674f99bda08e79b92c5135c6ed16fdf17a6005a18bd77599e26f59e15b46c51`；前端 **817 passed（37 个文件）**（比上一轮多 1 条 F2 的回归用例）；
  `pdf-reader` + `reader-layout` e2e → **16 passed**。

### 已知限制 / 未完成项

- **只铺两层书签**：三级及更深的条目不显示（一份论文的三级书签多是图表清单）。
- **当前条目按页码判**：一页里有多条书签时，它们在同一页内不会随滚动细分。
- **没有书签的 PDF 仍然没有目录**：不做「按页码列表」或页缩略图退路（用户选定）。
- **进度百分比与网页那套不是同一个算法**（这边按页、那边按滚动位置），用户看到的含义一致。
- **书签是串行解析的**（每条一次 `getPageIndex`）：几百条书签的大部头，左栏会比正文晚出现
  一点。改成并发要控制并发度，收益不明显，留作以后。
- **父条目解析失败、子条目成功时，会留下一条没有父级的三级条目**：缩进看着像孤儿。
  发生概率低（父子目标通常同源），不为它加一层树结构。
- 顶栏「目录」按钮的开关状态与网页共用同一个本机键（`studypilot.reader.outline`）——
  在网页上收起目录，切到 PDF 也是收起的。这是既有设计，本任务沿用。

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
