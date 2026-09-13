# TASK-059：≤760px 顶栏两组导航重叠、折叠按钮无意义显示

```toml
schema_version = 2
id = "TASK-059"
status = "IN_PROGRESS"
risk = "L1"
risk_reason = "只改 ≤760px 媒体查询下的三条 CSS（第二组导航的网格行、折叠按钮隐藏），加一条真实浏览器几何断言。不改 DOM、可访问名称、路由、契约；桌面布局不受影响。可证明低风险：改前改后均有实测。"
risk_flags = ["small-ui"]
owner = "coordinator"
base = "881e9aeb1244af1a2885e7d8d390fb473bfd6827"
allowed_paths = [
  "frontend/src/styles.css",
  "frontend/e2e/scaffold.spec.ts",
  "docs/tasks/TASK-059-mobile-topbar.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

- **用户授权**：2026-09-12 用户「老问题修复一下」之二（TASK-056 发现：手机宽度顶栏「我的学习」四项与「后续能力」三项文字互相盖住，`main` 即存在）。
- **根因**（读 `styles.css` ≤760px 块）：左栏在窄屏变为顶栏网格（两列），规则 `.nav-section { grid-column: 1 / -1; grid-row: 2 }` 同时命中两个 `.nav-section`（主导航与 `.nav-section-more`），两组都被放进第 2 行 → 重叠。另外折叠按钮 `.nav-toggle` 在顶栏布局里仍显示，而折叠在这一档没有意义（宽度规则只在 ≥761px 生效，点了只会隐藏品牌文字与标签）。
- **目标**：① `.nav-section-more` 在第 3 行（`grid-row: 3`），两组导航上下排列、互不重叠；② ≤760px 隐藏 `.nav-toggle`；③ 320/390 两档不横向溢出、所有导航链接可见且两两不相交（几何断言）。
- **非目标**：不改导航项数量/顺序/图标；不改 ≥761px 任何规则。

## 完成条件

1. `scaffold.spec.ts` 既有「all pages fit a 390/320px viewport」用例内补断言：主导航与「更多能力」导航中所有链接的 boundingBox 两两不相交、均在视口内；折叠按钮不可见。改前变红（记录）。
2. 既有单测/e2e 通过；`check_task` frontend PASS。

## 实现与测试

（实施后填写）

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

（实施后填写）
<!-- EVIDENCE:END -->
