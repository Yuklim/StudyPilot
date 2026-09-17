# TASK-066：侧栏 logo 与折叠按钮撑满侧栏内宽（首个 Pencil 设计稿同步）

```toml
schema_version = 2
id = "TASK-066"
status = "ACCEPTED"
risk = "L2"
risk_reason = "只改侧栏两处 CSS 宽度（small-ui），但要改写 TASK-055 那条用户确认过的 e2e 断言（收起/展开态按钮尺寸相等 → 高度相等 + 宽度与侧栏其他入口一致）。改断言含义而非仅定位方式，按 tests 归 L2：独立只读 Review；验收 N/A。"
risk_flags = ["small-ui", "tests"]
owner = "coordinator"
base = "50cfdd59fc92eea8400fdec62760a3ed9454d8dc"
allowed_paths = [
  "frontend/src/styles.css",
  "frontend/e2e/reader-layout.spec.ts",
  "docs/tasks/TASK-066-collapsed-rail-width.md",
  "docs/tasks/TASK-063-note-images.md",
  "docs/tasks/TASK-064-image-placeholders.md",
  "docs/tasks/TASK-065-sidebar-status-flake.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-16 用户在 Pencil（pen.dev）里改了资料库页折叠态侧栏的设计稿，并要求「做一下同步」。设计稿 diff（主 Agent 通过 Pencil MCP 只读比对，文件 `~/.pencil/documents/f1e68c8c-…/pencil-welcome-desktop.pen`，顶层 Frame「资料库 /resources」）：

- logo 链接 `.brand`/`.brand-mark`：折叠态 42×44 → **47×44**（撑满侧栏内宽，与下方导航项同宽）。
- 折叠按钮 `.nav-toggle`：折叠态 32×32 → **47×32**，图标居中。
- 其余节点（颜色、字号、圆角、结构）与代码一致，无差异。

主 Agent 指出与 TASK-055 断言（收起/展开态按钮尺寸相等）冲突，用户 2026-09-16 选定：**「两态都改成撑满侧栏内宽」**——展开态按钮也拉到与导航项同宽（228px 侧栏、左右 22px padding 下约 184px），logo 展开态已含文字不变。

### 目标

1. `.nav-toggle` 在展开与折叠两态都撑满侧栏内容宽度（`width: 100%`），高度保持 32px，图标居中。
2. 折叠态 `.brand` / `.brand-mark` 撑满侧栏内容宽度（47px），高度 44 不变；展开态 logo 不变。
3. TASK-055 的 e2e（`reader-layout.spec.ts` 「the sidebar toggle keeps its size…」）改为：两态高度相等（32）；两态按钮宽度均与同侧栏的「添加资料」入口 `.add-link` 宽度一致（±1px）；折叠态图标居中断言保留，并把 `.nav-toggle` 纳入居中检查。

### 非目标

不动侧栏其他元素、展开态 logo、`.primary-nav`、`.add-link`；不改 ≤760px 顶栏布局；不把 `.pen` 设计文件入库（用户未决定）。

### 禁止范围

所有未列入 allowed_paths 的路径。

### 顺带登记

把 TASK-063（PR #71，merge `8b58f39`）、TASK-064（PR #72，merge `50cfdd5`）、TASK-065（PR #73，merge `028a995`）登记为 MERGED（用户 2026-09-15 已合并，规则 §5 允许并入下一个已授权任务的控制面提交）。

## 完成条件

1. 真实浏览器（Playwright 1440×900）：展开态与折叠态 `.nav-toggle` 高度均 ≈32；宽度分别 ≈ 同态 `.add-link` 宽度；折叠态 `.brand-mark` 宽度 ≈ `.add-link` 宽度（47）。
2. 折叠态 `.nav-toggle`、`.primary-nav a`、`.add-link` 图标中心与入口中心偏差 ≤1px。
3. `check_task` frontend PASS；全套 e2e 通过；`git diff --check` exit 0。
4. L2：独立只读 Reviewer 审 base..candidate 最终 diff，结论 PASS。

## 上下文包

- 规则：AGENTS.md V2、frontend/AGENTS.md。
- 源：`frontend/src/styles.css` `.brand`(:88) `.brand-mark`(:97) `.nav-toggle`(:2765) `.app-shell.nav-collapsed …`(:2797-2820)；`frontend/src/App.tsx:130-149`；`frontend/e2e/reader-layout.spec.ts:229-263`。
- 设计依据：Pencil 文档 diff（见用户授权）；不入库。
- 检查：`frontend/` 内 `npm run lint`、`npm run typecheck`、`npm test`、`npx playwright test reader-layout`（全套 e2e 一次）、`python3 scripts/governance/check_task.py --task TASK-066 --candidate <sha>`。

## 实现与测试

- **实现 SHA**：`57d4f4e`（登记 `8a87bcf`）。`styles.css`：`.nav-toggle` `width: 32px` → `100%`；折叠态媒体块内新增 `.app-shell.nav-collapsed .brand, .brand-mark { width: 100% }`。`reader-layout.spec.ts`：TASK-055 用例改名并改写——保留两态高度 =32 且相等、折叠态图标 ±1px 居中（新增 `.nav-toggle` 入居中集合）；新增两态按钮宽 = 同态「添加资料」宽（`getByRole('link',{name:'添加资料'})`，避免与「写心得」的 `.add-link` 双命中）、展开态 >100 / 折叠态 >40、折叠态 `.brand-mark` 宽 = 「添加资料」宽且高 44。
- 本地（`frontend/`，2026-09-16）：`format:check` / `lint` / `typecheck` exit 0；`vitest run` **636 passed**（27 文件）；`playwright test` 全套 **63 passed**；`check_task --task … --candidate 57d4f4e` **CHECKS PASS**（含 build）；`git diff --check` exit 0。
- 判别性：stash 掉 `styles.css` 改动后重跑该用例 → 1 failed（`展开态按钮与「添加资料」同宽`），恢复后 6 passed。
- 真实浏览器（Pencil 内置浏览器，127.0.0.1:5173/resources，折叠态）：`.nav-toggle` 47×32、logo 与「添加资料」/导航项左右齐平，与 Pencil 设计稿一致。
- 已知限制：`.brand-mark span`「·」绝对定位 `right:5px`，折叠态变宽后相对 S 右移 5px，与设计稿一致（Review F2）。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：`57d4f4e`（范围 `50cfdd5..57d4f4e`，2 个源文件 + 5 个 docs/tasks 文件，均在 allowed_paths 内）。本次写回仅 docs 变化，形成新候选，Review 结论按其声明直接继承。
- Review（独立只读 `.claude/agents/reviewer.md`，声明仅持 Read/Grep/Glob）：**PASS**。原文摘录：「CSS：`.nav-toggle width:100%` 在 ≤760px 被 `display:none` 覆盖（scaffold.spec:165 不受影响）；`.brand/.brand-mark width:100%` 仅在 `min-width:761px` 折叠块内，展开态 `.brand` 仍 fit-content，无副作用。e2e：高度 32、两态高相等、折叠态图标 ±1px 居中均保留；宽度与 `.add-link` 同为同容器 100%/stretch，不 flaky；>100/>40 对旧固定 32 有判别性；`getByRole('link',{name:'添加资料'})` 在 /resources 唯一。」F1（必须，流程）：候选内「实现与测试」为待填 → 本次写回补齐。F2（可选）：「·」右移 5px，属预期，记录。
- Acceptance：L2 N/A。
- 最终状态：**ACCEPTED**，待用户合并。合并后 Pencil 文档里「资料库 /resources（原稿）」应重新从页面导入以对齐新基线（用户操作）。
- 日期与决定日志：2026-09-16 用户「做一下同步」；主 Agent 指出与 TASK-055 断言冲突，用户选「两态都撑满侧栏内宽」；实现 `57d4f4e`；Review PASS → 写回并置 ACCEPTED。
<!-- EVIDENCE:END -->
