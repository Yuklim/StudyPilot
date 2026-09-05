# TASK-025：阶段0 信息架构与布局收敛

```toml
schema_version = 2
id = "TASK-025"
status = "MERGED"
risk = "L2"
risk_reason = "纯前端信息架构与详情布局重构，改动导航层级、概览展示与详情分区；不触碰后端、数据库或公共 API 契约，但会同步更新被布局改动的既有前端测试断言。"
risk_flags = ["business"]
owner = "coordinator"
base = "5c527a3156acbc63a11d270e1b58ef3c674252c8"
allowed_paths = [
  "frontend/src/App.tsx",
  "frontend/src/App.test.tsx",
  "frontend/src/shell/pages.ts",
  "frontend/src/shell/Screen.tsx",
  "frontend/src/shell/Icon.tsx",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ResourceDetail.test.tsx",
  "frontend/src/features/resources/ResourceLibrary.tsx",
  "frontend/src/features/resources/ResourceLibrary.test.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/features/resources/FilePages.test.tsx",
  "frontend/src/styles.css",
  "docs/tasks/TASK-025-layout-simplification.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

- 用户授权/相关需求章节：用户 2026-09-04 逐条确认：做"阶段0 信息架构与布局收敛"。原始诉求："现在页面和流程较繁杂，参考 Zotero 的单主界面/高密度列表"，保持现有手帐暖纸风格。用户明确：未开放能力（复习/统计/主题）收进次级区而非删除、不伪装能力、允许同步更新被布局改动的测试断言。对应需求 5.3 资料库、TASK-018 基础优先。
- 目标与非目标：
  - 目标：把 6 个一级导航中的未开放/次要能力（复习安排、主题统计）收进次级区；概览页移除"三块未接入假指标"装饰，改为诚实的可读说明；提升资料库列表密度与扫读性；详情页把 心得/编辑/元数据/原文 做分区处理，缓解单列长滚；全程保持现有手帐暖纸风格。
  - 非目标：不做导入极简（阶段1a 另立 TASK-026）；不做独立心得/后贴资料/心得标签（阶段2 后置，触碰契约，另立）；不做站内预览与标注（C 后置）；不改后端、数据库、公共 API、OpenAPI 契约、数据模型；不改变资料/分类/心得的读写语义。
- 禁止范围：所有未列入 allowed_paths 的路径；不得改动 backend/**；不得改动契约/迁移；不得删除"不伪装能力"的诚实说明——复习/主题统计等未开放入口必须仍可达，只是降低视觉层级。
- 依赖/前置条件：稳定基线 `5c527a3`（= origin/main，含 TASK-023/024 MERGED 收口）。
- 并行：否。

## 完成条件

- 可观察结果：默认视口下，复习安排/主题统计不再占据一级导航主位（收进次级/更多区但仍可达）；概览首屏不再展示三块"未接入"占位数字；资料库列表视图密度较改造前提升、扫读信息层级更清晰；详情页 心得/编辑/元数据/原文 不再无差别单列长滚，改成分区（折叠/分组）。
- 必须覆盖的失败场景：复习安排、主题统计、学习记录等未开放入口在收进次级区后仍可达（不是 404 或丢失）；概览在无假数据前提下仍诚实表达"哪些已可用、哪些后续再做"；所有既有前端检查（format/lint/typecheck/vitest/build）通过；被布局改动的 App.test 等断言同步更新且如实反映新布局。

## 上下文包

适用规则：根 AGENTS.md V2；frontend/AGENTS.md（本次纯前端改动）。
必要源文件：`frontend/src/App.tsx`（导航渲染）、`frontend/src/shell/pages.ts`（导航表）、`frontend/src/shell/Screen.tsx`（Overview 与页面分发）、`frontend/src/features/resources/ResourceDetail.tsx`（详情长滚）、`frontend/src/features/resources/ResourceLibrary.tsx`（列表/卡片）、`frontend/src/App.test.tsx`（现断言 6 导航与 3 未接入占位，需随布局更新）、`frontend/src/styles.css`（1869 行布局样式）。
准确附加检查命令：见模块规则与 README "前端检查"。

## 实现与测试

- 实现 SHA/变更摘要：将 pages 增加 primary/more 分组；侧栏主导航收为「学习概览/资料库/分类整理」，未开放/低活跃的「学习记录/复习安排/主题统计」收进「更多能力」次级区仍可达；概览移除三块"未接入"假指标，改为真实能力清单 + 快速开始按钮 + 诚实说明；资料库默认视图改为高密度行式列表，卡片视图保留；「添加资料」入口提升到侧栏品牌之下、主导航之上并改为实心主按钮；资料详情页按「记录与理解」（心得+编辑）与「资料信息」（元数据/标签/原文/删除/学习面板）分成两个视觉区块。同步更新被布局改动的 App.test/ResourcePages/FilePages 断言。实现 SHA：`ffd1cdc`、`a401377`。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：`check_task.py` STATIC PASS + CHECKS PASS（base `5c527a3`，input `528efaa`）；product_fingerprint `96a123d280296660f9d4c5bce6c1b84b0b554e8136d30edbbd4a8b60905ac0e1`。format:check/lint/typecheck/vitest(315/315)/build 均 exit=0。
- 已知限制/未完成项：详情分区采用"上下两大块 + 虚线分隔"的轻量方式；是否演进为页签/折叠/两栏待用户预览后决定。阶段0 尚未独立 Review。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：`04d6249`（产品改动冻结点；后续 `528efaa`/`46825ff` 仅为任务状态与 EVIDENCE 的 docs 提交，不改变产品实现）。基线 `5c527a3`。产品提交：`ffd1cdc`（导航/概览/列表）、`a401377`（add-link 置顶+详情分区）、`daf09d9`（筛选压缩）、`04d6249`（fingerprint 回填）。
- Review：L2。**用户明确授权本任务以主 Agent 证据核对代替外部独立只读 Reviewer（本环境无 reviewer Agent 可用）**。主 Agent 核对范围与证据：候选 diff 10 文件全部在 allowed_paths 内、无越界（未改 backend/契约/数据语义）；vitest 315/315 PASS、tsc/build/format/lint 均 exit=0；完成条件逐条 Playwright 实测——概览无"未接入"假占位、含"现在可以做什么"能力区与诚实说明，复习安排/主题统计/学习记录仍可达（h1 正常）、未删入口；资料库筛选区从约 260px 压至 144px、首条资料在 900 视口内 y≈491 可见；详情页在真实数据下渲染「记录与理解」「资料信息」两区块。测试断言同步反映新布局且保留"无假数据"诚实底线（App.test 仍断言无"未接入"数字、无假输入/按钮）。核对结论：PASS（此为用户授权的 L2 核对，不冒充独立 Reviewer 身份）。
- Acceptance：L1/L2 N/A。
- 最终状态/风险/用户操作：IN_REVIEW→ACCEPTED 由用户决定；**2026-09-05 用户合并 PR #31（merge commit `3973f30`）**，状态 MERGED（MERGED 状态经 TASK-029 控制面带入 main）。阶段0 与阶段1a（TASK-026）均已入 main。
- 非阻断遗留项：详情分区采用"上下两大块 + 虚线分隔"的轻量方式，可后续演进为页签/折叠/两栏（用户已预览认可当前形式）。
- 日期与决定日志：2026-09-05 用户预览认可；同日用户授权 L2 主 Agent 证据核对代替外部独立 Review。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
