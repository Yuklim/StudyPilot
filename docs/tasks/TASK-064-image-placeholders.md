# TASK-064：编辑框里内嵌图片只显示短占位符（`![图片](image:N)`），预览/保存时回填

```toml
schema_version = 2
id = "TASK-064"
status = "ACCEPTED"
risk = "L2"
risk_reason = "只改前端两个编辑器的「显示层」：textarea 里把 base64 data URI 折叠成短占位符，预览与保存前展开回原文。存进后端的内容、契约、渲染器都不变。动的是自动保存/冲突/对比的输入源（折叠 ↔ 展开必须严格可逆，否则会把图片丢掉或把占位符存进后端），需独立 Reviewer 看最终 diff；不到 L3。"
risk_flags = ["business"]
owner = "coordinator"
base = "7768d7dae4153e346de298fb34698a8b959e0643"
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

- **实现 SHA**：`96e9ea4`（8 个前端文件，+231/−35；登记提交 `b5d11b1` 只含本记录）。**检查绑定 `96e9ea4`**（候选 SHA 见 EVIDENCE 区）。
- 改动摘要：
  1. `noteImages.ts`：`collapseImages(content) → { text, images }`（`![alt](data:image/…;base64,…)` → `![alt](image:N)`，按出现顺序编号）、`expandImages(text, images)`（编号不存在的原样保留）、`imagePlaceholder(alt, n)`。只匹配严格合法的 base64 data URI，畸形的不折叠（避免半折叠丢数据）。
  2. `NoteEditorPage.tsx`：新增 `gallery` state 并入 `latest` ref；`load(content)` 折叠后写 draft/gallery（读取、重新读取、覆盖共用）；`source()` = 展开后的正文，`flush` 的比较/发送、`finally` 补排判断、`beforeunload` 判断都用它；`expanded = useMemo(expandImages(draft, gallery))` 供预览、长度、「含图片约 N MB」；粘贴/拖入把 data URI 追加进 gallery（同步写 ref 以便连续编号）并插入 `![图片](image:N)`；新建重置、删除后清空 gallery；有图片时写作框下一行提示。顺带 TASK-063 F7：`onDrop` 在拖的是文件但没有图片时 `preventDefault` + 提示「只支持 PNG、JPEG、GIF 或 WebP 图片」。
  3. `NotesPanel.tsx`：`gallery` state，`expanded` 派生；`choose` 折叠；`dirty`、长度校验、`saveNote` 都按 `expanded`；`reset` 清空 gallery。
  4. `styles.css` 提示样式；e2e 粘贴用例改为断言写作框只有 `![图片](image:1)`、无 base64、提示可见，服务端读回是完整 data URI 且 > 50,000 字符。
- **单测**（frontend **636** = 基线 630 + 6）：`noteImages.test.ts` +4（往返精确相等、编号与未知编号、重复占位符展开同一张、畸形不折叠、占位符格式）；`NoteEditorPage.test.tsx` +1（读取含图心得 → 框里只有占位符 → 没改不发 → 预览两张 `<img src=data:>` → 删掉第一张占位符后 PATCH 内容只含第二张的 data URI）、既有粘贴用例改断言（框里占位符 + 提示、POST 仍是 data URI）、拖放用例补非图片文件拖入被接住并提示；`NotesPanel.test.tsx` +1（编辑含图心得框里无 base64、刚打开不算脏、保存 PATCH 展开）。
- **e2e**：63 passed（改写的粘贴用例通过）。如实记：红检查之后的那一次全量跑出现 1 failed（未捕获用例名、`test-results` 无 error-context），紧接着连续两次全量 63 passed；判为偶发，未查到根因。
- **判别性变红**（各破坏一处后跑对应测试，随后恢复）：R1 `expandImages` 不回填 → `noteImages.test` 2 红 + `NoteEditorPage.test` 2 红 + `NotesPanel.test` 1 红；R2 粘贴仍插 data URI → 2 红；R3 编辑器 `source()` 不展开（发折叠文本）→ 2 红；R4 侧栏 `saveNote` 发折叠文本 → 1 红；R5 非图片文件拖入不接住 → 1 红。
- **检查**：`check_task.py --task … --candidate 96e9ea4` **CHECKS PASS**（format/lint/typecheck/test 636/build）；`git diff --check f4cd190 96e9ea4` exit 0。
- 占位符语义（目标 4）：删掉占位符 = 删掉那张图；复制成两份 = 两处同一张图；手打一个不存在的编号会原样存成 `image:N` 字面链接（无害）。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 冻结候选：**`3bd6274`**（= 实现 `96e9ea4` + 本记录/索引；产品代码与 `96e9ea4` 相同）。范围 `f4cd190..3bd6274`，10 个文件（前端 8 + 任务记录 2），均在 `allowed_paths` 内。
- 检查：`check_task.py --task … --candidate 3bd6274` **CHECKS PASS**（format/lint/typecheck/test 636/build）；e2e 63 passed（`96e9ea4` 工作区，之后只改文档）；`git diff --check f4cd190 3bd6274` exit 0。
- Review（L2 独立只读 Reviewer `.claude/agents/reviewer.md`，仅 Read/Grep/Glob，自证无写工具；原文）：

> **结论：PASS**（附已处置的非阻断项）。范围 `f4cd190..3bd6274` 全量 diff（10 文件，均在 allowed_paths）+ 最终文件调用链。未改契约、后端、渲染器；侧栏未接粘贴。
> 核对：INLINE/PLACEHOLDER 的 alt 均为 `[^\]]*`，含 `( ) [` 可往返；`expandImages` 按编号索引，删中间占位符后 `image:2` 仍取 `images[1]`（编辑器用例 PATCH 断言直证）；`svg+xml` 会被折叠但渲染器 `INLINE_IMAGE` 仍拒，无变化。`source()` 在 flush/finally/beforeunload 三处与原语义等价（`cleanContent` 去首尾与服务端一致，夹具注释成立）；`overwrite`/`reload`/`remove`/`creating` 分支 ref 与 state 同步正确。`noteTitle` 不看 URL，标题等价。NotesPanel `recover()`/「作为新心得」保留 draft+gallery，`reset` 清空，正确。F7 `onDrop` 与 `onDragOver` 同用 `draggingFiles`。R1–R5 与用例结构对应；e2e 由 poll 证明服务端读回 data URI 且 > 50,000。e2e 单次 1 failed 未定位、候选绑定检查 PASS 且随后两次 63 全绿——不阻断，记剩余风险。
> - **F1（可记录后继续）** `noteImages.ts:141-163`：正文已含字面 `![x](image:k)` 且 k ≤ 真实图片数时不可逆（展开后两处都是同一张）。编辑器/侧栏保存时均已展开，此形态只能来自外部写入，发生可能极低；建议把「任意合法正文」限定为「不含字面占位符」。
> - **F2（可选）** 跨心得复制占位符文本不带图（存成字面 `image:N`，渲染器丢弃）；提示文案可补一句。
> - **F3（可选）** `NoteEditorPage.tsx:82-87`：`load()` 同步写 ref 的 draft/gallery，但 `note` 要等 commit；`.then`→commit 的宏任务窗口内 beforeunload 会以 `current=null` POST 重复。几乎不可触发；可让 `load(note)` 一并写 `note`。
> - **F4（可选）** e2e 注释「切换预览触发保存」已不成立，实际守卫是 poll，证明链仍成立，建议改注释。
> - **F5（可选）** `NotesPanel.tsx:54` `expanded` 每次渲染重算；侧栏场景可接受，可 `useMemo`。

- findings 处置：

| # | 处置 | 依据 |
| --- | --- | --- |
| F1 | **记录**（前提补进本区）：目标 1 的可逆性前提是**正文里没有用户手打的字面 `![x](image:k)`**；两个编辑器保存时都已展开，正常路径不会产生这种正文；只有外部直接写 API 才可能。 | 发生可能极低；目标文本按规则不在证据写回时改 |
| F2 | **记录**：跨心得复制占位符不带图——下次动编辑器时提示文案补一句。 | 可选 |
| F3 | **记录**：`load()` 一并写 `note` 到 ref（1 行），下次动编辑器时顺带。 | 几乎不可触发 |
| F4 | **记录**：e2e 注释措辞，下次动该用例时改。 | 注释 |
| F5 | **记录**：侧栏 `expanded` 可 `useMemo`。 | 可选 |

- Acceptance：L2，N/A。
- 最终状态/风险/用户操作：status=**ACCEPTED**（L2：1 Worker → 自动检查 → 1 名独立只读 Reviewer → 主 Agent 汇总）。**未 MERGED**——是否合并由用户本人决定。**依赖 PR #71（TASK-063）先合并**：本分支从其分支尖创建，PR 以该分支为 base，#71 合并后 GitHub 会自动把 base 换成 main。
- 非阻断遗留项：1. F1 前提 / F2 / F3 / F4 / F5（上表）；2. e2e 一次未定位的偶发失败；3. TASK-063 F4（`docs/开发与运行.md` 两处 50,000）仍待有该路径的任务。
- 日期与决定日志：
  - 2026-09-15 PR #73 合并后 TASK-063 分支并入 main（`7768d7d`）；本分支并入 `7768d7d` 为 merge `8f830b9`，只解索引冲突（064 行排到 065 行之后）；`git diff 3bd6274 8f830b9 -- frontend/src frontend/e2e/notes-pages.spec.ts` 为空，产品代码与候选 `3bd6274` 逐字节一致，Review 结论继续覆盖；`base` 前移到 `7768d7d`。
  - 2026-09-15 用户试用后「一串很长的文字很影响书写」→ 主 Agent 提出占位符方案并开做；登记 `b5d11b1`；实现 `96e9ea4`；写回 `3bd6274` 冻结；Review PASS（F1–F5 记录）；主 Agent 写回并置 `ACCEPTED`；待用户合并（先 #71）。
<!-- EVIDENCE:END -->
