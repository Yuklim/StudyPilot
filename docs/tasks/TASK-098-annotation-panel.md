# TASK-098：阅读器右栏改成 Zotero 式「注释」列表——高亮下就地写评论，写心得时有选区就自动高亮配对

```toml
schema_version = 2
id = "TASK-098"
status = "ACCEPTED"
risk = "L2"
risk_reason = "阅读器右栏交互重做（纯前端）：「高亮」「心得」两个 Tab 合成一个按文中顺序的「注释」列表，评论就地写、失焦/⌘↩/停笔自动保存；写心得时正文有选区则自动标高亮并配对。走已批准的心得与高亮接口（saveNote / updateHighlight / createHighlight），不改后端与契约。写用户数据的路径变多（自动保存、隐式建高亮）且大量既有 e2e 要改写，须独立只读 Reviewer 检查最终 diff；独立验收 N/A。执行链：1 Worker → 自动检查 → 1 独立只读 Reviewer。"
risk_flags = ["business"]
owner = "coordinator"
base = "cb0cfaaef23b920a23a1b3815b3c17566f6f8062"
allowed_paths = [
  "frontend/src/features/resources/ReaderHighlights.tsx",
  "frontend/src/features/resources/ReaderHighlights.test.tsx",
  "frontend/src/features/resources/AnnotationComposer.tsx",
  "frontend/src/features/resources/CommentBox.tsx",
  "frontend/src/features/resources/CommentBox.test.tsx",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ReaderQuote.tsx",
  "frontend/src/features/resources/ReaderQuote.test.tsx",
  "frontend/src/features/resources/ResourceToolbar.test.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/features/resources/ResourceEditor.test.tsx",
  "frontend/src/features/notes/NoteEditorPage.test.tsx",
  "frontend/src/features/taxonomy/ClassificationPages.test.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/reader-highlights.spec.ts",
  "frontend/e2e/pdf-highlights.spec.ts",
  "frontend/e2e/pdf-reader.spec.ts",
  "frontend/e2e/reader-layout.spec.ts",
  "frontend/e2e/reader-notes-sidebar.spec.ts",
  "frontend/e2e/notes-pages.spec.ts",
  "frontend/e2e/reader-immersive.spec.ts",
  "frontend/e2e/resource-edit-pages.spec.ts",
  "docs/tasks/TASK-098-annotation-panel.md",
  "docs/tasks/TASK-096-minimal-theme.md",
  "docs/tasks/TASK-097-library-classify.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-29 用户：「想再改一下阅读器中的心得页面，像 Zotero 中的注释功能一样，能够不用跳转到新窗口就开始写」→ 规则定案：
「高亮可以带评论，也可以不带评论；如果只写心得，就自动高亮选中文字，并自动配对；如果没有选中文字的心得，就是独立心得」
→ 看过 Pencil 草图「阅读器右栏｜注释（TASK-098 草图 · Zotero 式就地评论）」（`Dbma0`）后：「**就这样**」。

### 目标（按草图）

1. **一个「注释」列表**替代「高亮」「心得」两个 Tab（「信息」保留）：高亮/下划线（带或不带评论）按文中顺序排，
   不挂高亮的心得排在它们之后（新的在前）。每条：颜色条 + 引文 + 评论（就地可编辑）+ 「跳到正文」+ 时间 + ⋯ 菜单
   （换色 / 改为下划线⇄高亮 / 删除高亮；心得条目：整页编辑 / 删除心得）。角标 = 高亮数 + 不挂高亮的心得数。
2. **评论就地写**：点「添加评论…」变输入框；失焦、⌘↩ 或停笔 2 秒自动保存——没有心得就新建并配到这条高亮，有则改内容
   （版本化 PATCH）；冲突（409）提示并保留文字，不重试。
3. **顶部「写心得…」框**：点进去的那一刻若正文里有选区，记下这段选区（显示「将配到：『…』 ×」）；保存时先按当前颜色
   标高亮、再建心得并配对；没有选区就是这份资料的心得（不挂高亮）。失焦或 ⌘↩ 保存，保存后清空。
4. 胶囊「记下这段」= 立即按当前颜色标高亮 + 打开右栏 + 聚焦这条的评论框（选区跨页等标不了时退回：引文进顶部框）。
   正文里点高亮的气泡：「写评论 / 改评论」= 打开右栏并聚焦这条的评论框。
5. `NotesPanel` 不再用于阅读器（顶层「我的心得」页照旧用它）；`ResourceDetail` 里「配对等待」那套（`pendingNote`/
   `bindSavedNote`）随之删除——配对发生在评论框保存时。

### 非目标 / 禁止范围

- 不改后端与契约；不改顶层「我的心得」页与整页编辑器；不做拖拽排序、不做评论 Markdown 预览。
- 「解除绑定回独立心得」**保留**在心得条目的 ⋯ 菜单里（登记时以为整页编辑器有这个入口，实施时核对：没有；
  `notes-pages` 的后贴/解绑往返 e2e 也靠它）。
- 顶栏「心得」按钮的名字不改（既有守卫多）。

## 完成条件

- 单测：`CommentBox`（失焦/⌘↩/停笔保存、空文本不建、409 保留文字）、`ReaderHighlights`（混排顺序、评论保存 = POST 心得 +
  PATCH 配对、改评论 = PATCH 心得、不挂高亮的心得行、聚焦请求、角标计数）、`ReaderQuote` 全页流程（记下这段 → 标高亮 +
  聚焦评论框 → 输入 + 失焦 → 心得配上；顶部框有选区 → 高亮 + 心得 + 配对；无选区 → 只建心得）。
- e2e（真后端）改写：`reader-highlights`（记下这段 + 就地评论）、`reader-notes-sidebar`（顶部框写心得、角标、Esc、草稿保留）、
  `notes-pages` 里走阅读器面板的流程、`pdf-highlights`/`pdf-reader`/`reader-layout` 的 Tab 名。全套 e2e 绿。
- `check_task.py` PASS；独立只读 Reviewer 结论；用户本机看过。
- 顺带登记 TASK-096（PR #105，merge `0d1e198`）、TASK-097（PR #106，merge `cb0cfaa`）为 MERGED。

## 上下文包

- 草图 `Dbma0`；接口：`saveNote(scope, content, previous)`、`deleteNote`、`listNotes(scope, page, sort, size)`、
  `createHighlight`、`updateHighlight(prev, {note_id|style|color})`、`deleteHighlight`。
- 现状：`ReaderHighlights.tsx`（上色/点选/橡皮/撤销/列表）、`NotesPanel.tsx`（写作框 + 列表 + 恢复流程，留给顶层页）、
  `ResourceDetail.tsx`（Tab、配对等待、引文队列、聚焦请求）。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-098-annotation-panel.md --worktree`；
  `cd frontend && npx playwright test`。

## 实现与测试

- 实现 SHA：见「状态与最终证据」的候选 SHA（本记录的控制面提交在实现之前，不能引用自身之后的提交）。
- 变更摘要：
  - 新 `CommentBox.tsx`：就地评论框，失焦 / ⌘Ctrl+↩ / 停笔 2s 保存，只在有改动且非空时发请求，失败保留文字与原因、
    不重试；保存中又改了字则回来后按最新文字补存一次（不并发）。
  - 新 `AnnotationComposer.tsx`：右栏顶部「写心得…」框；`mousedown`/`focus` 那一刻读正文选区（复制 Range），显示
    「将配到：『…』 不配」；失焦 / ⌘↩ 提交；沿用 TASK-068 的引文队列作退路；⌘J 离开前的草稿确认沿用（`LEAVE_EVENT`）。
  - `ReaderHighlights.tsx` 重写为「注释」列表：高亮行（文中顺序，孤立排末）+ 不挂高亮的心得行（新在前）；评论保存 =
    无心得则 `saveNote` + `updateHighlight(note_id)`、有则 `saveNote(previous)`；⋯ 菜单：换色 / 改型 / 删除高亮（一次确认）
    与 整页编辑 / 解除绑定 / 删除心得；`focusHighlight` 聚焦请求；气泡「写评论 / 改评论」= `onOpenPanel` + 聚焦该行；
    `onCount` = 高亮 + 不挂高亮心得。上色 / 点选 / 橡皮 / 撤销逻辑保持。心得列表一次读 100 条（接口上限），不分页。
  - `ResourceDetail.tsx`：Tab 改为「注释 / 信息」；删除 `NotesPanel`、`pendingNote`/`bindSavedNote`/`PENDING_MS` 那套；
    `mark()` 返回 `Highlight | null`；胶囊「记下这段」= 标高亮成功则开右栏 + 聚焦该行评论框，否则引文进顶部框；
    `captureBodySelection` / `markSelection` 交给列表。顶栏「心得」按钮名字不变，角标 = 注释总数。
  - `styles.css`：`.annotation-*` / `.comment-box*` 新规则，删掉旧 `.reader-highlights-list` 等无引用规则。
  - 单测：新 `CommentBox.test.tsx`（6 例）；`ReaderHighlights.test.tsx` 改写 + 新增（混排顺序、评论 POST+PATCH、改评论、
    未挂高亮行的改/删/整页编辑、角标计数、写作框有/无选区、聚焦请求）；`ReaderQuote.test.tsx` 三条全页流程改写；
    `ResourceToolbar/ClassificationPages/NoteEditorPage/ResourceEditor.test.tsx` 选择器改到新框（后两个文件为此补进
    allowed_paths）。
  - e2e：`reader-highlights`（记下这段 → 就地评论配对；顶部框有/无选区两条路）、`pdf-highlights`、`pdf-reader`、
    `reader-layout`、`reader-notes-sidebar`、`notes-pages`（7 条走阅读器面板的流程按「失焦即存」改写；NotesPanel 的
    「操作结果需要核对 → 读取最新」恢复流程在阅读器里不再存在，改为断言不重发 + 文字保留）、`reader-immersive`、
    `resource-edit-pages`（后两个为此补进 allowed_paths）。
- 命令与真实结果（2026-09-29，macOS 本机，Node 22 / Chromium via Playwright）：
  - `cd frontend && npx vitest run` → 40 files / 864 tests passed（首轮候选）；Review 修订后 866 passed。
  - `cd frontend && npx tsc -b && npx eslint . && npx prettier --check src e2e` → 通过（eslint 仅 `PdfReader.tsx:64`
    既有 react-refresh 警告，基线同）。
  - `cd frontend && npx playwright test` → **88 passed (1.3m)**，隔离沙盒真后端；Review 修订后重跑 88 passed (1.2m)。
  - `backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-098-annotation-panel.md --worktree`
    → 首轮候选 `47c4176`：`CHECKS PASS`，`product_fingerprint=3033837b…95f`；Review 修订后：`CHECKS PASS`，
    `files=24 product_fingerprint=400c38e761b7ef2b31f0c68ba6499ddd789c5a72fe889023a424bafe41a76078`。
  - `backend/.venv/bin/python scripts/governance/validate_governance.py` → PASS。
- Review R1（RETURNED）修订摘要：F1 `CommentBox` 补存改为「落地后下一帧由 effect 触发」（`again` 成状态），闭包里的
  `saved`/`onSave` 才是新的，不会再建第二条心得或用旧版本 PATCH；F2 「不配」按钮 `mousedown` 不夺焦点；F3 评论框拿到
  焦点后回 `onFocused` 清掉聚焦请求；F4 写作框提示按实际配对结果说话，高亮建了、心得没存成则撤掉那条高亮再报错；
  F5 删掉残留调试代码；F6 删掉 `.reader-notes .notes-panel` 无引用规则。各补单测（F1 有状态 mock：一次 POST + 一次
  PATCH 心得；F2 `fireEvent.mouseDown` 返回 false；F3 重挂后不再抢焦点；F4 两种失败路径）。
- 已知限制/未完成项：
  - 顶部「写心得…」框**失焦即存**：点去别处（收起、菜单、编辑器）都会把已写的字存成心得——这是草图定的语义，
    也意味着阅读器里不再有「未保存草稿」状态；旧 e2e 里三条「草稿保留」用例据此改成「失焦已存」。
  - 评论 / 心得都是 textarea 就地编辑，不再在右栏里渲染 Markdown 预览（整页编辑器仍有）。
  - 心得超过 100 条的资料，右栏只列前 100 条（接口单页上限）；角标也按这 100 条算。
  - （Review F7）评论框 / 心得框的可访问名取引文前 24 字或心得首行，同前缀的两条会撞名；心得行的名字随内容变。
  - （Review F8）评论保存后父级回填的是 `cleanContent` 结果，末尾空白会在自动保存后被规整掉。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：首轮 `47c4176`（RETURNED）→ 最终 **`66987c1`**（PASS with notes）。
- Review（L2，独立只读 Reviewer 子代理 `.claude/agents/reviewer.md`，仅 Read/Grep/Glob；两轮同一 Reviewer）：

  **R1（候选 `47c4176`）原文**：

  > **只读证明**：本 Agent 仅有 Read/Grep/Glob，无写工具、无 Bash；未改任何文件。
  > **候选/基线**：candidate `47c4176`（fbedf49 + 47c4176），base `cb0cfaa`；按工作区（== 候选）审阅 24 个文件，基线版本无副本，styles.css 删除的旧规则未能逐条比对，只按现存引用核查。
  > **结论：CHANGES_REQUIRED（RETURNED）**——两处写用户数据路径的实际缺陷须修；其余可记录后继续。
  > **Findings**
  > - **F1（必须修复）** `CommentBox.tsx:74-100`：`save()` 的「保存中又改了字 → 回来补存」在 `finally` 里递归调用的是**同一个闭包**，`saved` 与 `onSave` 都是发起首次保存那一帧的旧值。触发：任何一次 `again` 路径。影响：① 挂在高亮下的首条评论：`onSave` 仍是 `row.note === null` 的旧 `saveComment` → **再 POST 一条心得** + 用旧版本 PATCH 高亮 → 409；服务端留下一条重复的孤立心得。② 已有心得：用旧 `note.version` PATCH → **必然 409**。单测用无状态 mock 看不到此问题。建议：`saved`、`onSave` 放进 ref，递归调用前先按新 `saved` 判断；补一条有状态 mock 的单测。
  > - **F2（必须修复）** `AnnotationComposer.tsx:129,135`：点「不配」按钮的 `mousedown` 先让 textarea 失焦 → `submit()` 用当时仍存在的 `anchor` 提交 → **建高亮并配对**。建议：按钮加 `onMouseDown={e => e.preventDefault()}`；补真实点击单测。
  > - **F3（可记录后继续）** `ReaderHighlights.tsx:180-193,582` + `CommentBox.tsx:62-70`：`focusTarget` 消费后不清；`retry()` 时整张 `<ul>` 卸载重挂，CommentBox 的 `lastFocus` 归零 → 该行评论框在**每次列表重读后再次抢焦点**。建议在 `result` 变更时清 `focusTarget`。
  > - **F4（可记录后继续）** `ReaderHighlights.tsx:504-509` + `AnnotationComposer.tsx:100`：`markSelection` 返回 null 时仍只建心得，但文案说「并配到刚标下的那段」；markSelection 成功、saveNote 失败后 anchor 保留，重试会**再建一条同位置高亮**。建议按实际结果决定文案，重试时复用已建高亮或清 anchor。
  > - **F5（必须修复，零成本）** `ReaderQuote.test.tsx:248-256`：残留调试代码进了候选。
  > - **F6（可选）** `styles.css:2858-2865` `.reader-notes .notes-panel` 规则已无对应 DOM，可删。
  > - **F7（可选/记录）** 无障碍：`aria-label` 用引文前 24 字/心得首行，同前缀条目撞名；心得行标签随保存内容变化。
  > - **F8（记录）** CommentBox 保存成功后 `initial` 变为 `cleanContent` 结果并覆盖 `text`，末尾换行/空白会在停笔自动保存后被吃掉。
  > **已核对无问题**：用户规则三条路径实现与 e2e `reader-highlights` 两条、`ReaderQuote.test` 三条相符；`pendingNote/bindSavedNote/PENDING_MS` 无遗留引用；`mark()` 返回值、`captureBodySelection` 的 `cloneRange` 正确；rows 排序/角标/橡皮/撤销/气泡逻辑保持，`detach` 入口与 `notes-pages` 往返 e2e 一致；notes-pages 三条「草稿保留」改「失焦即存」与记录说明一致且断言未降低；改动均在 allowed_paths 内；096/097 MERGED 登记与索引一致。
  > **剩余风险**：F1/F2 修复后需同一 Reviewer 增量复核 `47c4176..new`；F3/F4 若不修应在记录「非阻断遗留项」写明。

  **R2（增量 `47c4176..66987c1`）原文**：

  > **只读证明**：本 Agent 仅 Read/Grep/Glob，无写工具、无 Bash；未改任何文件。
  > **范围**：`47c4176..66987c1` 增量 diff（7 文件）已读并与工作区（== `66987c1`，干净）核对 `CommentBox.tsx`、`ReaderHighlights.tsx` 对应上下文；**继承上一轮**对 base..47c4176 已核对无问题的全部范围。增量未触及这些区域。
  > **结论：PASS with notes（覆盖 `66987c1`）**
  > 上一轮 F1/F2/F5 必须修复项均已闭合；F3/F4/F6 已修，F7/F8 已按非阻断写进「已知限制」。测试证据绑定新候选（vitest 866、e2e 88、`check_task` fingerprint `400c38e7…6078`），未复跑。
  > **逐项核对**
  > - F1 `CommentBox.tsx:81-111`：`again` 改为 state、由 effect `[again, state]` 在落地后触发。时序推演：在飞时置 `again` → effect 因 `inflight` 空转；落地 `setSaved`/`setState` 必然改变 `state` → effect 再跑，此时闭包的 `saved`/`onSave` 来自落地后的渲染。未发现漏存；未发现重复存。新单测用有状态 mock 断言一次 POST + 一次高亮 PATCH + 心得 PATCH `expected_version:1`，真正绑定了缺陷。
  > - F2 `AnnotationComposer.tsx:77-82`：`mousedown` preventDefault，与 `ReaderQuote` 同法；单测断言 `fireEvent.mouseDown(drop) === false` 后只建心得。
  > - F3：清空后该行 `focusToken` 变 0 → effect 早退；父级渲染期消费 `focusHighlight` 受 `seenFocus === token` 守卫，不会重新置 target。**无循环**。单测以 `revision=1` 重挂验证不再抢焦点。
  > - F4 `ReaderHighlights.tsx:506-519`：`saveNote` 失败 → 删刚建高亮（吞掉删除错误）→ `retry()` → 抛原错；composer 文案按 `paired` 说话。单测覆盖「标不成」与「回滚」。
  > - F5/F6：调试残留已删；`.reader-notes .notes-panel` 已删，`.notes-panel` 仍由顶层 NotesPanel 使用，无误删。
  > - 任务记录改动在「实现与测试」段，EVIDENCE 区未动。
  > **Notes（非阻断，可记录）**
  > - N1 `ReaderHighlights.tsx:512`：回滚的 `deleteHighlight` 也失败时（两次连续故障）高亮留在服务端、列表重读后显示为无评论行；用户重试会再标一条。发生需网络在三步中途中断，可接受。
  > - N2 `ReaderHighlights.tsx:516`：`saveNote` 成功但 `updateHighlight` 失败的路径未回滚（心得已建、未配对），重试会再建高亮+心得。罕见双步故障，建议记录。
  > - N3 `CommentBox.tsx:81-83`：`save()` 起手仍按闭包 `saved` 比较；理论上落在「promise 落地 → React 提交」的亚毫秒窗口内可读到旧值。实际可忽略。
  > **剩余风险**：无阻断项；用户本机验收尚待主 Agent 确认。

- Acceptance：L2 N/A。
- 最终状态/风险/用户操作：**ACCEPTED**（L2）。风险不变。待用户本机看过后 push 开 PR → main；用户合并后登记 MERGED。
- 非阻断遗留项：R1 F7/F8（已知限制段）；R2 N1/N2（三步写入中途双重故障可能留下一条未配评论的高亮或一条未配对的心得，重试会多一条）、N3（亚毫秒窗口，可忽略）。
- 日期与决定日志：2026-09-29 用户提出 Zotero 式就地评论 → 规则定案 → Pencil 草图 → 「就这样」→ 登记本任务 → 候选 `47c4176` R1 RETURNED → 修订 `66987c1` R2 PASS with notes → ACCEPTED。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
