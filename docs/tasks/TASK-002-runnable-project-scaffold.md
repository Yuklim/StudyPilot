# TASK-002：建立可运行的项目与本地开发脚手架

## 1. 基本信息

- 状态：`RETURNED`
- 负责人角色：`repo_maintainer`
- 创建人：主协调 Agent
- 创建日期：2026-09-02
- 目标阶段：第一阶段 MVP 共享工程基础
- 基线分支或提交：`main` / `9cf9cf0`

## 2. 背景与依据

TASK-001 已完成并合并，正式确定 StudyPilot 第一阶段采用 Python/FastAPI 模块化单体后端、React/TypeScript 前端、SQLite、本地文件存储、uv 与 npm 锁定依赖，并要求先建立脚手架，再冻结 API 与数据契约。

依据：

- [MVP 架构与技术选型提案](../architecture/MVP架构与技术选型提案.md)第 1、4、5、9、10、12、13、16 节；
- [项目需求说明](../../项目需求说明.md)第 2、3、8 节关于第一阶段、可运行项目和渐进开发的要求；
- [项目背景与介绍](../../项目背景与介绍.md)第 2、5、6 节关于个人本地使用、Python/API 学习和作品展示的目标。

本任务只把已经批准的技术方案落实为最小、可启动、可检查的工程框架，不决定业务字段、数据库表或正式业务 API。

## 3. 目标

- 从全新检出仓库按初学者说明安装依赖并启动最小后端与前端；
- 后端提供不包含用户数据的健康检查，证明 Python 应用可以运行；
- 前端显示明确的 StudyPilot 脚手架页面，证明 React 应用可以构建和运行；
- 建立后端、前端的格式化、静态检查、类型检查、单元测试和正式构建命令；
- 固定 Python、Node.js 和依赖版本，降低不同机器上的环境差异；
- 建立运行数据、环境文件、密钥和生成物的 Git 忽略边界；
- 建立默认拒绝的本地访问安全中间件骨架，使后续业务路由不能在没有明确安全策略时直接开放；
- 同步根规则中的项目状态，使其准确反映 TASK-001 已经由用户合并且技术栈已经确定；
- 为后续 API/数据契约、共享测试基础和业务模块任务提供稳定目录与命令基线。

## 4. 非目标

- 不实现资料、主题、标签、搜索、进度、笔记、学习记录、复习或统计功能；
- 不创建业务数据库模型、SQLite 表、Alembic 迁移或种子数据；
- 不冻结业务字段、错误码、分页、上传、删除或 OpenAPI 业务契约；
- 不实现本地会话令牌、Origin/Fetch Metadata/Host 完整协议、上传状态机、删除令牌或文件对账协议；这些属于后续契约与功能任务；
- 不建立 Playwright 端到端测试基础或完整用户闭环；
- 不实现登录、多用户、公开部署、Docker、云服务、CI/CD 或 GitHub Actions；
- 不实现内容解析、AI、RAG 或学习 Agent；
- 不创建看似可用但实际没有业务能力的资料库或仪表盘假页面。

## 5. 允许修改路径

- `.gitignore`（允许修改）
- `.env.example`（允许创建，只能包含无秘密的占位配置）
- `.python-version`（允许创建）
- `.node-version`（允许创建）
- `README.md`（允许创建）
- `AGENTS.md`（仅允许同步第 3 节“当前项目状态”，不得修改其他规则）
- `backend/AGENTS.md`（允许创建）
- `backend/pyproject.toml`（允许创建）
- `backend/uv.lock`（允许创建）
- `backend/src/studypilot/__init__.py`（允许创建）
- `backend/src/studypilot/main.py`（允许创建）
- `backend/src/studypilot/api/__init__.py`（允许创建）
- `backend/src/studypilot/api/health.py`（允许创建）
- `backend/src/studypilot/infrastructure/__init__.py`（允许创建）
- `backend/src/studypilot/infrastructure/config.py`（允许创建）
- `backend/src/studypilot/infrastructure/security/__init__.py`（允许创建）
- `backend/src/studypilot/infrastructure/security/local_access.py`（允许创建）
- `backend/tests/test_health.py`（允许创建）
- `backend/tests/test_local_access.py`（允许创建）
- `frontend/AGENTS.md`（允许创建）
- `frontend/package.json`（允许创建）
- `frontend/package-lock.json`（允许创建）
- `frontend/index.html`（允许创建）
- `frontend/vite.config.ts`（允许创建）
- `frontend/tsconfig.json`（允许创建）
- `frontend/tsconfig.app.json`（允许创建）
- `frontend/tsconfig.node.json`（允许创建）
- `frontend/eslint.config.js`（允许创建）
- `frontend/.prettierrc.json`（允许创建）
- `frontend/.prettierignore`（允许创建）
- `frontend/src/vite-env.d.ts`（允许创建）
- `frontend/src/main.tsx`（允许创建）
- `frontend/src/App.tsx`（允许创建）
- `frontend/src/App.test.tsx`（允许创建）
- `frontend/src/ErrorBoundary.tsx`（允许创建）
- `frontend/src/ErrorBoundary.test.tsx`（允许创建）
- `frontend/src/test/setup.ts`（允许创建）
- `frontend/src/styles.css`（允许创建）

任务单和以下证据文件由 `coordinator` 在控制面中维护，不属于 `repo_maintainer` 的写入范围：

```text
docs/tasks/TASK-002-runnable-project-scaffold.md
docs/tasks/TASK-002-HANDOFF.md
docs/tasks/TASK-002-REVIEW.md
docs/tasks/TASK-002-ACCEPTANCE.md
docs/tasks/任务索引.md
```

## 6. 禁止修改路径

- `项目背景与介绍.md`
- `项目需求说明.md`
- `docs/architecture/**`
- `docs/governance/**`
- `AGENTS.md` 第 3 节以外的全部内容
- `.agents/**`
- `.codex/**`
- `scripts/governance/**`
- `docs/tasks/**`（除 coordinator 的控制面证据写回外）
- `.github/**`
- `e2e/**`
- `backend/migrations/**`
- `backend/src/studypilot/modules/**`
- `backend/src/studypilot/application/**`
- `backend/src/studypilot/extension_ports/**`
- 业务代码、业务契约、数据库模型与迁移路径
- 所有未列入第 5 节的路径

## 7. 前置条件与依赖

- [x] 产品需求已确认
- [x] TASK-001 架构提案已由用户合并并登记为 `MERGED`
- [x] 技术栈、目录建议和本任务顺序已经批准
- [x] 本任务不依赖尚未批准的业务 API 或数据契约
- [x] `main` 与 `origin/main` 均位于稳定提交 `9cf9cf0`
- [x] 允许路径没有被其他活跃写入任务占用

本任务不能与 API/数据契约、共享测试基础或业务功能任务并行写入，因为这些任务依赖本任务建立的目录、锁文件和检查命令。

## 8. 功能要求

1. 后端使用架构已批准的 Python 3.13、FastAPI 和 Uvicorn；使用 uv 管理项目与锁文件。实际依赖版本必须锁定，并记录选择依据。
2. 后端采用 `src/studypilot/` 布局，只建立入口、非业务健康检查、配置与安全基础设施边界；不得创建业务模块、业务模型、应用服务或扩展端口占位实现。
3. 后端提供 operational endpoint `GET /health`，固定返回 HTTP 200 与 JSON `{"status":"ok","service":"StudyPilot"}`。它不属于 `/api/v1` 业务契约，不得读取数据库、文件或用户数据，也不得返回版本、环境变量、磁盘路径、主机信息或时间戳。
4. 建立独立的本地访问安全策略/中间件骨架。`/health` 是唯一明确允许匿名访问的后端 operational endpoint；其余 `/api/v1/**` 必须在解析请求体、进入处理函数或产生任何副作用前默认返回 403。前端静态资源不属于业务 API。为后续 Host、Origin、Fetch Metadata、本地令牌和自定义头契约保留单一扩展点，但本任务不得自行实现或冻结完整协议。
5. 后端启动说明和默认命令只能监听 `127.0.0.1`，不得默认监听全部网络接口。
6. 后端建立并实际使用 Ruff 格式化/检查、mypy 类型检查和 pytest；测试至少覆盖健康检查成功、敏感字段不泄露，以及 form、text、multipart 等未知 `/api/v1` 请求在读取请求体前被默认拒绝且不产生文件或数据库副作用。
7. 前端使用架构已批准的 React、TypeScript、Vite 和 React Router；使用 npm 与 `package-lock.json` 锁定依赖。Node.js 选择当前受支持的 LTS 主版本并固定到 `.node-version`，在 README 中解释 LTS 是长期维护版本。
8. 前端只建立应用壳、基础路由、全局错误边界和脚手架状态页。页面必须明确说明“工程框架已运行，业务功能尚未实现”，不得展示假的业务数据或可点击但无效的业务按钮。开发模式只通过同源 `/api` 代理访问后端，前端业务代码不得写死后端端口。
9. 前端建立并实际使用格式检查、ESLint、TypeScript 检查、Vitest、React Testing Library 和正式构建；测试至少覆盖脚手架状态页和错误边界的受控提示。
10. 根 README 面向初学者说明：所需软件、版本含义、安装步骤、后端与前端启动顺序、访问地址、停止方法、全部检查命令、常见问题，以及当前已实现与未实现内容。
11. `.gitignore` 必须排除 `var/`、本地数据库、上传文件、trash、`.env`、虚拟环境、Node 依赖、构建产物、测试缓存、覆盖率、日志和操作系统临时文件；根 `.env.example` 只能使用明显占位值。
12. 不得把 API Key、访问令牌、真实邮箱、Cookie、个人路径、真实学习资料或用户数据写入源码、测试、锁文件、示例配置和日志。
13. 数据库可迁移性在本任务只建立配置与编码边界：`.env.example` 暴露唯一的 `STUDYPILOT_DATABASE_URL` 占位配置并说明本地默认将使用 SQLite；未来数据库访问必须通过 SQLAlchemy 且数据库特有逻辑只能位于 infrastructure。当前不得创建 engine、Session、业务模型、表、SQLite 文件、原始 SQLite SQL、迁移或 PostgreSQL 实现。
14. 在 `backend/AGENTS.md` 和 `frontend/AGENTS.md` 中记录各模块的准确启动、格式化、静态检查、类型检查、测试和构建命令，以及禁止越过的职责边界。
15. 仅同步根 `AGENTS.md` 第 3 节中的客观项目状态：TASK-001 架构已经生效，当前可以按已批准技术栈建立脚手架；不得修改权限、Git、审查、验收或安全底线。

## 9. 验收条件

- [ ] 全新检出后能按 README 使用锁文件安装后端和前端依赖
- [ ] 后端只绑定本机并能启动，`GET /health` 精确返回约定的 HTTP 200 与最小 JSON
- [ ] 本地访问安全骨架在读取请求体和产生副作用前默认拒绝全部未知 `/api/v1/**` 请求
- [ ] 前端能启动并显示明确的脚手架状态页，不伪装业务功能已经完成
- [ ] 后端格式、静态检查、类型检查和 pytest 全部通过
- [ ] 前端格式、lint、TypeScript 检查、Vitest 和正式构建全部通过
- [ ] Python、Node.js、后端和前端依赖均有可复现版本或锁文件
- [ ] README 能让缺少开发经验的用户完成安装、启动、停止和检查
- [ ] 运行数据、秘密、依赖目录、缓存和构建产物不会进入 Git
- [ ] 未创建业务模型、数据库迁移、业务 API、业务页面或未来 AI 功能
- [ ] 数据库与运行数据只通过基础设施/配置边界预留，没有 SQLite 或 PostgreSQL 专属业务耦合
- [ ] 根规则只同步已生效技术栈状态，其他治理规则没有变化
- [ ] 只修改允许路径，没有敏感信息或真实个人数据
- [ ] 已提交标准交接报告

## 10. 必须执行的检查

实现 Agent 必须在交接前实际运行并记录以下命令。若工具生成的准确脚本名不同，必须在不降低检查类别的前提下统一任务单、README 与模块规则，并由 coordinator 重新确认后再进入复审。

```text
git diff --check
PYTHONDONTWRITEBYTECODE=1 python3 scripts/governance/validate_governance.py
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest scripts/governance/test_validate_governance.py
cd backend && uv sync --locked
cd backend && uv run ruff format --check .
cd backend && uv run ruff check .
cd backend && uv run mypy src tests
cd backend && uv run pytest
cd frontend && npm ci
cd frontend && npm run format:check
cd frontend && npm run lint
cd frontend && npm run typecheck
cd frontend && npm run test -- --run
cd frontend && npm run build
敏感信息模式扫描
允许路径与生成物检查
执行后确认虚拟环境、node_modules、dist、var、缓存和日志未进入 Git
按 README 从干净环境启动后端和前端，并验证 loopback 监听、/health、前端状态页和默认拒绝的人工冒烟检查
```

“冒烟检查”是最小的实际运行验证：确认程序确实能启动、健康检查能返回、浏览器能打开状态页，而不是只看代码和测试文件存在。

## 11. 审查要求

- Reviewer 角色：`qa_reviewer`
- 审查重点：可复现安装、启动体验、版本锁定、依赖最小性、默认本地安全、检查真实性、生成物与秘密隔离、范围越界、初学者可理解性
- 是否需要额外专项审查：不需要；阶段验收仍由独立只读 `integration_owner` 执行

## 12. 交接要求

使用 `HANDOFF_TEMPLATE.md`，把报告返回给 `coordinator`，由协调者保存为 `docs/tasks/TASK-002-HANDOFF.md`，并提供：

- 完整修改文件清单；
- 实际安装、启动、测试、构建和安全检查证据；
- README 冒烟步骤与结果；
- 依赖版本及选择依据；
- 未执行检查及原因；
- 已知风险、限制和后续任务边界；
- 分支名与提交 SHA。

## 13. 决策与状态记录

只有 `coordinator` 可以维护本节状态；其他角色只能返回状态建议和证据。

| 日期 | 状态或决定 | 责任人 | 说明 |
| --- | --- | --- | --- |
| 2026-09-02 | READY | coordinator | TASK-001 已合并；目标、非目标、允许路径、依赖、检查和验收条件完整；等待用户将 intake 分支合并到稳定 `main` 后派发 |
| 2026-09-02 | RETURNED | coordinator | 冻结候选 `93b6ff47c1a692eb89b3ba2a599066c9cacb77a4` 的独立实际只读复审发现 3 项问题，退回原负责 Agent 修订；修订后重新冻结并完整复审 |
| 2026-09-02 | IN_REVIEW | coordinator | 原负责 Agent 已在实现提交 `6b84a3adfeff1dae96a1191715956564b6947cd3` 修复异常日志泄露风险并对齐 Node 24 类型定义；更新交接后重新冻结候选并安排完整只读复审 |
| 2026-09-02 | RETURNED | coordinator | 冻结候选 `36da78d0fa9eec1a2f02af696aaad50bfeff8322` 的第二轮独立实际只读复审发现 React 19 根级默认 `onCaughtError` 仍会记录原始异常；退回原负责 Agent 修订并要求补充真实根渲染路径的脱敏测试 |
