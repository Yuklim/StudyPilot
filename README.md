# StudyPilot

StudyPilot 是一个面向个人学习者的资料与学习过程管理助手。本仓库目前处于**工程脚手架阶段**：前后端可以安装、启动、检查和测试，但资料管理、学习进度、笔记、复习、统计、AI 等业务功能尚未实现。

如果你刚开始学习开发，可以把“脚手架”理解为房子的基础结构：它先保证门、墙和水电线路的位置正确，之后的任务才会逐步加入真正可用的房间和家具。

## 当前有什么

- Python 3.13 + FastAPI 后端，可通过 `GET /health` 确认进程正常运行；
- 默认拒绝所有未知 `/api/v1` 请求的安全边界，防止业务契约完成前误开放接口；
- React + TypeScript + Vite 简约手帐风前端应用壳：暖纸色、灰绿、圆角、书页和便签细节；共用导航、手机布局、全局错误边界与明确的未接入提示；
- Ruff、mypy、pytest、Prettier、ESLint、TypeScript、Vitest 和正式前端构建检查；
- uv 与 npm 锁文件，用来在不同机器安装同一组依赖版本。
- SQLAlchemy 数据模型和 Alembic 初始迁移：前者让 Python 操作数据库，后者按版本创建或升级表结构；目前只支持 SQLite。

当前已具备数据库建表能力，但**没有**可操作的资料库、添加资料、进度、笔记、复习、统计、文件上传、登录或 AI 功能。页面也不会展示假的业务数据或无效的业务按钮。

### 可以浏览哪些页面（TASK-007）

“应用壳”就是先把页面布局和导航搭好，之后再接入真正的数据操作。目前导航、返回和浏览器前后退可用；添加资料仅展示来源说明，不是可以上传或保存的表单。

| 页面 | 本地路径 |
| --- | --- |
| 学习概览 | `/` |
| 资料库 | `/resources` |
| 添加资料预览 | `/resources/new` |
| 资料详情预留 | `/resources/:resourceId`（可用 `/resources/preview` 看布局，不会读取资料） |
| 学习记录 | `/study-records` |
| 复习安排 | `/reviews` |
| 主题统计 | `/topics` |

直接访问或刷新这些地址仍能显示页面；其他地址会提示“没有找到这个页面”，并提供返回入口。统计用“— / 未接入”表示未连接数据，不是零记录。页面不请求业务接口、外部素材，也不在浏览器保存数据。键盘用户可按 Tab 找到“跳到主要内容”；切换页面后焦点会移到新标题。

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

前端开发服务器已预留同源 `/api` 代理。后续前端业务代码只能访问 `/api`，不能把后端端口写死在组件中；接口与安全契约已在 TASK-003 批准，具体实现仍待后续任务。只浏览当前界面可以单独启动前端，无需运行后端或建库。

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
PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-007-journal-app-shell.md --worktree
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

### 共用测试工具

测试夹具（fixture）是可重复使用的“测试准备和收尾”。新后端测试直接声明需要的参数，不要从别的 `test_*.py` 文件导入辅助函数：

| 入口 | 提供什么 |
| --- | --- |
| `runtime`（自动启用） | 每测试独立临时工作目录、SQLite URL、`runtime.files` 文件目录；设置并清理配置缓存 |
| `database` | 使用已提交 Alembic 迁移创建的临时 SQLite Engine，退出时释放连接池 |
| `session_factory` | 该测试独有的会话工厂；用 `with session_factory.begin() as session` 保证提交/异常回滚/关闭 |
| `client` | 每测试新建应用的 FastAPI TestClient，自动启动/结束生命周期，不复用全局应用或 Cookie |
| `backend/tests/support.py` | 共用 `migrate`、合成资料 `resource` 和临时路径定义，不属于生产代码 |

测试不会沿用终端中指向真实数据库的 `STUDYPILOT_DATABASE_URL`；配置缓存、环境变量和工作目录在测试间隔离，夹具本身也有隔离/回滚回归测试。pytest 会按自身策略保留少量临时目录用于排错，不代表写入正式运行目录。当前 API 仍不访问数据库；`client` 与 `database` 的共用入口不是已经实现业务连接。

前端组件测试使用 `src/test/render.tsx` 的 `renderWithRouter(<组件 />, '/路径')`，不用逐文件重复包路由。`src/test/setup.ts` 在每项测试后清理 DOM、mock（替代真实行为的测试对象）、全局变量替身和环境变量替身。Vitest 只收集 `src/**/*.test.ts(x)`；浏览器测试由 Playwright 单独执行，不混进组件测试。

### 浏览器联通与页面测试（TASK-006 / TASK-007）

端到端测试（E2E）是在真实浏览器里检查多个部分能否连起来工作。首次安装需先完成后端 `uv sync --locked`，然后从仓库根目录执行：

```bash
cd frontend
npm ci
npm run test:e2e:install
npm run test:e2e
```

浏览器下载只需首次或 Playwright 版本更新后执行。测试不会隐式下载浏览器；缺少浏览器会明确失败。此启动方式已在 macOS 验证；Linux 还可能需要 Playwright 官方系统依赖，Windows 的虚拟环境路径与信号停止流程尚未适配。

测试自动启动 **127.0.0.1:15173** 的前端与 **127.0.0.1:18000** 的后端；常规开发的 5173/8000 保持不变。后端运行在本次新建的系统临时目录，先执行既有初始迁移；结束时停止本次自启进程并回收其临时数据。若端口已被占用会明确失败，不复用或结束已有服务，也不允许两个浏览器套件并行抢占固定端口。

当前验证：页面明确显示“业务功能尚未实现”、导航与前后退、资料详情直接访问/刷新、未知地址返回、键盘焦点，以及 390px/320px 窄屏无横向溢出；同时保留浏览器同源请求经过 Vite 代理到 FastAPI 后返回 403 的真实检查。桌面与窄屏截图保存在 `frontend/test-results/`，供人工检查布局，不进 Git。**没有模拟业务成功，也不代表添加、学习、复习等主闭环已经通过。**只跑 Chromium、单 Worker、零自动重试；失败需要修正或说明原因，不能靠重试掩盖。

运行器在结束后释放测试服务器；失败记录/浏览器 trace（可回放的执行记录）位于 `frontend/test-results/`，已被 Git 忽略，只用于合成测试数据。报浏览器缺失时运行上方安装命令；报端口占用时检查是否有自己启动的测试，不要结束不明进程。项目完整任务检查入口目前不自动运行 E2E，涉及联通变化的任务必须像 TASK-006 一样显式把 `npm run test:e2e` 列入必要检查，不能用组件测试冒充。

参考：[pytest 临时目录](https://docs.pytest.org/en/stable/how-to/tmp_path.html)、[Testing Library 共用测试设置](https://testing-library.com/docs/react-testing-library/setup/)、[Playwright 测试服务器](https://playwright.dev/docs/test-webserver)。

### 数据库运行配置

应用导入和启动仍然不连接、创建或迁移数据库。`.env.example` 只是配置示例，程序**不会自动加载 `.env`**；需要时在当前终端用 `export STUDYPILOT_DATABASE_URL=...` 显式设置。

只查看当前脚手架页面，无需建库。需要建立本地开发数据库时，在仓库根目录执行：

```bash
cd backend
uv sync --locked
uv run alembic upgrade head
uv run alembic current
uv run alembic check
```

`upgrade head` 将数据库升级到最新版本；重复执行不会清空已有数据。`current` 显示版本，`check` 比较模型与数据库是否存在待迁移的结构差异，但不能代替迁移审查。初始版本是 `0001_initial`，包括 11 张业务表和 1 张版本表。

默认 URL 为 `sqlite:///./var/studypilot.db`，相对路径基于**命令运行目录**：按上述步骤得到 `backend/var/studypilot.db`。切换目录时请使用绝对 URL（例如 `sqlite:////绝对路径/studypilot.db`），避免误建另一个库。只有显式调用连接工厂或迁移命令才创建所需目录；连接工厂不自行建表。

每次对已有数据迁移前，先停止应用和所有数据库写入进程，备份数据库及关联文件，并确认目标路径。初始迁移的降级只允许业务表全空的开发库；只要任一业务表有数据，就在删除任何表之前拒绝执行。不要对真实资料库运行降级或依赖它作为备份替代品。

数据库访问统一通过 `infrastructure.database` 的连接工厂、会话工厂和 `session_scope` 事务入口。事务即“一组写入全部成功才保存，失败则全部撤销”；每次使用独立会话，不共享可变 Session。每个 SQLite 连接开启外键、设置 5 秒锁等待；测试只在临时目录执行迁移，不触碰默认库。

字段范围、枚举、唯一性和外键由数据库约束；Python 对象映射（ORM）负责时区转换、名称规范化、版本冲突以及普通对象写入保护。时间点必须带时区，按 UTC 保存和读取，日历日期不转换。正常无变化更新不会增加版本。ORM 钩子和版本保护**不覆盖直接 SQL 或批量更新**；后续应用服务须走普通 ORM 写入，不得绕过这些保护。插入关联对象时先保存并 `flush` 父对象；本阶段只有外键，未引入自动关联保存。

初始模型位于共享基础设施，表的 `info.owner` 保留 resources/taxonomy/learning/notes/reviews 的原有职责。历史学习/复习记录拒绝普通 ORM 修改或直接删除；资料删除可通过数据库级联删除关联记录，但不会删除主题、标签或删除确认记录。确认表只存令牌摘要，不存原始令牌。**文件状态流转、完整 URL 校验、跨表状态一致性、删除确认和保留期清理仍由后续业务任务实现**，数据库基础不表示这些操作已获准开放。当前未安装或验证 PostgreSQL 驱动，不承诺只改 URL 就能切换。

枚举采用显式表约束，使 Alembic 能可靠比较；迁移版本不导入可变模型。连接与时间处理参考 [SQLAlchemy SQLite 说明](https://docs.sqlalchemy.org/en/20/dialects/sqlite.html) 和 [UTC 时间存储示例](https://docs.sqlalchemy.org/en/20/core/custom_types.html#store-timezone-aware-timestamps-as-timezone-naive-utc)。

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

因为业务功能尚未实现。目前可以切换页面、查看布局与添加资料来源预览，但没有可操作的保存/上传表单；未接入的数据明确留空，不能用假数据让人误以为资料管理已经完成。

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

TASK-003 已冻结 API、数据字段、错误、安全和数据库契约；TASK-005 落实数据库基础，TASK-006 补充共用测试与浏览器联通骨架。下一步按批准边界实现真实业务模块与前端应用壳；开放业务接口之前仍需完成既定本地访问安全策略。内容解析、模型 API Key、AI、RAG 和学习 Agent 仍然属于更晚阶段，不能因为目录已经存在就提前加入。
