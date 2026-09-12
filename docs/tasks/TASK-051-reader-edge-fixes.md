# TASK-051：阅读页三个已登记边缘缺陷（替换正文失败态 / Esc 死键 / 聚焦令牌）

```toml
schema_version = 2
id = "TASK-051"
status = "IN_REVIEW"
risk = "L2"
risk_reason = "修三个已由独立 Review/验收登记为「非阻断、可后续修」的阅读页缺陷，全部是同一页面（/resources/:id）的交互边缘：① 正文读取失败时菜单仍有「替换/粘贴正文」且点击令牌悬置迟到重放（TASK-046 遗留 I）；② 心得侧栏 + ⋯ 菜单叠开时第二下 Esc 不关侧栏（TASK-045 遗留 1「死键」）；③ 心得聚焦令牌在资料刷新窗口被烧掉而未聚焦（TASK-045 复审 R2 finding 3）。不改公共 API、后端、契约、数据含义与门禁；不引入依赖。判 L2 而非 L1：② ③ 触及已确立的无障碍焦点契约（Esc 归还、聚焦一次不抢焦点），改错了屏幕上看不出来，需要独立 Reviewer 看最终 diff 与测试是否真守得住。不到 L3：无架构/契约/迁移/认证变更。"
risk_flags = ["business"]
owner = "coordinator"
base = "adb030459bff47ac147059be4a3cace720f9db00"
allowed_paths = [
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ResourceToolbar.tsx",
  "frontend/src/features/resources/ContentSnapshot.tsx",
  "frontend/src/features/notes/NotesPanel.tsx",
  "frontend/src/features/resources/ResourceToolbar.test.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/features/notes/NotesPanel.test.tsx",
  "docs/tasks/TASK-050-reader-screenshot.md",
  "docs/tasks/TASK-051-reader-edge-fixes.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-12 用户合并 PR #58 后，主 Agent 解释了三项遗留候选（② 窄屏顶栏瘦身 / ③ 替换正文失败态 / ④ Esc 死键与聚焦令牌），用户指示「先做两个小的任务」，即 ③ 与 ④（④ 含两个子项）。主 Agent 建议合为一个任务（同一页面、同一批测试），本记录即该任务。② 窄屏顶栏瘦身**不在本任务内**，待用户另定形态。

### 三个缺陷的登记出处与现状核对

1. **替换正文失败态**（`docs/tasks/TASK-046-immersive-reader.md` 遗留 I）：`ContentSnapshot.tsx:206-209` 读取失败（`unreadable`）时不回传 `onSnapshotState`，父级 `snapshotExists` 停在 `null`；`ResourceToolbar.tsx:259-266` 的「替换正文/粘贴正文」项无条件渲染；`ContentSnapshot.tsx:219` 令牌只在 `result && !unreadable` 时消费。结果：失败态点该项无反应，请求悬置，等一次成功的「重新读取正文」后编辑表单突然打开。
2. **Esc 死键**（`docs/tasks/TASK-045-notes-sidebar.md` 遗留 1）：`ResourceDetail.tsx:149-152` 守卫「焦点在 `.reader-toolbar, .reader-panel` 内且非心得区、非心得按钮 → 让给表面自身」，对**没有表面打开**的工具条普通控件也 defer。结果：侧栏 + 菜单叠开，第一下 Esc 关菜单、焦点回 ⋯ 触发钮，第二下 Esc 不关侧栏。
3. **聚焦令牌被提前烧掉**（`docs/tasks/TASK-045-notes-sidebar.md` 复审 R2 第 3 条「新盲点」）：`NotesPanel.tsx:75-79` 在 `available/deleting/pending` 守卫**之前**就 `lastFocusRequest.current = focusRequest`；点击若落在父级刷新的 `available=false` 窗口，令牌被记为已消费而未聚焦，`available` 回来后不补焦。

### 目标

1. 正文读取失败时，⋯ 菜单里不出现「替换正文/粘贴正文」（源码切换与删除正文本就依赖 `snapshotExists`，一并不出现）；读取中点下的「替换正文」若最终读取失败，令牌**作废**而不是等下次成功后重放。读取成功后行为与现状一致。
2. 侧栏 + 菜单叠开：第一下 Esc 关菜单并把焦点还给 ⋯（现状保持），**第二下 Esc 关侧栏并把焦点还给「心得」按钮**。焦点在**正打开的**菜单项 / 面板内 / 打开态触发钮上时仍让给该表面（既有两条用例保持通过）。
3. `focusRequest` 在 `available=false` 期间到达时**保留**，`available` 回 true 即聚焦一次；同一令牌仍只消费一次（既有 F1 回归用例保持通过）；`deleting/pending` 期间到达的请求维持现状（立即作废，不在用户操作别的东西之后抢焦点）。
4. 每个修复各配一条**判别性**单测：把实现还原为旧逻辑该用例必须变红（在记录里写明验证方式）。
5. 既有前端单测与 e2e 全部通过，断言只增不减。

### 非目标

- 不做窄屏顶栏瘦身（A/F7）、不改浮层定位、不改任何样式。
- 不改后端、契约、门禁、扩展；不改 `snapshotMarkdown.ts`、`ResourceDeletion.tsx`、`NotesPage.tsx`。
- 不引入 focus-trap 之类依赖；不改 `package.json` 与锁文件。
- 不把 `deleting/pending` 期间的聚焦请求也改为延后（那正是 F1 修掉的「事后抢焦点」形态）。

### 顺带完成的状态登记

`docs/tasks/TASK-050-reader-screenshot.md` 在 `allowed_paths` 内，仅用于把 `status` 由 `ACCEPTED` 登记为 `MERGED`（2026-09-12 用户合并 PR #58，merge `adb0304`，已用 `gh pr view 58` 与 `git log origin/main` 双向核实），并同步索引该行。

## 完成条件

1. 目标 1：`ResourcePages.test.tsx`（正文快照的既有用例都在这里，登记时误写为 `ContentSnapshot.test.tsx`，实现前修正 `allowed_paths`）新增用例——快照读取失败时菜单无「替换正文/粘贴正文/看 Markdown 源码/删除正文…」；读取中点「替换正文」后读取失败、再重试成功，编辑表单**不**自动打开。
2. 目标 2：`ResourceToolbar.test.tsx` 新增用例——侧栏 + 菜单叠开，两下 Esc 后侧栏 `aria-expanded=false` 且焦点在「心得」按钮；既有「菜单 own Esc」「面板 own Esc」两条不改且通过。
3. 目标 3：`NotesPanel.test.tsx` 新增用例——`focusRequest=1` 与 `available=false` 同时到达，写作框未聚焦；`available` 翻 true 后写作框聚焦；再翻 false→true 不再重新聚焦。
4. 每条新用例对旧逻辑变红（记录验证过程）。
5. `check_task.py --candidate <SHA>` 的 frontend profile PASS（lint/typecheck/单测/build）；`npm run test:e2e` 全部通过（基线 55）。
6. L2 独立只读 Reviewer 对 `base..candidate` 最终 diff 出 PASS。

## 上下文包

- 规则：`AGENTS.md` §4/§5/§6，`docs/governance/风险分级与检查规则.md`（L2）。
- 出处：TASK-045 记录第 184-189、205 行；TASK-046 记录遗留 I 与 R1 finding 5。
- 代码：上文「现状核对」列出的行号。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-051-reader-edge-fixes.md --worktree`；`cd frontend && npm run test -- --run && npm run test:e2e`。

## 实现与测试

- **实现 SHA**：`8bcdb82`（实现 + 测试同一提交）；`9efb8f4` 仅把记录里的 `base` 改成完整 SHA（检查脚本要求）。
- **变更摘要**（`git diff --numstat adb0304..8bcdb82`，7 个前端文件 +174/−35）：
  - `ContentSnapshot.tsx`（+22/−9）：新增导出类型 `SnapshotState = { unreadable: true } | { unreadable: false; exists }`；`onSnapshotState` 读取失败时也回传；`editRequest` 令牌在 `result` 到达即记为已消费，只有 `!unreadable` 才开表单（失败即作废，读取中仍留着等读到）。
  - `ResourceDetail.tsx`（+22/−15）：父级改存 `snapshotState`，派生 `snapshotExists`（失败时为 `null`）与 `snapshotUnreadable` 传给工具条；Esc 守卫改为「焦点在心得区/心得按钮 → 关；焦点在 `.reader-menu`/`.reader-panel` 内或停在 `aria-expanded="true"` 的触发钮上 → 让给该表面；其余 → 关」。
  - `ResourceToolbar.tsx`（+21/−9）：新增可选 prop `snapshotUnreadable`（默认 false，既有用法不传）；为 true 时不渲染「替换正文/粘贴正文」（看源码/删除本就依赖 `snapshotExists`，失败时为 `null` 一并不出现）。
  - `NotesPanel.tsx`（+7/−1）：`focusRequest` 令牌在 `!available` 时**不记为已消费**、直接返回，`available` 回 true 后 effect 重跑即聚焦；`deleting/pending` 仍立即作废（保持 F1 修法）。
- **新增用例（4 条）与判别性验证**（把实现还原为旧逻辑后实跑，均变红；随后恢复）：
  1. `ResourcePages.test.tsx`「offers none of the body actions while the body cannot be read」：快照 `NETWORK_ERROR` → 菜单无「粘贴/替换正文、看 Markdown 源码、删除正文…」，对照「编辑资料」仍在。还原（`{true && (`）→ 红（`expected … to be null`）。
  2. `ResourcePages.test.tsx`「drops a replace request that was pending when the read fails…」：用 Promise 闸门让首次读取悬着 → 读取中点「粘贴正文」→ 放行并失败 → 无表单 → 点「重新读取正文」成功 → **仍无表单**、正文渲染。还原令牌守卫（`&& !unreadable`）→ 红（重试成功后表单弹出、正文被顶掉）。
  3. `ResourceToolbar.test.tsx`「closes the notes sidebar on the second Escape once the menu is gone」：侧栏 + 菜单叠开 → Esc 关菜单、焦点回 ⋯、侧栏仍开 → **再 Esc** → 侧栏 `aria-expanded=false`、焦点在「心得」。还原守卫（`closest('.reader-toolbar, .reader-panel')`）→ 红。
  4. `NotesPanel.test.tsx`「holds a focus request that lands while the resource is being re-read, then honours it once」：`focusRequest=1` 与 `available=false` 同时到达 → 未聚焦 → `available` 翻 true → 聚焦 → blur → 再翻 false→true → 不再聚焦。还原（守卫前烧令牌）→ 红。
- **既有用例的改动（1 条，断言只增不减）**：`NotesPanel.test.tsx`「focuses the composer once per request and never steals it back…」原以 `renderWithRouter` 挂载、之后 `rerender` 不带 Router——根元素类型一变整棵重挂、ref 归零，旧逻辑靠「重挂后在 `available=false` 时烧掉令牌」通过，而不是靠「同一令牌只消费一次」；改为全程 `render` 一棵树，并把注释里已写明的「用户已把焦点挪到别处」真的做出来（显式 `blur()`）。断言未删未弱化。判别性：还原到 F1 之前的逻辑（无令牌、翻转即聚焦），该用例与新用例 4 同时变红。
- **登记后修订授权范围（实现前）**：正文快照的既有用例都在 `ResourcePages.test.tsx`，登记时误写为 `ContentSnapshot.test.tsx`，`allowed_paths` 已替换（同一提交内如实写在完成条件 1）。
- **检查（候选 `9efb8f4`，干净工作区）**：`check_task.py --candidate HEAD` → `STATIC PASS`，`risk=L2 stages=('worker','review')`，`files=8`，`product_fingerprint=dbd01591…`，`profiles=frontend`：`format:check` exit 0、`lint` exit 0、`typecheck` exit 0、`test --run` **552 passed / 23 files**（基线 548 + 新增 4）、`build` exit 0 → **CHECKS PASS**。`git diff --check adb0304..HEAD` exit 0。`npm run test:e2e` → **55 passed (35.4s)**，与基线 55 持平（本任务不改 e2e）。
- **已知限制**：
  1. Esc 守卫的「打开态触发钮」判据是 `aria-expanded="true"`，依赖工具条各触发钮都正确维护该属性（现有三处：学习状态、⋯、原件/粘贴原文均有）；新增触发钮若漏写该属性，焦点停在它上面按 Esc 会关侧栏而不是它的表面——这是可接受的退化方向（多关一层，不抢焦点）。
  2. 修复 1 只覆盖「替换正文」令牌；「删除正文」令牌本就以 `snapshot` 存在为守卫，失败态菜单也不渲染该项，不需要改。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：**待冻结**——本提交之后的 HEAD 即候选，精确 SHA 在 Review 写回时补记（提交无法引用自身）。
- Review：待派独立只读 Reviewer（`.claude/agents/reviewer.md`，仅 Read/Grep/Glob）审 `adb0304..候选` 完整 diff。
- Acceptance：L2，N/A。
- 最终状态/风险/用户操作：status=**IN_REVIEW**。
<!-- EVIDENCE:END -->
