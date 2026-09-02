# 后端 Agent 规则

## 1. 适用范围

本文件适用于 `backend/**`，并补充仓库根 `AGENTS.md`。不得放宽根规则。

## 2. 模块职责

- 本模块负责：FastAPI 接口层、应用服务和领域模块的 Python 实现，以及数据库、文件、配置和安全适配器。
- 本模块不负责：React 界面、未经批准的产品需求、公开多用户服务、解析、AI、RAG 或 Agent 功能。
- 上游依赖：已批准的产品需求、API/数据契约和架构决定。
- 下游使用者：StudyPilot 前端和后续受控扩展能力。

TASK-002 只建立应用入口、`GET /health`、配置边界和默认拒绝的本地访问中间件；不得据此推断业务 API 已获授权。

## 3. 必须保持的不变量

- 默认启动只绑定 `127.0.0.1`；没有正式身份认证前不得公开部署。
- `/health` 只返回固定的运行状态，不读取用户数据或泄露环境、路径、版本和时间。
- 未经后续安全契约批准，所有 `/api/v1` 请求必须在读取请求体和产生副作用前返回 403。
- 数据库配置只能从 `infrastructure` 边界进入；未来数据库访问使用 SQLAlchemy，不把 SQLite 专属逻辑写入业务模块。
- 原始文件、数据库、密钥、日志和运行数据不得进入 Git。

## 4. 公共契约

- 架构边界：`docs/architecture/MVP架构与技术选型提案.md`
- 当前已批准的唯一 HTTP 行为：`GET /health` 精确返回 `{"status":"ok","service":"StudyPilot"}`。
- 业务接口、错误外形和数据字段尚未冻结，未经任务授权不得新增或改变。

## 5. 准确命令

以下命令已经由 TASK-002 验证，均在 `backend/` 中运行。

```text
安装：uv sync --locked
启动：uv run uvicorn studypilot.main:app --host 127.0.0.1 --port 8000
格式化：uv run ruff format .
格式检查：uv run ruff format --check .
静态检查：uv run ruff check .
类型检查：uv run mypy src tests
模块测试：uv run pytest
构建：uv build
```

## 6. 文件边界

- 默认允许：具体任务单授权的 `backend/**` 路径。
- 默认禁止：前端、治理文档、未获批准的业务模型/迁移/契约和根配置。
- 生成文件：`.venv/`、缓存、覆盖率、数据库、日志和 `var/` 不提交。
- 锁文件要求：依赖变化必须同步提交 `pyproject.toml` 和 `uv.lock`，并重新执行全部后端检查。

## 7. Code Review Rules

### 本地 API 默认拒绝

- 要发现的违规行为：新 `/api/v1` 路由绕过统一安全中间件，或中间件为判断权限而先读取请求体。
- 真实风险：恶意网页可以向本机服务发送简单表单或 multipart 请求并造成用户数据变化。
- 安全路径：先由独立契约任务冻结 Host、Origin、Fetch Metadata 和本地令牌策略，再在统一扩展点实现并测试。

### 基础设施隔离

- 要发现的违规行为：业务模块导入 SQLite 专属 API、拼接本机路径，或直接创建全局数据库会话。
- 真实风险：数据库迁移成本上升、测试互相污染、文件越界。
- 安全路径：依赖上层定义的端口，由 `infrastructure` 提供 SQLAlchemy、文件和配置适配器。
