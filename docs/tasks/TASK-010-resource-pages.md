# TASK-010：手帐资料页面接入真实数据

```toml
schema_version = 2
id = "TASK-010"
status = "IN_REVIEW"
risk = "L2"
risk_reason = "普通前端业务接入，仅使用已合并的三个资料接口和共享客户端，不改变公共契约、认证策略、事务、数据模型或后端；新行为通过组件与真实浏览器测试验证。"
risk_flags = ["business", "tests"]
owner = "frontend_worker"
base = "6ff2aace02d527dce1a9acb2144c4e00e57a4636"
allowed_paths = ["frontend/src/features/resources/**", "frontend/src/App.tsx", "frontend/src/App.test.tsx", "frontend/src/shell/Screen.tsx", "frontend/src/shell/pages.ts", "frontend/src/styles.css", "frontend/e2e/scaffold.spec.ts", "frontend/e2e/local-access.spec.ts", "frontend/e2e/resources.spec.ts", "frontend/e2e/resource-pages.spec.ts", "frontend/playwright.config.ts", "README.md", "docs/tasks/TASK-009-resource-backend.md", "docs/tasks/TASK-010-resource-pages.md", "docs/tasks/任务索引.md"]
checks = ["frontend", "governance"]
```

## 需求与范围

- 用户确认 TASK-009 已合并；PR #14 实际 MERGED，2026-09-03T04:28:25Z，merge commit 为 base。承接上一任务明确的下一步：现有手帐页面接入网页/粘贴资料表单、列表和详情。
- 依据：需求 5.1～5.4/5.10；契约 1.3 当前阶段清单、2.1～2.3、4.1/4.4/4.6、5，以及 createResource/listResources/getResource 的已合并字段。完整契约不等于本阶段全功能可用，不更改契约。
- 唯一写入者：主 Agent兼任 frontend_worker，按 task-intake/implement Skills 串行实现及维护任务控制面；L2 完整自动检查和自检后只启动一位实际只读独立 Reviewer，主 Agent核对完成条件直接汇总，独立 Acceptance 为 N/A。
- 添加：WEB/PASTE 来源、标题、网址/原文、可选来源名称及保存原因；输入校验、保存中禁重复提交、成功去详情、失败保留输入。不抓网页、不解析或执行原文，不持久化草稿/凭据；提示离开/刷新表单会丢失未保存输入。缺少分类管理接口，暂不添加主题/标签选择器，也不调用未开放接口。
- 资料库：真实加载/失败重试/空状态，卡片与列表切换，标题等既定字段搜索、资料类型/学习状态组合筛选、四个既定字段正反排序、分页；展示真实进度/标签。筛选仅保存在页面内存，离开后可重设，不新增后端查询能力。
- 详情：真实标题、来源、保存原因、状态/进度、时间、标签及原始网址或原样文本；网址仅经验证的 http/https 外链，用户点击才打开，隔离 opener/referrer；粘贴原文用纯文本呈现，不渲染 HTML/Markdown。FILE 仅展示已返回元数据及未开放提示，不提供上传/下载入口。
- 保留纸色/灰绿/圆角/手帐布局；更新全局阶段提示，概览统计/学习/复习等仍明确未接入；保留键盘焦点、返回与移动端。旧“无表单/无请求”断言只在未接入页面保留，已接入页面改为真实正向测试，不削弱安全或错误断言。
- 仅前端功能模块消费现有 `src/api/client.ts`；共享客户端、安全配置、后端、数据库、依赖、治理和契约均不改。所有浏览器测试关闭 trace，避免真实临时令牌进入网络录制；这是测试输出控制，不改变运行时认证。
- 只更新 TASK-009 status/EVIDENCE/索引的合并事实；其他历史不改。禁止范围：所有未列路径、FILE 操作、修改/删除、分类 CRUD、学习记录/笔记/复习/统计实现、AI、公网部署。无并行写入。

## 完成条件

1. 可从页面保存合规 WEB/PASTE，原文保持原样；校验失败不发送创建，来源字段互斥，保存中仅一次请求；错误/不确定结果不自动重放，输入保留且提供可理解的恢复提示。
2. 资料库真实读取并支持规定的搜索/筛选/排序/分页/卡片列表；加载、服务不可用、空库、空搜索均可识别；较晚返回的旧请求不覆盖新状态，离开页面不触发过期导航。
3. 详情可通过地址直接访问/刷新，404/协议错误/连接错误有受控提示与恢复入口；真实状态/时间不伪造，原文不执行脚本，危险外链不呈现可点击入口；没有原文、凭据或错误正文的主动日志/浏览器持久化。
4. 原手帐风格、导航、焦点、未开放页面真实性保持；桌面和 390/320px 无横向溢出，可键盘操作表单/分页，截图人工检查新增界面；FILE/分类/删除/AI 等未开放能力不假装可用。
5. 前端/治理自动检查、真实 Chromium 的页面添加 WEB/PASTE→详情→刷新→资料库搜索流程通过，含失败、原文安全和重复提交回归。只使用临时数据库和合成数据，保留既有共享客户端/错误边界测试。README 说明启动需显式建库及当前能力边界；冻结候选和独立 Review 有效，最终合并由用户执行。

## 上下文包

根/前端 AGENTS.md V2，task-intake/implement/review Skills，风险与模块规则；上述需求/契约段落；现有 App/Screen/pages/styles、api/client（只读）、共用组件测试与 E2E。嵌套规则中早期“业务未实现”描述按已合并后续 TASK-009/本任务授权更新实际页面，而非修改规则本身。

检查：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-010-resource-pages.md --worktree`；`cd frontend` 后 `npm run test:e2e`，只用既有隔离临时服务 15173/18000。不新增依赖、不操作用户真实资料。

## 实现与测试

- 已实现：三个真实资料页面及局部类型适配，复用原共享客户端；表单输入/互斥来源/重复提交保护，列表搜索筛选排序分页/卡片列表，详情元信息/安全外链/纯文本原文，受控错误及过期请求保护。未修改后端、数据库、共享客户端、依赖或契约。主 Agent自检一次完整变更，范围与阶段清单一致；不冒充独立 Review。
- 原 Shell 中资源页的“无请求/无表单”断言改为业务正向测试，其他未接入页保持无接口/无假数据；原客户端、安全及错误边界测试不删。所有 Playwright trace 关闭，测试只用隔离临时数据库和合成资料。README 更新当前能力、显式建库、两端启动、使用方法和边界。
- 实现提交：`971b0e21a20114b0ee791db27ca65bd1e2c4a35f`；最终业务/测试输入指纹：`00d46db467e4e0ac8ada23517b9fa46d4228122627a4bb6c1ac500fc0bdc1f5b`。冻结候选为之后包含本实现 SHA 与测试记录的提交，精确 SHA 写入独立报告与 EVIDENCE。
- 2026-09-03（macOS；Node 24.18.0、npm 11.16.0、Python 3.13.9；现有锁文件/依赖未变）：任务检查命令 `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-010-resource-pages.md --worktree` exit=0。静态范围/敏感模式/Git diff 检查、前端 format/lint/typecheck、70 项 Vitest、生产构建、治理校验/Ruff/23 项治理测试全部 PASS。治理测试中的 fake-test/missing-tool 输出为故障模拟断言，整套实际结果为 23 tests / OK / exit=0。
- `cd frontend && npm run test:e2e` 最终 exit=0，11 项 Chromium / 单 Worker / 零重试 / 13.0s：原 8 项回归保留；新增实际页面 WEB/PASTE 保存→详情→刷新→搜索筛选，断网读取重试/保存不重放/404，以及 21 条合成资料的真实分页与键盘操作。受影响前端/治理检查在最终修正后重跑；后端源码/配置无变，不重复整套后端测试，以真实临时后端 E2E 验证接口接入。
- 截图人工检查：`frontend/test-results/resource-pages-real-UI-sav-19a4f--and-safely-reads-originals-chromium/` 中 `desktop-web-form.png`、`desktop-paste-detail.png`、`mobile-320-detail.png`、`library-1440.png`、`library-320.png`（以及 390px 自动布局断言）。表单/卡片/正文可读、无横向溢出；只含合成资料，不提交截图或运行数据。
- 开发期失败如实记录：初次 lint 拒绝 URL 校验的控制字符正则，改用字符码检查；一次类型检查拒绝 Testing Library 不支持的 `exact` 参数，移除该参数（名称默认精确匹配）。首次 E2E 8 PASS / 2 FAIL：数量定位器与附加提示共用文本节点，改成独立数量 span；断网模拟只拦截一次，开发 StrictMode 第二次读取仍成功，改为在明确点击重试前持续拦截，再恢复真实网络。没有删除或放松断言，最终全套 11 PASS。
- 已知限制：仅本机个人使用；WEB/PASTE 可创建，文件、主题/标签管理、修改删除、学习/笔记/复习/AI 未开放。草稿/筛选仅当前页内存；保存返回不确定时先查资料库再决定是否重试。浏览器仅验证 Chromium，不承诺公网部署或跨浏览器完备。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 2026-09-03：IN_PROGRESS。前置合并已核实，按 L2 登记；Review 待实现完成后执行。独立 Acceptance：N/A（L2，由主 Agent按证据完成门禁）。
- 实现和必要检查完成，转 IN_REVIEW。按 V2 只启动一位实际只读 Reviewer；最终合并仍由用户决定。
<!-- EVIDENCE:END -->
