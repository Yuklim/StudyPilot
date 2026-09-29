# TASK-096：简约风格改版——灰底蓝强调的新色板，去掉手帐装饰

```toml
schema_version = 2
id = "TASK-096"
status = "IN_PROGRESS"
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
- 已知限制/未完成项：
  - 色值映射是按色相/明度机械做的，个别地方的深浅可能与设计意图差一档（例如某些 hover 底色），用户看过截图或本机后再微调。
  - README 与截图仍是旧风格（随下一次文档追平）。
  - 深色模式不在范围。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：
- Review：（L2，待独立只读 Reviewer）
- Acceptance：L2 N/A。
- 最终状态/风险/用户操作：
- 非阻断遗留项：
- 日期与决定日志：2026-09-29 用户提出简约改版 → 两套 Pencil 对比稿 → 选定方案 2 → 登记本任务。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
