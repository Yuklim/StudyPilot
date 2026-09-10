# TASK-047：仓库公开门面整理

```toml
schema_version = 2
id = "TASK-047"
status = "IN_PROGRESS"
risk = "L2"
risk_reason = "不触碰产品代码、契约、门禁与数据；但新增 .github/workflows（CI 门禁配置）与 LICENSE（对外授权声明），属普通级别中的工具与对外声明变更，命中 documentation + tooling，取较高级别。"
risk_flags = ["documentation", "tooling"]
owner = "coordinator"
base = "f60914545ceb04f8c2f4257a047ecd07419f3fb4"
allowed_paths = [
  "README.md",
  "LICENSE",
  "docs/images/**",
  "docs/开发与运行.md",
  ".github/workflows/**",
  "docs/tasks/TASK-047-repo-public-showcase.md",
  "docs/tasks/任务索引.md",
]
checks = ["governance"]
```

## 需求与范围

- 用户授权/相关需求章节：用户 2026-09-10 直接指示「把项目的 github 仓库公开，用于投简历展示，现在感觉有点乱，帮我整理一下」；随后在四个澄清问题上选定：**门面优先**、**过程材料保留并加以说明**、**删除已合并的远程分支**、**README 中文为主 + 英文摘要**。
- 目标与非目标：
  - 目标：让仓库首屏（README）能说明「这是什么、长什么样、怎么跑、测过什么」；补上 LICENSE、CI 与仓库元数据；清理 52 个已合并远程分支与两个误建的空文件。
  - 非目标：不改任何产品代码、后端/前端/扩展源文件、API 契约、门禁（AGENTS.md 与 docs/governance）、迁移与数据模型；不重写 Git 历史；不重排目录结构；不英文化中文文件名；不合并或推送到 main。
- 禁止范围：所有未列入 allowed_paths 的路径；额外禁止项：`backend/var/**`（用户本机真实运行数据）、`AGENTS.md`、`docs/governance/**`、`.codex/**`、`.agents/**`。
- 依赖/前置条件：无未合并依赖；基线 main = `f609145`（TASK-045 已由用户合并）。
- 并行：默认否。

## 完成条件

1. `README.md` 首屏为中文门面：一句话定位、英文摘要、截图、技术栈、架构说明、精简快速开始、真实测试数字、多 Agent 流程说明与 License 段；
2. 原 README 的详细安装/启动/检查/FAQ 内容不丢失，迁移到 `docs/开发与运行.md` 并从 README 链接；
3. `docs/images/` 含 6 张来自真实运行的截图（概览、资料库、阅读器、分类整理、我的心得、扩展 popup），无占位图、无伪造数据；
4. 截图数据来自隔离的 e2e 沙盒（临时目录 + 独立端口 18000/15173），**未使用也未改动用户本机 `backend/var/studypilot.db`**；
5. 新增 `LICENSE`（MIT）；
6. 新增 `.github/workflows/ci.yml`，所跑命令与仓库既有检查组一致且本地实跑为绿；
7. `backend/src/-H`、`backend/src/-i` 两个 0 字节误建文件被删除；
8. 已合并的远程分支被删除，仅保留 main 与未合并的进行中分支，删除前逐一核实合并状态。

## 上下文包

适用规则版本：AGENTS.md V2（2026-09-03 生效，本次未变）。
必要源文件：`README.md`、`docs/governance/risk-policy.json`、`scripts/governance/check_task.py`、`frontend/playwright.config.ts`、`backend/tests/run_browser_server.py`。
相关契约章节：无（本任务不触碰 `/api/v1`）。
补充检查命令：无（governance 组由自动选择覆盖）。

## 实现与测试

- 实现 SHA/变更摘要：见下方 EVIDENCE 段的候选 SHA。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：
  - 截图：`cd frontend && npx playwright test showcase-capture`（临时 spec，截图后删除），真实通过；
  - 扩展 popup：`extension/npm run build` + Playwright 持久化上下文加载 `extension/dist`，真实通过；
  - 三套测试与 CI 命令的实跑结果记录于 EVIDENCE 段。
- 已知限制/未完成项：
  - 截图基于 main（`f609145`）。TASK-046「沉浸式阅读页」尚未合并，其合入后 `03-reader.png` 会与线上不符，需要重截；
  - 截图脚本为一次性临时文件，未入库；重截步骤见 EVIDENCE 段说明。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：
- Review：
- Acceptance：L2 N/A
- 最终状态/风险/用户操作：
- 非阻断遗留项（仅有真实问题时）：
- 日期与决定日志：2026-09-10 用户授权并选定四项范围；登记 L2。
<!-- EVIDENCE:END -->
