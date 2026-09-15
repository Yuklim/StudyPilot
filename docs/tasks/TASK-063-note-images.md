# TASK-063：心得粘贴图片（base64 内嵌进正文）+ 心得正文上限放宽（契约 + 迁移）

```toml
schema_version = 2
id = "TASK-063"
status = "IN_PROGRESS"
risk = "L3"
risk_reason = "放宽已批准公共契约（`Note.content` 上限 50,000 → 2,000,000 字符；`docs/contracts/**` 与 `openapi-v1.json` 同步）并新增 0006 迁移改写 `notes` 表的 CHECK；前端编辑器接受粘贴/拖入图片，压缩后以 data URI 内嵌进 Markdown，渲染器放行 `data:image/*;base64`。命中 public-api + migration + critical-data，走 L3：独立只读 Reviewer + 独立只读 Integration/Acceptance。"
risk_flags = ["public-api", "migration", "critical-data", "business"]
owner = "coordinator"
base = "4edcc27143eaace84de4f07a45e6cbc37e65f415"
allowed_paths = [
  "backend/src/studypilot/modules/notes/contracts.py",
  "backend/src/studypilot/infrastructure/database/models.py",
  "backend/migrations/versions/0006_note_content_limit.py",
  "backend/tests/test_notes.py",
  "backend/tests/test_migrations.py",
  "backend/tests/test_database.py",
  "docs/contracts/API与数据契约基线.md",
  "docs/contracts/openapi-v1.json",
  "frontend/src/features/notes/api.ts",
  "frontend/src/features/notes/api.test.ts",
  "frontend/src/features/notes/noteImages.ts",
  "frontend/src/features/notes/noteImages.test.ts",
  "frontend/src/features/notes/noteTitle.ts",
  "frontend/src/features/notes/noteTitle.test.ts",
  "frontend/src/features/notes/NoteEditorPage.tsx",
  "frontend/src/features/notes/NoteEditorPage.test.tsx",
  "frontend/src/features/notes/NotesPage.tsx",
  "frontend/src/features/notes/NotesPage.test.tsx",
  "frontend/src/features/notes/NotesPanel.tsx",
  "frontend/src/features/notes/NotesPanel.test.tsx",
  "frontend/src/features/resources/snapshotMarkdown.ts",
  "frontend/src/features/resources/snapshotMarkdown.test.ts",
  "frontend/src/styles.css",
  "frontend/e2e/notes-pages.spec.ts",
  "docs/tasks/TASK-062-notes-polish.md",
  "docs/tasks/TASK-063-note-images.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

### 用户授权

2026-09-15 用户原话：「写心得好像目前只能写文字，不能粘贴图片」。主 Agent 反问存法，用户选定 **「图片直接内嵌进正文」**（base64 写进 Markdown，不新增图片接口；已告知代价：列表页一次拉多条正文会变慢、数据库膨胀）。主 Agent 在 TASK-062 汇报里给出的具体参数（最长边 1600px、WebP 压缩、正文上限 200 万字符、单张压缩后上限约 600 KB）用户未反对，作为主 Agent 假设登记，可在实际使用后调整。

### 契约事实与变更性质

- 现契约 4.8：`content` 去首尾后 1～50,000。1.2 节：v1 内**放宽既有输入**不属破坏性变更（禁止的是收紧）。本任务把上限放宽到 **2,000,000 字符**；`min_length`、去首尾、不空、版本化写全部不变。
- 存储：`notes.content` 是 `Text`，但 0001 迁移写死了 `ck_notes_content_length`（`length(content) BETWEEN 1 AND 50000`）→ 需 **0006 迁移**（SQLite batch 重建表改 CHECK），模型 `bounded_length("content", 1, 2_000_000)` 同步。运行时不自动迁移（既有规则），用户本机由启动脚本 / `alembic upgrade head` 升级。
- 渲染：正文渲染器（`snapshotMarkdown.ts`）对图片地址只放行 http(s) 与已冻结资产，`data:` 一律拒绝并显示替代文字；markdown-it 自身的 `validateLink` 允许 `data:image/(gif|png|jpeg|webp);base64`。本任务给渲染器加**显式选项** `inlineImages`，只有心得预览开启；资料正文快照的渲染**不变**（仍拒 data:）。

### 目标

1. **后端**：`Content.max_length = 2_000_000`；模型 CHECK 同步；`0006_note_content_limit` 迁移（升级放宽、降级只在无超长行时收紧，否则拒绝——与 0002/0003 同规矩）；`test_notes` 边界用例改为 2,000,000 通过、2,000,001 → 422；`test_migrations` head 改 0006，并证明迁移后能写入 >50,000 的内容（旧 CHECK 若未改写会 IntegrityError）。
2. **契约文档**：4.8 表 `content` 行改上限并注明「可含 `![](data:image/…;base64,…)` 内嵌图片；服务端不解析、不校验图片内容，只按字符数限制」；1.3 节追加 TASK-063 一段；`openapi-v1.json` 三处 `maxLength` 改 2000000。
3. **前端编辑器**（`NoteEditorPage`）：textarea `onPaste`/`onDrop` 取图片文件 → `noteImages.ts`：`imageToMarkdown(file)`：解码 → 最长边缩到 ≤1600px → `canvas.toBlob('image/webp', 0.82)`（WebP 不可用则 JPEG 0.85；GIF 不重编码以保留动画）→ 压缩后 > 600 KiB 抛 `IMAGE_TOO_LARGE` → data URL → `![图片](data:…)` 插到光标处（前后各保证一个换行）；处理中状态栏显示「正在处理图片…」，失败显示原因；插入后走既有自动保存。多张一次粘贴按顺序插入。
4. **限额同步**：`MAX_CHARS`、`api.ts` 两处、`NotesPanel` 一处 50000 → 2,000,000；编辑器超限文案改为「正文过大（含图片约 N MB），删掉一些图片才会保存」。
5. **渲染**：`renderSnapshot(..., { inlineImages: true })` 放行 `^data:image\/(png|jpeg|gif|webp);base64,`（不加 referrerpolicy/`data-origin-image`）；心得预览（编辑页、心得页右栏）开启；快照渲染默认关闭且有测试证明 data: 仍被拒。
6. **文字派生**：`noteTitle` 跳过只有图片的行、去掉行内图片语法（取 alt）；`noteSnippet` 已取 alt；心得页搜索按去掉图片 data 的文本匹配（`searchableText`）；阅读器侧栏心得卡的纯文本展示把内嵌图片显示为「[图片]」占位（不把 base64 铺到界面上）。
7. **测试**：`noteImages.test.ts`（缩放/格式/超限/GIF 直通，canvas 用 stub）；编辑器粘贴单测（合成 `paste` 事件 + `File`，断言插入的 Markdown 与光标位置、状态文案、超限提示）；渲染器 data: 放行/拒绝各一；e2e：编辑页派发带 PNG `File` 的 paste 事件 → 正文含 `![图片](data:image/webp;base64,` → 预览有 `<img src^="data:image/webp">` → 自动保存后 API 读回 → 心得页预览显示图片。
8. 顺带：TASK-062 F4（`flushRef` 改 `useLayoutEffect` 赋值）、F5（creating 分支无条件 `setLoadError(null)`）。

### 非目标

- 不新增图片接口、不存文件、不改 `snapshot_assets`；资料正文快照渲染不放行 data:。
- 阅读器侧栏的快速心得框（`NotesPanel` textarea）不接粘贴图片（长文/图片走「整页编辑」）。
- 不做图片编辑、不做外链图片抓取；不改列表分页策略（每页 100 保持，代价已告知用户）。

### 顺带完成的状态登记

`TASK-062-notes-polish.md`（PR #70，merge `4edcc27`）登记 MERGED，索引同步。

## 完成条件

1. 目标 1–7 各有测试直证；至少三处判别性变红（渲染器不放行 data:、粘贴不插入、上限未放宽等）。
2. `check_task` backend + frontend + contracts PASS；e2e 全套通过；`git diff --check` exit 0；`alembic check` 无差异。
3. L3：独立只读 Review PASS；独立只读 Integration/Acceptance PASS（核对完成条件、契约三处一致、迁移证据）。

## 上下文包

- `backend/migrations/versions/0002_note_optional_resource.py`（batch 重建模式）、`0001_initial.py:254`（原 CHECK 名 `ck_notes_content_length`）、`models.py` `bounded_length`；`tests/test_notes.py:143`（边界用例）、`tests/test_migrations.py:32`（head 断言）。
- `frontend/src/features/resources/snapshotMarkdown.ts`（`createRenderer(resolve)`、`renderSnapshot` 的 resolve 只放 http(s)）；`NoteEditorPage.tsx`（textarea、`onChange/schedule/flush`、状态栏）；`noteTitle.ts`。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-063-note-images.md --worktree`。

## 实现与测试

（实施后填写）

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

（实施后填写）
<!-- EVIDENCE:END -->
