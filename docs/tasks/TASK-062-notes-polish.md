# TASK-062：心得页收口（去页内写入口、摘要与文案）+ 阅读器「整页编辑」入口 + 心得遗留 findings

```toml
schema_version = 2
id = "TASK-062"
status = "IN_PROGRESS"
risk = "L2"
risk_reason = "只改前端：「我的心得」页去掉页内写入口并修摘要/文案；阅读器侧栏心得卡加「整页编辑」链接；补 TASK-060 F3（⌘J 绕过侧栏脏草稿确认）与 F7（编辑页切换 noteId 不先保存）、TASK-061 F2（删除模态 Esc/焦点）与 F3（`?note=` 失配提示）。动的是「写/回看心得」核心路径上的导航守卫与保存时序，需独立 Reviewer 看最终 diff；不改后端与契约，不到 L3。"
risk_flags = ["business"]
owner = "coordinator"
base = "58e48312e58fe112431502619343a58411bc6d85"
allowed_paths = [
  "frontend/src/App.tsx",
  "frontend/src/features/notes/NotesPage.tsx",
  "frontend/src/features/notes/NotesPage.test.tsx",
  "frontend/src/features/notes/NotesPanel.tsx",
  "frontend/src/features/notes/NotesPanel.test.tsx",
  "frontend/src/features/notes/NoteEditorPage.tsx",
  "frontend/src/features/notes/NoteEditorPage.test.tsx",
  "frontend/src/features/notes/noteTitle.ts",
  "frontend/src/features/notes/noteTitle.test.ts",
  "frontend/src/shell/pages.ts",
  "frontend/src/styles.css",
  "frontend/e2e/notes-pages.spec.ts",
  "docs/tasks/TASK-061-notes-manager.md",
  "docs/tasks/TASK-062-notes-polish.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-15 用户合并 PR #69 后原话：「我的心得页面就做成心得查询即可，不用预留写心得接口」；「写心得好像目前只能写文字，不能粘贴图片……并进下个任务一起做即可」。主 Agent 反问后用户选定图片存法为「直接内嵌进正文（base64）」——该项需要放宽后端正文上限（契约改动，`docs/contracts/**` 属高风险路径），**拆为 TASK-063（L3）**，本任务只做前端收口与遗留 findings。

主 Agent 用 7 条模拟心得实跑心得页时另发现两处：表格心得的摘要显示成 `| 函数 | 用途 | --- |`；标题下方文案「独立记下此刻的理解与疑问，不先绑定资料」仍是旧写作页的说法。

### 目标

1. **心得页只做查询与管理**：去掉列表工具行的「写心得」按钮与空态的「写一条」链接；空态改为提示用左侧「写心得」或快捷键。`pages.ts` 里 `/notes` 的 caption/description 改为管理页说法。写心得入口保留侧栏按钮与 ⌘J/Ctrl+J（用户未要求去掉）。
2. **摘要修正**（`noteSnippet`）：跳过表格行（`|` 开头）与代码围栏行（```），去掉任务列表标记（`[ ]`/`[x]`）；标题与摘要对图片引用只留替代文字（已有）。
3. **阅读器侧栏「整页编辑」**：`NotesPanel` 绑定模式的每张心得卡加链接「整页编辑」→ `/notes/<id>?resource=<resourceId>`（编辑页返回处即该资料）。独立模式（已无页面使用）不动。
4. **TASK-060 F3**：⌘J 触发导航前先派发可取消的 `studypilot:leave` 事件；`NotesPanel` 有脏草稿时按既有 `discardAllowed()`（`window.confirm`）决定，用户取消则不导航。
5. **TASK-060 F7**：编辑页 `noteId` 从一条既有心得切到另一条时先 `flush()` 旧的；保存回调只在「手里仍是那条」时写状态（不把旧心得写回新地址）。
6. **TASK-061 F2**：心得页删除模态补 Escape 关闭、打开时焦点落在「取消」、关闭后焦点还给触发按钮（与 `ResourceDeleteDialog` 同规矩，不引入 inert/门户以控制范围）。
7. **TASK-061 F3**：`?note=` 指向已加载列表里没有的心得（已绑定/已删/未加载页）时，右栏给一句提示并附「直接打开」→ `/notes/<id>`，不再静默显示「从左边选一条」。
8. 测试：每项有单测直证；e2e 顶层心得页用例去掉对页内「写心得」的依赖（本就走编辑器）。

### 非目标

- 图片粘贴与正文上限放宽（TASK-063）。
- 不改后端/契约；不动 `NotesPanel` 独立模式；不改 ⌘J 键位。
- 不做「所有心得（含绑定）一页看全」。

### 顺带完成的状态登记

`TASK-061-notes-manager.md`（PR #69，merge `58e4831`）登记 MERGED，索引同步。

## 完成条件

1. 目标 1–7 各有单测；对「⌘J 不派发离开事件」「切换 noteId 不 flush」「Esc 不关模态」「摘要不跳过表格行」等至少三处变红（记录）。
2. 既有单测/e2e 通过；`check_task` frontend PASS；`git diff --check` exit 0。
3. L2 独立只读 Review PASS。

## 上下文包

- `NotesPage.tsx`（TASK-061）、`NotesPanel.tsx`（脏草稿守卫 `discardAllowed`、绑定模式心得卡）、`NoteEditorPage.tsx`（`latest` ref、`flush`、读取 effect 的 `note?.id === noteId` 守卫）、`App.tsx`（⌘J 处理器）、`ResourceDeleteDialog.tsx`（模态焦点规矩）。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-062-notes-polish.md --worktree`。

## 实现与测试

- **实现 SHA**：`570e5cb`（11 个前端文件，+269/−31；登记提交 `fe7be8f` 只含本记录）。**检查绑定 `570e5cb`**（候选 SHA 见 EVIDENCE 区）。
- 改动摘要（按目标）：
  1. `NotesPage.tsx` 去掉列表工具行「写心得」与空态「写一条」（空态文案改为「用左侧『写心得』或快捷键记一条」）；`pages.ts` `/notes` caption 改「回看、搜索与整理独立心得；写新的用左侧『写心得』或快捷键」。
  2. `noteTitle.ts` `noteSnippet`：过滤 `|`/```/~~~ 开头的行，去掉 `[ ]`/`[x]` 勾选框。
  3. `NotesPanel.tsx` 绑定模式心得卡加 `<Link>`「整页编辑」→ `/notes/<id>?resource=<scope>`。
  4. `pages.ts` 导出 `LEAVE_EVENT = 'studypilot:leave'`；`App.tsx` ⌘J 处理器在 `navigate` 前 `document.dispatchEvent(new CustomEvent(LEAVE_EVENT, { cancelable: true }))`，被 `preventDefault` 即不导航；`NotesPanel` 在 `dirty` 时监听该事件，`window.confirm` 否则 `preventDefault`（只在 dirty 时挂监听，干净时零开销）。
  5. `NoteEditorPage.tsx`：读取 effect 在 `latest.current.note` 存在且换到另一条时先 `flushRef.current()`（flush 定义在后，经 ref）；`flush` 内新增 `stale()`（手里的 note id ≠ 这次保存的 current id），`then/catch` 命中即不写状态；`finally` 在 `saved` **或 stale** 时补排一次（新那条在旧保存占着 inflight 期间的键入不丢；stale 只发生一次，不构成循环）。实跑发现：卸载保底 effect 依赖 `flush`，而 `flush` 依赖 `navigate`（非数据路由下每次导航换身份），所以切换时保底 effect 的清理**本来就会 flush 一次**——显式预 flush 保留作为意图声明（inflight 去重），真正的缺陷是慢返回落到新那条上（`stale` 守卫，见变红 R3）。
  6. `NotesPage.tsx` 删除模态：打开时焦点到「取消」（ref），Esc 关闭（`pending` 时不关），关闭后焦点还给「删除」按钮（effect 清理）。
  7. `NotesPage.tsx` `missing = selectedId && !loading && !error && !selected` → 右栏 `role="status"` 提示 + 「直接打开」→ `/notes/<id>`。
- **单测**（frontend 606 = 基线 600 + 6）：`NotesPage.test.tsx` +2（Esc/焦点；`?note=` 失配提示）、既有两条改断言（页内无写入口、空态文案）；`NotesPanel.test.tsx` +1（整页编辑链接 + 离开事件：干净放行不问、脏时 confirm=false 拦住且草稿仍在、confirm=true 放行）；`NoteEditorPage.test.tsx` +2（阅读器脏草稿按 ⌘J：confirm=false 留在阅读器、草稿仍在，confirm=true 进编辑页；切换 noteId：旧那条以旧版本号 PATCH，慢返回在新那条读入后才回来也不覆盖，再键入的 PATCH 落在新那条、版本 1）；`noteTitle.test.ts` +1（表格/围栏/勾选框）。
- **e2e**（62 passed，数量不变）：顶层心得页用例改为断言页内无写入口、从侧栏进编辑器；后贴往返用例补「整页编辑」链接 href（`/notes/<id>?resource=<rid>`）→ 编辑页内容正确 → 「返回资料」回到该资料。
- **判别性变红**（各破坏一处后跑对应测试文件，随后恢复）：R1 ⌘J 不派发离开事件 → `NoteEditorPage.test` 1 红；R3 `stale = () => false`（慢返回落到新那条）→ `NoteEditorPage.test` 1 红（第二次 PATCH 打到旧 id）；R4 Esc 不关模态 → `NotesPage.test` 1 红；R5 `missing = false` → `NotesPage.test` 1 红；R6 摘要不过滤表格行 → `noteTitle.test` 1 红。**R2**（去掉显式预 flush）**不红**——原因如上（卸载保底 effect 的清理已 flush），如实记录。
- **检查**：`check_task.py --task … --candidate 570e5cb` **CHECKS PASS**（format/lint/typecheck/test 606/build）；`git diff --check 58e4831 570e5cb` exit 0。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

（实施后填写）
<!-- EVIDENCE:END -->
