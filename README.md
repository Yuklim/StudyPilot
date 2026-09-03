# StudyPilot

StudyPilot 是一个面向个人学习者的资料与学习过程管理助手。本仓库目前处于**工程脚手架阶段**：前后端可以安装、启动、检查和测试，但资料管理、学习进度、笔记、复习、统计、AI 等业务功能尚未实现。

如果你刚开始学习开发，可以把“脚手架”理解为房子的基础结构：它先保证门、墙和水电线路的位置正确，之后的任务才会逐步加入真正可用的房间和家具。

## 当前有什么

- Python 3.13 + FastAPI 后端，可通过 `GET /health` 确认进程正常运行；
- 默认拒绝所有未知 `/api/v1` 请求的安全边界，防止业务契约完成前误开放接口；
- React + TypeScript + Vite 前端应用壳、基础路由、全局错误边界和脚手架状态页；
- Ruff、mypy、pytest、Prettier、ESLint、TypeScript、Vitest 和正式前端构建检查；
- uv 与 npm 锁文件，用来在不同机器安装同一组依赖版本。

当前**没有**资料库、添加资料、进度、笔记、复习、统计、数据库表、文件上传、登录或 AI 功能。页面也不会展示假的业务数据或无效的业务按钮。

## 需要先安装的软件

| 软件 | 本项目版本 | 用途 |
| --- | --- | --- |
| Git | 当前受支持版本 | 下载代码并查看修改历史 |
| uv | 当前受支持版本 | 安装 Python 3.13、后端依赖并运行后端命令 |
| Node.js | 24 LTS | 运行前端开发工具 |
| npm | 11.x（随 Node.js 24 提供） | 按锁文件安装前端依赖 |

`LTS` 是 “Long-Term Support（长期维护）” 的缩写，表示该 Node.js 主版本会获得较长时间的错误修复和安全更新。仓库中的 `.python-version` 与 `.node-version` 分别固定 Python 3.13 和 Node.js 24；后端的 `uv.lock` 与前端的 `package-lock.json` 进一步固定依赖的精确版本。

可以先在终端检查工具是否存在：

```bash
git --version
uv --version
node --version
npm --version
```

如果某条命令显示 “command not found（找不到命令）”，请先安装对应软件，再继续下面的步骤。

## 第一次安装

打开终端，进入本仓库根目录。然后安装后端依赖：

```bash
cd backend
uv sync --locked
cd ..
```

`uv sync --locked` 会按锁文件创建本项目自己的 `.venv` 虚拟环境；它不会把依赖混入系统 Python。若电脑上还没有 Python 3.13，uv 会按配置安装合适的 Python 运行时。

再安装前端依赖：

```bash
cd frontend
npm ci
cd ..
```

`npm ci` 表示按照 `package-lock.json` 进行一次干净、可复现的安装。生成的 `.venv/` 和 `node_modules/` 只存在于本机，已经被 Git 忽略。

## 启动顺序

开发时需要两个终端窗口：一个运行后端，一个运行前端。

### 1. 启动后端

在第一个终端中，从仓库根目录运行：

```bash
cd backend
uv run uvicorn studypilot.main:app --host 127.0.0.1 --port 8000
```

看到 Uvicorn 的启动信息后，可在浏览器打开 <http://127.0.0.1:8000/health>。正确响应只有：

```json
{"status":"ok","service":"StudyPilot"}
```

`127.0.0.1` 表示只允许这台电脑自己访问。不要把启动地址改成 `0.0.0.0`；当前项目没有公开部署所需的身份认证和其他安全保护。

### 2. 启动前端

保持第一个终端运行，再打开第二个终端，从仓库根目录运行：

```bash
cd frontend
npm run dev
```

然后在浏览器打开 <http://127.0.0.1:5173>。页面应明确显示：

> 工程框架已运行，业务功能尚未实现

前端开发服务器已预留同源 `/api` 代理。后续前端业务代码只能访问 `/api`，不能把后端端口写死在组件中；完整业务接口与安全协议会由后续任务确定。

## 如何停止

分别切换到正在运行后端和前端的终端，按下 `Control + C`。看到终端重新出现命令提示符，就表示该服务已经停止。停止服务不会删除代码或已安装依赖。

## 运行全部检查

### 仓库治理检查

在仓库根目录运行：

```bash
git diff --check
PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/validate_governance.py
PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python -m unittest discover -s scripts/governance -p 'test_*.py'
```

V2 开发时优先按任务一次执行相关检查（不重复跑全部模块）：

```bash
PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-004-governance-v2.md --worktree
```

该入口检查范围、Git 差异、敏感模式与 JSON/OpenAPI 结构，并自动选择相关 lint、格式检查、测试和构建；不会安装依赖或修改源文件。缺少工具、测试失败和未执行均不会当作通过。详见 [V2 使用指南](docs/governance/多Agent开发制度使用指南.md)。

### 后端检查

在 `backend/` 中运行：

```bash
uv sync --locked
uv run ruff format --check .
uv run ruff check .
uv run mypy src tests
uv run pytest
uv build
```

- Ruff 检查 Python 排版和常见代码问题；
- mypy 根据类型标注提前发现参数或返回值类型不一致；
- pytest 实际运行后端自动测试；
- `uv build` 确认 Python 包可以正式构建。

### 前端检查

在 `frontend/` 中运行：

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test -- --run
npm run build
```

- Prettier 检查代码排版；
- ESLint 检查前端代码中的常见错误；
- TypeScript 在构建前检查类型；
- Vitest 和 React Testing Library 按用户能看到的页面内容运行组件测试；
- `npm run build` 生成正式发布所需的静态文件到 `frontend/dist/`。该目录是生成物，不会提交到 Git。

## 配置与本地数据

`.env.example` 只展示未来数据库配置的安全占位写法。TASK-002 不会读取或创建数据库；后续默认本地数据库将使用 SQLite，并且数据库访问必须放在后端基础设施层、通过 SQLAlchemy 完成。

未来的数据库、上传原件和回收站等运行数据统一放在 `var/` 或由配置指定的本地目录。以下内容都不会进入 Git：

- `.env` 和其他本地环境配置；
- `.venv/`、`node_modules/` 和构建产物；
- SQLite 文件、上传文件、trash、日志、缓存和覆盖率报告。

不要把 API Key、Token、Cookie、真实学习资料或私人笔记写入源码、测试或示例配置。

## 常见问题

### 为什么打开 `http://127.0.0.1:8000/` 是 404？

当前后端只提供 `/health`，根地址和业务 API 尚未实现。404 的意思是“这个地址目前没有对应页面”，不是后端没有启动。

### 为什么访问 `/api/v1/...` 返回 403？

403 的意思是“服务器理解请求，但拒绝执行”。这是脚手架刻意设置的安全默认值：完整本地访问协议和业务契约批准前，任何业务请求都不能读取请求体或产生副作用。

### 为什么前端页面没有资料卡片和功能按钮？

因为业务功能尚未实现。脚手架页面只证明 React 应用能够运行，不能用假数据让人误以为资料管理已经完成。

### 端口已经被占用怎么办？

先确认是否已经在另一个终端启动过同一服务，并在那个终端按 `Control + C`。项目使用固定的本机地址和端口来减少前后端配置差异，不建议初学阶段随意更改。

### 安装后依然使用了错误的 Python 或 Node.js 版本怎么办？

运行 `uv run python --version` 应看到 Python 3.13.x；运行 `node --version` 应看到 v24.x。若 Node.js 不是 v24，请使用你电脑上的 Node 版本管理工具切换到仓库 `.node-version` 指定的版本后，重新运行 `npm ci`。

### `npm ci` 提示 npm 缓存没有权限怎么办？

如果错误中包含 `EACCES` 或 `permission denied`，表示 npm 以前留下的用户缓存权限异常，并不是 StudyPilot 代码损坏。不要使用 `sudo npm ci`。可以在 `frontend/` 中改用仓库内、已被 Git 忽略的临时缓存：

```bash
npm ci --cache ../.npm-cache
```

正常机器仍然直接使用 `npm ci`；这个替代命令只改变下载缓存位置，不改变 `package-lock.json` 中的依赖版本。

### 可以直接部署到公网展示吗？

不可以。当前应用是无登录的本地单用户脚手架，本地访问边界不能替代公网身份认证。未来若需要在线演示，必须先建立独立的部署与安全任务。

## 下一阶段边界

后续任务会先冻结 API、数据字段、错误、安全和数据库契约，再实现真实业务模块。内容解析、模型 API Key、AI、RAG 和学习 Agent 仍然属于更晚阶段，不能因为目录已经存在就提前加入。
