# TASK-002 交接报告

## 1. 结果

- 状态：`COMPLETE`
- 负责人角色：`repo_maintainer`
- 分支：`agent/repo-maintainer/TASK-002-runnable-scaffold`
- 比较基线 SHA：`2ded4eb3612fd0df2129f667bc4ace05fb2dbf20`
- 交接前实现提交 SHA：`188bee69c00899a919407e888faab6addce856c2`

`coordinator` 提交本报告后，所得提交才是冻结候选；其精确 SHA 记录在 REVIEW 和 ACCEPTANCE 中，本报告不引用自身所在提交。

## 2. 已完成内容

- 建立 Python 3.13、FastAPI、Uvicorn、uv 后端脚手架和锁文件。
- 实现 `GET /health`，精确返回 `{"status":"ok","service":"StudyPilot"}`。
- 实现原始 ASGI 本地访问中间件：`/health` 可访问，`/api/v1` 与 `/api/v1/**` 在读取请求体、进入业务路由或产生副作用前默认返回 403，并保留单一安全策略扩展点。
- 建立配置边界和唯一 `STUDYPILOT_DATABASE_URL` 示例；未创建 engine、Session、数据库、表、迁移或 SQL。
- 建立 React、TypeScript、Vite、React Router 前端脚手架及 npm 锁文件。
- 建立基础路由、全局错误边界和受控错误提示。
- 实现简化的“现代简约生活手帐风”状态页：暖米白、鼠尾草绿、平滑圆角和少量纸胶带、叶片、书本线稿；明确显示“工程框架已运行，业务功能尚未实现”，不包含假业务数据和无效业务按钮。
- 建立后端 Ruff、mypy、pytest、构建命令，以及前端 Prettier、ESLint、TypeScript、Vitest、React Testing Library、正式构建命令。
- 建立后端和前端模块级 `AGENTS.md`。
- 完成面向初学者的 README，覆盖安装、启动顺序、停止、检查、术语和常见问题。
- 扩充 Git 忽略规则，覆盖运行数据、数据库、上传、trash、环境文件、依赖、构建、缓存、覆盖率和日志。
- 仅同步根 `AGENTS.md` 第 3 节项目状态。

## 3. 未完成或未包含内容

任务范围内无未完成代码。根据任务边界，未包含业务 API、业务字段、数据库模型和迁移，资料、进度、笔记、复习、统计等业务功能，完整本地会话和来源校验协议，Playwright、登录、公开部署、AI、RAG 和 Agent 功能。

## 4. 修改文件

共 38 个实现文件，全部位于 TASK-002 允许路径：

```text
.env.example
.gitignore
.node-version
.python-version
AGENTS.md
README.md
backend/AGENTS.md
backend/pyproject.toml
backend/src/studypilot/__init__.py
backend/src/studypilot/api/__init__.py
backend/src/studypilot/api/health.py
backend/src/studypilot/infrastructure/__init__.py
backend/src/studypilot/infrastructure/config.py
backend/src/studypilot/infrastructure/security/__init__.py
backend/src/studypilot/infrastructure/security/local_access.py
backend/src/studypilot/main.py
backend/tests/test_health.py
backend/tests/test_local_access.py
backend/uv.lock
frontend/.prettierignore
frontend/.prettierrc.json
frontend/AGENTS.md
frontend/eslint.config.js
frontend/index.html
frontend/package-lock.json
frontend/package.json
frontend/src/App.test.tsx
frontend/src/App.tsx
frontend/src/ErrorBoundary.test.tsx
frontend/src/ErrorBoundary.tsx
frontend/src/main.tsx
frontend/src/styles.css
frontend/src/test/setup.ts
frontend/src/vite-env.d.ts
frontend/tsconfig.app.json
frontend/tsconfig.json
frontend/tsconfig.node.json
frontend/vite.config.ts
```

本交接报告由 `coordinator` 按控制面例外写入 `docs/tasks/TASK-002-HANDOFF.md`。

## 5. 用户可见行为变化

- 后端启动后访问 `/health` 可看到最小健康响应。
- 前端启动后可在浏览器看到简约生活手帐风状态页。
- 页面清楚区分“工程可运行”和“业务尚未开发”。
- 未知 `/api/v1` 请求返回 403。
- 页面渲染失败时显示中文受控提示，不会只显示空白页面。

## 6. 契约、数据或需求变化

- 无产品需求变化。
- 无业务 API 或数据契约变化。
- 仅实现任务已批准的 operational `/health` 契约和临时默认拒绝边界。
- 未创建数据库或用户数据。

## 7. 依赖版本与选择依据

实际锁定的主要版本：

- Python `3.13.9`；FastAPI `0.141.1`；Uvicorn `0.52.4`；pydantic-settings `2.15.0`；Ruff `0.16.5`；mypy `1.20.2`；pytest `8.4.2`；httpx2 `2.12.0`。
- Node.js `24.18.0`，仓库固定 LTS 主版本 `24`；npm `11.16.0`。
- React / React DOM `19.2.8`；React Router DOM `7.18.3`；Vite `8.2.2`；TypeScript `6.0.3`；Vitest `4.1.11`；ESLint `10.9.1`；Prettier `3.9.6`。

Python 3.13 来自已批准架构；Node.js 24 是受支持的偶数 LTS 主版本。直接依赖采用当前稳定版本并写入清单或锁文件。未采用 TypeScript 7.0.2，因为当前 `typescript-eslint` 声明支持 `<6.1`；选择兼容的 6.0.3。使用 Starlette 当前推荐的 `httpx2`，避免旧 `httpx` TestClient 弃用警告。

## 8. 验证证据

| 命令或检查 | 结果 | 说明 |
| --- | --- | --- |
| `git diff --check` | PASS | 无空白错误 |
| `PYTHONDONTWRITEBYTECODE=1 python3 scripts/governance/validate_governance.py` | PASS | 30 项语义治理不变量 |
| `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest scripts/governance/test_validate_governance.py` | PASS | 3 项治理测试 |
| `cd backend && uv sync --locked` | PASS | 按锁文件安装 |
| `cd backend && uv run ruff format --check .` | PASS | 11 个文件 |
| `cd backend && uv run ruff check .` | PASS | 无问题 |
| `cd backend && uv run mypy src tests` | PASS | 10 个源文件 |
| `cd backend && uv run pytest` | PASS | 6 项测试 |
| `cd backend && uv build` | PASS | wheel 与 source distribution |
| `cd frontend && npm run format:check` | PASS | Prettier 检查通过 |
| `cd frontend && npm run lint` | PASS | ESLint 检查通过 |
| `cd frontend && npm run typecheck` | PASS | TypeScript 检查通过 |
| `cd frontend && npm run test -- --run` | PASS | 2 个测试文件、3 项测试 |
| `cd frontend && npm run build` | PASS | 正式构建 25 个模块 |
| npm 安全审计 | PASS | 0 个漏洞 |
| 敏感密钥模式扫描 | PASS | 无匹配 |
| 邮箱、个人绝对路径扫描 | PASS | 无匹配 |
| 允许路径检查 | PASS | 38 个实现文件全部匹配任务清单 |
| 生成物检查 | PASS | 均被 Git 忽略 |
| 提交后基线差异检查 | PASS | 工作区干净 |

实际冒烟检查：

- 后端仅监听 `127.0.0.1:8000`，前端仅监听 `127.0.0.1:5173`；验证后均已停止。
- `/health` 返回 HTTP 200，响应精确匹配。
- form、text、multipart 三类未知 `/api/v1` 请求全部返回 HTTP 403。
- 浏览器状态页标题可见，假业务按钮数量为 0，控制台错误数量为 0；状态卡背景为暖米白，计算圆角为 `42px`。

## 9. 未执行或环境性失败

原始 `npm ci` 已实际执行，但因用户目录中既有的 root-owned npm 缓存发生 `EACCES` 权限失败。开发 Agent 没有修改、删除或重置任务范围外的用户级缓存。

以下按同一 `package-lock.json` 进行的安全等价干净安装均成功：

```text
npm_config_cache=/private/tmp/studypilot-npm-cache npm ci
npm ci --cache ../.npm-cache
```

第二种方式已写入 README 的故障处理说明，项目内缓存已加入 Git 忽略。剩余风险是用户机器的默认 npm 缓存权限异常仍然存在，但项目具备不使用 `sudo`、不修改用户缓存的替代步骤。

## 10. 已知限制与风险

- 当前中间件是有意设置的临时“全部业务 API 默认拒绝”状态；后续必须先冻结完整安全契约才能开放任何 `/api/v1` 路由。
- 当前前端只展示脚手架状态，不调用业务 API。
- 当前没有数据库、文件存储或业务能力。
- 当前无登录，不能直接部署到公网。

## 11. 建议审查重点

- 原始 ASGI 中间件是否确实在调用 `receive` 或业务路由前拒绝请求。
- `/health` 是否保持最小响应且无敏感字段。
- 页面是否诚实表达当前完成范围，未伪造业务能力。
- README 是否足以让初学者安装、启动、停止和排查 npm 缓存问题。
- 锁文件、生成物忽略和依赖范围是否可复现。
- 根 `AGENTS.md` 是否只修改第 3 节。
