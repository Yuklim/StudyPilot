# TASK-008：本机访问保护与共享 API 调用基础

```toml
schema_version = 2
id = "TASK-008"
status = "IN_PROGRESS"
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

- 进行中，未报告 PASS。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 2026-09-03：IN_PROGRESS。独立 Review/Acceptance 待执行；沿用用户已授权的临时 GPT-5.4/medium 只读运行器，不改默认配置。
- 最终合并仅由用户决定并执行。
<!-- EVIDENCE:END -->
