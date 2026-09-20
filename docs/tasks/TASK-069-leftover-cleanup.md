# TASK-069：遗留小项清理（068 引文连点丢段 + 063/064 记录项）

```toml
schema_version = 2
id = "TASK-069"
status = "MERGED"
risk = "L2"
risk_reason = "唯一有行为变化的是 TASK-068 F2：`quoteRequest` 从单槽位改成待消费队列，让 `available=false` 瞬态窗口内的连续两次「记下这段」都进草稿，不再被后一次覆盖。改的是既有前端组件间的 prop 形状与消费逻辑（ResourceDetail ↔ NotesPanel），不碰接口、契约、数据含义，按 business 归 L2：独立只读 Review；验收 N/A。其余为文档数字、提示文案、ref 赋值、useMemo、测试清理与注释，单独看是 L1，取最高级按 L2 走一次 Review。"
risk_flags = ["business"]
owner = "coordinator"
base = "63ab98f43bd241537c1b9563fd747d26172893a9"
allowed_paths = [
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ReaderQuote.test.tsx",
  "frontend/src/features/notes/NotesPanel.tsx",
  "frontend/src/features/notes/NotesPanel.test.tsx",
  "frontend/src/features/notes/NoteEditorPage.tsx",
  "frontend/src/features/notes/NoteEditorPage.test.tsx",
  "frontend/e2e/notes-pages.spec.ts",
  "docs/开发与运行.md",
  "docs/tasks/TASK-069-leftover-cleanup.md",
  "docs/tasks/TASK-068-quote-note-progress.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-19 用户问「连点两次记下这段只留最后一段引文是什么意思」，主 Agent 解释 F2 的触发窗口与修法，并问「要我顺手把它和另外几个小遗留打包成一个任务改掉吗」，用户答「**改吧**」。因此本任务范围＝F2 + 主 Agent 在同一句里点名的「另外几个小遗留」，不含任何新产品决定。

### 目标

1. **TASK-068 F2（必须）**：`ResourceDetail` 把引文改成**待消费队列**，`NotesPanel` 按已消费下标一次追加全部未消费引文。`available=false` 的瞬态窗口内连点两次「记下这段」，两段都要进草稿（顺序不变、段间空行），不再只剩最后一段。
2. **TASK-068 F3（可选）**：`ReaderQuote.test.tsx` 里 `vi.spyOn(window, 'getSelection')` 显式 restore，不靠 vitest 的隔离默认值。
3. **TASK-063 F4（记录项）**：`docs/开发与运行.md` 两处心得正文上限 `50,000` → `2,000,000`（TASK-063 已改契约与实现，文档漏改，当时越 allowed_paths）。
4. **TASK-064 F2（记录项）**：编辑页图片占位符说明补一句——跨心得复制占位符文本不带图。
5. **TASK-064 F3（记录项）**：`NoteEditorPage` 的 `load()` 一并把 `note` 写进 `latest.current`，消掉 `.then`→commit 宏任务窗口内 `beforeunload` 以 `note=null` 重复 POST 的理论路径。
6. **TASK-064 F4（记录项）**：`frontend/e2e/notes-pages.spec.ts` 里已不成立的注释（「切换预览触发保存」，实际守卫是轮询）改成实际证明链。
7. **TASK-064 F5（记录项）**：`NotesPanel` 的 `expanded` 用 `useMemo`。
8. 顺带把 **TASK-068 登记为 MERGED**（用户 2026-09-18 合并 PR #76，merge `63ab98f`）并更新索引行。

### 非目标 / 禁止范围

- 不动后端、契约、openapi、迁移；不改渲染器与 XSS 边界；不加快捷键（用户 2026-09-17 决定）。
- 不改「记为学习进度」的直写行为（用户 2026-09-18「不要再返回确认」）。
- 不处理 TASK-064 F1 前提、TASK-051 F2/F3、TASK-052 F3/F4 等不在本次点名范围内的旧记录项。
- 所有未列入 `allowed_paths` 的路径。

### 依赖

无；基线为已合并的 main `63ab98f`。并行：否（主 Agent 亲自实施，唯一写入者）。

## 完成条件

- 新单测：`NotesPanel` 在 `available=false` 期间收到两次引文请求，`available` 回 true 后草稿里**两段引文都在**、顺序为点击顺序；去掉队列改回单槽位时该用例必须变红（判别性）。
- 既有引文用例（单段追加、草稿非空时空一行、删除/保存中作废、同 token 只消费一次、焦点与光标落末尾）保持绿。
- `docs/开发与运行.md` 不再出现 `50,000` 作为心得正文上限。
- `check_task.py --task TASK-069` 必要检查 PASS：lint/format/typecheck 0 问题、vitest 全绿、受影响 e2e 绿。
- L2 独立只读 Reviewer 对 `base..candidate` 最终 diff 给出结论。

## 上下文包

- 规则：`AGENTS.md`（V2）、`frontend/AGENTS.md`；风险分级见 `docs/governance/风险分级与检查规则.md`。
- 源文件：`ResourceDetail.tsx:218-224`（`takeQuote`）、`NotesPanel.tsx:103-122`（渲染期消费 + 聚焦 effect）、`NotesPanel.tsx:61`（`expanded`）、`NoteEditorPage.tsx:82-87`（`load`）、`NoteEditorPage.tsx:541-542`（占位符说明）。
- 遗留项原文：`docs/tasks/TASK-068-quote-note-progress.md`（F2/F3）、`TASK-064-image-placeholders.md`（F2–F5 表）、`TASK-063-note-images.md`（F4）。
- 检查：`python3 scripts/governance/check_task.py --task TASK-069`。

## 实现与测试

- 实现 SHA：`fbaedd9`（控制面登记 `66e7f04`）。变更摘要：
  - **F2（行为）** `ResourceDetail.tsx`：`quoteRequest` 由 `{token, quote}` 改为 `{token, quotes: string[]}`，`takeQuote` 每次追加一段、`token` 即队列长度；组件按 `resourceId` 在 `Screen.tsx:118` 重挂，换资料队列自然清空。`NotesPanel.tsx`：渲染期消费改为 `quotes.slice(quoteConsumed)`，把未消费的按点击顺序一次追加（段间空一行），`deleting/pending` 仍整批作废（与旧单段语义一致），空批不改草稿。
  - **F3（068）** 不需要改代码：spy 由全局 `src/test/setup.ts` 的 `afterEach → vi.restoreAllMocks()` 统一还原；在 `ReaderQuote.test.tsx` 头部注明这条约定，避免下次复审再提。
  - **063 F4** `docs/开发与运行.md:97,123` 两处上限 50,000 → 2,000,000，并点明含内嵌图片的 base64 数据。
  - **064 F2** 编辑页占位符说明补「复制到另一条心得不带图，只显示字面文本」。
  - **064 F3** `NoteEditorPage.load()` 改签名收 `Note`，把 `note` 与草稿/图片表**一起**写进 `latest.current`；两处调用（读取 effect、`reload()`）不再各自 `setNote`，消掉 `.then`→commit 窗口内 `beforeunload` 以 `note=null` 重复 POST 的路径。
  - **064 F5** `NotesPanel` 的 `expanded` 改 `useMemo(…, [draft, gallery])`。
  - **064 F4** `frontend/e2e/notes-pages.spec.ts:549` 注释改为「停笔 1s 的自动保存把这条写出去（不是切换预览触发）」。
- 新测试：`NotesPanel.test.tsx` 新增 1 例「刷新窗口内连点两次引文，按点击顺序全部保留，且同一 token 不重复消费」。**判别性已验**：把消费改回 `quotes.slice(-1)`（等价旧单槽位）→ 该例红（`expected '> 当隐藏层…\n\n' to be '> 神经网络…\n\n> 当隐藏层…\n\n'`），改回队列后绿。
- 命令与结果（本机 macOS 25.5.0，Node 项目内 devDependencies，均在 `fbaedd9` 的工作区）：
  - `npx prettier --write …` 6 个文件 → 仅 `NotesPanel.test.tsx` 重排；`npm run lint`（eslint .）exit=0；`npx tsc --noEmit` exit=0。
  - `npx vitest run` → **29 文件 / 656 用例全绿**（TASK-068 时为 655，+1 即本次新用例）。
  - `npx playwright test` → **66 passed**（与 TASK-068 持平；改动只有一条注释）。
  - `python3 scripts/governance/check_task.py --task docs/tasks/TASK-069-leftover-cleanup.md --worktree` → **CHECKS PASS**（含 lint/format/typecheck/vitest/e2e/build，末条 `npm run build` exit=0）。
- 已知限制/未完成项：队列只在内存里，刷新页面前未消费的引文不保留（与原本单槽位一致，未变差）；`NoteEditorPage` F3 是理论窗口，无法在 jsdom 稳定复现，未新增定向用例，靠既有编辑页用例（读取→自动保存→切换心得→409 覆盖）保持绿作为回归界面。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：`9d08e90`（代码 `fbaedd9`；`fbaedd9..9d08e90` 只有本任务记录一文件、16 增 4 删，无代码改动，故 `fbaedd9` 工作区上跑出的检查结论覆盖本候选）。
- Review：L2 独立只读 Reviewer（`.claude/agents/reviewer.md`），**PASS**。原文摘录：
  > **权限证明**：本次仅持有 `Read` / `Grep` / `Glob` 三个只读工具，无 Write/Edit/Bash，运行器层面无法写入或执行 git。**限制**：因无 Bash，无法执行 `git diff 63ab98f 9d08e90`，我按工作树读取全部 allowed_paths 文件逐一核对；候选 SHA 与工作树一致性请主 Agent 自行确认。
  > F2 队列：token 恒等于 `quotes.length`，`slice(quoteConsumed)` 消费后立即 `setQuoteConsumed(token)`，同 token 不二次消费；`available=false` 留着不烧、`deleting/pending` 整批作废、`fresh.length===0` 不动草稿，均正确。渲染期 setState 只写本组件 state 且条件下一帧即假，无 "Too many re-renders"。换资料不串段：`Screen.tsx:118` 与 `ResourceDetail.tsx:440` 两层 key，队列与 `quoteConsumed` 同时归零。新单测同一棵树 rerender、断言全值与顺序，判别性成立（改 `slice(-1)` 必红），非假绿。
  > 064 F3：`load()` 一次性写 `draft/gallery/note` 且保留 `save`；`reload()` 路径下 ref 的 `save` 短暂仍是 `conflict`，而 `flush()` 对 conflict 直接返回，不会误写；`overwrite()`/`beforeunload`/卸载保底/`stale()` 语义未变，未见新竞态或丢状态。
  > 小项：文档两处 2,000,000 与 `MAX_CONTENT = 2_000_000` 一致、已无 50,000；占位符提示、`expanded` useMemo、e2e:549 注释均与实现相符。未发现越 allowed_paths、skip/only 或降低断言。
  > Findings（均非阻断）：1. 完成条件措辞略宽于实际覆盖（`quoteRequest` 只有本次新增这一条用例）；2. 索引行仍 READY，与记录 IN_REVIEW 不一致；3. 批次被 `deleting/pending` 作废时仍推进 `quoteConsumed` 并触发聚焦（与旧单槽位同形，未变差）；4. `slice(quoteConsumed)` 依赖「token === quotes.length」的跨组件隐式不变量。
  > 剩余风险：低。未消费引文仍只在内存、刷新即失（与旧行为一致）；F3 属理论窗口，无定向用例。我未重跑检查，采信记录中的 vitest 656 / e2e 66 / CHECKS PASS；如候选相对 `fbaedd9` 另有代码改动需重跑。
- Reviewer 提的候选一致性：已核对 `git diff --stat fbaedd9 9d08e90` 只含本记录一文件，工作树与 `9d08e90` 无差异，检查证据成立。
- Acceptance：L2，N/A。
- 最终状态/风险/用户操作：**MERGED**——2026-09-19 用户已合并 PR #77，merge commit `44eb28a`（登记并入 TASK-070 控制面）。风险低：唯一行为变化是引文队列，覆盖有判别性用例；其余为文档/文案/注释/性能与一处 ref 赋值。
- 非阻断遗留项（Review findings 处置）：
  - F1 **记录**：完成条件里「既有引文用例……保持绿」措辞宽于实际——`quoteRequest` 的自动化覆盖只有本次新增的一条（删除/保存中作废、焦点落末尾等分支无定向用例）。与 TASK-068 持平、未变差；按规则证据写回不改标记区外的完成条件，改在此处如实记下。重评触发：下次再动引文链路时补齐分支用例。
  - F2 **已修**：索引行状态同步为 ACCEPTED。
  - F3 **记录**（可选）：引文批次被 `deleting/pending` 作废时仍推进 `quoteConsumed` 并触发一次聚焦，删除/保存结束后焦点会落进写作框——与旧单槽位同形，用户至今未反馈；改动它会牵动 TASK-045/051 两轮复审守住的焦点形态，成本大于收益。重评触发：用户反馈删除后焦点被抢。
  - F4 **记录**（可选）：`token === quotes.length` 是 ResourceDetail 与 NotesPanel 之间的隐式不变量（两处均有注释）；若将来队列要裁剪，必须两处同改。
- 日期与决定日志：2026-09-19 用户「改吧」→ 登记 TASK-069 → 实现 `fbaedd9` → 冻结候选 `9d08e90` → L2 独立 Review PASS（4 条非阻断）→ ACCEPTED → 2026-09-19 用户合并 PR #77，MERGED。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
