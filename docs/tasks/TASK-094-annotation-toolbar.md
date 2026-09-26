# TASK-094：顶栏标注工具——多色荧光笔、下划线、橡皮，点选高亮写心得

```toml
schema_version = 2
id = "TASK-094"
status = "ACCEPTED"
risk = "L2"
risk_reason = "只改前端（阅读器顶栏、胶囊、右栏高亮面板与上色），消费 TASK-093 已批准的契约字段；不改后端、不改契约、不碰快照渲染器（XSS 边界）。用户可见的交互改动大（「标下来」按钮退场、选中即落色、正文上点选与橡皮即删），须独立只读 Review 检查最终 diff；独立验收 N/A。执行链：1 Worker → 自动检查 → 1 独立只读 Reviewer。"
risk_flags = ["business"]
owner = "coordinator"
base = "a9cb950042c6ef6d14c3d940d7a52ea36a67baec"
allowed_paths = [
  "frontend/src/shell/Icon.tsx",
  "frontend/src/features/resources/AnnotationTools.tsx",
  "frontend/src/features/resources/AnnotationTools.test.tsx",
  "frontend/src/features/resources/highlights.ts",
  "frontend/src/features/resources/highlights.test.ts",
  "frontend/src/features/resources/ReaderQuote.tsx",
  "frontend/src/features/resources/ReaderQuote.test.tsx",
  "frontend/src/features/resources/ReaderHighlights.tsx",
  "frontend/src/features/resources/ReaderHighlights.test.tsx",
  "frontend/src/features/resources/ResourceToolbar.tsx",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/fixtures.ts",
  "frontend/src/styles.css",
  "frontend/e2e/reader-highlights.spec.ts",
  "frontend/e2e/pdf-highlights.spec.ts",
  "frontend/e2e/pdf-reader.spec.ts",
  "docs/tasks/TASK-094-annotation-toolbar.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-26 用户：「目前的高亮是先选中文字，再决定是标下来还是写心得，我想把他改为：在页面最上面工具栏放上一些工具，
如荧光笔、橡皮、下划线等，心得可以选中文字、选中高亮、选中下划线进行书写」；追问后选定「再加多种颜色」、
「橡皮点一下立刻删，底部出『已删除，撤销』提示」、「先画 Pencil 草图」；看过草图后「**可以，按草图开 TASK-093 和 094**」。
草图里替用户定下并已明示的细节：四色（黄/绿/蓝/粉）；气泡里「写心得 / 换色 / 改为下划线」、不放删除；
下划线跟荧光笔当前色走；工具选中后一直有效直到再点一下取消，刷新回到「没选工具」；高亮与下划线可互转。

### 依赖（写在最前面）

叠在 TASK-093 分支上（base = 093 证据写回提交 `a9cb950`）：本任务**消费** 093 的 `style`/`color` 字段与新的 PATCH 语义，
093 未合并前不能单独合并。PR 指向 093 的分支。

### 目标（按草图）

1. **顶栏工具区**（`AnnotationTools`，放在「返回资料库」与右侧按钮之间）：荧光笔 + 四个颜色点 + 下划线 + 橡皮；
   按下态用 `aria-pressed`，颜色是 `role=radiogroup`。点颜色时若没选工具或选的是橡皮，自动切到荧光笔。
2. **选中即落**：荧光笔/下划线开着时，松开鼠标（`mouseup`/`touchend`）就按当前样式与颜色建一条高亮，不弹胶囊、
   不自动打开右栏；跨页/页外选区仍弹「选区跨页或落到页外，只能记下这段」的胶囊。没选工具（或橡皮）时胶囊只剩
   「记下这段」——**「标下来」按钮退场**。「记下这段」标的是当前颜色的高亮。
3. **上色按「样式 × 颜色」拆注册表名**：`studypilot-{mark|underline}-{color}`，PDF 再加 `-pdf`；下划线用
   `text-decoration` 画，四色各一深（线）一浅（底）。
4. **点选高亮/下划线**（正文上 `click`，按坐标 `caretPositionFromPoint` 反查落在哪条 Range 里；拖选后的松手不算点选）：
   没选工具 → 气泡：写心得/改写心得、换色四点、改为下划线⇄改为高亮；橡皮开着 → 立刻删，底部「已删除一条高亮 · 撤销」，
   撤销按同样锚点、页码、样子重建，原本配的心得一并接回。气泡与提示用 portal 挂到 body（右栏 Tab 隐藏时也要能显示）。
5. 右栏「高亮」Tab 每条前面加颜色点与「高亮/下划线」种类；空态文案改成新的操作方式。

### 非目标 / 禁止范围

- 不改后端、契约；不碰 `snapshotMarkdown.ts`；不做快捷键（用户既定）；不做「清除本页全部」。
- 不记住上次选的颜色（刷新回默认黄）；不做触屏专门适配（`touchend` 只是顺手一并监听）。
- PDF 上的下划线/换色走同一套代码，不单独造 PDF e2e（PDF 高亮 e2e 只把「标下来」换成工具流程）。

## 完成条件

- 单测：`AnnotationTools`（按下态/颜色/自动切荧光笔）、`ReaderQuote`（工具态松手即 `onMark`、无工具只剩「记下这段」、
  谓词拒绝时的提示）、`ReaderHighlights`（按样子分注册表名上色、点选出气泡与换色/改型 PATCH、橡皮删除 + 撤销重建）、
  `highlights.ts`（`updateHighlight` 的请求体与至少一个字段的校验；解析器拒绝未知样式/颜色）。
- e2e（真后端）：荧光笔选绿 → 选中即上色到 `studypilot-mark-green`；点它 → 气泡「改为下划线」→ 注册表换到
  `studypilot-underline-green`；橡皮点一下 → 列表/上色/服务端三处空 → 撤销 → 回来。既有 PDF e2e 改用工具流程后仍绿。
- `check_task.py` 必要检查 PASS（`frontend` 组）；独立只读 Reviewer 结论。
- 用户本机看过后再推 PR（既定偏好）。

## 上下文包

- 草图：Pencil `pencil-new.pen` 里「阅读器｜标注工具栏（TASK-093/094 草图）」（`OY9Qp`）与「标注｜四个状态」（`v06vD8`）。
- 代码：`ReaderQuote.tsx`（胶囊）、`ReaderHighlights.tsx`（上色 + 列表）、`ResourceDetail.tsx`（`mark`/`takeMark`/
  `takeQuoteAndMark`）、`ResourceToolbar.tsx`（顶栏行）、`highlights.ts`（客户端）、`styles.css` 的 `::highlight()` 与
  `.reader-quote`。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-094-annotation-toolbar.md --worktree`；
  `cd frontend && npx playwright test e2e/reader-highlights.spec.ts e2e/pdf-highlights.spec.ts e2e/pdf-reader.spec.ts`。

## 实现与测试

- 实现 SHA/变更摘要：实现与登记同一个提交（SHA 在 EVIDENCE 区作候选记录；之后的证据写回是另外的提交）。变更：
  - 新文件 `AnnotationTools.tsx`（+测试）：荧光笔/四色单选/下划线/橡皮，`aria-pressed` + `role=radiogroup`；`Icon.tsx` 加三个图标。
  - `highlights.ts`：`style`/`color` 类型与解析（闭集，不认识即 INVALID_RESPONSE）、`registryName()`、`createHighlight` 加
    `look`（默认黄色高亮不发字段）、新 `updateHighlight(changes)`（只发点名的字段，空改动与未知值在发出前拒），
    `bindHighlightNote` 变成它的薄封装。
  - `ReaderQuote.tsx` 重写：`tool` 属性；荧光笔/下划线开着时 `mouseup`/`touchend` 上读选区、谓词通过即 `onMark` 并清选区、
    不出胶囊；谓词拒绝出胶囊说明原因；「标下来」按钮删除，胶囊只剩「记下这段」。
  - `ReaderHighlights.tsx`：按 `registryName` 分组注册、删掉上一轮多余的名字；正文容器上的 `click` 按
    `caretPositionFromPoint`（回退 `caretRangeFromPoint`）反查 `isPointInRange`，拖选后的松手（选区非空）不算点选；
    气泡（写心得/改写心得、换色、改型）与底部提示（撤销 / 错误）用 `createPortal` 挂 body；换色/改型走本地覆盖
    （`patched` 以 `result` 为键，列表重读即失效）不重读、不闪；橡皮即删 + 8 秒内撤销（按同锚点/页码/样子/心得重建后重读列表）；
    条目加颜色点与种类；空态文案改。
  - `ResourceDetail.tsx`：`tool`/`color` 状态、点颜色顺手切荧光笔、`mark()` 带样子、`takeMark` 不再打开右栏、
    有可标注正文时才给顶栏工具；`ResourceToolbar.tsx` 加 `tools` 插槽。
  - `styles.css`：四色变量、16 条 `::highlight()`（高亮/下划线 × 四色 × 网页/PDF）替换原来两条、工具区/气泡/提示/条目样式；
    删掉「标下来」的三条旧规则（分隔线、`.mark` 及其 `:hover`；分隔线的 JSX 也一并去掉）。
  - 测试：单测 6 条改写 + 6 条新增（AnnotationTools 1、ReaderHighlights 3、highlights 2；第一次记录写成 7，Review F3 订正）；
    e2e 三个 spec 改为工具流程，`reader-highlights.spec.ts` 新增整条「绿荧光笔 → 气泡改下划线 → 橡皮 → 撤销」用例。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：
  - `check_task.py --task docs/tasks/TASK-094-annotation-toolbar.md --worktree` → 退出码 0，**CHECKS PASS**，`files=17`，
    `product_fingerprint=bda31239bb2a25a2a28e8726db2a1ba8123f585adc33c233a4b0cd1365537879`，`profiles=frontend`
    （lint/format/`tsc -b`/build；vitest 38 文件 **832** 条全过）。第一次跑 FAIL：测试里给 `document.caretPositionFromPoint`
    的替身用了 `delete`，新版 lib.dom 已声明该方法（非可选）→ 改为保存/还原原值，重跑即 PASS。
  - `npx playwright test e2e/reader-highlights.spec.ts e2e/pdf-highlights.spec.ts e2e/pdf-reader.spec.ts` → **16/16 通过**
    （隔离沙盒，真后端）。
  - 真机截图（一次性 spec，已移出工作区）：1440 宽下工具区落在返回链接与右侧按钮之间、荧光笔按下态带当前色；黄高亮 +
    绿下划线同屏；点中高亮出气泡（写心得 / 四色 / 改为下划线）；橡皮点后底部「已删除一条高亮 · 撤销」。
- **第二次实现提交（按第一轮 Review）**：F1 工具开着时拖选到已有高亮上，`ReaderQuote` 在 `mouseup` 里清了选区，随后的
  `click` 到 `ReaderHighlights` 时选区已空、「选区非空不算点选」的守卫失效——补一条按下点/松开点位移 >4px 即视为拖动的判定
  （容器上多听一个 `mousedown`）；F2 补两条断言（位移判定、选区非空）+ 既有橡皮用例改为先 `mouseDown` 再 `click`；
  F4 撤销时若带心得重建被拒（`NOTE_NOT_FOUND`，或共享客户端把 `NOTE_ALREADY_HIGHLIGHTED` 映成的带 409 的 `REQUEST_FAILED`），
  退一步不带心得再建一次，补一条用例；F3 订正上面两处计数与四处陈旧注释。
  重跑：vitest 资源模块 366 条 → 全过；三个 e2e spec 16/16；`check_task.py --worktree` → 退出码 0，**CHECKS PASS**，`files=17`，
  `product_fingerprint=6ecdcca6a917edb2de864dc2d70d33430bd412efb1c63c475b5c8ad9621e415b`（vitest **834** 条）。
  中途两次 FAIL 留痕：① 测试里给 `ApiError` 传了共享客户端不认识的码 `NOTE_ALREADY_HIGHLIGHTED`（tsc 报）→ 改成客户端实际
  会给的 `REQUEST_FAILED` + 409，实现里的判定也据此改；② 改完测试忘了跑 prettier（format:check 报）→ 格式化后重跑。
- 已知限制/未完成项：
  - 键盘用户：工具开着时 Shift+方向键选区既不落色也不出胶囊；颜色 `radiogroup` 无方向键循环；气泡不移焦点（Review F5，
    不违背既定约定，后续任务处理）。
  - 点选靠 `caretPositionFromPoint` 反查，**多行高亮点在行间空隙不算点中**（落点不在任何文字上）；点到字上即可。
  - 工具态与颜色不记忆（用户选定）；触屏只顺手听了 `touchend`，未专门适配。
  - 换色/改型失败与橡皮失败都走底部提示（右栏 Tab 多半没开着）；成功不提示。
  - 用户文档（README 截图/说明）还写着旧流程，随下一次文档追平任务更新。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：`ac8f17b`（= `829c602` 实现 + 登记，再加按 Review 的 `ac8f17b`）。本条证据写回是之后的另一个提交。
- Review：独立只读 Reviewer（`.claude/agents/reviewer.md`，工具仅 Read/Grep/Glob，运行器层无写工具）。
  **第一轮**（`a9cb950..829c602`）报告原文：
  > 权限证据：仅 Read/Grep/Glob（无 Write/Edit/Bash，运行器层面只读）。
  > **候选/基线**：`.git/HEAD` → `refs/heads/agent/coordinator/TASK-094-annotation-toolbar` = `829c602b4de4…`，与任务候选一致；base `a9cb950`。审查范围：`diff-094.patch` 全部 1989 行（15 个 frontend 文件）+ `ReaderHighlights.tsx`/`ReaderQuote.tsx`/`ResourceDetail.tsx`/`useResourceQuery.ts` 现行上下文。未触碰 `snapshotMarkdown.ts`；portal 内容只有常量、`STYLE_LABELS`、`failureText` 文本节点与数字坐标，无 innerHTML，XSS 面未扩大。
  > **结论：PASS（附非阻断项）**
  > **F1（可记录后继续，建议小修）工具开着时"拖选后松手"仍会弹气泡**——`ReaderQuote.tsx:104`（`settle` 内 `removeAllRanges()`）与 `ReaderHighlights.tsx:251-252`。事件顺序是 `mouseup`（document）→ `click`（容器）。荧光笔/下划线开着拖选时，`settle` 在 `mouseup` 里已同步清掉选区，随后的 `click` 到达时选区已是 collapsed，"选区非空不算点选"的守卫失效；若松手点落在已有高亮 Range 内，落色之后还会为那条旧高亮弹出气泡。橡皮态不受影响。不丢数据，Esc/外点可关；建议按 mousedown/mouseup 位移判定让该 click 被忽略。
  > **F2（可记录）`isCollapsed` 守卫无测试**——单测的 jsdom 选区始终 collapsed，e2e 只派发合成 `mouseup` 不派发 click；删掉那行没有任何断言变红。
  > **F3（可记录）记录与 diff 的可数描述有出入**——"单测 6 条改写 + 7 条新增"实为 6 条新增；"删掉两条旧规则"实际删了三条；陈旧注释仍指旧流程：`ReaderHighlights.tsx:37`、`ResourceDetail.tsx:364/645`、`e2e/pdf-highlights.spec.ts:12`。
  > **F4（可记录）撤销重建可能失败于悬挂心得**——`restore()` 原样带回 `note_id`；若那条心得已被解绑/贴到别的资料或已删，POST 会被服务端拒，只出错误提示，删除不可逆。可选：失败时退回不带 `note_id` 重建一次。
  > **F5（可选建议）**键盘用户：工具开着时 Shift+方向键选区既不落色也不出胶囊；`radiogroup` 无方向键/roving tabindex；`role=dialog` 气泡不移焦点。均不违背既定约定，可后续任务处理。
  > **已核对为正确的项**：谓词拒绝无双触发；`busy`/`removed`/`retry()` 与 `patched.base===result` 失效逻辑正确；`painted` 注册表按 `rows` 重算、旧名一律删；图标按钮 `textContent===''`、`aria-label`；`radiogroup`/`radio`+`aria-checked`；气泡 Esc + `pointerdown` 外点关闭；e2e 新用例每步绑定服务端 `style/color`；单测替身与 e2e 真机走同一 `caretAt()`。
  主 Agent 处置：F1/F2/F4 修、F3 订正、F5 记入已知限制（`ac8f17b`），请同一 Reviewer 增量复核。**增量复核**（`829c602..ac8f17b`）报告原文：
  > 权限证据：仅 Read/Grep/Glob（无写工具、无 Bash）。
  > **结论：PASS，覆盖最终候选 `ac8f17b`**。继承上一轮对 `a9cb950..829c602` 的完整审查范围与结论；本轮只复核 `829c602..ac8f17b`（217 行，4 个文件）及 `api/client.ts`、后端 `highlight_store.py`、任务记录第 106-126 行。
  > ① 位移阈值 4px（`Math.hypot`）：手抖 1-2px 与 `page.mouse.click` 都不会误伤；单测「原地点一下」用 (40,20)→(41,21) 覆盖。② `pressedAt` 陈旧值无误判：按下点在容器外时，`click` 派发在共同祖先上，不会冒泡到容器监听器。③ 与 `client.ts:284-323` 一致：`NOTE_NOT_FOUND` 原样到达；`NOTE_ALREADY_HIGHLIGHTED` → `REQUEST_FAILED` + 409（后端 `highlight_store.py:147` 确为 409）；`VERSION_CONFLICT` 不会被误吞。④ 记录与 diff 一致。
  > **Findings：No findings.** 剩余风险：F5 已记入已知限制，非阻断。
- Acceptance：L2 N/A。
- 最终状态/风险/用户操作：**ACCEPTED**（L2：自动检查 PASS → 独立只读 Review 两轮 PASS）。风险：交互改动大，靠 e2e 与真机截图
  兜底；最坏情况是某种点选/拖选组合的手感不对，都有 Esc/撤销可退。**等待用户操作**：本机启动（迁移 0010 会由启动脚本先备份
  库再升级）后试：顶栏选色标几段、下划线、点高亮换色/改型、橡皮删再撤销；看过后由你决定推 PR（094 → 093 分支 → 092 分支）。
- 非阻断遗留项：见「已知限制」（行间空隙不算点中；键盘/焦点；用户文档待追平）。
- 日期与决定日志：2026-09-26 用户看过草图答「可以，按草图开 TASK-093 和 094」→ 登记本任务。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
