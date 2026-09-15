# TASK-064：编辑框里内嵌图片只显示短占位符（`![图片](image:N)`），预览/保存时回填

```toml
schema_version = 2
id = "TASK-064"
status = "IN_PROGRESS"
risk = "L2"
risk_reason = "只改前端两个编辑器的「显示层」：textarea 里把 base64 data URI 折叠成短占位符，预览与保存前展开回原文。存进后端的内容、契约、渲染器都不变。动的是自动保存/冲突/对比的输入源（折叠 ↔ 展开必须严格可逆，否则会把图片丢掉或把占位符存进后端），需独立 Reviewer 看最终 diff；不到 L3。"
risk_flags = ["business"]
owner = "coordinator"
base = "f4cd190a2a2b0903ed6a5971a08774380ca381be"
allowed_paths = [
  "frontend/src/features/notes/noteImages.ts",
  "frontend/src/features/notes/noteImages.test.ts",
  "frontend/src/features/notes/NoteEditorPage.tsx",
  "frontend/src/features/notes/NoteEditorPage.test.tsx",
  "frontend/src/features/notes/NotesPanel.tsx",
  "frontend/src/features/notes/NotesPanel.test.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/notes-pages.spec.ts",
  "docs/tasks/TASK-063-note-images.md",
  "docs/tasks/TASK-064-image-placeholders.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-15 用户在本机试用 TASK-063 后原话：「我粘贴了图片之后会显示一串很长的文字 `![图片](data:image/webp;base64,…)`，这样很影响书写，可以怎么解决」。主 Agent 提出「编辑框只显示短占位符、真正的数据在预览/保存时回填」并直接开做（不改存法）。

### 依赖

建立在 TASK-063（PR #71，候选 `9cb9987`，L3 已 ACCEPTED，**待用户合并**）之上：`noteImages.ts`、编辑器粘贴链路、`displayText` 都来自它。本任务分支从 TASK-063 分支尖 `f4cd190` 创建；PR #71 合并后本分支对 main 的 diff 只含本任务。

### 目标

1. `noteImages.ts` 新增严格可逆的一对函数：`collapseImages(content) → { text, images }`（把每个 `![alt](data:image/…;base64,…)` 换成 `![alt](image:N)`，N 从 1 起按出现顺序编号，data URI 存进 `images[N-1]`）与 `expandImages(text, images)`（把 `![alt](image:N)` 换回；N 不存在的原样保留）。对任意合法正文 `expandImages(...collapseImages(c)) === c`。
2. `NoteEditorPage`：`draft` 改为折叠后的文本，图片表 `gallery` 为 state 并同步进 `latest` ref；读取/重新读取/覆盖/新建重置都经折叠；`flush` 的内容比较与发送、`tooLong` 与「含图片约 N MB」估算、预览渲染都用展开后的正文；粘贴/拖入插入的是 `![图片](image:N)`（N = 追加后的序号）；标题仍取自折叠文本（alt 不变）。有图片时写作框下方一行提示「图片在这里显示为 `![图片](image:N)` 占位，预览和保存时会还原」。
3. `NotesPanel`（阅读器侧栏 / 绑定心得）：编辑既有心得时同样折叠；`dirty`、长度校验、`saveNote` 都按展开内容；重置/转新心得时图片表随之处理。侧栏不接粘贴图片（TASK-063 非目标不变），只是别把 base64 铺进 textarea。
4. 用户手工删掉占位符 = 删掉那张图（保存后正文里没有它）；手工把占位符复制成两份 = 两处同一张图。这是占位符语义，记进说明。
5. 测试：`noteImages.test` 往返/编号/未知编号/alt 含特殊字符；编辑器：读取含图心得后 textarea 只有占位符、保存发出的是展开正文、粘贴插入占位符、删占位符后保存不含该图、超限估算按展开算、预览有 `<img src=data:>`；`NotesPanel`：编辑含图心得 textarea 无 base64、保存展开、`dirty` 判断不受折叠影响；e2e 在 TASK-063 的粘贴用例上加断言：textarea 值是 `![图片](image:1)` 而非 base64，服务端读回仍是 data URI。

### 非目标

- 不改存法、契约、后端、渲染器；不做所见即所得。
- 不给侧栏快速心得框加粘贴图片。
- TASK-063 遗留 F4（`docs/开发与运行.md` 两处 50,000）不在本任务路径，仍留待后续；F7（非图片文件拖入提示）顺带做——`onDrop` 在 `draggingFiles` 为真但无图片时 `preventDefault` 并提示「只支持 PNG、JPEG、GIF 或 WebP 图片」。

### 顺带完成的状态登记

PR #71 若在本任务收尾前合并，`TASK-063-note-images.md` 登记 MERGED，索引同步；否则保留待登记说明。

## 完成条件

1. 目标 1–3 各有单测直证；至少三处判别性变红（展开不回填、粘贴仍插 data URI、侧栏保存发送折叠文本等）。
2. 既有单测/e2e 通过；`check_task` frontend PASS；`git diff --check` exit 0。
3. L2 独立只读 Review PASS。

## 上下文包

- `noteImages.ts`（`imageToMarkdown`、`inlineImageBytes`、`draggingFiles`）、`NoteEditorPage.tsx`（`latest` ref、`flush`、`insertAtCursor`、状态栏）、`NotesPanel.tsx`（`draft`/`selected`/`dirty`/`submit`）。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-064-image-placeholders.md --worktree`。

## 实现与测试

（实施后填写）

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

（实施后填写）
<!-- EVIDENCE:END -->
