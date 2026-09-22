# TASK-087：PDF 上能选中文字，并把选中的话「记下这段」写进心得

```toml
schema_version = 2
id = "TASK-087"
status = "ACCEPTED"
risk = "L2"
risk_reason = "普通业务实现：给 PDF 每页叠一层 pdf.js 文字层（可选中/可复制），并让既有 `ReaderQuote`（TASK-068）在 PDF 上生效。只动前端渲染与交互，**不改后端、不改契约、不存高亮、不加迁移**；不命中 risk-policy.json 的 high_risk_paths。顺带两项已到期的收尾（TASK-086 的 MERGED 登记、删 popup.ts 一句陈旧注释）也只是登记与注释。执行链：1 Worker → 自动检查 → 1 独立只读 Reviewer；独立验收 N/A。"
risk_flags = ["business"]
owner = "coordinator"
base = "198efc81faf208fc7feedacfa5ae3ca0dc828c5a"
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

- 实现 SHA：`4521272`。
- **命令与结果**（都在这条实现上跑）：
  - `check_task.py --task docs/tasks/TASK-087-pdf-text-layer.md --worktree` → **CHECKS PASS**，
    `files=11`
    `product_fingerprint=daf72a0252516e3452c548bb5138d4eae4f966c6f56fadf767248563393ca252`，
    `profiles=extension,frontend`。
  - `frontend npm run test -- --run` → **800 passed（36 个文件）**（改前 793，新增 7 条）。
  - `extension npm run test -- --run` → **196 passed（9 个文件）**（只改了注释，数字不变）。
  - `npx playwright test e2e/pdf-reader.spec.ts` → **5 passed**（原 4 条 + 新增 1 条）。
  - `npx tsc --noEmit`、`prettier --check` → 通过（首轮 `prettier` 咬住两处，已 `--write` 修正）。

### 落点

1. **文字层**（`PdfReader.tsx`）：`PdfPageView` 在 canvas 之后渲染一层 `.pdf-text-layer`，
   用 pdf.js 5.x 从主包导出的 `TextLayer`。三处值得记：
   - **字号的换算基准不是 `scale`**。`TextLayer` 把每个 span 的 left/top 写成页面百分比，
     只有字号按 `--total-scale-factor` 从 PDF 点换算成 CSS 像素。而全局 `box-sizing: border-box`
     让 `.pdf-page` 的 1px 边框吃掉内容宽度、canvas 按 100% 跟着缩，**用 `scale` 会让文字层比
     canvas 宽 2px，右侧的选区整体偏出字外**。改用「canvas 实际显示宽度 ÷ scale=1 时的页宽」。
     e2e 里用真实布局守住：两个盒子的 left/top/width 相差都 < 1.5px。
   - `--scale-round-x/y` 必须给：`setLayerDimensions` 用 `round()` 算宽高，缺了步长整条
     `calc` 失效，层撑不到一页大。
   - **取文字要赶在 `target.cleanup()` 之前**——那一句会把这一页的资源交还。
2. **pdf.js 只加载一次**（新的 `loadPdfjs`）：原先 `openDocument` 里一处 `import('pdfjs-dist')`，
   我在文字层又写了一处。**结果第二处绕开了 `vi.mock` 的替身、把真模块拉了起来**，
   jsdom 里 `DOMMatrix is not defined`，单测因此多出 12 条 unhandled rejection
   （用例仍显示通过——这正是它危险的地方）。改成模块级缓存一个 promise，两处共用。
3. **`ReaderQuote` 的正文根可传**：新增 `selector`（默认 `.snapshot-rendered`，PDF 传
   `.pdf-reader-pages`）与 `canMark`（PDF 传 false，胶囊只留「记下这段」，分隔线一并消失）。
   `ResourceDetail` 在 PDF 分支另接一个 `takeQuoteOnly`——`mark()` 本来就会在取不到
   `.snapshot-rendered` 时早退，但靠别处早退来表达「这条路不标高亮」，读代码的人看不出是有意的。
4. **滚动监听改到捕获阶段**：`scroll` 不冒泡，而 PDF 是在 `.pdf-reader-pages` 这个内层容器里
   滚的——只听 `window` 的话，PDF 上一滚动胶囊就钉在原地。捕获能同时拿到内层与文档自身的滚动。
5. **收尾两项**：TASK-086 记录与索引行登记 MERGED（merge `198efc8`）；删掉
   `extension/src/popup/popup.ts` 注释里已过期的「前提是 TASK-084 先合并」。

### 登记时的一处错误，已改正

首次登记把 `base` 写成了 `198efc839a0a7f5a0f84b5be9aa1b86a1f96ba6d`——**前 7 位对、后面是我编的**。
分支确实是从 `198efc8` 切的，真值为 `198efc81faf208fc7feedacfa5ae3ca0dc828c5a`，已订正。
值得记的是：**`validate_governance.py` 当时是 PASS 的**——它不校验 `base` 指向的提交是否存在，
`check_task.py` 才在 `git rev-parse` 上失败。这算一条治理工具的缺口，登记为遗留项。

### 第二轮：处置独立 Review 的 5 条非阻断项（4 条改了，1 条只记录）

Review 结论是 PASS，但给了 5 条「可记录后继续 / 可选」。逐条判断后改掉其中四条——
它们都是**真实的行为问题或诚实性问题**，且代价都在几行之内：

1. **旋转页（`/Rotate 90|270`）的文字层必然错位 → 改为不挂**（F1，用户可见的错行为）。
   `setLayerDimensions` 按**未旋转**的 `rawDims` 定层宽高、只打一个 `data-main-rotation`，
   真正转坐标的是我们刻意没引的 `pdf_viewer.css`。挂上去的后果是**用户拖选会选到别处的
   文字**——比选不中更糟。现在 `rotation % 360 !== 0` 时直接不挂，canvas 照常可读。
   新增单测守住（第 1 页旋转 90°：这一页没有文字层，第 2 页照常有——证明是按旋转角判的）。
2. **`pdfjsOnce` 把失败的 import 也缓存了 → reject 时清空**（F3）。否则一次 chunk 加载失败，
   这次会话里再也打不开任何 PDF；旧代码每次都会重试，不能比它更差。
3. **单测名夸大了覆盖 → 改名**（F2）。`scales the text by what the canvas actually shows…`
   在 jsdom 里两条路都得 1，**用 `scale` 的错误实现同样会通过**；真正的守卫只有 e2e。
   改名为 `hands the text layer the css variables it needs to size itself`，名副其实。
4. **`<br>` 漏在样式之外 → 用 `:is(span, br)`**（F4）。pdf.js 在段末（`hasEOL`）会插 `<br>`，
   不收进绝对定位规则会留在常规流里把层撑变形。官方样式同样是 `:is(span, br)`。
5. **TASK-086 记录里「等待用户操作：本次不主动推 PR」与它自己的 MERGED 自相矛盾 → 已改写**（F5）。

**只记录不改**的是 Review 提的剩余风险：缩放时旧 `TextLayer` 若有已就绪的 chunk 抢在新一轮
`replaceChildren()` 之后落地，理论上会留下重复 span。窗口极窄、任一次重渲染即自愈，
按 §6「按实际影响与成本判断」不值得为它加一层代。

**这一轮自己又栽了一次**：F3 的第一版写成 `pdfjsOnce ??= (import(…) as …).catch(…)`，
TS 在 catch 里把 `pdfjsOnce` 窄化成 `never`，`tsc` 报 4 处错——`check_task.py` 当场 FAIL: 2
（typecheck + build）。改成显式 `PdfjsModule` 类型 + 带返回类型标注的 `loadPdfjs()` 后
**CHECKS PASS**，`files=11`
`product_fingerprint=5d639156cf511af57c8b8577df8dac14fd095b79ac898c5dee3b742b257c1312`。
前端 **801 passed（36 个文件）**（比上一轮多 1 条旋转页用例）、`pdf-reader` e2e **5 passed**。

### 已知限制 / 未完成项

- **扫描件/图片型 PDF 选不中**：它们没有文本层，这是 PDF 自身的性质，除非上 OCR（明确非目标）。
- **旋转页（`/Rotate 90|270`）选不中**：见第二轮 F1。要让它可选，得连 pdf.js 的旋转样式一起引
  （或自己写坐标变换），属另一个任务；夹具全是 0 度，e2e 覆盖不到这一档。
- **跨页选区**照原样交给浏览器：`selection.toString()` 会把两页文字拼起来，中间可能少一个换行。
- **选中后滚很远，选区会丢**：文字层随 canvas 一起卸载（登记时的决定）。
- **PDF 上仍没有高亮**：按用户选定的节奏，锚点（页码 + 原文 + 前后文）与契约改动留给下一个任务。
- 没有为「缩放后文字层跟着重排」单独写 e2e：改 `scale` 会整段重渲染（同一条 effect），
  与首帧走的是同一条路；e2e 只验了首帧的对齐。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：**最终候选 `d571a03`**（base `198efc8`）。两次冻结：`ec3ec7e`（第一次送审 → PASS + 5 条
  非阻断）→ `d571a03`（处置四条 → 增量复核 PASS / No findings）。
- Review（独立只读 Reviewer，审 `198efc8..ec3ec7e` 全量最终 diff，**报告原文**）：

  > ## 结论：PASS（候选 `ec3ec7e`，base `198efc8`）
  >
  > **只读证明**：本 Agent 仅授予 Read/Grep/Glob，无 Write/Edit、无 Bash；未改、未提交任何文件。
  >
  > **范围**：`198efc8..ec3ec7e` 全量 diff（11 文件）+ 回源码核对 `PdfReader.tsx` / `ReaderQuote.tsx` / `ResourceDetail.tsx` / `styles.css` / 两个测试文件 / e2e，并对读了 `node_modules/pdfjs-dist/build/pdf.mjs` 的 `TextLayer`、`setLayerDimensions`、`rawDims`。未重跑测试（无 Bash）。SHA 经 `.git/logs/HEAD` 核实：base、实现 `4521272`、候选 `ec3ec7e` 均属实，登记的「base 曾编造、已订正」与 reflog 一致；新增 3+4 单测、1 条 e2e 与「793→800、4→5」自洽。
  >
  > **逐点核对（无阻断）**
  > - 对齐推理成立：`*{box-sizing:border-box}` + `.pdf-page` 1px 边框 ⇒ canvas 实宽 = `w*scale−2`，而 `setLayerDimensions` 按 `--total-scale-factor × rawDims.pageWidth` 定层宽；用 `scale` 必宽 2px。实测基准更稳，e2e（<1.5px）真守住。`|| cssViewport.width` 退路只会退回「宽 2px」，不会给出错误量级。
  > - 生命周期：`text` 在 `new Layer` 后立即赋值，`alive` 在三个 await 点后都查；`drawText` 在 `cleanup()` 之前、`if (alive)` 之后；卸载/换页/`destroy()` 的 reject 都被 catch。未见漏 cancel 或往已卸载节点写。
  > - PDF 不会误标高亮：`canMark=false` 隐藏按钮、`onQuote=takeQuoteOnly`、`mark()` 取不到 `.snapshot-rendered` 早退，且「高亮」Tab 与 `ReaderHighlights` 均由 `!pdfOriginal` 把门；全仓无第二处 `onMark`/键盘入口。
  > - `ReaderQuote` 默认值保持网页正文行为；`scroll` 捕获监听移除对称（第三参 `true`）；`fireEvent.scroll(pages)` 是非冒泡事件，那条用例对旧 `window` 监听会失败——真守行为。
  > - TASK-086 的改动限于 TOML `status` 与 EVIDENCE 区（241–369）内，索引两行状态与记录一致。
  >
  > **Findings（均为可记录后继续 / 可选）**
  > 1. **旋转页（`/Rotate 90|270`）文字层必然错位**（`PdfReader.tsx:481-494`）。`unit.width` 已含旋转（=`pageHeight`），而 `setLayerDimensions` 用未旋转的 `rawDims.pageWidth/Height` 定层宽高，且只打 `data-main-rotation` 属性——本任务刻意不引 `pdf_viewer.css`，那条旋转规则也就没有。结果：横置页上层是竖版、span 百分比坐标不转，用户拖选会选到别处的文字（`overflow:clip` 还会吃掉一部分）。canvas 阅读不受影响，非回归（此前根本没有文字层），夹具全是 0 度、e2e 覆盖不到。建议登记为已知限制，或加一行廉价兜底：`cssViewport.rotation % 360 !== 0` 时不挂文字层。
  > 2. 单测 `scales the text by what the canvas actually shows...`（`PdfReader.test.tsx:375`）在 jsdom 里两条路都得 1，**用 `scale` 的错误实现同样会通过**；真正的守卫只有 e2e。用例注释已如实说明，但用例名夸大了覆盖，建议改名或降级为「只验 `--scale-round-*`」。
  > 3. `pdfjsOnce` 会把**失败的** import 也永久缓存，一次 chunk 加载失败后本次会话再也打不开任何 PDF（旧代码每次重试）。建议 reject 时清空。
  > 4. 小：`hasEOL` 产出的 `<br>` 不在 `.pdf-text-layer span` 规则内（pdf.js 官方用 `:is(span, br)`），会留在常规流里；`harness()` 造的 `host` 未从 `document.body` 摘除（本 describe 在文件末尾，实测无跨用例污染）；`pages.push/finally` 因 `near` 上限只到第 3 页，截断后不会有延迟访问，安全。
  > 5. 小：TASK-086 记录 349–352 行仍是现在时的「**等待用户操作**：本次不主动推 PR……」，与同一条目开头的 MERGED 相矛盾，宜随下次登记顺手收掉。
  >
  > **剩余风险**：缩放时旧 TextLayer 若有已就绪的 chunk 抢在新一轮 `replaceChildren()` 之后落地，理论上会留下重复 span（窗口极窄，任一次重渲染即自愈）；扫描件、跨页选区、滚远丢选区三项已在记录里如实登记。

- 主 Agent 对 Review 的处置：F1/F2/F3/F4/F5 **五条里改了四条**（F1 旋转页不挂层 + 新增单测、
  F3 失败不缓存、F2 用例改名、F4 `:is(span, br)`、F5 TASK-086 那段自相矛盾的文字），
  详见「第二轮」。Review 提的「重复 span」剩余风险按成本收益只记录不改。

- Review（第二轮，同一 Reviewer 增量复核 `ec3ec7e..d571a03`，**报告原文**）：

  > ## 结论：PASS（新候选 `d571a03`，base 仍 `198efc8`）
  >
  > **只读证明**：本轮同样只有 Read/Grep/Glob，无 Write/Edit、无 Bash；未改、未提交任何文件。
  >
  > **覆盖与继承**：本轮只审 `ec3ec7e..d571a03`（5 文件，+124/−15）及受影响上下文（`loadPdfjs`/`drawText`/`PdfPage` 类型、`.pdf-text-layer` 规则、两处任务记录），并回读 `pdfjs-dist` 的 `PageViewport` 构造函数核实旋转取值域。`198efc8..ec3ec7e` 的结论按 §6 **继承**：本轮改动全部落在上一轮已审的同一批文件与同一条代码路径上，未触及 `ReaderQuote`/`ResourceDetail`/e2e/契约/基线，耦合可界定，无需完整复审。候选 `d571a03` 经 `.git/logs/HEAD` 核实存在且是 `ec3ec7e` 的直接子提交；5 个文件均在 allowed_paths 内；801 = 800+1 与新增用例自洽。
  >
  > **逐条核对你的处置**
  > - **F1 判据成立，且比我建议的更严**。`PageViewport` 在 `this.rotation = rotation` **之后**才做 `%=360` 归一，所以 `viewport.rotation` 是**原始值**（`-90`、`450` 都可能出现）。`(x ?? 0) % 360 !== 0` 对这三类都判对：`-90 % 360 = -90` → 跳过；`-360 % 360 = -0`，而 `-0 !== 0` 为 false → 不跳过（归一后确实是 0 度，该渲染）；`450` → 90 → 跳过。**180° 也必须跳过是对的**：那一档宽高虽然与未旋转一致，但 span 的百分比坐标不翻转，会整页上下左右颠倒——比 90° 更隐蔽。`pdf.js` 的 `case default` 只接受 90 的倍数，取值域封闭。
  > - **新增单测真会因缺兜底而失败**：没有 `return` 时，替身 `TextLayer` 会把「第 1 页的文字」写进那一层，`toBe('')` 必挂；同时第 2 页仍断言有文字，排除了「整体没生效」这种假通过。`pages[0]` 改共享夹具 + `finally` 还原与上一条同模式，`near` 上限保证截断后无延迟访问。
  > - **F3 无竞态**。`catch` 回调只会在 `pdfjsOnce` 仍指向自己那条链时运行：只有它把缓存置 null，后来的调用才会新建；不存在「旧的 catch 把新 promise 清掉」的交错。并发两次拿的是同一条链，失败时两边都收到同一个 reject，之后才重试。TS 那次栽跟头（`catch` 把 `pdfjsOnce` 窄化成 `never` → tsc 4 处错 → `check_task.py` FAIL: 2）已如实留痕，属「必要检查失败不得完成」的正确处理。
  > - **F4**：`.pdf-text-layer :is(span, br)` 与官方 `pdf_viewer.css` 一字不差。**`::selection` 不必一起改**——`getTextContent()` 默认 `includeMarkedContent: false`，层里不会出现嵌套 `span`，承载文字的只有顶层 `span`；`br` 是零尺寸绝对定位元素，选中时最多一条看不见的细缝。若想与官方完全对齐，可写成 `.pdf-text-layer ::selection`，一行、零风险，但不是必要。
  > - **F2 改名名副其实**；**F5** 改写后与 MERGED 自洽，且仍落在 TASK-086 的 EVIDENCE 区（241–369）内。
  > - **重复 span 那条同意只记录**：新一轮 `replaceChildren()` 排在一次全新的 `getTextContent()` worker 往返之后，被取消流的滞留 chunk 几乎必然更早落地、随即被清掉；要撞上得让旧流比新往返还慢。不比我上轮的评估更严重。
  >
  > **Findings**：No findings（无必须修复项，无新增非阻断项）。
  >
  > 一条**流程提醒**（不是缺陷）：EVIDENCE 区现在的「候选 SHA」只写了 `ec3ec7e` 与「新候选见下」，而 `d571a03` 尚未落在记录里（避免提交引用自身，符合 §6）。请在收尾提交里把最终候选写实为 `d571a03`（或其后继），并把本轮增量复核结论一并原文写回；索引行 status 与记录 status 须同步。
  >
  > **剩余风险**：旋转页现在选不中（已入「已知限制」，行为退化到本任务前的状态，非回归）；扫描件、跨页选区、滚远丢选区三项照旧；`--total-scale-factor` 的真实对齐仍只由 e2e 一条 0 度夹具守着，缩放档与旋转档无 e2e 覆盖（已在记录中说明）。
- Acceptance：N/A（L2）
- 最终状态/风险/用户操作：**ACCEPTED**（L2 执行链走完：实现 → 每轮机械检查 → 独立只读
  Reviewer 两轮，第一轮 PASS + 5 条非阻断、改掉四条后增量复核 PASS / No findings）。
  风险：只动前端渲染与交互，不碰后端/契约/数据；最坏情况是文字层没挂上或对不齐，
  canvas 阅读不受影响（旋转页已主动降级为不挂）。
  **等待用户操作**：先交用户在真机上划两下试手感（选中、复制、「记下这段」进草稿），
  确认后再由用户决定推 PR 与合并。合并后 087 的 MERGED 登记按 §5 并入下一个任务的控制面提交。
- 非阻断遗留项：
  1. **旋转页（`/Rotate 90|270|180`）选不中**：主动不挂文字层（选错文字比选不中更糟）。
     要支持得连 pdf.js 的旋转样式一起引或自写坐标变换，属另一个任务。
  2. **扫描件/图片型 PDF 选不中**（无文本层，除非 OCR）、**跨页选区**照原样交给浏览器、
     **选中后滚很远选区会丢**（文字层随 canvas 卸载）。
  3. **对齐只由一条 0 度夹具的 e2e 守着**：缩放档与旋转档没有 e2e 覆盖。
  4. **`validate_governance.py` 不校验 `base` 指向的提交是否存在**——本任务登记时把完整 SHA
     写错（前 7 位对、后半是编的）它照样 PASS，是 `check_task.py` 在 `git rev-parse` 上失败才
     暴露。建议后续在治理校验里补一条存在性检查。
  5. **PDF 上仍没有高亮**：按用户选定的节奏，锚点（页码 + 原文 + 前后文）与契约 §4.15 的改动
     （加 `page_index`、放宽「必须有快照」）留给下一个 L3 任务。
- 日期与决定日志：2026-09-21 用户问「是不是可以开始做 pdf 的批注、心得功能」→ 主 Agent 核查现状
  （无文字层、高亮需改契约）后给出三步拆法 → 用户选「先做第 1 步，验过再说」+ 锚点用文本锚点
  → 登记 TASK-087；同轮用户把 TASK-086 的两项收尾并入本任务。
<!-- EVIDENCE:END -->
