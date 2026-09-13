# TASK-055：左栏折叠按钮尺寸统一、收起态图标居中

```toml
schema_version = 2
id = "TASK-055"
status = "ACCEPTED"
risk = "L1"
risk_reason = "只改左栏两处 CSS（折叠按钮不被压扁、收起态导航项去掉占位的圆点并归零间距），加一条真实浏览器几何断言。不改任何 DOM、可访问名称、路由、契约、门禁；无行为变化。可证明低风险：改前改后均有实测数值。"
risk_flags = ["small-ui"]
owner = "coordinator"
base = "23c9dc5b17bc8de24e7c10ef28b06f609069e1c8"
allowed_paths = [
  "frontend/src/styles.css",
  "frontend/e2e/reader-layout.spec.ts",
  "docs/tasks/TASK-053-dedupe-body-title.md",
  "docs/tasks/TASK-055-sidebar-polish.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

- **用户授权**：2026-09-12 用户提出「左侧菜单栏的切换图标，收起与展开状态下大小不一样；我的学习中的四个功能的图标也不在中央」，要求优化。主 Agent 检查后用户确认按检查结果直接修（本项无需再定形态）。
- **实测（1440×900，main `23c9dc5`）**：
  - 折叠按钮 `.nav-toggle` CSS 为 32×32，展开态实测 **32×18**、收起态 32×32。原因：`.sidebar` 是 `flex-direction: column`、`height: 100dvh`，展开态内容超出容器高度时各子项按默认 `flex-shrink: 1` 被压缩，按钮没有 `min-height` 被压成 18px；收起态内容更少不溢出。
  - 收起态导航项宽 47px（中心 x=33.5），图标 21px 宽、中心 x=27，**偏左 6.5px**。原因：`.nav-dot`（5px，`margin-left:auto`）在收起态仍渲染占位，加上 13px 的 `gap`。
- **目标**：① 折叠按钮在两态都是 32×32（`flex-shrink: 0`）；② 收起态导航项与「添加资料」的图标水平居中（±1px）：收起态隐藏 `.nav-dot`、`gap: 0`。
- **非目标**：不改按钮的位置/样式风格；不改展开态任何几何；不改 ≤760px 的顶栏档；不动 `App.tsx`。

### 顺带完成的状态登记

`docs/tasks/TASK-053-dedupe-body-title.md` 在 `allowed_paths` 内，仅用于把 `status` 由 `ACCEPTED` 登记为 `MERGED`（2026-09-12 用户合并 PR #61，merge `23c9dc5`，已双向核实），并同步索引。

## 完成条件

1. e2e（`reader-layout.spec.ts` 既有「collapsing the sidebar…」用例内补断言，或新用例）：展开态与收起态 `.nav-toggle` 均为 32×32（±1）；收起态每个 `.primary-nav a` 内图标中心与链接中心差 ≤1px；「添加资料」同理。
2. 新断言对改前 CSS 变红（记录验证）。
3. 既有单测/e2e 全部通过；`check_task.py` frontend profile PASS。

## 实现与测试

- **变更**：`styles.css` 两处——`.nav-toggle { flex-shrink: 0 }`；`.app-shell.nav-collapsed .primary-nav a, .add-link { gap: 0 }` + `.app-shell.nav-collapsed .nav-dot { display: none }`。`reader-layout.spec.ts` 新增用例「the sidebar toggle keeps its size and collapsed icons sit centered」：两态 `.nav-toggle` 均 32×32（±0.5）、收起态五个入口图标中心与入口中心差 ≤1px。
- **判别性**：先写用例后改 CSS，改前实跑 → 红（`展开态按钮高：Expected 32, Received 18`）；改后 reader-layout + scaffold 10 passed。
- **目视**：两态截图核对——按钮同尺寸方形；收起态四个图标与「+」均居中。
- **检查**：见 EVIDENCE。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：`f13942e`（实现 `c8999af` + risk_flags 词表修正；本行为其后的补记）。
- 检查：`check_task.py --candidate f13942e` → `STATIC PASS`，`files=5`，`product_fingerprint=7559daee…`，`profiles=frontend` 五项 exit 0，`562 passed` → **CHECKS PASS**；`npm run test:e2e` **58 passed**（基线 57 + 1）。
- Review：**L1，N/A**。Acceptance：**L1，N/A**。
- 最终状态：status=**ACCEPTED**；待用户合并。
- 非阻断遗留项：无。
- 日期与决定日志：2026-09-12 用户提出；主 Agent 实测定位（flex-shrink / nav-dot 占位）后修，先写红用例再改。
<!-- EVIDENCE:END -->
