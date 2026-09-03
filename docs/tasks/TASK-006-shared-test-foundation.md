# TASK-006：共享测试基础

```toml
schema_version = 2
id = "TASK-006"
status = "IN_REVIEW"
risk = "L2"
risk_reason = "仅整理共用测试设施、补浏览器联通验证，不改变生产接口、安全策略、数据模型或迁移；测试可靠性需一次独立 Review。"
risk_flags = ["tests", "tooling", "internal-refactor"]
owner = "repo_maintainer"
base = "edeb8c1115e6615910f3e93282ffec502a287e04"
allowed_paths = ["backend/tests/conftest.py", "backend/tests/support.py", "backend/tests/run_browser_server.py", "backend/tests/test_support.py", "backend/tests/test_database.py", "backend/tests/test_migrations.py", "backend/tests/test_health.py", "frontend/src/test/**", "frontend/src/App.test.tsx", "frontend/src/ErrorBoundary.test.tsx", "frontend/e2e/**", "frontend/playwright.config.ts", "frontend/vite.config.ts", "frontend/tsconfig.node.json", "frontend/.prettierignore", "frontend/package.json", "frontend/package-lock.json", ".gitignore", "README.md", "docs/tasks/TASK-006-shared-test-foundation.md", "docs/tasks/TASK-005-database-baseline.md", "docs/tasks/任务索引.md"]
checks = ["backend", "frontend", "governance"]
```

## 需求与范围

- 用户依据：确认 TASK-005 已合并并要求下一步。GitHub PR #10 已 MERGED，合并提交为上述 base。对应已批准架构第 10.1、12 阶段 A 建议任务 C。
- 唯一写入者：主 Agent兼任 repo_maintainer，串行维护测试基础及任务状态；不委派额外 Worker。
- 目标：后端共用临时数据库/文件目录、迁移辅助、每测试独立应用/API 客户端；前端共用带路由渲染与清理；基于已批准 Playwright 的 Chromium 最小端到端骨架（真实浏览器→前端代理→后端），只验证现有脚手架与默认拒绝行为。
- 测试设施采用现有 pytest/Vitest；新增仅测试用 @playwright/test 及锁文件。浏览器测试放 frontend/e2e，复用现有 npm 依赖，不增加第三套包管理。测试服务器仅本机绑定，使用独立端口与临时目录，不复用用户服务器，不读写真实数据库。
- 非目标/禁止：不改生产 Python、迁移、业务 API/契约/权限规则，不实现文件处理、认证或真实学习闭环；不改 UI 样式、页面内容、开发服务器正常端口和代理行为，不启用远程 CI/部署，不声称最小联通测试覆盖未来业务流程。
- 状态附带：仅将 TASK-005 的状态和 EVIDENCE/索引登记为用户已合并；不重写历史审查或测试。
- 风险路由：L2，一名独立实际只读 Reviewer；独立 Acceptance 为 N/A，由主 Agent核对边界与证据。若实现需触碰生产规则/数据库结构，停止并重新评估，不能借测试任务扩大范围。

## 完成条件

1. 每个后端测试有独立临时路径与数据库配置，配置缓存不跨测试泄漏；数据库仅由既有 Alembic 迁移创建，每测试独立 Engine/Session 工厂，正常及异常退出均释放资源。
2. 共用 API 客户端基于每测试新 create_app，生命周期正常关闭；原有数据库/健康/安全断言不降低；测试不再互相导入另一个 test 文件作为辅助库。
3. 前端共用路由渲染器及统一 DOM/mock 清理，既有页面/错误边界测试保留；新增工具自身的路由及隔离用例，不引入假业务数据。
4. Playwright 实际启动独立本机测试服务并用 Chromium 验证页面及同源代理 403；零自动重试、端口占用明确失败、不复用已有服务；测试结束关闭自启进程，临时运行目录可回收。只承诺当前脚手架联通，不冒称业务端到端验收。
5. 后端、前端和治理必要检查通过，另执行 `cd frontend; npm run test:e2e`；README 说明夹具（可复用测试准备）、安装浏览器、运行命令、临时数据与失败排查；最终独立 Review PASS。

## 上下文包

根 AGENTS.md V2、backend/AGENTS.md、frontend/AGENTS.md、架构第 10.1/12 的测试工具与任务 C；现有 backend/tests、frontend/src/test 与 *.test.tsx。无需读取旧任务整份报告或所有业务契约。前端规则中的“契约尚未冻结”为 TASK-002 历史描述，本任务依据已合并 TASK-003，但不开放或定义任何新业务行为。

检查：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-006-shared-test-foundation.md --worktree`；补充 Playwright 实际运行和测试服务器资源释放检查。安装与检查分开执行，禁止自动隐式安装或隐藏失败。

## 实现与测试

- 实现 SHA：`eebf94d527db4012adb0935c1f3baacd56392b4b`，25 文件。抽出共用夹具/迁移辅助/合成资料工厂，去除全局 API 客户端与 test 文件互相导入；统一路由渲染与清理；增加独立临时运行的 Chromium 联通测试、报告忽略与说明。生产模型、迁移、安全实现、页面内容及正常开发代理配置未改，原断言保留。
- 环境：macOS arm64、Python 3.13.9、Node 24.18.0/npm 11.16.0；Playwright 1.62.1 固定锁文件，配套 Chromium 151.0.7922.34；沿用 pytest 8.4.2/Vitest 4.1.11。依赖安装、浏览器下载和测试分开运行，没有隐藏安装。
- 完整入口 `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-006-shared-test-foundation.md --worktree`：exit=0，CHECKS PASS；首次指纹 `dbb4899b270f5ff330a6226e80f4dbdce9410d36268df8dbcc8c0ef118fa9fce`。后端格式/lint、mypy（20 文件）、pytest（55 项）、离线构建；前端格式/lint/typecheck、Vitest（8 项）、构建；治理校验、格式/lint及 23 单测全部 exit=0。
- 首次 `cd frontend; npm run test:e2e`：1 项真实 Chromium 联通测试 PASS，exit=0。随后只补全 E2E 配置导入的 `.ts` 扩展名消除工具未来兼容警告；相同命令再次 PASS（7.5 秒），该候选浏览器逻辑不再变化。
- 真实浏览器运行后暴露格式检查误扫 `test-results/.last-run.json` 的失败，未忽略失败结论或格式化生成报告，改 `.prettierignore` 只排除测试生成目录；随后 `npm run format:check`、`npm run typecheck`、`npm run lint` 均 exit=0，报告保留时也通过。中途两处 mypy 对测试 monkeypatch 导入的标注问题已修正，最终完整检查通过。
- 最终静态检查及治理元数据校验 exit=0，25 文件，`product_fingerprint=b90e107330882f6d17510e566f7e66ab26ee08ecbdd61838a0c9d6fb413133b0`；除 E2E 导入扩展名和生成物格式忽略外，其余内容未变，复用上述后端/组件/构建/治理测试，不把 static-only 称为完整测试。
- 额外失败路径探针：仓库根运行 `backend/.venv/bin/python -`（标准库临时 HTTPServer，独占本次占用的 127.0.0.1:18000），其存活期间运行 `npm run test:e2e` 得到预期 exit=1/`already used`；验证原临时服务仍存活，随后仅关闭探针自建服务。探针总 exit=0，并用 socket.bind 确认 18000/15173 均已释放；不结束不明进程。
- 完成条件映射：1/2 → 原 49 项后端回归及 `test_support.py` 新增 6 项（重复隔离、回滚、客户端不建库、启动器正常/中断回收与外部配置哨兵保留）；3 → 原 5 项组件回归及 3 项路由/DOM/global 隔离测试；4 → 实际 Playwright、端口探针、启动器清理测试；5 → 完整工具输出与 README，独立 Review 待执行。生成目录 Git 忽略已核实。
- 限制：只承诺 macOS 已验证的 Chromium 脚手架联通；Linux 系统依赖和 Windows 启动路径/信号需另行验证/适配。E2E 非全业务闭环，未启用远程 CI；README 明确需独立运行 E2E 命令。L2，独立 Acceptance N/A。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 2026-09-03：IN_REVIEW；TASK-005 合并已核实。L2，独立验收 N/A；主 Agent完成范围/断言自检，独立 Review 待执行。
- 用户独占最终合并权限。
<!-- EVIDENCE:END -->
