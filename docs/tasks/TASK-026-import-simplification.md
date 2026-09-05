# TASK-026：阶段1a 资料导入极简化

```toml
schema_version = 2
id = "TASK-026"
status = "IN_REVIEW"
risk = "L2"
risk_reason = "纯前端「添加资料」表单体验收敛：折叠选填项 + 文件/粘贴自动带出标题占位；不触碰后端、数据库或公共 API 契约，但会同步更新被表单改动的既有前端测试断言。"
risk_flags = ["business"]
owner = "coordinator"
base = "5c527a3156acbc63a11d270e1b58ef3c674252c8"
allowed_paths = [
  "frontend/src/features/resources/ResourceForm.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/features/resources/FilePages.test.tsx",
  "frontend/src/styles.css",
  "docs/tasks/TASK-026-import-simplification.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

- 用户授权/相关需求章节：延续 2026-09-04 逐条确认的「阶段1 导入极简」。用户本轮（2026-09-05）明确：阶段0（TASK-025）暂不合并、先做阶段1，需确认处默认采纳安全方案。已确认关键决策：URL 来源**不强自动填标题**（严守「网页只存 URL 不抓取正文」边界，不联网抓 `<title>`）。需求章节：5.1 添加学习资料、5.2 资料基本信息、7.1 随手收藏资料。
- 目标与非目标：
  - 目标：把「添加资料」首屏压到核心必填项（来源选择 / 标题 / URL或原文或文件 / 保存），把选填的「来源名称 / 保存原因」收进默认收起的「补充信息」折叠区；分类（主题+标签）维持既有自折叠按钮。标题**自动带出**（仅当标题为空且不覆盖用户已输入）：FILE 用文件名去扩展名、PASTE 用内容首个非空文本行，均可再编辑；保留后端 title 强必填（1～200 字）不变。
  - 非目标：不做「标题可空 / 后端自动生成标题」（阶段1b，改 OpenAPI title 可空 = L3，另立）；不做 URL 联网抓取 `<title>`（触碰「网页只存不抓取」后置边界）；不改后端、数据库、公共 API、OpenAPI 契约、数据模型；不改变资料读写语义。
- 禁止范围：所有未列入 allowed_paths 的路径；不得改动 backend/**；不得改动契约/迁移；不得以任何形式联网抓取网页正文或 `<title>`；不得把占位标题伪装成真实标题（标题仍由用户可改，占位可辨识）。
- 依赖/前置条件：稳定基线 `5c527a3`（= origin/main）。阶段1a 与阶段0（TASK-025）文件无重叠，可并行独立；二者最终由用户分别合并。
- 并行：否（单任务单写入者）。

## 完成条件

- 可观察结果：进入「添加资料」，首屏仅见 来源选择（网页/粘贴/文件）、标题、当前来源对应输入、保存按钮；「来源名称 / 保存原因」不在首屏展开，收纳于一个可展开的「补充信息」折叠区，展开后可填且值随提交携带。选择文件时若标题为空自动填入去除扩展名的文件名；切换到粘贴并输入正文时若标题为空自动填入正文首行文本（去 Markdown 标题符与首尾空白，截断 ≤200 字）；标题被自动填入后仍可编辑，保存使用最终标题。
- 必须覆盖的失败场景：自动带出**不得覆盖用户已填的标题**；WEB 来源不被自动填标题、不触发任何网络请求；折叠区展开后填写的来源名称/保存原因与分类在提交请求中如实携带；未展开折叠区提交时这些选填字段保持省略（与现状一致）；所有既有前端检查（format/lint/typecheck/vitest/build）通过；被折叠改动的 ResourcePages.test 断言同步更新且如实反映新交互（折叠默认收起、需展开才能填选填项），不弱化「无假输入/诚实」底线。
- Review：L2。本环境无外部独立只读 reviewer Agent 可用；Review 方式由用户在醒来后决定（沿用 TASK-025 的主 Agent 证据核对授权，或另行提供外部只读 CLI）。实现者不自审冒充独立 Review。

## 上下文包

适用规则：根 AGENTS.md V2；frontend/AGENTS.md（本次纯前端改动）。
必要源文件：`frontend/src/features/resources/ResourceForm.tsx`（导入表单）、`ResourcePages.test.tsx`（表单/库/详情断言）、`ResourceEditor.tsx` 与 `ClassificationPicker.tsx`（库内既有 `<details>`/`aria-expanded` 折叠模式参照）、`frontend/src/styles.css`（表单与折叠样式）。
准确附加检查命令：见 frontend/AGENTS.md §5，均在 `frontend/` 运行。

## 实现与测试

- 实现 SHA/变更摘要：ResourceForm 把「来源名称 / 保存原因」收进默认收起的「补充信息（选填）」`<details>` 折叠区，分类（主题+标签）维持既有自折叠按钮；FILE 选文件、PASTE 粘贴正文时，若标题仍为空则分别从「去扩展名文件名」「首个非空文本行（去 Markdown 标题符，截断 ≤200）」自动带出可编辑标题占位；手动输入过标题（非空）后不再自动覆盖；WEB 来源不强自动填标题、不触发网络请求。styles.css 增加 `.resource-more` 折叠样式。同步更新 ResourcePages.test/FilePages.test：操作折叠字段前先展开、新增 5 条断言覆盖「默认收起 / 展开可见 / FILE/PASTE 自动带出 / 不覆盖手动标题」。产品 SHA：`84e2528`。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：`check_task.py --task docs/tasks/TASK-026-import-simplification.md --candidate HEAD` STATIC PASS + CHECKS PASS（base `5c527a3`）；product_fingerprint `c3e5b4765bbf2f29a79fef618e39387bdec28071c3fbff56a6e84c659ebbcc36`。format:check/lint/typecheck/vitest(320/320)/build 均 exit=0。真实浏览器（Playwright + dev server 127.0.0.1:5173）验证：补充信息默认收起时来源名称不可见、粘贴后标题自动带出、展开后字段可见。
- 已知限制/未完成项：URL 来源不做标题自动带出（用户已确认，尊重不抓取边界）；分类折叠仍由 ClassificationPicker 既有按钮承担，未并入「补充信息」details（避免嵌套折叠）。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

（候选 SHA、Review/Acceptance、最终状态在证据与收尾阶段回填）

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
