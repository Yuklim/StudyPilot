# TASK-008：本机访问保护与共享 API 调用基础

```toml
schema_version = 2
id = "TASK-008"
status = "MERGED"
risk = "L3"
risk_reason = "落实已批准的本地令牌、Host/Origin/Fetch Metadata 前置安全协议，并连接浏览器共享客户端；安全及跨模块影响必须独立 Review 与独立验收。"
risk_flags = ["security", "authentication", "public-api", "tests"]
owner = "repo_maintainer"
base = "9e59355fee2aabe741b171e33197b8f96ee6f27a"
allowed_paths = ["backend/src/studypilot/infrastructure/security/**", "backend/src/studypilot/infrastructure/config.py", "backend/src/studypilot/main.py", "backend/tests/test_local_access.py", "backend/tests/test_local_session.py", "backend/tests/conftest.py", "backend/tests/run_browser_server.py", "backend/tests/test_support.py", "frontend/src/api/**", "frontend/vite.config.ts", "frontend/e2e/vite.config.ts", "frontend/e2e/scaffold.spec.ts", "frontend/e2e/local-access.spec.ts", ".env.example", "README.md", "docs/tasks/TASK-007-journal-app-shell.md", "docs/tasks/TASK-008-local-access-foundation.md", "docs/tasks/任务索引.md"]
checks = ["backend", "frontend", "governance"]
```

## 需求与范围

- 用户已合并 TASK-007 并要求下一步；PR #12 实际 MERGED，base 为已确认合并提交。延续上一任务列明的本机访问保护和共享 API 基础，不增加产品需求。
- 依据：已批准 `docs/contracts/API与数据契约基线.md` 第 2.1/2.2、7、10 的 local-session，OpenAPI LocalSessionEnvelope/ErrorResponse；架构第 9.2 节安全边界及第 12 阶段 B 的共享 API 客户端。契约不改。
- 唯一写入者：主 Agent兼任 repo_maintainer（经批准的跨端安全基础设施，不实现业务），串行维护登记和实现。L3：1 位实际只读独立 Reviewer → 1 位不同身份的实际只读 Integration Owner；主 Agent不重复审代码。
- 后端：启动期规范来源配置与随机进程令牌；纯 ASGI 头部安全门禁，拒绝发生在读取请求体/访问数据库/磁盘之前；bootstrap 成功响应与已批准的 403/500 安全错误格式、请求编号和 no-store；白名单 CORS/预检。
- 前端：按需初始化、只在闭包内存保存令牌的共享 JSON 请求入口；同源路径限制、固定安全 fetch 选项、受控错误与重启失效处理，不自动重放写请求。开发/E2E 代理固定后端 Host，测试端口显式配置。
- 此任务不改变手帐页面和导航，不在页面自动触发业务请求；共享客户端由后续业务页面复用，本次通过组件单测和真实浏览器调用验证。不添加账户、登录、公开部署、表单、业务增删改、文件操作、数据模型或迁移；不把安全门禁放行后的框架 404 冒充业务成功。
- 仅更新 TASK-007 合并事实的 status/EVIDENCE/索引；不重写原证据。不改全局治理或默认 Agent 配置。
- 判断口径：契约表 7.3 明确允许无浏览器上下文的 Host+token 只读请求；若提供 Origin/Fetch Metadata 则必须合法，不接受显式跨站/不完整伪造上下文。写入必须有完整来源上下文。CORS 方法/头只采用已批准操作集合，不发明业务接口。

## 完成条件

1. 正常浏览器可经同源代理取得符合契约的 local-session；进程实例/重启产生独立令牌，no-store，不读体/数据库、不在日志/持久化中暴露令牌；健康检查精确响应不变。
2. 错误/重复/覆盖 Host、不一致绝对目标、非法来源/Fetch 元数据、缺失/错误/旧 token、非法预检和恶意三种表单都被拒绝，raw ASGI receive/路由及文件哨兵证明无前置副作用。合法 token 读、完整来源写可到受控测试路由；不存在任何绕过接口。
3. CORS 只精确允许配置的回环 UI 来源，预检 204，不允许通配或凭据；配置在启动确定，异常端口/模式直接失败，不动态信任外部 Host。
4. 共享客户端只同源 `/api/v1/`，不从调用方接收覆盖安全选项/令牌的任意 fetch 配置；bootstrap 并发去重/失败可恢复、403 旧令牌作废且不自动重放，网络/协议错误不回显敏感响应。返回原始 Response 的上传/下载入口不在本次范围。
5. 后端/前端/治理检查、生产构建与真实 Chromium 同源安全测试通过，旧 UI 与错误边界测试不削弱；文档说明运行配置、单进程边界和安全不等于业务/公网认证。全部必要证据绑定最终候选并经过 L3 独立 Review/验收。

## 上下文包

根/后端/前端 AGENTS.md V2、task-intake/implement/review/stage-acceptance Skills、契约上述限定段落、相关安全中间件/应用配置/Vite 代理及共用测试。模块旧文案的默认拒绝以“未经后续任务授权”为前提；本任务只授权既定安全协议与 bootstrap，不开放业务。

命令：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-008-local-access-foundation.md --worktree`；`cd frontend; npm run test:e2e`。测试只使用既有临时数据库、15173/18000 端口和合成数据，安全套件禁用浏览器 trace，避免录入真实临时令牌；不影响用户运行服务。

## 实现与测试

- 实现 SHA：`a4f6bb26ff843dc48477bd35054425c128672a19`，19 文件。实现进程生命周期令牌、纯 ASGI 头部门禁、bootstrap/安全错误与 no-store/CORS、启动端口配置；共享客户端仅闭包内存缓存/初始化去重/受控错误/显式重试；代理固定 Host 且在改写前限制 UI authority。没有数据库/迁移/业务路由/页面/依赖变化。
- 环境：macOS arm64、Python 3.13.9/pytest 8.4.2、Node 24.18.0/npm 11.16.0、Vitest 4.1.11、Playwright 1.62.1/Chromium 151.0.7922.34。测试后端沿用 TASK-006 隔离临时目录，15173/18000 端口，不读取真实资料。
- 最终完整 `check_task.py --task docs/tasks/TASK-008-local-access-foundation.md --worktree`：exit=0/CHECKS PASS，输入指纹 `87aa6b202400f7ece9f72f999ca0e713005068933f27909fd4ab4b82a398607f`；后端 Ruff 格式/lint、mypy（21 文件）、pytest（115 项）、离线源码包/wheel 构建；前端格式/lint/类型、46 项 Vitest、生产构建；治理校验/格式/lint/23 单测全部通过。
- 后续仅补 UI Host 前置校验与浏览器断言、README：`npm run format` 后 `npm run lint && npm run typecheck && npm run build`、`npm run format:check && npm run test -- --run` 全部 exit=0，仍 46 项。完整 `npm run test:e2e` 最终 7 项全部 PASS（12.5 秒），覆盖新 Host 保护、初始化、实际预检与旧页面回归；后端/治理输入未变，复用有效证据。最终静态检查 exit=0，19 文件，指纹 `c6f52e97dc3ffb6aaa2b3394b39915d08ab910384b02d9b84fb8c7aaaa190743`。
- 真实失败与修正：初始环境端口严格类型拒绝字符串，改为有范围限制的配置整数；初始 Ruff 的中文逗号与排版已修正。首次完整入口仅 uv 缓存读取被沙箱拒绝（build exit=2），允许访问既有缓存后离线构建及最终完整检查成功，未下载依赖。首次 E2E 6/7 通过，非法 Cookie 预检被 Vite 默认 CORS 提前返回 204；改 `cors:false` 由后端处理后全套通过。没有降低 403 断言或抹去失败。
- 完成条件 1/2：`test_local_session.py` 60 项（真实生命周期、旧 token、头部矩阵、合法读写/CLI 读、非法来源/重复/转发/绝对目标、预检/上限）；原 4 项安全测试仍验证 receive/路由/文件/数据库哨兵不被触发，正常 Host/上下文下缺 token 的表单仍拒绝。bootstrap 不建库的共用夹具检查、健康精确响应保留。真实临时令牌相关断言仅输出布尔失败，避免失败说明回显凭据。
- 完成条件 3/4：端口配置/临时启动器断言、46 项前端测试中的 25 项共享客户端测试；危险路径、二次解码、并发初始化、错误净化、重启失效/晚到旧错误不清新令牌、无自动写重试；JSON 返回完整成功信封保留分页元数据，具体业务类型留给对应任务。
- 完成条件 5：7 项真实浏览器（本机代理+生产客户端，无模拟业务成功；合法 token 到未实现路由为框架 404）；预检还核对后端错误码/请求编号，安全套件关闭 trace，不把真实令牌返回测试进程。原 21 项 UI/错误边界/隔离测试及 4 项浏览器回归不降低，页面未变无需重复设计截图审查。README/.env.example 已说明运行方式和边界。
- 独立 Review/Acceptance 待执行。已知限制：一个后端进程，macOS Chromium 实测；未实现业务路由/上传下载/公网认证，当前 UI 不自动连接。共享客户端在后续功能导入时使用；不声称当前资料管理已可用。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 2026-09-03：IN_REVIEW。主 Agent已自检范围与实现，必要自动检查有效通过。独立 Review/Acceptance 待执行；沿用用户已授权的临时 GPT-5.4/medium 只读运行器，不改默认配置。
- 最终合并仅由用户决定并执行。

### 独立 Review 原文

Reviewer session `01a06551-1bfc-74b2-97af-af1bbc1ea4f0`，Codex CLI 0.145.0/GPT-5.4 medium；启动头为 `sandbox: read-only`、`approval: never`。独立于主 Agent实现者，未改默认配置。

PASS

`base=9e59355fee2aabe741b171e33197b8f96ee6f27a` `candidate=260d9fc6c42716aea1bebfb75a74c38e38c642f0`

只读证明：运行器为 `sandbox: read-only`、`approval: never`；实际执行 `test -w .` 退出码 `1`，`stat -f '%Sp %N' .` 为 `drwxr-xr-x .`；读取 Git 时还出现 `/tmp/... Operation not permitted`，可确认未具写权限。

覆盖：已完整读取 `.agents/skills/studypilot-review-change/SKILL.md`、根/`backend`/`frontend` `AGENTS.md`、`docs/tasks/TASK-008-local-access-foundation.md`、`docs/governance/风险分级与检查规则.md`、契约 `38-104` 与 `367-404` 行；已完成 19 文件 `base..candidate` diff 首次完整审查，并补查 [backend/src/studypilot/infrastructure/security/local_access.py](/Users/yuklimching/Desktop/StudyPilot/backend/src/studypilot/infrastructure/security/local_access.py:1)、[backend/src/studypilot/main.py](/Users/yuklimching/Desktop/StudyPilot/backend/src/studypilot/main.py:14)、[frontend/src/api/client.ts](/Users/yuklimching/Desktop/StudyPilot/frontend/src/api/client.ts:1)、[frontend/vite.config.ts](/Users/yuklimching/Desktop/StudyPilot/frontend/vite.config.ts:1) 等必要调用链。

Findings：No findings。启动令牌生命周期、Host/Origin/Fetch Metadata 前置判定、OPTIONS/CORS、Vite Host 重写前校验、bootstrap 不泄漏、共享客户端内存保存且不自动重放写请求、业务路由仍未开放，和任务/契约一致。

证据与限制：复用任务中已绑定候选的 `115 backend / 46 frontend / 23 governance / 7 Chromium` 通过证据与指纹 `c6f52e97dc3ffb6aaa2b3394b39915d08ab910384b02d9b84fb8c7aaaa190743`；按规则未重跑，也未读取浏览器 trace。限制仅在当前单机单进程、macOS Chromium 已验证范围内成立。

- 已对冻结候选 `260d9fc6c42716aea1bebfb75a74c38e38c642f0` 执行静态范围/指纹核对，exit=0，指纹与最终测试输入一致。独立 Review PASS，No findings。
- 2026-09-03：IN_ACCEPTANCE。仅写回本任务证据和索引，不改产品输入；安排不同身份、实际只读的 Integration Owner 核对五项完成条件与证据，不重复全量 Review/测试。


### 独立 Acceptance 原文

Integration Owner session `01a06554-1fdd-76b2-8816-42e4c99596b3`，独立于实现者和 Reviewer；Codex CLI 0.145.0/GPT-5.4 medium，实际启动头 `sandbox: read-only`、`approval: never`。仅核对完成条件、候选和证据，未重跑整套测试或重审代码。下文仅将 Markdown 行尾双空格换行改为空行分段以通过 Git 空白检查，报告文字不变。

PASS

实际只读证明：本会话运行器约束为 `sandbox read-only`、`approval never`；实测 `test -w .` 退出码 `1`。读取 Git 时还出现 `/tmp/... Operation not permitted`，与只读沙箱一致，独立性可确认。

`base=9e59355fee2aabe741b171e33197b8f96ee6f27a`，已审 `candidate=260d9fc6c42716aea1bebfb75a74c38e38c642f0`，当前证据 `HEAD=9f2d7a8c2f52616b1a97fe0d36b880e19e303e0e`。我核对了 `candidate..HEAD`，仅变更 [docs/tasks/TASK-008-local-access-foundation.md](/Users/yuklimching/Desktop/StudyPilot/docs/tasks/TASK-008-local-access-foundation.md) 的 `status/EVIDENCE` 与 [docs/tasks/任务索引.md](/Users/yuklimching/Desktop/StudyPilot/docs/tasks/任务索引.md) 对应索引行，无产品输入变化；Review PASS 仍覆盖冻结候选。

条件 1：任务证据已绑定 `test_local_session.py` 生命周期/no-store/健康检查/旧 token/无持久化与无前置副作用哨兵。

条件 2：同组后端安全矩阵覆盖非法来源、Host/绝对目标、缺失/错误/旧 token、非法预检、恶意表单，且合法读写仅到受控测试路由。

条件 3：证据记录白名单 CORS、预检 `204`、异常端口失败、无 wildcard/credentials。

条件 4：46 项前端中 25 项共享客户端测试覆盖同源 `/api/v1/`、并发去重、403 旧令牌作废、不自动重放写请求、错误净化。

条件 5：`115 backend / 46 frontend / 23 governance / 7 Chromium` 通过，Reviewer `01a06551-1bfc-74b2-97af-af1bbc1ea4f0` 已 PASS；任务记录注明 `check_task --candidate HEAD --evidence-from 260d... --static-only` 为 `EVIDENCE_ONLY PASS`，且指纹仍为 `c6f52e97dc3ffb6aaa2b3394b39915d08ab910384b02d9b84fb8c7aaaa190743`。

未见未处置阻断。剩余风险仅为已声明边界：证据适用于单机单进程、macOS Chromium、本地安全连接基础；不代表业务功能完成，也不代表公网认证能力。

- 主 Agent工具证据：`check_task.py --task docs/tasks/TASK-008-local-access-foundation.md --candidate HEAD --evidence-from 260d9fc6c42716aea1bebfb75a74c38e38c642f0 --static-only` 对 `9f2d7a8c2f52616b1a97fe0d36b880e19e303e0e` 实际返回 EVIDENCE_ONLY PASS（exit=0）。本条补记原工具事实，不把静态检查称为重新运行测试。
- 2026-09-03：ACCEPTED。已审候选仍为 `260d9fc6c42716aea1bebfb75a74c38e38c642f0`，独立 Review PASS/No findings、独立 Acceptance PASS；五项条件全部满足。主 Agent仅做证据完成门禁，没有第三次从头审查代码。
- 剩余边界：单机单进程/macOS Chromium 已验证；安全连接基础不是公开身份认证，业务/上传下载/实际资料界面仍待后续任务。没有需要另行处置的遗留缺陷。
- 用户操作：待用户决定并执行合并；Agent 不合并或推送 main。下一步拟实现资料管理后端，先保存网页链接和粘贴内容、读取资料列表与详情，再按任务接入页面；文件上传/学习/AI 不提前扩大到本任务。

- 2026-09-03：用户确认合并，GitHub PR #13 已核实 MERGED（2026-09-03T03:41:56Z），merge commit `910e85b3164704e02664f1420eee65e509467e63`；origin/main 已获取一致。状态 MERGED，历史审查/验收不变；TASK-009 承接资料后端。
<!-- EVIDENCE:END -->
