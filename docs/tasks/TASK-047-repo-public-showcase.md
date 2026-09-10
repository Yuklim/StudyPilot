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

- 实现 SHA：`d19446a`（门面主体：README 重写、README 详情迁出至 `docs/开发与运行.md`、LICENSE、CI workflow、6 张截图、删除 2 个误建空文件）。
  后续 `0374bed` 为同任务修订（README 补回扩展权限清单，修复下述回归），二者同属本任务最终候选。
- 变更摘要：README 由 447 行实现日志改写为门面（定位/英文摘要/徽章/截图/技术栈/架构/快速开始/测试数字/流程/边界/文档索引）；
  原详细内容迁入 `docs/开发与运行.md` 并修正 2 处相对链接与 5 处过期「尚未开放」表述（已核对 `ResourceToolbar.tsx:260,269` 与 TASK-021/022/023 状态）；
  新增 MIT LICENSE、`.github/workflows/ci.yml`（5 job：governance/backend/frontend/extension/e2e）。

- 命令、真实退出结果、环境：
  - `backend: uv run pytest` → **550 passed**（13.68s，Ruff/mypy 同步通过）；
  - `frontend: npm run test -- --run` → **539 passed / 23 files**；
  - `extension: npm run test -- --run` → **145 passed / 8 files**（候选 `0374bed` 实跑，见下「回归」）；
  - `frontend: npm run test:e2e` → **49 passed**（33.6s，真实浏览器）；
  - `scripts/governance/check_task.py --candidate 0374bed` → `FAIL: binary file needs explicit manual validation: docs/images/01-overview.png`。
- 截图证据（临时脚本，未入库）：
  - 页面 5 张：`cd frontend && npx playwright test showcase-capture`，spec 为一次性文件，截图后已删除；
  - 扩展 popup：`extension/npm run build` 后用 Playwright 持久化上下文加载 `extension/dist` 截图；
  - 数据来源：e2e 隔离沙盒（临时目录 + 端口 18000/15173），**未读取也未改动 `backend/var/studypilot.db`**（生成时该库正被用户运行的实例占用，全程未触碰）。
- 二进制文件人工核验（治理检查器按设计对二进制返回 FAIL，此处逐张人工确认）：
  - `01/02/03/04/05` 均为 1440×900、`06` 为 292×250（与 manifest popup 尺寸一致），`file` 均识别为有效 PNG，无零字节、无截断；
  - 逐张目视核对：确为本应用真实运行的界面（非占位图、非设计稿），数据为合成演示内容，未含个人真实数据、令牌或本机路径。
- 已知限制/未完成项：
  - 截图基于 main（`f609145`）。TASK-046「沉浸式阅读页」尚未合并，其合入后 `03-reader.png` 的正文宽度/元信息会与线上不符，需重截；
  - 截图脚本为一次性临时文件，未入库；重截需按上述命令临时重建 spec 并删除；
  - CI 从未在 GitHub 上真实运行过，首次 push 才是首次真实执行；本地已按 workflow 内命令逐条实跑为绿。
- 过程回归（真实发生并已修复，记录以备审查）：
  - README 改写时压掉了 manifest 权限清单段落，`extension/src/boundaries.test.ts` 的
    `keeps the docs naming every reach the manifest actually asks for` 立即变红（1 failed / 144 passed）。
  - 该门闩检查的是**根 README** 是否列全 manifest 实际申请的权限串。已补回「### 扩展申请了哪些权限」一节，
    并将 `activeTab` / `scripting` / `storage` / `http://127.0.0.1:5173/*` / `optional_host_permissions: ["<all_urls>"]` 全部写明；
    修复后 extension 恢复 145 passed（`0374bed`）。
  - 这属于既有测试拦住的真实回归，未降低任何断言。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：
- Review：
- Acceptance：L2 N/A
- 最终状态/风险/用户操作：
- 非阻断遗留项（仅有真实问题时）：
- 日期与决定日志：2026-09-10 用户授权并选定四项范围；登记 L2。
<!-- EVIDENCE:END -->
