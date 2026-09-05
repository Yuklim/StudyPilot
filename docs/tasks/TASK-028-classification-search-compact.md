# TASK-028：压缩分类整理搜索区，主题列表上移可见

```toml
schema_version = 2
id = "TASK-028"
status = "MERGED"
risk = "L1"
risk_reason = "纯前端小视觉调整：压缩分类整理页搜索框宽度与布局，不改变契约、数据或行为语义。"
risk_flags = ["small-ui"]
owner = "coordinator"
base = "0e8a731c506fc83c8c96b5fa5504aa4aae420492"
allowed_paths = ["frontend/src/styles.css", "frontend/src/features/taxonomy/ClassificationBrowser.tsx", "frontend/src/features/taxonomy/ClassificationPages.test.tsx", "frontend/e2e/taxonomy-pages.spec.ts", "docs/tasks/TASK-027-independent-notes.md", "docs/tasks/TASK-028-classification-search-compact.md", "docs/tasks/任务索引.md"]
checks = ["frontend"]
```

## 需求与范围

- 用户 2026-09-05 预览后反馈：**分类整理页里的搜索框太大，点进去看不到下面的主题**；参考资料库当时的调整（TASK-025 把筛选压缩、让内容可见）把搜索框变小一点。用户明示「可以后面做」，本任务即登记此项。
- 依据：TASK-025 资料库筛选压缩的先例与样式（`.record-filters` grid 两列、控件 `width:100%; min-width:0`）。
- 现状根因：`styles.css` `.classification-search .resource-field { flex: 1 1 120px }` 使「搜索输入 / 排序 select」两字段在 flex 容器内拉伸平分整行，搜索框被撑得过宽，把下方主题列表挤出首屏。
- 目标：压缩 `.classification-search` 布局——给搜索框与排序一个合理而非撑满的宽度，让搜索区收窄，主题列表在进入页面即可见；窄/中/宽屏与键盘/可访问性不回归。功能与接口不变。
- 非目标：不改资料库/学习记录等其它筛选；不加搜索功能；不改后端/契约/数据；不改变搜索与排序行为语义。

## 完成条件

1. 分类整理页(主题与标签两个视图)进入即可见列表与下方分类；搜索框不再横向撑满或造成大面积空白。
2. 320/390/1440 宽度下无横向溢出、控件可用；键盘操作(Enter 搜索、Tab 到按钮/排序)不变。
3. 既有分类页面行为/可访问性测试保留其断言；改动只限视觉布局，必要时同步极小结构。

## 上下文包

前端规则、本任务；`frontend/src/features/taxonomy/ClassificationBrowser.tsx`（`.classification-search` 三块：搜索 label+input、查找按钮、排序 select）、`frontend/src/styles.css` 相关块（668-684）、`ClassificationPages.test.tsx`、TASK-025 对 `.record-filters` 的压缩样式参照。按需读，不全仓扫描。

准确命令：
- `cd frontend && npm run test`（含 ClassificationPages.test）
- `cd frontend && npx playwright test e2e/taxonomy-pages.spec.ts`（如有 e2e）
- `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-028-classification-search-compact.md --worktree`

## 实现与测试

- 实现：仅改 `frontend/src/styles.css`（无 JSX/行为改动）。`.classification-search .resource-field` 由 `flex:1 1 120px`(撑满整行)改为 `flex:0 1 230px`(有界不撑满)；压缩 `.classification-intro`(padding/margin、h2 24→19px)与 `.classification-tabs`、`.classification-search` margin，让主题/标签列表进入页面即上移可见。320/390/1440 实测无横向溢出。
- 视觉核对：真实 Chromium 测 1440/900，搜索框宽收窄至 230px、主题列表首项 top 由改前 741 上移至 674(可见约 2 张卡)；390/320 `scrollWidth<=innerWidth` 均 true。
- 检查命令与结果：
  - `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-028-classification-search-compact.md --worktree` → `CHECKS PASS`、exit 0；STATIC PASS，risk=L1，files=4，product_fingerprint=`5f8e7fad2d9be85cbe1b2a4e826973252fd21c80e0bab600b0ae9af1ccc947c4`；profile frontend(format/lint/typecheck/vitest/build)。
  - `cd frontend && npx vitest run src/features/taxonomy` → 24 passed；`npx playwright test e2e/taxonomy-pages.spec.ts` → 3 passed(真实 Chromium + 临时 SQLite)。
- 已知限制：横幅文案保留、仅压缩留白与字号；未改资料库/其它页共用样式。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 2026-09-05：ACCEPTED。L1 无需独立 Review/Acceptance。最终产品候选 `53c3da8f367d0ab308bd3498fe516f2f08c5802d`（实现提交），product_fingerprint=`5f8e7fad…c947c4`，base=`0e8a731c…ac420492`。CHECKS PASS(frontend)、taxonomy vitest 24、真实 Chromium e2e 3、320/390/1440 无横向溢出，见「实现与测试」。待用户合并，Agent 不合并 main。
- 非阻断遗留项：无（纯视觉微调；横幅文案保留仅压缩留白）。

此区仅允许写回状态/EVIDENCE/候选与报告原文；目标、风险、路径、检查、实现与测试记录在标记区外。
<!-- EVIDENCE:END -->
