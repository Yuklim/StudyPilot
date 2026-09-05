# TASK-031：修复 main 基线 e2e 4 条红（导航分组/折叠选填字段同步 + 资料库 320px 横向溢出）

```toml
schema_version = 2
id = "TASK-031"
status = "READY"
risk = "L2"
risk_reason = "两类改动：(1) 三条 e2e 红是测试与 TASK-025/026 后真实 UI 不同步（导航拆成「主要导航/更多能力」两组、选填字段收进 `<details>` 折叠区），属测试侧修正，必须按真实用户路径补操作而不是删断言；(2) 一条是真实响应式缺陷——`/resources` 在 320px 下 documentElement.scrollWidth=338 横向溢出，源于 `.resource-filter-top` 不换行把 `.view-switch` 挤出视口，需改共享 `styles.css`，影响资料库页在所有断点的筛选行布局。不动后端、公共契约、数据模型与治理门禁；但共享样式 + 测试断言完整性需独立只读 Review，故 L2 而非 L1。"
risk_flags = ["tests", "small-ui", "business"]
owner = "coordinator"
base = "849dc1fa93d02ef90a2e4ec63931afff3e88a9fb"
allowed_paths = [
  "frontend/src/styles.css",
  "frontend/e2e/scaffold.spec.ts",
  "frontend/e2e/resource-pages.spec.ts",
  "frontend/e2e/file-pages.spec.ts",
  "docs/tasks/TASK-031-e2e-baseline-green.md",
  "docs/tasks/TASK-030-note-attach.md",
  "docs/tasks/TASK-029-title-nullable.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

- 用户授权：2026-09-05 用户在 TASK-030 合并后明确选定「修 main 基线 e2e 4 条红」为下一个任务，并要求把 TASK-030 的 MERGED 状态登记并入本任务首个控制面提交。
- 背景事实（已在基线 `849dc1f` 实测复现，不是从记录抄来的）：`cd frontend && npm run test:e2e` → **4 failed / 32 passed (1.9m)**，与 TASK-029 记录的 4 条完全一致：
  1. `resource-pages.spec.ts:4`「real UI saves WEB and PASTE…」：`page.getByLabel('来源名称（选填）')` / `('保存原因（选填）')` 位于 `ResourceForm.tsx:251` 的 `<details className="resource-more"><summary>补充信息（选填）</summary>` 折叠区内，未展开即填 → 定位不到。
  2. `file-pages.spec.ts:8`「file page saves an original…」：同因，`保存原因（选填）` 在同一折叠区内。
  3. `scaffold.spec.ts:28`「navigation, history, direct links…」：`nav = getByRole('navigation', {name:'主要导航'})` 里找 `学习记录/复习安排/主题统计` 点击超时——TASK-025 已把这三项移到第二个 nav「更多能力」（`App.tsx:53-66`，`App.test.tsx:58` 已同步用 moreNav，e2e 未同步）。
  4. `scaffold.spec.ts:90`「all pages fit a 320px viewport」：真实缺陷。定向测量（320px 逐路由）显示只有 `/resources` 溢出：innerWidth=320、scrollWidth=338，越界元素 `div.view-switch left=230 right=338`；`.resource-filter-top`（`styles.css:1065`）是 `display:flex` 且未 `flex-wrap`，其中 `.resource-actions` 与 `.view-switch` 均 `flex-shrink:0`，320px 下放不下。`/`、`/resources/new`、`/resources/synthetic-id`、`/study-records`、`/reviews`、`/topics`、`/notes`、`/unknown-page` 均不溢出。
- 目标：让 `npm run test:e2e` 在本任务候选上 **36/36 全绿**，且 3 条测试侧修正一律按真实用户路径补操作（展开折叠区、用正确的 nav 分组），不得删除或弱化任何既有断言；1 条产品缺陷用最小 CSS 修正（`.resource-filter-top` 允许换行），并保证 ≥390px 断点布局不变。
- 非目标 / 禁止范围：不改后端、不改 openapi 与中文契约、不改任何产品文案与表单字段、不重构导航或筛选区结构、不动 `ResourceForm.tsx`/`ResourceLibrary.tsx`/`App.tsx`（已实测纯 CSS 可收敛）、不新增 e2e 用例、不改 vitest 用例、不动未列路径。
- 依赖/前置条件：TASK-030 已由用户合并（PR #35，merge `849dc1f`）。无迁移、无契约依赖。
- 并行：否，单写入者 `coordinator`。
- 状态收尾并入本任务控制面提交（用户既有做法）：本记录的首个 docs 提交同时 (a) 把 TASK-030 由 ACCEPTED 标 **MERGED**（记录状态行 + 索引行）；(b) 修正一处事实错误——TASK-029 记录与索引写「用户已合并 PR #35」，但 #35 实际是 TASK-030 的 PR，TASK-029 当时没有 PR（合并提交 `dea241a` 里的 `(#35)` 为手写引用），改为准确表述并保留提交 SHA。仅动状态/合并事实引用，不碰目标、风险、路径、检查、实现与测试记录。

## 完成条件

1. `cd frontend && npm run test:e2e` 在最终候选上全绿（36 passed / 0 failed），输出真实记录；不得用 `--grep` 挑选子集充当全量证据。
2. 320px 下 `/resources` 的 `document.documentElement.scrollWidth <= window.innerWidth` 成立（`scaffold.spec.ts:110` 原断言不改而通过）；`.view-switch` 两个按钮仍可见可点、`min-height` 等既有样式不变。
3. 390px / 768px / 1440px 下资料库筛选行布局与修改前一致（`.view-switch` 仍与搜索框同一行、不换行），有实测数据支撑。
4. `resource-pages.spec.ts` 与 `file-pages.spec.ts` 通过真实展开 `补充信息（选填）` 折叠区后再填写 `来源名称（选填）`/`保存原因（选填）`，且这两条用例原有的保存、详情刷新、搜索、原件读取断言一条不少。
5. `scaffold.spec.ts:28` 用 `更多能力` nav 定位 `学习记录/复习安排/主题统计`，其余断言（`aria-current`、焦点、`unexpectedRequests` 为空）保持不变。
6. `npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build` 全绿（vitest 应仍为 337 passed，无新增/减少）。

## 上下文包

根规则 + `frontend/AGENTS.md` + 本记录；`frontend/e2e/{scaffold,resource-pages,file-pages}.spec.ts`、`frontend/playwright.config.ts`；`frontend/src/styles.css` 的 `.resource-filter-top`(1065)/`.view-switch`(1157)/`.resource-filters`(1130 附近)；`frontend/src/App.tsx:41-66`（两组 nav）与 `App.test.tsx:50-60`（已同步写法参照）；`frontend/src/features/resources/ResourceForm.tsx:245-275`（折叠区）与 `ResourceLibrary.tsx:60-95`（筛选行结构，只读参照）。不做全仓扫描。

准确命令：
- `cd frontend && npm run test:e2e`（全量 36 条；Playwright 自起 backend 18000 + vite 15173）
- `cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build`
- `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-031-e2e-baseline-green.md --candidate <SHA>`

## 实现与测试

- 实现 SHA/变更摘要：（待填）
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：（待填）
- 已知限制/未完成项：（待填）

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：（待填）
- Review：L2 需独立只读 Reviewer（待填身份、权限证据、base..candidate、findings/No findings、结论）。
- Acceptance：L2 → N/A。
- 最终状态/风险/用户操作：（待填）
- 非阻断遗留项：（待填）
- 日期与决定日志：2026-09-05 用户在 TASK-030 合并后选定本任务；同日在基线 `849dc1f` 实测复现 4 条红并定位根因（3 测试侧 + 1 真实 320px 溢出），登记为 L2。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
