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

（实施后填写）

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

（实施后填写）
<!-- EVIDENCE:END -->
