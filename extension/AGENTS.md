# 浏览器扩展 Agent 规则

## 1. 适用范围

本文件适用于 `extension/**`，并补充仓库根 `AGENTS.md`。不得放宽根规则。

## 2. 模块职责

- 本模块负责：Manifest V3 浏览器扩展 —— 读取用户当前已打开、已渲染的网页内容，并把它交给本机 StudyPilot 的 UI 页面。
- 本模块不负责：后端业务判断、数据库、文件存储、API 契约定义、正文的存储格式决定（这些由 `backend/` 与 `docs/contracts/` 承担），也不负责 StudyPilot 主界面（`frontend/`）。
- 上游依赖：产品需求、冻结的 `/api/v1` 契约、`frontend/` 提供的接收入口。
- 下游使用者：在本机浏览器中使用 StudyPilot 的个人学习者。

TASK-037 只建立工程骨架与检查组。骨架中的说明文字不是业务功能；采集能力在后续任务实现。

## 3. 必须保持的不变量

- **不引入任何第三方站点凭证**：不要求、不读取、不存储、不转发用户在知乎/CSDN 等站点的登录态、Cookie 或扫码登录结果。扩展读的是用户**已经登录、已经看得见**的页面，会话由浏览器自己持有。
- **只能采集用户本人当前已能看到的内容**，不得绕过任何站点的访问控制、付费墙或权限检查。
- **不改动 StudyPilot 的安全边界**：内容一律经由本机 UI 页面（`http://127.0.0.1:5173`）转交，扩展**不直接调用** `/api/v1`。理由：`backend/src/studypilot/security/local_access.py` 要求 `Origin` 等于 UI 源且 `Sec-Fetch-*` 三元组成立，而扩展发起的请求源是 `chrome-extension://`、`Sec-Fetch-Site: cross-site`，只能通过放宽该门禁来满足。放宽本机访问门禁不在本模块的职权内。
- **权限最小化且需显式授权**：新增 `permissions`、`host_permissions` 或 `content_scripts` 必须在任务记录中写明用途与替代方案，并经独立 Review。`src/manifest.test.ts` 会因这类新增而失败，这是有意的门闩，不得为通过测试而删除断言。
- 不在扩展存储中持久化 StudyPilot 的本机访问令牌或任何密钥；不记录用户正文、笔记或凭据。
- 未完成的功能不得以假数据或无效按钮伪装成可用。

## 4. 公共契约

- 架构边界：`docs/architecture/MVP架构与技术选型提案.md`
- 与 UI 页面之间的消息格式属跨模块契约，须在相应任务中与 `frontend/` 一并定义并写入契约文档；不得由本模块单方面约定。
- 当前骨架只承诺显示「工程框架已就绪，采集功能尚未实现」。

## 5. 准确命令

以下命令均在 `extension/` 中运行。

```text
安装：npm ci
格式化：npm run format
格式检查：npm run format:check
静态检查：npm run lint
类型检查：npm run typecheck
模块测试：npm run test -- --run
构建：npm run build
```

构建产物在 `extension/dist/`，在 Chrome 的 `chrome://extensions` 打开「开发者模式」后用「加载已解压的扩展程序」选择该目录。

## 6. 文件边界

- 默认允许：具体任务单授权的 `extension/**` 路径。
- 默认禁止：后端、数据库、治理文档、`frontend/**` 与未获批准的业务契约。
- 本目录是**独立 npm 工程**，不与 `frontend/` 共享 `node_modules`、不做 npm workspace；两个顶层目录之间不建立构建耦合。
- 生成文件：`node_modules/`、`dist/`、覆盖率与 `*.tsbuildinfo` 不提交。
- 锁文件要求：依赖变化必须同步提交 `package.json` 和 `package-lock.json`，并重新执行全部扩展检查。

## 7. Code Review Rules

### 凭证与访问控制

- 要发现的违规行为：任何读取、存储或转发第三方站点 Cookie / 登录态的代码；任何绕过付费墙或权限检查的采集；任何把 StudyPilot 令牌写入扩展存储的行为。
- 真实风险：本机学习工具变成第三方会话的保管者，泄露面与法律风险都远超其收益。
- 安全路径：只读取当前标签页已渲染的 DOM；会话完全留在浏览器里。

### 安全边界

- 要发现的违规行为：扩展直接向 `127.0.0.1:8000` 发请求；为让扩展直连而修改 `security/local_access.py` 或放宽 `Origin`/`Sec-Fetch` 校验。
- 真实风险：本机访问门禁一旦为扩展放开，任何本机页面或扩展都可能获得同等能力。
- 安全路径：内容经 UI 页面转交，后端只信任 UI 源。

### 权限增量

- 要发现的违规行为：manifest 悄悄新增权限；或为绕过 `manifest.test.ts` 的门闩而修改/删除断言。
- 真实风险：扩展权限是一次性授予、长期生效的，用户不会重新审视。
- 安全路径：权限变更在任务记录中说明用途、范围与替代方案，测试断言随之**显式**更新。
