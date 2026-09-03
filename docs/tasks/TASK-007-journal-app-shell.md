# TASK-007：简约手帐风前端应用壳

```toml
schema_version = 2
id = "TASK-007"
status = "MERGED"
risk = "L2"
risk_reason = "多页面布局、导航与可访问性实现，改变可见界面但不改变公共 API、数据模型、安全策略或业务状态；一次独立 Review 足够。"
risk_flags = ["business", "tests"]
owner = "frontend_worker"
base = "04c340f6b7b2320ed505672b985b6f912187d4d6"
allowed_paths = ["frontend/src/App.tsx", "frontend/src/App.test.tsx", "frontend/src/styles.css", "frontend/src/shell/**", "frontend/index.html", "frontend/e2e/scaffold.spec.ts", "README.md", "docs/tasks/TASK-007-journal-app-shell.md", "docs/tasks/TASK-006-shared-test-foundation.md", "docs/tasks/任务索引.md"]
checks = ["frontend", "governance"]
```

## 需求与范围

- 用户授权：确认 TASK-006 已合并并要求下一步；延续已明确的前端应用壳计划和简约、Mac 式平滑圆角、手帐/自然/生活元素、不局限于植物、降低视觉疲劳的风格要求。PR #11 已 MERGED，合并提交即 base。
- 产品依据：项目需求说明第 5.1、5.3、5.8～5.10；已批准架构第 5.2、12 阶段 B 的前端应用壳。只落实已有入口，不添加社交、账号、打卡排名、AI 等需求。
- 唯一写入者：主 Agent兼任 frontend_worker；串行实现，主 Agent另以 coordinator 写任务/索引。沿用现有 React/Router/CSS，不新增框架、依赖或 Sites 托管，不创建独立网站。
- 范围：共用侧栏/移动导航、学习概览、资料库、添加资料、资料详情预留、学习记录、复习、主题统计与未知地址页；真实可操作的导航、当前页状态、键盘跳转和清楚标明未接入的页面。
- 视觉：现有暖纸色/灰绿与系统字体基础上改进层次、留白、圆角；复用现有书页线稿与轻量纸张/胶带/印章细节，避免装饰遮挡文字和功能，不添加外部素材请求。
- 非目标：不实现表单提交/上传/搜索/删除/学习记录写入、API 客户端或令牌接入；不请求业务接口、不持久化数据、不修改后端/契约/迁移/权限规则，不用假资料、0 统计或伪进度营造已可用状态。原工程状态句作为全局说明保留，标题可按已有需求入口变化。
- 仅登记 TASK-006 已合并事实（status/EVIDENCE/索引行），原审查与测试不重写。
- 风险路由：L2，1 位独立实际只读 Reviewer；独立 Acceptance N/A。导航和骨架不等于已完成管理业务；如需开放接口或改规则，停止另行评估。

## 完成条件

1. 已确认入口有独立页面地址和一致布局，站内导航/返回/浏览器前后退/直接访问有效；资料详情不伪造真实资料，不存在地址提供可返回的提示。
2. 始终明确“业务功能尚未实现/未接入”；无假数据、无伪保存/搜索/上传控件；页面不主动请求业务 API、外部字体/图像或浏览器持久化。原错误边界保留。
3. 桌面与窄屏（至少 390px，检查 320px）无横向溢出/遮挡，中文内容可读；导航语义/当前页/焦点可见、跳过导航、页面切换焦点与标题及减少动效偏好可用。
4. 用户可见变化有组件测试，原安全/错误断言不降低；浏览器验证导航、深链刷新、前后退、窄屏和真实同源代理 403；保留实际页面截图供人工目视核对（本地临时产物，不进 Git）。
5. 前端与治理检查通过、生产构建通过，README 更新当前可见内容/路由与未完成功能；完成独立 Review。只复用有效测试证据，不另起验收 Agent。

## 上下文包

根 AGENTS.md V2、frontend/AGENTS.md、相关需求/架构章节、现有前端与 TASK-006 测试入口。前端模块旧规则描述 TASK-002 的单页和未冻结契约为历史基线；本任务依据用户已授权的新应用壳及已合并 TASK-003，但不改任何业务契约。

命令：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-007-journal-app-shell.md --worktree`；`cd frontend; npm run test:e2e`。浏览器截图/实测使用既有 Playwright，复用本机 15173/18000 临时测试服务；向用户展示采用本地预览，不公开部署。

## 实现与测试

- 实现 SHA：`86cb5185cc7411d9258ec1135ba2b31758fdd93c`；12 文件。共用导航/标题/键盘焦点，7 个已规划页面与未知地址提示；暖纸色、灰绿、圆角、书页/胶带/便签；无业务请求、持久化、假数据或保存/上传表单。原错误边界与后端代码不变，未增加依赖。
- 环境：macOS arm64，Node 24.18.0/npm 11.16.0、Python 3.13.9，Vitest 4.1.11、Playwright 1.62.1/Chromium 151.0.7922.34；沿用 TASK-006 的隔离测试服务，不接触个人资料。
- 首次完整入口（上方 `check_task.py --worktree`）：前端格式/lint、21 项组件测试、治理校验/格式/lint/23 单测均 exit=0；E2E 源文件缺少浏览器 DOM 类型声明导致 typecheck/build exit=2，完整入口如实 FAIL。仅在该测试文件加入 `reference lib="dom"`，未改运行逻辑、断言或配置；随后 `cd frontend; npm run format:check && npm run lint && npm run typecheck && npm run build` exit=0，正式构建成功。其余未变化检查复用首次有效结果，不把首次完整入口改称 PASS。
- `cd frontend; npm run test:e2e`：4 项真实 Chromium 测试 PASS，exit=0（11.8 秒）。覆盖桌面导航、键盘跳过导航/新标题焦点、当前页、前后退、详情直达/刷新、未知地址返回、无业务/外部请求、390px/320px 全页面无横向溢出、触控入口高度与减少动效；原真实同源代理 403 断言保留。上述仅类型声明的补丁无运行时代码，浏览器证据仍对应相同实现与断言，无需重复启动。
- 最终 `check_task.py --task docs/tasks/TASK-007-journal-app-shell.md --worktree --static-only`：exit=0，12 文件，指纹 `0964124aeb9e47d7a8997f1601f81108aa509a8bfbf3877dd253f9b9b076949a`。本条仅为范围/Git diff/敏感模式/JSON 等静态检查，模块测试采用上两条有效证据。未改后端，复用 TASK-006 的 55 项后端基线，不重复运行。
- 目视核对：实际 1440×1050 桌面概览/添加预览、390px 与 320px 概览全页截图均已查看，文字、卡片和装饰没有遮挡/裁切；截图位于 `frontend/test-results/`（已验证 Git 忽略）。本机预览 `http://127.0.0.1:5173/` 已启动，不公开部署。
- 完成条件 1/2 → 21 项组件测试（含原错误边界/测试隔离断言）、4 项浏览器测试及代码自检；3/4 → 真实浏览器与上述截图；5 → 格式/lint/类型/构建/治理通过，README 更新。独立 Review 待执行；L2 独立 Acceptance N/A。
- 限制：现在只能看布局和切换页面，不能管理真实资料；仅 macOS Chromium 实测，不声称已完成跨浏览器、屏幕阅读器或全业务闭环认证。后续接口/令牌接入必须另立任务，不借本次开放。

<!-- EVIDENCE:BEGIN -->
- 2026-09-03：用户已合并 PR #12，提交 `9e59355fee2aabe741b171e33197b8f96ee6f27a`；当前状态 MERGED，原证据保留。

## 状态与最终证据

- 2026-09-03：IN_REVIEW；主 Agent完成实现、自检和测试证据核对。只使用一位实际只读独立 Reviewer，沿用用户已授权的临时 GPT-5.4/medium，不更改默认配置；L2 独立 Acceptance N/A。
- 最终合并仅由用户决定并执行。

### 独立 Review 原文

Reviewer session `01a06532-0e3f-7d31-bbf5-a5fa07c51d2d`，独立于主 Agent实现者；Codex CLI 0.145.0 启动头实际为 `sandbox: read-only`、`approval: never`、GPT-5.4/medium。本次仅一位 Reviewer，未改默认 Agent 配置。

`PASS`

- `base`: `04c340f6b7b2320ed505672b985b6f912187d4d6`
- `candidate`: `750a43ae4258257048f7691f2597c1d0e4da3fa2`

只读证明：
- 运行环境声明为受限只读；实际执行 `test -w .` 返回不可写。
- 只读读取 Git 时多次出现 `/tmp/... Operation not permitted`，未进行任何写入探针、编辑、提交、推送或委派。

审查范围：
- 已完整阅读 `.agents/skills/studypilot-review-change/SKILL.md`、根 `AGENTS.md`、`frontend/AGENTS.md`、`docs/tasks/TASK-007-journal-app-shell.md`、`docs/governance/风险分级与检查规则.md`。
- 已读取 `项目需求说明.md` 的 `5.1`、`5.10`，以及 `docs/architecture/MVP架构与技术选型提案.md` 中阶段 B 的前端应用壳段落。
- 已完整审查 `base..candidate` 的 12 文件最终 diff，并补查相关调用链 `frontend/src/main.tsx`、`frontend/src/ErrorBoundary.tsx`、`frontend/src/test/setup.ts`。

Findings：
- No findings.

证据与限制：
- 核对了候选 SHA、12 文件范围、任务记录中的 `product_fingerprint=0964124a...6949a`、TASK-006 合并事实登记、README/测试源码/调用链一致性。
- 复核了前端壳实现满足本次范围：5 个主导航、添加来源预览、资料详情空页、404、全局保留“工程框架已运行，业务功能尚未实现”，且未引入业务 API、令牌或持久化。
- 组件/E2E/构建未由我重新执行；本次按规则复用了绑定到候选的既有证据，并确认补丁仅为 `frontend/e2e/scaffold.spec.ts` 的 DOM lib 类型声明，不改变运行逻辑。
- 已查看现有桌面与 `320px` 截图产物，未见文字遮挡或明显裁切。

- 最终候选：`750a43ae4258257048f7691f2597c1d0e4da3fa2`；冻结候选静态检查 exit=0，指纹仍为 `0964124aeb9e47d7a8997f1601f81108aa509a8bfbf3877dd253f9b9b076949a`。独立 Review PASS，No findings。
- 2026-09-03：ACCEPTED。主 Agent只核对任务边界、五项完成条件、测试绑定和独立结论，全部满足；没有第三次从头审代码。独立 Acceptance N/A，未额外调用 Agent。
- 剩余边界：界面/导航可用，业务未接入；只验证 macOS Chromium，其他浏览器和完整业务闭环未承诺。未发现需要另行处置的遗留缺陷。
- 用户操作：待用户决定并执行合并，Agent 不合并或推送 main。之后拟进入本机访问保护与共享 API 调用基础，让界面能按已批准契约安全连接后端，为真实资料管理准备；涉及安全，另立 L3 任务，不扩展本任务。

<!-- EVIDENCE:END -->
