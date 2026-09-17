# TASK-066：侧栏 logo 与折叠按钮撑满侧栏内宽（首个 Pencil 设计稿同步）

```toml
schema_version = 2
id = "TASK-066"
status = "READY"
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

- 实现 SHA/变更摘要：（待填）
- 命令、真实退出结果：（待填）

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：
- Review：
- Acceptance：L2 N/A。
- 最终状态/风险/用户操作：
- 日期与决定日志：2026-09-16 用户「做一下同步」；冲突处理选「两态都撑满侧栏内宽」。
<!-- EVIDENCE:END -->
