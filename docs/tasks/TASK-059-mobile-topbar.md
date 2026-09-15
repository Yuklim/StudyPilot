# TASK-059：≤760px 顶栏两组导航重叠、折叠按钮无意义显示

```toml
schema_version = 2
id = "TASK-059"
status = "ACCEPTED"
risk = "L1"
risk_reason = "只改 ≤760px 媒体查询下的三条 CSS（第二组导航的网格行、折叠按钮隐藏），加一条真实浏览器几何断言。不改 DOM、可访问名称、路由、契约；桌面布局不受影响。可证明低风险：改前改后均有实测。"
risk_flags = ["small-ui"]
owner = "coordinator"
base = "5f58545ed96a8c8e421a9a0f2c9e695dd2e3b393"
allowed_paths = [
  "frontend/src/styles.css",
  "frontend/e2e/scaffold.spec.ts",
  "frontend/e2e/reader-layout.spec.ts",
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

### 实现中修订授权范围（登记后、冻结前）

追加 `frontend/e2e/reader-layout.spec.ts`：既有「collapsing the sidebar…」用例在 390px 用「展开导航栏」按钮可见来确认折叠态仍在；折叠按钮按目标 ② 在 ≤760px 隐藏后，该确认改为断言外壳带 `nav-collapsed` 类（它正是那条 `width:68px` 规则的选择器，语义等价，随后的「侧栏不是 68px 窄带」断言不变）。

## 完成条件

1. `scaffold.spec.ts` 既有「all pages fit a 390/320px viewport」用例内补断言：主导航与「更多能力」导航中所有链接的 boundingBox 两两不相交、均在视口内；折叠按钮不可见。改前变红（记录）。
2. 既有单测/e2e 通过；`check_task` frontend PASS。

## 实现与测试

- **变更**：`styles.css` ≤760px 块两处——`.nav-section-more { grid-row: 3 }`；`.nav-toggle { display: none }`（放在文件末尾那个 ≤760px 块里：`.nav-toggle` 基础规则在原块之后，同特异度靠顺序取胜——首次放在前一个块里实测无效，e2e 抓到）。
- **测试**：`scaffold.spec.ts` 两档视口用例内补断言：「主要导航」+「更多能力」全部链接两两 boundingBox 不相交、右沿在视口内、`.nav-toggle` 隐藏（沉浸式阅读页除外，那页没有顶栏）。改前实跑红：「学习概览」与「学习记录」重叠。`reader-layout.spec.ts` 折叠态确认改为断言 `nav-collapsed` 类（见范围修订）。
- **目视**：390px 截图两组导航上下排列、无折叠按钮。
- **检查**：`check_task.py --candidate 68d62c3` → `STATIC PASS`，`files=4`，`product_fingerprint=250cb5b6…`，frontend 五项 exit 0，**571 passed** → **CHECKS PASS**；`npm run test:e2e` **60 passed**（基线 60，断言只增）；`git diff --check` exit 0。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：`68d62c3`（实现 + 测试同一提交；本行为其后的补记）。
- Review：**L1，N/A**。Acceptance：**L1，N/A**。
- **合并前并入 main（2026-09-14）**：用户合并 PR #66（TASK-058，merge `5f58545`）后本 PR 出现索引冲突；`git merge origin/main` → `761e08b`，只解 `任务索引.md` 表头相邻行（保留 main 的 058/057 行 + 本分支 059 行）。核实 `git diff 68d62c3..761e08b -- backend/ frontend/` 的增删行与 `881e9ae..5f58545`（即 TASK-058 的改动）逐行一致，本任务代码未变；基线前移为 `5f58545`。并入后 `check_task.py --worktree` → CHECKS PASS（571），e2e 60 passed（真实后端跑在 TASK-058 的事务模式下）。
- 最终状态：status=**ACCEPTED**；待用户合并。
- 非阻断遗留项：无。
- 日期与决定日志：2026-09-14 用户「老问题修复一下」之二；主 Agent 读 CSS 定位根因（同一选择器命中两组导航），先写红用例再改。
<!-- EVIDENCE:END -->
