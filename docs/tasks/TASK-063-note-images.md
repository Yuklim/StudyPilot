# TASK-063：心得粘贴图片（base64 内嵌进正文）+ 心得正文上限放宽（契约 + 迁移）

```toml
schema_version = 2
id = "TASK-063"
status = "MERGED"
risk = "L3"
risk_reason = "放宽已批准公共契约（`Note.content` 上限 50,000 → 2,000,000 字符；`docs/contracts/**` 与 `openapi-v1.json` 同步）并新增 0006 迁移改写 `notes` 表的 CHECK；前端编辑器接受粘贴/拖入图片，压缩后以 data URI 内嵌进 Markdown，渲染器放行 `data:image/*;base64`。命中 public-api + migration + critical-data，走 L3：独立只读 Reviewer + 独立只读 Integration/Acceptance。"
risk_flags = ["public-api", "migration", "critical-data", "business"]
owner = "coordinator"
base = "028a995312c87b931cd0078b204ef04db8fac0cb"
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

- **实现 SHA**：`e912fd6`（24 个文件，+745/−36；登记提交 `3846ed0` 只含本记录；实施中把 `backend/tests/test_database.py` 追加进 `allowed_paths`——它有一条 50,001 的持久化拒绝用例）。**检查绑定 `e912fd6`**（候选 SHA 见 EVIDENCE 区）。
- 改动摘要（按目标）：
  1. 后端：`contracts.py` `MAX_CONTENT = 2_000_000`；`models.py` `bounded_length("content", 1, 2_000_000)`；`0006_note_content_limit`：`batch_alter_table("notes")` 里 `drop_constraint("content_length", type_="check")` + `create_check_constraint`（命名约定加 `ck_notes_` 前缀；SQLite 能从 CREATE TABLE 文本反射命名 CHECK，首版误传 `table_args` 会留下第二条旧 CHECK，实跑抓到后去掉）；降级前 `SELECT count(*) … length(content) > 50000`，非零即 `RuntimeError`。`test_notes` 边界改 2,000,000 通过 / 2,000,001 → 422，并新增含 120,000 字符 data URI 的往返；参数化拒绝用例 50,001 → 2,000,001；`test_database` 同步；`test_migrations` head 改 0006，新增 `test_0006_widens_note_content_and_refuses_lossy_downgrade`（0005 下 60,000 字符 IntegrityError → 升级后可写 → 有超长行时降级被拒且 head 不动 → 删掉后可降级并再次拒绝 60,000）。`alembic check` 在新库上无差异。
  2. 契约：4.8 `content` 行「1～2,000,000（TASK-063 起；此前 50,000）」+ 内嵌图片写法与「服务端不解析、不校验」；1.3 节追加 TASK-063 一段；`openapi-v1.json` `Note`/`NoteCreate`/`NotePatch` 三处 `maxLength` 2000000（OpenAPI 校验通过）。
  3. 前端 `noteImages.ts`：`imageFiles(transfer)`、`imageToMarkdown(file, alt)`（`createImageBitmap` → canvas 缩到最长边 1600 → `toBlob('image/webp', 0.82)`，编出来不是 WebP 就退 JPEG 0.85；GIF 直通；压缩后 > 600 KiB 抛 `IMAGE_TOO_LARGE`；只认 png/jpeg/gif/webp）、`inlineImageBytes`。`NoteEditorPage`：textarea `onPaste/onDrop/onDragOver`，`insertImages` 顺序处理、`insertAtCursor` 前后各保证一个换行并把光标放到图后、同步写 `latest.draft` 让连续多张接续；状态栏「正在处理图片…」/ 失败原因（下一次改动清掉）。
  4. `MAX_CONTENT` 从 `api.ts` 导出，编辑器/`NotesPanel`/校验三处引用；超限文案含图片时改「正文过大（含图片约 N MB）…」。
  5. `snapshotMarkdown.ts`：`ImageSource` 加 `inline`，导出 `INLINE_IMAGE`（png/jpeg/gif/webp 的 base64 data URI，与 markdown-it `validateLink` 集合一致，SVG 不收）；`RenderOptions.inlineImages`；只有编辑页预览与心得页右栏传 true。
  6. `noteTitle`：标题行的图片只留替代文字、纯图片行跳过；新增 `displayText`（内嵌图片 → 「[图片]」/「[图片：替代文字]」），心得页搜索与阅读器侧栏卡片用它。
  7. 顺带 TASK-062 F4（`flushRef` 在 `useLayoutEffect` 里赋值）、F5（`loadError` 在 `creating` 时按渲染派生为 null——lint 禁止 effect 内无条件 setState，改为派生值）。
- **单测**（frontend **627** = 基线 607 + 20；backend **556** = 555 + 1）：`noteImages.test.ts` 8 条（缩放到 1600 边、不放大、WebP→JPEG 回退、GIF 直通、超限/SVG 拒绝、alt 清洗、`imageFiles` 挑选、字节估算）；`snapshotMarkdown.test.ts` +5（开启时渲染 data: 且不带 referrerpolicy、默认仍拒、SVG/text-html/非 base64/夹带 `<script>` 拒）；`NoteEditorPage.test.tsx` +3（粘贴接管且纯文本粘贴不受影响、处理中文案、按光标插入并自动保存 POST；失败提示与正文不变；超限文案两种）；`NotesPage.test.tsx` +1（预览 `<img src=data:>`、摘要无 base64、搜 base64 片段不命中/搜配文命中）；`NotesPanel.test.tsx` +1（卡片占位）；`noteTitle.test.ts` +2；`api.test.ts` 三处上限值改 2,000,001 / 2,000,000。
- **e2e**（**63** = 62 + 1）：`an image pasted into the editor…`——页内画 2400×1500 PNG（含噪点带，压后 > 50,000 字符）派发真实 `ClipboardEvent('paste')` → 正文出现 `![图片](data:image/webp;base64,…)` → 解码宽高 1600×1000 → 预览 `<img>` naturalWidth 1600 → 服务端读回含同一 data URI（证明迁移后 CHECK 放行）→ 心得页摘要无 base64、右栏显示图片 → 清理。
- **判别性变红**（各破坏一处后跑对应测试，随后恢复）：R1 渲染器去掉 inline 分支 → `snapshotMarkdown.test` 1 红 + `NotesPage.test` 1 红；R2 渲染器无条件放行 data:（快照也放）→ 2 红；R3 编辑器 onPaste 不接管 → 2 红；R4 不缩放 → `noteImages.test` 1 红；R5 前端上限仍 50,000 → `api.test` 1 红；R6 搜索直接搜正文 → `NotesPage.test` 1 红；R7 后端迁移 `upgrade` 置空 → `test_migrations`/`test_notes` 2 红。
- **检查**：`check_task.py --task … --candidate e912fd6` **CHECKS PASS**（profiles backend, contracts, frontend：ruff format/check、mypy、pytest 556、uv build、OpenAPI 校验、format/lint/typecheck/test 627/build）；`git diff --check 4edcc27 e912fd6` exit 0。
- **用户本机**：运行中的后端仍是 0005 的库，粘贴大图会被旧 CHECK 拒绝（受控 500）；用启动脚本重启会自动 `alembic upgrade head`（脚本比较 current/heads），或手动执行。
- 已知取舍（用户已接受的存法代价，如实记）：列表页一次拉 100 条正文，含图心得多了会变慢；心得的 PATCH 每次整份带图；侧栏快速心得框编辑含图心得时 textarea 里是 base64 原文（看图去「整页编辑」）。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 冻结候选：首轮 **`bb2961b`**（= 实现 `e912fd6` + 记录/TASK-062 MERGED 登记/索引）→ Review F1/F2/F3/F5/F6 修复后**最终候选 `9cb9987`**（`fix(frontend): 拖入图片按 types 判定 dragover；文字+图片粘贴不接管；侧栏三处预览/摘要首行/搜索 memo`，只动前端 9 个文件：`NoteEditorPage`/`NotesPanel`/`NotesPage`/`noteImages`/`noteTitle` 及其测试）。范围 `4edcc27..9cb9987`，26 个文件（后端 6 + 契约 2 + 前端 15 + 任务记录 3），均在 `allowed_paths` 内。
- 检查（绑定 `9cb9987`）：`check_task.py --task … --candidate 9cb9987` **CHECKS PASS**（profiles backend, contracts, frontend；ruff/mypy/pytest **556**/uv build、OpenAPI 校验、format/lint/typecheck/vitest **630**/build）；e2e **63 passed**（`9cb9987` 工作区）；`git diff --check 4edcc27 9cb9987` exit 0。修复的判别性：R8 dragover 改回按 `imageFiles` 判定（原缺陷）→ `NoteEditorPage.test` 2 红；R9 文字+图片粘贴仍接管 → 1 红；累计 9 处定向变红。
- Review（L3 独立只读 Reviewer `.claude/agents/reviewer.md`，仅 Read/Grep/Glob，自证无写工具；原文）：

> **首轮**（`4edcc27..bb2961b`）：26 文件均在 allowed_paths；`renderSnapshot(` 全部调用点里仅编辑页/心得页右栏传 `inlineImages: true`，`ContentSnapshot.tsx:181` 未传；`INLINE_IMAGE` 唯一 `.test()` 用点（非 `g`）；`noteTitle` 的 `g` 正则仅用于 `replace`；`html:false` 未动；五处 2,000,000 数值一致（contracts/models/0006/api.ts/openapi 三处/4.8/1.3）；迁移与 `test_migrations` 新用例（0005 下 60,000 IntegrityError → 0006 可写 → 有超长行拒降级且 head 不动 → 删后可降级并再拒），`compare_metadata==[]` 兼证索引保留，`test_resource_deletion` 在迁移库上证级联；e2e 断言 `value.length > 50_000` 且服务端读回含同一 data URI，直证 CHECK 已放宽。
> - **F1（必须修复）** `NoteEditorPage.tsx:475-477` `onDragOver` 用 `imageFiles(event.dataTransfer)` 判定，而 dragover 阶段拖拽数据处于 protected mode，`files` 为空、`getAsFile()` 返回 null → 永远不 `preventDefault`，纯文件拖入不会触发 `drop`，浏览器走默认动作。目标 3 的「拖入」实际不可用，且无测试覆盖。
> - **F2（可记录后继续）** `onPaste`：剪贴板同时含非空 `text/plain` 与图片文件时（Excel/Word 复制单元格常见）无条件取图片、取消默认粘贴。建议有非空文本时走默认粘贴。
> - **F3（可记录）** `NotesPanel.tsx:317,363,375` 删除预览、冲突「最新已保存内容」「刚读取的最新心得」仍直出 `content` 原文，含图心得会把 base64 铺到界面。
> - **F4（可记录，越 allowed_paths）** `docs/开发与运行.md:97,123` 仍写 50,000。
> - **F5（可选）** `noteTitle` 跳过首行纯图片，但 `noteSnippet` 仍把首个非空行（图片行）当标题行，标题与摘要会重复。
> - **F6（可选）** `NotesPage.tsx:103` 搜索每次渲染对全部已加载正文跑 `displayText`，未 memo。
> - R1–R7 变红声明与用例结构相符，可信；`'🌱'.repeat(2_000_000)` 约 8 MB，单次可接受。完成条件 1 因拖入缺证据部分未满足。剩余风险：2 MB 受控 textarea 每键重渲染与列表页拉 100 条含图正文的性能（用户已接受）；程序化插入后原生撤销栈失效；旧浏览器 `createImageBitmap` 不带 EXIF 方向时相机照片可能转向。
> - **结论：CHANGES_REQUIRED**（仅 F1）。
>
> **增量复审**（`bb2961b..9cb9987`，继承首轮全部结论）：F1 `draggingFiles` 按 `types` 含 'Files' 或 `items[].kind==='file'` 判定，`onDrop` 仍用 `imageFiles`；单测覆盖 dragover 只带 types → 拦、text/plain → 不拦、drop → 插入。F2 `getData('text/plain').trim()` 非空即返回；e2e 的 `DataTransfer` 只含文件不受影响。F3 三处改 `displayText`，删除预览有断言。F5 标题行判定与 `noteTitle` 同口径。F6 `useMemo` 建 id→可搜文本 Map。F4 越范围，接受。
> - **F7（可选）** `onDrop` 拖入非图片文件时 dragover 已放行、drop 却不 `preventDefault`，浏览器仍可能导航到该文件（与修复前相同，非回归）。建议 `draggingFiles` 为真时一律 `preventDefault` 并提示「只支持图片」。
> - **结论：PASS**（覆盖新候选 `9cb9987`）。

- findings 处置：

| # | 处置 | 依据 |
| --- | --- | --- |
| F1 | **已改**（`9cb9987`：`draggingFiles` 按 types 判定）+ 单测。 | 目标 3 的拖入路径实际失效 |
| F2 | **已改**（有文字走默认粘贴）+ 单测。 | 常见复制场景误接管，1 行 |
| F3 | **已改**（侧栏三处 `displayText`）+ 断言。 | 目标 6 的漏网处 |
| F4 | **记录 → 下个任务**（`docs/开发与运行.md` 两处 50,000 改 2,000,000）。 | 越 allowed_paths |
| F5 | **已改**（摘要标题行同口径）+ 单测。 | 2 行 |
| F6 | **已改**（`useMemo`）。 | 含图正文 MB 级 |
| F7 | **记录**：非图片文件拖入时 drop 一律 `preventDefault` 并提示——与修复前行为相同，非回归；下个任务顺带。 | 不再开一轮候选 |

- Integration/Acceptance（L3 独立只读，第三个 Agent 实例，独立于实现者与 Reviewer；仅 Read/Grep/Glob，自证无写工具；原文摘录）：

> **结论：PASS**（附 2 条非阻断记录项）。候选 `9cb9987` / 基线 `4edcc27`；依据 final.diff（全量）与 fix1.diff（增量，blob 尾哈希与全量一致，证实即 `bb2961b..9cb9987`）。
> - 完成条件 1：目标 1–7 各有直证（`test_notes` 边界 + data URI 往返、`test_0006_widens_note_content_and_refuses_lossy_downgrade`；契约 4.8/1.3/openapi 三处；编辑器粘贴/拖放/失败三条用例 + `noteImages.test`；`api.test`/`NotesPanel.test`/超限文案；`snapshotMarkdown.test` 开启/默认拒绝 + 4 种拒绝；`noteTitle`/`displayText`/搜索/卡片与删除预览；e2e 真实 paste → 1600×1000 → 预览 → 服务端读回 > 50,000 → 心得页）。R1–R9 与用例结构对应（R7：`conftest.py:36` 用 `migrate(engine)`，upgrade 置空会同时红两个文件）。
> - 完成条件 2：增量只在 `frontend/src/features/notes/`，未触及 backend/docs/contracts，后端与迁移证据对 `9cb9987` 仍有效；pytest 556 / vitest 630（= 627 + 3，与新增用例数吻合）。**保留**：scratchpad 无绑定候选的 check/e2e 日志工件，PASS 仅为记录声明。
> - 跨模块一致性：`contracts.py`/`models.py`/0006 CHECK/`api.ts`（编辑器、NotesPanel、`noteAt`、`saveNote` 引用）/openapi 三处/契约 4.8、1.3 数值一致，计数口径均为码点；1.2 节「不得收紧既有输入」，放宽不属破坏性变更；`renderSnapshot(` 调用点里 `ContentSnapshot.tsx:181` 未传 `inlineImages`，仅编辑页/心得页传 true，`inline` 不加 referrerpolicy——承诺成立。
> - 迁移证据：用例在 0005 下写 60,000 得 IntegrityError（模型 CHECK 已是 2,000,000，拒绝只能来自库内旧 CHECK），升到 0006 后可写——证明的是迁移而非模型；`compare_metadata==[]` 兼证 `alembic check`。本机需 `alembic upgrade head` 的说明与启动脚本行为相符。
> - Review 处置：F1–F7 与原文一一对应；F1/F2/F3/F5/F6 均在增量里有改动与用例；F4 越 allowed_paths、F7 为既有行为，记录合理。
> - 范围：无图片接口、无文件存储、`snapshot_assets` 未动；`onPaste/onDrop` 仅在编辑页；分页未改。
> - Findings（非阻断）：1. 记录称最终修复「只动前端 7 个文件」，实为 9 个，建议更正；2. 绑定 `9cb9987` 的 check/e2e 输出未留工件，汇报时宜附摘要。

- Acceptance findings 处置：1. **已改**（上文口径更正为 9 个）；2. **已补**：`check_task --candidate ed9d772`（产品代码与 `9cb9987` 相同，只多任务记录提交）完整日志与 `playwright test` 日志存于会话 scratchpad `t063/check-ed9d772.log`、`t063/e2e-9cb9987.log`——CHECKS PASS（pytest 556、vitest 630）、e2e 63 passed；`check_task` 拒绝对非检出 SHA 跑完整检查（"full checks require the candidate checked out"），故按检出的 HEAD 绑定。
- 最终状态/风险/用户操作：status=**ACCEPTED**（L3：1 Worker → 自动检查 → 独立只读 Reviewer（两轮）→ 独立只读 Integration/Acceptance → 主 Agent 汇总）。**未 MERGED**——是否合并由用户本人决定。**合并后用户本机需迁移**（启动脚本自动 `alembic upgrade head`，或手动执行），否则保存含图心得会被旧 CHECK 拒绝。
- 非阻断遗留项：1. F4 `docs/开发与运行.md:97,123` 两处 50,000（下个任务）；2. F7 非图片文件拖入的 drop 处理；3. 用户已接受的存法代价（列表页拉含图正文、PATCH 整份带图、侧栏编辑含图心得是 base64 原文）；4. 主 Agent 假设（1600px / WebP / 600 KB / 2,000,000）待用户实际使用后确认或调整。
- 日期与决定日志：
  - 2026-09-15 用户合并 PR #73（TASK-065）后 PR #71 与 main 在 `任务索引.md` 冲突：并入 `origin/main`（`028a995`）为 merge `d35764f`，只解索引冲突（保留本分支 062 MERGED/063 行 + main 的 065 行）；`git diff 9cb9987 d35764f -- backend frontend/src docs/contracts` 为空，产品代码与最终候选 `9cb9987` 逐字节一致，Review 与验收结论继续覆盖；`base` 前移到 `028a995` 以便 `check_task` 范围只含本任务路径。
  - 2026-09-15 用户「不能粘贴图片」→ 反问后选「直接内嵌进正文」；登记 `3846ed0`；实现 `e912fd6`（实跑抓到：batch 迁移误传 `table_args` 会留下第二条旧 CHECK；lint 禁止 effect 内无条件 setState → `loadError` 改为派生值；纯色图压成 WebP 只有几 KB，e2e 需噪点带才能超过旧上限）；写回 `bb2961b` 冻结；Review 首轮 CHANGES_REQUIRED（F1 dragover 看不到文件）→ 修复 `9cb9987`（含 F2/F3/F5/F6）→ 增量复审 PASS → 独立 Integration/Acceptance PASS；主 Agent 写回并置 `ACCEPTED`；待用户合并。
- 2026-09-15 用户已合并 PR #71，merge `8b58f39`；status=**MERGED**（登记并入 TASK-066 控制面提交）。
<!-- EVIDENCE:END -->
