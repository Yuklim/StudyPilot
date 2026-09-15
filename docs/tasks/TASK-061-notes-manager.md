# TASK-061：「我的心得」改为两栏管理 + 预览（列表 / 搜索 / 预览 / 后贴 / 删除）

```toml
schema_version = 2
id = "TASK-061"
status = "IN_PROGRESS"
risk = "L2"
risk_reason = "重做 `/notes` 页面：由「写作框 + 列表 + 编辑 + 删除同一组件」改为备忘录式两栏（左列表可搜索，右预览与管理动作），编辑一律进 TASK-060 的整页编辑器。前端为主，只给 `listNotes` 加一个契约里已有的可选 `sort` 参数；不改后端与契约。判 L2：动了「回看 / 管理心得」这条核心路径与后贴/删除的版本化写调用，需独立 Reviewer 看最终 diff；不到 L3。"
risk_flags = ["business"]
owner = "coordinator"
base = "b06b6e9b66d28b03213c18da7ee9e7deee8ac93a"
allowed_paths = [
  "frontend/src/features/notes/NotesPage.tsx",
  "frontend/src/features/notes/NotesPage.test.tsx",
  "frontend/src/features/notes/api.ts",
  "frontend/src/features/notes/api.test.ts",
  "frontend/src/features/notes/noteTitle.ts",
  "frontend/src/features/notes/noteTitle.test.ts",
  "frontend/src/shell/pages.ts",
  "frontend/src/styles.css",
  "frontend/e2e/notes-pages.spec.ts",
  "docs/tasks/TASK-060-note-editor.md",
  "docs/tasks/TASK-061-notes-manager.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-14 用户原话「想让"我的心得"部分变成心得的管理和预览……就像 iPhone 的备忘录一样」；主 Agent 拆三步，本任务是第二步（第一步 TASK-060 编辑页已合并 PR #68）。形态按主 Agent 在沟通里给出的描述（用户回复「可以」）：宽屏两栏——左边心得列表（标题 + 首行摘要 + 时间，可搜索），右边选中那条的预览；手机上是列表 → 点进编辑页；标题取第一行；后贴/解绑/删除留在管理动作里。

### 契约事实（决定本任务边界）

- `GET /api/v1/notes` **只列独立心得**（`resource_id` 为 null），参数仅 `page/page_size(≤100)/sort(created_at|updated_at 两向)`，**没有搜索参数**；绑定资料的心得只能在各自资料下列出。
- 因此：本页管理的是**独立心得**；搜索在前端对已加载的心得做（标题/正文包含匹配）；「所有心得（含绑定资料的）一页看全」需要新接口，**不在本任务**，作为后续决定上报用户。

### 目标

1. `/notes` 页重做为两栏（`min-width: 1024px`；以下单栏）：
   - 左栏：搜索框（前端过滤已加载项）、按最近更新排序的列表（`sort=-updated_at`，每页 100，「加载更多」翻页），每项显示标题（`noteTitle`，空为「无标题心得」）、摘要（标题行之后的正文前 ~80 字）、更新时间；选中项高亮；空态「还没有独立心得」+「写一条」（→ `/notes/new`）；顶部「写心得」入口。
   - 右栏（宽屏）：选中心得的预览——标题、更新时间、Markdown 渲染（复用 `renderSnapshot` + `pageTitle` 去重）、动作「编辑」（→ `/notes/:id`）、「后贴到资料」（复用 `ResourceAttachPicker`，成功后从列表移除并给出「打开《资料》」链接）、「删除」（模态一次确认，复用 TASK-056 样式）。未选中时右栏提示「从左边选一条」。
   - 选中项写进网址 `?note=<id>`（刷新/后退保留）；窄屏下列表项直接链到 `/notes/:id` 编辑页。
2. `listNotes(resourceId, number, sort?)` 加可选第三参（默认 `-created_at` 不变；只接受契约枚举）。
3. 旧的 `NotesPanel` 独立模式不再被页面使用（组件与其单测保留，阅读器侧栏仍用绑定模式；TASK-062 再处理）。
4. 页面 `h1` 仍由外壳渲染「我的心得」；各态（读取中/失败/空/有数据）正常。
5. 测试：单测覆盖列表/搜索/选中与网址/预览去重与转义/后贴/删除/加载更多/窄屏链接；e2e 改写 `notes-pages.spec.ts` 中走旧页面 UI 的两条（「top-level notes page…」「standalone note attaches…」）为新交互，**契约断言保留**（后端计数、后贴后独立列表为 0、解除后回到独立、删除后计数 0）。

### 非目标

- 不做「含绑定资料心得的全量列表」（需新接口）；不做服务端搜索。
- 不做右栏内联编辑（编辑一律进整页编辑器，避免 TASK-060 遗留 F7 的切换丢字问题）。
- 不改阅读器侧栏（TASK-062）；不改后端/契约。

### 顺带完成的状态登记

`TASK-060-note-editor.md`（PR #68，merge `b06b6e9`）登记 MERGED，索引同步。

## 完成条件

1. 目标 1–2 各有单测或 e2e 直证；新用例对「不写 `?note=`」「预览不去重」「删除不刷新列表」等至少三处变红（记录）。
2. 全部既有单测/e2e 通过（可重写的仅限目标 5 列出的两条 e2e 与 `notes-pages` 里依赖旧页面文案的断言）；`check_task` frontend PASS；`git diff --check` exit 0。
3. L2 独立只读 Review PASS。

## 上下文包

- `NotesPanel.tsx`（旧交互与文案、后贴/解绑/删除调用）、`ResourceAttachPicker.tsx`、`notes/api.ts`、`NoteEditorPage.tsx`（标题规则、预览方式）、`ResourceLibrary.tsx`（列表页的 URL 事实来源写法）。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-061-notes-manager.md --worktree`。

## 实现与测试

- **实现 SHA**：`b61589f`（8 个前端文件，+918/−54；登记提交 `3975264` 只含本记录）。**检查绑定 `b61589f`**（候选 SHA 见 EVIDENCE 区）。
- 改动摘要：
  - `NotesPage.tsx` 重写：`matchMedia('(min-width: 1024px)')` 决定两栏/单栏；第一页 `listNotes(null, 1, '-updated_at', 100)` 走 `useResourceQuery`（读取中/失败/重试），「加载更多」的后续页放本地并与第一页对象绑定（刷新即作废）；搜索是对已加载项 `content` 的小写包含过滤；选中项 `?note=<id>`（`setSearchParams` 函数式 + `replace`），宽屏列表项链到 `/notes?note=<id>`、窄屏直接链到 `/notes/<id>`；右栏 `NotePreview`：`renderSnapshot(content, new Map(), null, { pageTitle })` 去重首行标题，动作「编辑」→ `/notes/:id`、「后贴到资料」复用 `ResourceAttachPicker` → `attachNote`（成功后 `role="status"` 提示 + 「打开《资料》查看」+「回到列表」）、「删除」模态一次确认 → `deleteNote(null, note)`；后贴/删除成功后清掉 `?note=` 并刷新第一页。
  - `api.ts`：`listNotes(resourceId, number = 1, sort: NoteSort = '-created_at', pageSize = 20)`，`sort` 只接受契约四个枚举、`pageSize` 1–100 整数，否则 `INVALID_REQUEST`；默认值与请求串不变。
  - `noteTitle.ts`：新增 `noteSnippet(content, limit = 80)`（标题行之后的正文，去掉列表/标题/引用标记与行内 Markdown，超长省略号）。
  - `styles.css`：`.notes-manager`（两栏 grid `minmax(280px,360px) minmax(0,1fr)`）、列表工具行、列表项、预览栏；搜索框改用 `aria-label`（原 `.sr-only` 标签在真实浏览器里被 `display:none` 吞掉可访问名称——e2e 抓到）。
  - 未动 `shell/pages.ts`（外壳 `h1` 与路由沿用，不需要改）。
- **单测**：`NotesPage.test.tsx` 9 条（顺序与摘要 / `?note=` 选中 + 预览转义 + 不重复 h1 / 从地址恢复选中 / 前端过滤 / 加载更多 / 后贴请求体 `{resource_id, expected_version}` / 删除 `DELETE + ifMatchVersion` / 窄屏链接 / 失败重试与空态）；`noteTitle.test.ts` +4（摘要）；`api.test.ts` 在既有用例里补 `sort/pageSize` 请求串与非法值拒绝。frontend 合计 **600 = 基线 587 + 13**。
- **e2e**：`notes-pages.spec.ts` 改写两条走旧页面 UI 的用例（顶层页：编辑器写 → 列表 → 预览 → 编辑 → 删除；后贴往返：编辑器写 → 预览「后贴到资料」→ 「打开《资料》查看」→ 原解绑流程），级联删除用例的独立心得改由 `/notes/new` 创建并先清空残留；契约断言（后端计数、后贴后独立列表为 0、解绑后回到独立、删除后 0）全部保留；编辑器用例的「写心得」链接限定到侧栏（页面上现在也有一个）。全套 **62 passed**（数量与基线相同）。
- **判别性变红**（对 `NotesPage.tsx` 各做一处破坏后跑 `NotesPage.test.tsx`，随后恢复；9 条中各红 1 条）：① 列表项不写 `?note=`（宽屏也链到 `/notes/:id`）→ 红；② 预览不传 `pageTitle`（正文首行标题不去重）→ 红；③ 删除成功后不调 `onChanged`（列表不刷新）→ 红；④ 搜索不过滤（`shown = notes`）→ 红。
- **检查**：`check_task.py --task … --candidate b61589f` **CHECKS PASS**（format/lint/typecheck/test 600/build）；`git diff --check b06b6e9 b61589f` exit 0。
- 实跑抓到并已修的问题（未进独立 Review 前）：`.sr-only` 被列表工具行样式 `display:none` 吞掉可访问名称（上文）；e2e 里「写心得」链接双匹配；改写用例时漏掉的 `standaloneNote` 常量。
- TASK-060 遗留 F7（编辑页内切换 noteId 不先 flush）：本页所有进编辑器的链接都从列表/预览进入，编辑器内没有心得间跳转入口，F7 触发路径仍不存在；随 F3 一并进 TASK-062。
- 上报用户的后续决定：「所有心得（含绑定资料的）一页看全」需要新增契约（`GET /notes` 只列独立心得），不在本任务。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

（实施后填写）
<!-- EVIDENCE:END -->
