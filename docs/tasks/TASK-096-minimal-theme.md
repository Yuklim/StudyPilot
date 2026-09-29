# TASK-096：简约风格改版——灰底蓝强调的新色板，去掉手帐装饰

```toml
schema_version = 2
id = "TASK-096"
status = "ACCEPTED"
risk = "L2"
risk_reason = "全站视觉改版：把 styles.css 里 164 个散落色值收成一套设计变量并换成灰 + 蓝强调的新色板，去衬线、统一圆角，删掉手帐装饰（便签、眉标、副标题、徽章、书本插画、签名）。不改任何交互与数据，但改动面大（一个 3900 行的样式文件 + 4 个组件的装饰性 JSX），且用户可见；须独立只读 Reviewer 检查最终 diff；独立验收 N/A。执行链：1 Worker → 自动检查 → 1 独立只读 Reviewer。"
risk_flags = ["business"]
owner = "coordinator"
base = "324e9c41bf6c70ba077a62811fa6be5a91ebdd00"
allowed_paths = [
  "frontend/src/styles.css",
  "frontend/src/App.tsx",
  "frontend/src/shell/Screen.tsx",
  "frontend/src/shell/Icon.tsx",
  "frontend/src/shell/ShellPages.test.tsx",
  "frontend/src/ErrorBoundary.tsx",
  "frontend/src/features/resources/ResourceLibrary.tsx",
  "frontend/src/features/resources/ResourceLibrary.test.tsx",
  "frontend/src/features/taxonomy/ClassificationManager.tsx",
  "docs/tasks/TASK-096-minimal-theme.md",
  "docs/tasks/TASK-093-highlight-style-color.md",
  "docs/tasks/TASK-094-annotation-toolbar.md",
  "docs/tasks/TASK-095-reader-math.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-29 用户：「我主要是想改一下页面风格，改成简约风格，颜色不想用现在的清新绿色，一些手帐元素也可以删掉」→
「主要是想去掉一些无关的占用视觉的元素」→ 在 Pencil 里看过两套对比稿后：「**用灰+蓝强调，方案 1 太单调太压抑了**」。
草图：`pencil-new.pen` 里「资料库｜简约 · 方案 2（灰 + 蓝强调）」（`tBrac`）；方案 1（`JIw1D`）留作对照。

### 目标（按方案 2 草图）

1. **色板收成变量**：`:root` 新增 `--bg`/`--surface`/`--surface-2`/`--ink`/`--text-2`/`--muted`/`--faint`/`--line`/
   `--accent`/`--accent-soft`/`--accent-strong`/`--danger`/`--danger-soft`；旧名 `--paper`/`--green`/`--link` 等作别名保留。
   164 个散落色值按色相/明度映射到变量（深绿 → 强调蓝、灰绿 → 灰字、浅绿 → 线/浅底、米白 → 白/浅灰、红褐 → 危险色），
   四色高亮体系（黄/绿/蓝/粉与其线色）**原样保留**。
2. **去装饰**：删掉侧栏便签（`.sidebar-note`）、品牌副标题「个人学习手帐」、顶栏「本机学习空间」徽章、页头眉标
   「STUDYPILOT / YOUR LEARNING JOURNAL」、概览页的「A LITTLE EVERY DAY」眉标与右侧手帐装饰（和纸胶带/日期/书本插画/签名）、
   空态里的书本插画（`.book-mat`/`BookSketch`）。对应 CSS 规则一并删。
3. **字与形**：衬线体标题改无衬线（删 15 处 `font-family: … serif`）；不对称圆角（8 处）统一 8px；虚线边框（11 处）改实线或去掉。
4. 结构、布局、交互、文案（除装饰性文案）不动；既有 e2e 像素守卫（顶栏一行、正文列宽、不横向溢出）继续绿。

### 非目标 / 禁止范围

- 不改页面结构与导航模型；不换字体；不做深色模式；不改高亮四色。
- 不动 README/截图（随下一次文档追平）。
- 顺带登记：TASK-093/094（随 PR #103，merge `413804f`，2026-09-29）、TASK-095（PR #104，merge `324e9c4`）记 MERGED。

## 完成条件

- `styles.css` 里不再有绿系色值与米白（除四色高亮体系）；色值集中在 `:root`。
- 装饰元素在 DOM 里不存在（`sidebar-note`/`journal-decoration`/`book-mat`/`eyebrow`/`workspace-badge` 均为 0）。
- 单测、全套 e2e 全绿；`check_task.py` PASS。
- 每个主要页面（概览、资料库、阅读器、心得、心得录入、学习记录、分类整理）真机截图给用户看过；独立只读 Reviewer 结论。

## 上下文包

- 草图节点：`tBrac`（方案 2）、`JIw1D`（方案 1）。色板：bg #ffffff / surface #fafafa / surface-2 #f3f4f6 / ink #111318 /
  text-2 #374151 / muted #6b7280 / faint #9ca3af / line #e5e7eb / accent #2563eb / accent-soft #eff4ff / accent-strong #1d4ed8 /
  danger #b91c1c / danger-soft #fef2f2。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-096-minimal-theme.md --worktree`；
  `cd frontend && npx playwright test`。

## 实现与测试

- 实现 SHA/变更摘要：实现与登记同一个提交（SHA 在 EVIDENCE 区作候选记录；之后的证据写回是另外的提交）。变更：
  - `styles.css`：`:root` 重写为 13 个设计变量 + 旧名别名（`--paper`/`--green`/`--link`/`--button-*`/`--sidebar-bg`）+
    四色高亮体系原样；164 个散落色值**按色相/明度脚本映射**（深绿→`--accent`、灰绿→`--muted`、中绿→`--faint`、浅绿→`--line`/
    `--surface-2`、米白→`--bg`/`--surface`、红褐→`--danger`/`--danger-soft`、`#303a32`→`--ink`），8 位带透明度的色值改
    `rgba(17,19,24,…)`/`--surface-2`，`rgba(255,253,248,…)`→白；`:root` 之外不再有色值（高亮四色与 `#fff` 除外）。
    9 处衬线字体改 `var(--font-sans)`；8 处不对称圆角→8px、15 处 ≥16px 圆角→12px；11 处虚线→实线。
    删掉装饰规则（`.sidebar-note`/`.note-pin`/`.workspace-badge`/`.eyebrow`/`.journal-decoration`/`.washi-tape`/
    `.journal-date`/`.journal-signature`/`.book-sketch`/`.book-mat`/`.brand-copy > span`）。
    第二轮按截图微调：品牌标改 32px 蓝底白「S」（收起态仍 44px 高，守卫要求）；资料行去左侧色条、圆角 8；次要按钮
    改墨色字 + 浅灰边；删除类按钮平时灰、悬停才红；角标由红改蓝；概览首屏卡片改浅灰底；折叠按钮去边框。
  - JSX：`App.tsx` 删副标题「个人学习手帐」、侧栏便签、「本机学习空间」徽章、页头眉标；`Screen.tsx` 删概览页眉标
    「A LITTLE EVERY DAY」与右侧手帐装饰块、空态书本插画；`ResourceLibrary.tsx` 删空态书本插画、去掉「知识手帐」文案；
    `Icon.tsx` 删 `BookSketch`；`ClassificationManager.tsx` 删眉标「SMALL LABELS, GROWING IDEAS」（登记时漏列，
    实施中补进 allowed_paths，理由同上：它就是手帐眉标）。
  - 测试：无需改动——没有测试绑到被删元素；`App.test.tsx` 断言的页脚文案保留。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：
  - `check_task.py --task docs/tasks/TASK-096-minimal-theme.md --worktree` → 退出码 0，**CHECKS PASS**，`files=11`，
    `product_fingerprint=b0f79749b6cb3f0ef2b9f87a061f50eb63a030dbe75b665db8c7667d64330ab8`，`profiles=frontend`
    （lint/format/`tsc -b`/build；vitest 38 文件 **846** 条全过）。
  - `npx playwright test`（全套）→ 第一轮 85/86：`reader-layout.spec.ts:235`「收起态 logo 高不变」红（我把品牌标改成 32px
    方块，收起态守卫要 44px）→ 收起态补回 44px 高 → 该 spec 绿 → 全套重跑 **86/86**。
  - 真机截图（一次性 spec，已移出工作区）：概览、资料库、阅读器（含高亮/下划线/公式/右栏）、我的心得、新心得、学习记录、
    分类整理七页各两轮，第二轮与方案 2 草图对得上。
- **第二次实现提交（按第一轮 Review，RETURNED → 修）**：
  - 必须修复 F1–F3：删规则的脚本把三条复合选择器的前半截粘到了下一条规则上（`.welcome-copy .welcome-copy h2`、
    `.journal-decoration .overview-actions`、`.page-heading .page-heading p`），概览标题、快速开始按钮组、窄屏页头的样式
    因此失效而 e2e 没有守卫——已改回正确选择器，并用 `^\s*\.x \.y \{` 模式全文核过没有第四处。
  - F4「粘贴」来源标签被映成红字 → `--text-2`；F5 `.resource-card::before` 两条「胶带」伪元素删掉；F6 `.capability-list strong`
    回 `--ink`、删除确认正文回 `--text-2`；F7 「后续能力」链接与 PDF 占位文字由 `--faint` 改 `--muted`（对比度 <3:1 → ≥4.5:1）；
    F8 两处 `.sidebar-note` 死选择器删掉，`ErrorBoundary.tsx` 的眉标 span 删掉（补进 allowed_paths，理由：与其余眉标一致；
    `.small-label` 的三处小标题是内容标题不是装饰，保留）。
  - 重跑：七页截图第三轮（概览标题与按钮组回位）；全套 e2e **86/86**；`check_task.py --worktree` → 退出码 0，**CHECKS PASS**，
    `files=12`，`product_fingerprint=d82960ebe1f5c95a5c0a4cd43d88da472c990763377f8a28fd8cc71ec9c54cb0`（vitest 846）。
- 已知限制/未完成项：
  - 色值映射是按色相/明度机械做的，个别地方的深浅可能与设计意图差一档（例如某些 hover 底色），用户看过截图或本机后再微调。
  - README 与截图仍是旧风格（随下一次文档追平）。
  - 深色模式不在范围。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：`d9d3fae`（= `994247e` 实现 + 登记 → `c5e377b` 补一行记录 → 按 Review 的 `d9d3fae`）。本条证据写回是之后的另一个提交。
- Review：独立只读 Reviewer（`.claude/agents/reviewer.md`，工具仅 Read/Grep/Glob，运行器层无写工具）。
  **第一轮**（`324e9c4..c5e377b`）报告原文：
  > 权限证据：仅 Read/Grep/Glob（无 Write/Edit/Bash，运行器层面只读）。
  > **结论：RETURNED**（3 处必须修复的机械错误，均低成本；其余可记录/可选）
  > **审查范围**：候选 `c5e377b`；base `324e9c4`；完整读了 diff-096.patch（1849 行）并回到工作区 `styles.css` 核实；JSX 5 个文件的删除全部核对；e2e 目录 grep 无守卫绑到被删/受影响元素。
  > **必须修复**（脚本删规则时把复合选择器的前缀留给了下一条，规则永不命中；与「布局不动」矛盾，e2e 无守卫故 86/86 抓不到）：1. `styles.css:334` `.welcome-copy .welcome-copy h2 {` → 应为 `.welcome-copy h2`，概览标题回落浏览器默认 h2。2. `:367` `.journal-decoration .overview-actions {` → 应为 `.overview-actions`，快速开始按钮组丢 flex/gap/margin。3. `:1892`（窄屏媒体查询）`.page-heading .page-heading p {` → 应为 `.page-heading p`。建议顺手 grep `^\s*\.[\w-]+ \.[\w-]+` 确认无第四处。
  > **可记录后继续**：4. `.source-chip.paste { color: var(--danger) }`「粘贴」来源标签全变红字，违反「红只留给删除」（原棕字），建议 `--text-2`。5. `.resource-card::before` 与 `nth-child(even)::before` 仍画旋转「胶带」。6. `.capability-list strong` 与 `small` 同为 `--muted`，层级丢；`.deletion-dialog-body` 整段改红字偏重。7. 对比度：`--muted` 白底 4.83:1 达标；`--faint` 作文字的「后续能力」链接 ≈2.3:1、pdf 占位 ≈2.5:1，低于 3:1（改前 ≈2.8/2.1，非本次引入但略降）。
  > **可选**：8. 两处仍引用已删的 `.sidebar-note`；`ErrorBoundary.tsx:36` 仍用 `.eyebrow`（CSS 已删，该文件不在 allowed_paths）；`.small-label` 眉标三处仍在，与分类页删眉标不一致。
  > **已核实无问题**：`BookSketch` 无残留引用；`.brand-mark` 本就 `aria-hidden`、可访问名由 `Link aria-label` 提供；被删节点均为装饰/`aria-hidden`；rgba 替换透明度一致；`:root` 外无色值、无 `dashed`、无 `serif`；可数描述与 diff 一致；收起态 44px 处置合理。
  主 Agent 处置：1–8 全部落实（`d9d3fae`；`.small-label` 三处保留并说明理由），请同一 Reviewer 增量复核。**增量复核**（`c5e377b..d9d3fae`）报告原文：
  > 权限证据：仅 Read/Grep/Glob。
  > **结论：PASS，覆盖最终候选 `d9d3fae`**（继承上一轮对 `324e9c4..c5e377b` 的完整审查，本轮只审增量 130 行及受影响上下文）。
  > ① 三条选择器已回到与 base 规则同义的 `.welcome-copy h2`（声明块与原规则一致，仅字体换 sans）、`.overview-actions`（flex/wrap/gap 同原）、媒体查询里的 `.page-heading p`。全文复核无第四处。② F5 删除后 `.resource-card` 的 `position: relative` 已无绝对定位后代依赖，属无害残留，可选清理。③ F4/F6/F7/F8 改动与记录逐条一致；`allowed_paths` 含 `ErrorBoundary.tsx`；`files=12` = 7 产品 + 5 文档；`.eyebrow`/`.sidebar-note` 已无引用。
  > **No findings**（阻断级）。
- Acceptance：L2 N/A。
- 最终状态/风险/用户操作：**ACCEPTED**（L2：自动检查 PASS → 独立只读 Review 一轮 RETURNED + 增量复核 PASS）。风险：纯视觉；
  最坏情况是某处深浅不合意，改一个变量或一条规则即可。**等待用户操作**：刷新本机页面看过（工作区已在本分支，前端热更新），
  说可以再推 PR。
- 非阻断遗留项：`.resource-card` 多余的 `position: relative`（无害）；`.small-label` 三处保留；README/截图待文档追平。
- 日期与决定日志：2026-09-29 用户提出简约改版 → 两套 Pencil 对比稿 → 选定方案 2 → 登记本任务。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
