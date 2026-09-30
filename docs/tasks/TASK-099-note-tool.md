# TASK-099：顶栏加「注释」工具，同一段话不重复标高亮

```toml
schema_version = 2
id = "TASK-099"
status = "ACCEPTED"
risk = "L2"
risk_reason = "阅读器交互增补（纯前端）：顶栏新增「注释」工具（开着时选中文字 = 标高亮 + 打开右栏聚焦评论框；点已有高亮 = 聚焦它的评论框），并在建高亮前按锚点去重（同一段话再标一次不再建第二条，只按当前颜色改样子）。写用户数据的路径有变化（去重会改走 PATCH），须独立只读 Reviewer 检查最终 diff；独立验收 N/A。执行链：1 Worker → 自动检查 → 1 独立只读 Reviewer。"
risk_flags = ["business"]
owner = "coordinator"
base = "736ee78ffad51a3c13dbec1061ee427125db5464"
allowed_paths = [
  "frontend/src/features/resources/highlights.ts",
  "frontend/src/features/resources/AnnotationTools.tsx",
  "frontend/src/features/resources/AnnotationComposer.tsx",
  "frontend/src/features/resources/ReaderQuote.tsx",
  "frontend/src/features/resources/ReaderQuote.test.tsx",
  "frontend/src/features/resources/ReaderHighlights.tsx",
  "frontend/src/features/resources/ReaderHighlights.test.tsx",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/shell/Icon.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/reader-highlights.spec.ts",
  "docs/tasks/TASK-099-note-tool.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-30 用户本机检查 TASK-098 后（附截图：同一段话两条一模一样的高亮）：
「1、同样的内容能够被多次保存。2、现在没有记注释的入口了，把注释也做成工具栏，可以选择点一下高亮语句自动绑定，
也可以直接记录在语句上，然后高亮」。

### 目标

1. **去重**：建高亮前按锚点（同一页、同 `exact`、同 `start_offset`/`end_offset`）在已读到的列表里找；已有就不再建第二条——
   样子不同时按当前颜色/样式 PATCH 一次，相同则什么都不发。荧光笔/下划线、「记下这段」、顶部写作框三条路都走这一处。
2. **「注释」工具**（顶栏，荧光笔/颜色/下划线之后、橡皮之前）：开着时——选中文字松手 = 按当前颜色标高亮 + 打开右栏
   「注释」+ 焦点落进这条的评论框；点正文里已有的高亮/下划线 = 打开右栏 + 焦点落进它的评论框（不出气泡）。
   工具互斥开关的语义与 TASK-094 一致；手机宽度同样隐藏整组。
3. 顶部写作框：选区若正好是一条**已有评论**的高亮，不改绑——心得存为独立心得并说明；无评论的已有高亮则配上去。

### 非目标

- 不做部分重叠 / 包含关系的合并（只认锚点完全相同）；不改后端/契约；胶囊「记下这段」保留。

## 完成条件

- 单测：去重（第二次同选区只发 PATCH 或不发）、「注释」工具的两条路、写作框对「已有评论的高亮」的处理。
- e2e：同一段话用荧光笔标两次只剩一条；「注释」工具选中 → 评论框聚焦并配对；点已有高亮 → 聚焦。全套 e2e 绿。
- `check_task.py` PASS；独立只读 Reviewer 结论；用户本机看过。

## 实现与测试

- 实现 SHA：见证据段候选 SHA（控制面与实现同一提交之后的 docs 提交不引用自身）。
- 变更摘要：
  - `highlights.ts`：`AnnotationTool` 加 `'note'`；`Icon.tsx` 加 `comment` 图标；`AnnotationTools.tsx` 在下划线与橡皮之间
    加「注释」按钮（跟当前颜色）。
  - `ReaderQuote.tsx`：`note` 工具也算「松手即交给 onMark」；`ResourceDetail.takeMark` 在 `note` 下标完打开右栏、
    聚焦该条评论框。`ReaderHighlights` 点选：`note` 工具下命中即 `onOpenPanel` + 聚焦该行，不出气泡。
  - 去重：`ReaderHighlights` 通过新 prop `onHighlights` 把当前清单回传，`ResourceDetail.mark()` 建高亮前按
    页号 + exact + 偏移找相同锚点——有则样子相同直接返回、不同只 PATCH 变了的字段；新建的一条也立刻记进清单，
    列表读取中不回传空表（Review F1 修订，此前重读那一拍会把它抹掉）。
  - 写作框：`onSubmit` 改回 `{ outcome }` 四态；选区是已有评论的高亮 → 心得存为独立心得并提示「那段已经有评论了」，
    不改绑；回滚只针对本次新建的高亮。
  - 测试：`ReaderQuote.test` 新 describe 三条（同段两次只一条 / 换色只 PATCH color；注释工具标下即聚焦并配对；
    已有评论的段落走 taken）；`ReaderHighlights.test` 一条（注释工具点选 → onOpenPanel + 聚焦、无气泡、清单回传）；
    e2e `reader-highlights` 一条真后端（两次标只剩一条且换色不加条、注释工具选中即写、点已有高亮直接聚焦）。
- 命令与真实结果（2026-09-30，macOS 本机）：
  - `cd frontend && npx vitest run` → 40 files / 870 passed；`npx tsc -b`、`npx eslint .`（仅基线 PdfReader 警告）、
    `npx prettier --check src e2e` 通过。
  - `cd frontend && npx playwright test` → **89 passed (1.3m)**。
  - `backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-099-note-tool.md --worktree`
    → `CHECKS PASS`，`files=12 product_fingerprint=4b7184e33e0942f2cdc634198b22bd75b00e81e44239aa8a899ce939f4f5fcec`。
- Review R1（PASS with notes）修订：F1 列表读取中不回传清单；F2 写作框的「已有评论」按列表里真配上的心得判，
  悬挂 note_id 不算；F3 注释工具下标不成也打开右栏让错误可见。F4（换色走整表重读而非本地覆盖）记为遗留。
- 已知限制：去重只认锚点完全相同；部分重叠仍会各建一条。去重依据是右栏已读到的清单，首次列表还没读完的那一瞬
  （打开页面立刻标）可能漏判一次。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：首轮 `cb5ac13`（PASS with notes）→ 最终 **`c96d209`**（增量复核 PASS with notes）。
- Review（L2，独立只读 Reviewer 子代理 `.claude/agents/reviewer.md`，仅 Read/Grep/Glob；两轮同一 Reviewer）：

  **R1（候选 `cb5ac13`）原文**：

  > **只读证明**：本 Agent 仅授予 Read/Grep/Glob，无 Write/Edit/Bash，未改任何文件。
  > **候选/基线**：candidate `cb5ac13`，base `736ee78`；按干净工作区直接审 12 个改动文件，均在 `allowed_paths` 内（styles.css 未动，注释按钮复用 `.reader-tools .reader-tool ${color}` 尺寸/按下态，足够；640px 以下整组 `display:none` 仍成立；1440px 顶栏一行守卫由全套 e2e 89 passed 覆盖）。
  > **授权对照**：去重按「页号+exact+偏移」精确匹配，三条入口（工具松手、胶囊、写作框）都经 `ResourceDetail.mark()`；「注释」工具两条路（选中即标+聚焦评论框；点已有高亮直接聚焦、无气泡）实现准确，未越出非目标。dedup 命中已有高亮返回「那条」的语义对三个调用方都合理。`fresh` 用提交时渲染闭包的 `highlights` 判断，可靠。测试真守行为：单测三条断言了 POST 计数、PATCH 只带 `color`+`expected_version`、`taken` 文案且无 PATCH；`setTimeout 50ms` 那条是确定性的；e2e 走真后端核对服务端条数。
  > **Findings**
  > - **F1（可记录后继续）** `ReaderHighlights.tsx:212-214` + `ResourceDetail.tsx:426`。`setHighlightRevision` 换 key 后 `useResourceQuery` 返回 `undefined`，`highlights` 变 `[]`，effect 立刻 `onHighlights([])` 把 `mark()` 刚写进 ref 的那条抹掉，直到列表重读回来。记录「新建的一条也立刻记进清单」实际不成立。建议：`if (result) onHighlights?.(highlights)`，并订正记录。
  > - **F2（可记录后继续）** `ReaderHighlights.tsx:522` `taken = target.note_id !== null`。高亮可带悬挂 `note_id`（心得在 /notes 解除绑定时后端不清高亮侧）；此时写作框会提示「那段已经有评论了」而评论框却是空的。可用 `highlightRows` 里的 `row.note != null` 判 `taken`。
  > - **F3（可选建议）** `ResourceDetail.tsx:444-448`：注释工具下 `mark()` 失败时什么都不打开，`markError` 落在收起的右栏里看不见。可在失败时也 `setNotesOpen(true)`。
  > - **F4（可选建议）** `ResourceDetail.tsx:415-423`：去重换色走 `setHighlightRevision` 整表重读，与面板的本地覆盖不一致；功能正确。
  > **结论：PASS with notes**（F1 建议同任务顺手修+订正记录）。

  **R2（增量 `cb5ac13..c96d209`）原文**：

  > **只读证明**：仅 Read/Grep/Glob，无写工具，未改任何文件。
  > **范围**：增量 diff 3 文件 77 行，已用 Grep 确认工作区含全部三处修订。**继承 R1 对 cb5ac13 已核对无问题的全部范围**；增量未触及这些路径以外的代码。
  > **F1 验证**：`result` 与 `highlights` 同源变化，加进依赖不会多触发；`result === undefined` 时跳过，父级 ref 里 `mark()` 刚写入的一条得以保留——修订成立。列表读失败时回传 `[]`、去重关闭：正确行为。首次挂载不回传，与记录「首次列表还没读完那一瞬可能漏判」一致。无漏回传。
  > **F2 验证**：新建 target → `taken=false` → 配对；已有且真配心得 → `taken=true`；悬挂 `note_id` → `taken=false` → 覆盖悬挂值，与 `saveComment` 一致。
  > **F3 验证**：注释工具下无论成败都开右栏/切 Tab，成功才聚焦；无害。
  > **Findings（本轮）**
  > - **F5（可记录后继续）** F1/F2/F3 均无新增测试绑定；现有 870 条未退化。不阻断。
  > - 证据说明：全套 e2e 89 passed 绑定的是 cb5ac13；本轮只跑 4 个 spec 24 passed。F1 只改变回传时机、不改渲染，风险低，接受。
  > **结论：PASS with notes**（覆盖 c96d209；F5 与 F4 一并记入非阻断遗留项即可）。

- Acceptance：L2 N/A。
- 最终状态/风险/用户操作：**ACCEPTED**（L2）。待用户本机看过后 push 开 PR（→ 098 分支）；合并顺序 098 → 099；用户合并后登记 MERGED。
- 非阻断遗留项：R1 F4（去重换色走整表重读，可改走本地覆盖通道）；R2 F5（F1/F2/F3 三处修正路径没有专门用例）。
- 日期与决定日志：2026-09-30 用户本机检查 098 提出两点 → 登记本任务（叠在 098 分支 `736ee78` 上）→ 候选 `cb5ac13` R1 PASS with notes → 修订 `c96d209` R2 PASS with notes → ACCEPTED。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
