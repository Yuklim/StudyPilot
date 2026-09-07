# 浏览器扩展 Agent 规则

## 1. 适用范围

本文件适用于 `extension/**`，并补充仓库根 `AGENTS.md`。不得放宽根规则。

## 2. 模块职责

- 本模块负责：Manifest V3 浏览器扩展 —— 读取用户当前已打开、已渲染的网页内容，并把它交给本机 StudyPilot 的 UI 页面。
- 本模块不负责：后端业务判断、数据库、文件存储、API 契约定义、正文的存储格式决定（这些由 `backend/` 与 `docs/contracts/` 承担），也不负责 StudyPilot 主界面（`frontend/`）。
- 上游依赖：产品需求、冻结的 `/api/v1` 契约、`frontend/` 提供的接收入口。
- 下游使用者：在本机浏览器中使用 StudyPilot 的个人学习者。

TASK-037 建立工程骨架与检查组；TASK-038 实现网页正文采集（读当前页 → Markdown → 经 `/capture` 页面确认后写入）。**图片冻结不在其中**，正文里的图片引用仍指向原站。

**浏览器范围（用户 2026-09-06 明确决定，不要再提议扩大）：只做 Chrome 与 Edge**（同属 Chromium）。不支持 Firefox 与 Safari，不引入 `webextension-polyfill` 一类兼容层，不产出第二套构建产物——Firefox 的 `browser.*` 命名空间、后台脚本模型与签名要求等于第二套代码，此后每个扩展任务都要维护两份。直接用 `chrome.*` API。除非用户本人重新提出，视为已关闭的范围问题。

## 3. 必须保持的不变量

- **不引入任何第三方站点凭证**：不要求、不读取、不存储、不转发用户在知乎/CSDN 等站点的登录态、Cookie 或扫码登录结果。扩展读的是用户**已经登录、已经看得见**的页面，会话由浏览器自己持有。
- **只能采集用户本人当前已能看到的内容**，不得绕过任何站点的访问控制、付费墙或权限检查。
- **不改动 StudyPilot 的安全边界**：内容一律经由本机 UI 页面（`http://127.0.0.1:5173`）转交，扩展**不直接调用** `/api/v1`。理由：`backend/src/studypilot/infrastructure/security/local_access.py` 要求 `Origin` 等于 UI 源且 `Sec-Fetch-*` 三元组成立，而扩展发起的请求源是 `chrome-extension://`、`Sec-Fetch-Site: cross-site`，只能通过放宽该门禁来满足。放宽本机访问门禁不在本模块的职权内。
- **类型作用域按运行时实际拥有的 API 分开**（TASK-040 关闭 TASK-038 遗留 L2）：`tsconfig.json` 的 `types` 只有 `chrome`，因为 popup、注入脚本与 service worker 跑在扩展沙箱里，**没有 `process`**；把 `node` 放进全局 `types` 会让 `process.env` 通过类型检查却在运行时炸。测试与构建配置确实跑在 node 上，由 `tsconfig.tools.json` 单独覆盖，`npm run typecheck` 两份都跑。（这条理由不能写在 `tsconfig.json` 里——治理检查按严格 JSON 解析 `*.json`，注释会让它失败。）
- **当前已授予的 reach 就是全部，逐条有据**：`activeTab`（仅在用户点击图标后授予当前那一个标签页，用完即失效）、`scripting`（把提取脚本注入该标签页）、`storage`（popup 关闭后暂存一份待交付内容，交付即删）、**一条只匹配 `http://127.0.0.1:5173/*` 的内容脚本**，以及 **`optional_host_permissions: ["<all_urls>"]`（TASK-040）**——后者**安装时不授予**，只在用户于 popup 点「连图片一并保存」时经 `chrome.permissions.request` 请求，可随时撤销，用于由 background service worker 取回正文图片的字节（`credentials: 'omit'`，不带任何站点凭证）。**不申请永久的 `host_permissions`**——那会把「用户主动指定的一页」换成「安装即持有、不再询问的长期访问权」；可选权限的覆盖面与它完全相同，差别只在授予时机与可撤销性。
- **权限最小化且需显式授权**：给扩展增加任何 reach —— `permissions`、`host_permissions`、`optional_permissions`、`content_scripts`、`externally_connectable`、`web_accessible_resources`、CSP 覆写等 —— 必须在任务记录中写明用途与替代方案，并经独立 Review。`src/manifest.test.ts` 断言 manifest 的顶层键恰好是既定的那一组（当前为 `manifest_version`/`name`/`version`/`description`/`permissions`/`optional_host_permissions`/`background`/`content_scripts`/`action` **九个**，TASK-040 新增后两个），另有断言锁死 `permissions` 的确切三项（**安装时权限一字未加**）、`optional_host_permissions` 恰好为 `["<all_urls>"]` 且不得出现 `host_permissions`、`background` 条目的确切键集、以及内容脚本的唯一匹配源，**任何**新增键都会让它失败；这是有意的白名单门闩，不得为通过测试而删除或放宽断言。用白名单而非逐个点名危险键，是因为点名必然漏掉下一个。
- 不在扩展存储中持久化 StudyPilot 的本机访问令牌或任何密钥；不记录用户笔记或凭据。**唯一例外是 §3 已授权的 `pendingCapture` 暂存**：采集到的正文在交给 `/capture` 页面之前必须落一次扩展存储（popup 打开新标签页后即被关闭），中转脚本在交付时立即删除。**已知残留**：用户点了采集却始终不打开确认页时，这份正文会一直留在扩展 profile 的磁盘上，直到下次采集覆盖或下次交付时被清掉——这一点必须在面向用户的文档里如实告知。
- 未完成的功能不得以假数据或无效按钮伪装成可用。

## 4. 公共契约

- 架构边界：`docs/architecture/MVP架构与技术选型提案.md`
- 与 UI 页面之间的消息格式属跨模块契约，须在相应任务中与 `frontend/` 一并定义并写入契约文档；不得由本模块单方面约定。
- 当前承诺的能力：采集用户当前打开页面的正文并交给 `/capture` 页面确认。图片冻结、PDF、标注均尚未实现，不得以任何形式暗示已经可用。

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

构建产物在 `extension/dist/`。Chrome 在 `chrome://extensions` 打开「开发者模式」后用「加载已解压的扩展程序」选择该目录；Edge 在 `edge://extensions` 打开左下角「开发人员模式」后用「加载解压缩的扩展」。**已在 Edge 实机验证可加载（TASK-037）；Chrome 尚未实测**，两者同内核、manifest 无分支专有字段。

## 6. 文件边界

- 默认允许：具体任务单授权的 `extension/**` 路径。
- 默认禁止：后端、数据库、治理文档、`frontend/**` 与未获批准的业务契约。
- 本目录是**独立 npm 工程**，不与 `frontend/` 共享 `node_modules`、不做 npm workspace；两个顶层目录之间不建立构建耦合。
- **一处明示例外**：`src/shared/protocol.test.ts` 在**测试期**只读 `frontend/src/features/capture/protocol.ts` 的源码文本，用于守护两份手写协议实现的漂移。这不构成构建耦合 —— 不 import、不共享依赖、`npm run build` 与 `dist/` 完全不涉及 `frontend/`。**但移动或改名前端那个文件需要同步更新此处路径**，否则扩展的检查组会因为另一个模块的改动而变红。
- 生成文件：`node_modules/`、`dist/`、覆盖率与 `*.tsbuildinfo` 不提交。
- 锁文件要求：依赖变化必须同步提交 `package.json` 和 `package-lock.json`，并重新执行全部扩展检查。

## 7. Code Review Rules

### 凭证与访问控制

- 要发现的违规行为：任何读取、存储或转发第三方站点 Cookie / 登录态的代码；任何绕过付费墙或权限检查的采集；任何把 StudyPilot 令牌写入扩展存储的行为。
- 真实风险：本机学习工具变成第三方会话的保管者，泄露面与法律风险都远超其收益。
- 安全路径：只读取当前标签页已渲染的 DOM；会话完全留在浏览器里。

### 安全边界

- 要发现的违规行为：扩展直接向 `127.0.0.1:8000` 发请求；为让扩展直连而修改 `infrastructure/security/local_access.py` 或放宽 `Origin`/`Sec-Fetch` 校验。
- 真实风险：本机访问门禁一旦为扩展放开，任何本机页面或扩展都可能获得同等能力。
- 安全路径：内容经 UI 页面转交，后端只信任 UI 源。

### 权限增量

- 要发现的违规行为：manifest 悄悄新增权限；或为绕过 `manifest.test.ts` 的门闩而修改/删除断言。
- 真实风险：扩展权限是一次性授予、长期生效的，用户不会重新审视。
- 安全路径：权限变更在任务记录中说明用途、范围与替代方案，测试断言随之**显式**更新。
