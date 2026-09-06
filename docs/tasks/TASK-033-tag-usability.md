# TASK-033：标签使用体验（就地新建标签 + 标签 chip 可点筛选 + 资料库筛选进 URL）

```toml
schema_version = 2
id = "TASK-033"
status = "IN_REVIEW"
risk = "L2"
risk_reason = "三个目标全部落在前端，已批准的公共契约、后端、数据模型与迁移一律不动：新建标签复用既有 `POST /api/v1/tags`（TASK-011 交付），筛选进 URL 只改变客户端如何组装同一个既有查询串，chip 可点只是把纯文本换成链接。不新增接口、不改请求/响应形状、不改 AND 筛选语义。判 L2 而非 L1 的原因：目标 3 是对 `ResourceLibrary` 筛选机制的一次真实重构（七个维度与 URL 双向同步、要处理浏览器前进后退与非法参数），资料库是核心页面，回归面覆盖搜索/筛选/排序/分页；目标 1 又在原本只读的选择器里首次引入写操作。判 L3 的条件均未命中：无契约、无迁移、无安全/认证、无关键数据模型、无跨模块写。"
risk_flags = ["business", "internal-refactor", "small-ui", "tests"]
owner = "coordinator"
base = "b6ab87e992c6d1f4c30c585fb1eab748bd3e34bb"
allowed_paths = [
  "frontend/src/features/taxonomy/TagCreateField.tsx",
  "frontend/src/features/taxonomy/ClassificationPicker.tsx",
  "frontend/src/features/taxonomy/ResourceTagEditor.tsx",
  "frontend/src/features/taxonomy/ClassificationPages.test.tsx",
  "frontend/src/features/resources/ResourceLibrary.tsx",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ResourceEditor.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/features/resources/ResourceEditor.test.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/resource-pages.spec.ts",
  "frontend/e2e/taxonomy-pages.spec.ts",
  "docs/tasks/TASK-033-tag-usability.md",
  "docs/tasks/TASK-032-tag-postfill.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

- 用户授权：2026-09-05 用户在 PR #37（TASK-032）合并后确认下一步同时做「就地新建标签」与「标签 chip 可点筛选」，并在主 Agent 提出的三个 chip 跳转方案中明确选定**「全部筛选条件进 URL」**（主 Agent 已当面说明该选项是对资料库筛选机制的重构、明显大于「chip 可点」顺带的改动，用户确认按完整范围做），且选定**合为一个任务**登记。
- 需求依据：`项目需求说明.md:146`「创建和使用多个自定义标签」、`:149`「按标签筛选」、`:396`「必要的主题、标签、搜索、筛选和排序，使资料能再次找到」。
- 复核过的现状事实（主 Agent 亲自在基线 `b6ab87e` 核实）：
  1. `ClassificationPicker.tsx` 全文无任何新建入口（`grep 新建|创建|添加` 零命中），标签区只是 `ClassificationBrowser` 渲染的复选框列表。资料详情的 `ResourceTagEditor.tsx` 同样只能从既有标签里挑。TASK-032 在 `ResourceEditor.tsx` 里自建的标签区也只有浏览。
  2. 因此想在填表时用一个新标签，必须离开当前页去 `/classifications` 新建再回来；而 `ResourceForm.tsx:109` 明写「未保存的内容只留在当前页面；离开或刷新会丢失」，`ClassificationManager.tsx:86` 同样如此 —— 草稿会真的丢。
  3. 建标签的能力已存在，无需新增接口：`saveClassification(kind, name, description)`（`taxonomy/api.ts:89`）在 `previous` 为空时 `POST /api/v1/{kind}`。`ClassificationBrowser` 已有 `revision` 入参（`ClassificationBrowser.tsx:20`）可在新建后强制重载列表。
  4. `ResourceLibrary.tsx` 的筛选全部是组件内 `useState`（`initialFilters` 在 `:11`，`draft`/`filters`/`page`/`view` 在 `:18-21`），**没有任何 URL 参与**（`useSearchParams`/`useLocation`/`useNavigate` 在该文件零命中）。页面自己在 `:169` 向用户承认「筛选条件离开本页后重置」。
  5. 标签 chip 目前是死文本：`ResourceLibrary.tsx:209-211`、`:243-245` 为 `<li>`，`ResourceDetail.tsx:86-90` 为 `<span className="source-chip">`，都不可点击。
  6. 路由基础具备：`main.tsx:18` 用 `BrowserRouter`，`react-router-dom` 7.18.3，`Screen.tsx` 已在用 `useMatch`。

### 目标

1. **就地新建标签**：在写入侧的标签选择处提供「输入名称 → 新建并选用」，成功后自动勾选新标签并刷新列表，全程不离开当前页面、不丢草稿。覆盖三个写入侧入口：
   - `/resources/new` 添加资料表单（经 `ClassificationPicker`，仅非 `filter` 模式）；
   - 资料修改页 `ResourceEditor` 的标签区（TASK-032 自建）；
   - 资料详情 `ResourceTagEditor`。
   实现为一个共享的 `TagCreateField` 组件，避免三处各写一遍。约束与既有标签契约一致：名称去首尾空白后 1～50 字符；重名由后端 `409 DUPLICATE_TAG` 返回、前端如实提示且不吞错；已选满 20 个时禁用新建。
   **筛选模式下不提供新建**（`ClassificationPicker filter` 用于资料库筛选，在筛选场景造标签没有意义且会误建）。
2. **标签 chip 可点筛选**：资料库列表/卡片与资料详情上的标签 chip 变为链接，指向 `/resources?tag_id=<id>`，点击后资料库按该标签筛选。用真实链接（`<Link>`）而非 onClick，使中键/新标签页打开、复制链接都成立。
3. **资料库筛选进 URL**：`ResourceLibrary` 的七个维度与 URL 查询串双向同步 —— `q`、`source_type`、`learning_status`、`topic_id` / `topic_unassigned`、`tag_id`（可重复）、`sort`、`page`。要求：刷新不丢、可收藏、可分享、浏览器前进/后退可用；URL 为空时行为与今天的默认值完全一致。URL 里只有 id 没有名称，因此进入时需按 id 读取主题/标签名称以在已选 chip 上显示；读取失败或 id 非法时不得让整页崩溃或静默丢弃用户的其他筛选条件。相应删除 `:169`「筛选条件离开本页后重置」这句已不再成立的提示。

### 非目标 / 禁止范围

- 不改任何后端代码、不改 `docs/contracts/**`、不新增或修改接口、不加迁移。本任务不产生契约变更。
- 不改标签的 AND 筛选语义（多 `tag_id` 仍为「全部具有」，`resource_store.py:399-404` 与契约 `:146` 不动）；**不做 OR 筛选**。
- 不做标签重命名/合并/批量解绑、不在分类管理页显示使用数量（调研 D 项，留待后续任务）。
- 不改 `Tag` 数据模型（不加颜色/描述/分组）。
- 不改 `ClassificationBrowser` 的分页与搜索行为（新建后仅通过既有 `revision` 触发重载）。
- 不改 `ClassificationManager`（分类管理页）的新建/改名/删除交互。
- 不动 TASK-032 交付的 `tag_ids` 整组替换语义与后端实现。
- 不把 `view`（卡片/列表切换）纳入 URL —— 它是显示偏好不是筛选条件，纳入会让分享出去的链接强加他人视图。
- 不动未列路径。

- 依赖/前置条件：TASK-032 已由用户合并（PR #37，merge `b6ab87e`）。无未合并依赖。
- 并行：否，单写入者 `coordinator`（主 Agent 亲自充当 Worker，不授予自审权；L2 的独立只读 Review 由独立子 Agent 执行）。
- 状态收尾并入本任务控制面提交：本记录的首个 docs 提交同时把 TASK-032 由 `ACCEPTED` 标 **MERGED**（记录状态行 + 索引行，merge `b6ab87e`、PR #37），并把索引里 TASK-032 依赖列那句登记时的前瞻表述（「L3，需独立只读 Review 与 Acceptance」）改为已完成的结论事实。仅动状态与合并事实。

## 完成条件

1. 在 `/resources/new` 填好表单后，可在标签区输入新名称并新建，新标签立即出现在列表且已勾选，表单其他字段（标题/网址或原文/来源/原因/主题）一字不丢；保存后该资料确实带上这个新标签。
2. 资料修改页与资料详情的标签区同样可就地新建并选用；详情页新建后关联立即生效。
3. 新建重名标签时如实显示后端 `DUPLICATE_TAG` 的提示，不静默失败、不把已填内容清空；名称为空白或超 50 字时在发请求前拦下。
4. 已选 20 个标签时新建入口禁用，与既有复选框上限行为一致。
5. `ClassificationPicker` 在 `filter` 模式下**没有**新建入口（资料库筛选处不可造标签）。
6. 资料库列表、卡片、资料详情三处的标签 chip 均为链接，`href` 指向 `/resources?tag_id=<id>`，可中键/右键在新标签页打开。
7. 点击 chip 后落在资料库且已按该标签筛选，筛选区的已选 chip 显示该标签**名称**（不是 id）。
8. 七个维度全部进 URL：任意组合筛选后刷新页面，结果与刷新前一致；复制地址到新标签页打开得到同样结果；浏览器后退回到上一组筛选条件。
9. 空 URL（`/resources`）的行为与本任务修改前完全一致：默认排序 `-created_at`、第 1 页、无筛选。
10. URL 里带非法或不存在的 `tag_id`/`topic_id` 时页面不崩溃，给出可理解的提示，且不丢弃 URL 中其他合法筛选条件。
11. 「筛选条件离开本页后重置」提示已删除（该承诺已不成立）。
12. 既有资料库测试（搜索、类型/状态/排序/分页、组合筛选）全部仍绿，断言不得删除或弱化；本任务为上述新行为补前端测试与至少一条走真实用户路径的 e2e。
13. `cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build` 全绿（vitest 基线 339 passed，本任务后应 >339）；`npm run test:e2e` 全绿（基线 37 passed）。后端未改动，`pytest` 保持 497 passed。
14. `check_task.py --task docs/tasks/TASK-033-tag-usability.md --candidate <SHA>` CHECKS PASS，记录 product_fingerprint。
15. L2 执行链完整：独立只读 Reviewer（`.claude/agents/reviewer.md`，仅 Read/Grep/Glob）审 `b6ab87e..candidate` 完整 diff 并给结论，原文写回 EVIDENCE 区。L2 不要求独立验收。

## 上下文包

根 `AGENTS.md` + `frontend/AGENTS.md` + 本记录。

要改的文件见 `allowed_paths`。只读参照（不改）：`frontend/src/features/taxonomy/ClassificationBrowser.tsx`（`revision` 入参与分页/搜索行为）、`frontend/src/features/taxonomy/api.ts:89`（`saveClassification`）与 `:136-141`（`classificationError` 文案映射）、`frontend/src/features/taxonomy/ClassificationManager.tsx:15-132`（既有新建/校验/冲突处理写法参照）、`frontend/src/features/resources/useResourceQuery.ts`（查询键与重试）、`frontend/src/main.tsx:18`（BrowserRouter）、`frontend/src/shell/Screen.tsx:99-110`（路由分发）。

需求章节：`项目需求说明.md:146,149,396`。契约只读参照：`docs/contracts/API与数据契约基线.md:146`（多 `tag_id` 为 AND 语义，本任务不改）、`:156`（资料列表可用重复 `tag_id`）。

准确命令：
- `cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build`
- `cd frontend && npm run test:e2e`
- `cd backend && .venv/bin/python -m pytest`（回归确认后端未受影响）
- `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-033-tag-usability.md --candidate <SHA>`

不做全仓扫描。

## 实现与测试

- 实现 SHA/变更摘要：`f801ad1`，相对基线 `b6ab87e` 共 14 个文件 +664 −40（含本任务记录与索引）。**后端与契约零改动。**
  - 新增 `frontend/src/features/taxonomy/TagCreateField.tsx`（66 行）：共享的「输入 → 新建并选用」。刻意**不是 `<form>`** —— 三个调用点全都已经在某个 form 内部，嵌套 form 是非法 HTML；因此用输入框 + `type="button"`，并在 `Enter` 上 `preventDefault()`，避免敲回车顺手提交了外层的资料表单。校验（去空白后 1～50 字）在发请求前拦下，服务端错误经既有 `useOperation` → `classificationError` 如实呈现。
  - `ClassificationPicker.tsx`（+16）：非 `filter` 模式下渲染 `TagCreateField`；新建成功后把标签并入已选并 `revision + 1` 触发 `ClassificationBrowser` 重载；已选满 20 时禁用并给出原因。
  - `ResourceEditor.tsx`（+11）：同样接入，新建后并入 TASK-032 的整组替换集合。
  - `ResourceTagEditor.tsx`（+13）：详情页语境下「选用」即「附加到本资料」，新建成功后紧接着走既有 `changeResourceTag(..., true)`。
  - `ResourceLibrary.tsx`（+209 −40，本任务主体）：筛选状态从组件内 `useState` 改为以 `useSearchParams()` 为唯一真相。新增 `readApplied`/`writeApplied` 两个纯函数做 URL ↔ 筛选的双向映射，默认值（`sort=-created_at`、`page=1`、空筛选）不写进 URL，因此 `/resources` 的地址与行为与改动前完全一致。`view`（卡片/列表）**故意不进 URL**：它是显示偏好，进 URL 会让分享出去的链接把自己的视图强加给对方。
  - 标签 chip 改为 `<Link>`（`ResourceLibrary` 列表与卡片两处、`ResourceDetail` 一处），用真实链接而非 `onClick`，中键/右键新标签页打开与复制链接都成立。
  - `styles.css`（+31）：链接化 chip 保持原有外观（`color: inherit`、悬停/键盘聚焦才出下划线），以及 `.tag-create` 的排版。
- 实现中的两个非显然决定：
  1. **URL 里只有 id，没有名称**。为让筛选区的已选 chip 显示「合成标签」而不是一串 uuid，进入时按 id 读 `GET /tags/{id}` / `GET /topics/{id}` 解析名称，结果缓存在 `names` 里；空字符串表示「问过且读不到」，因此不会对同一个坏 id 反复发请求。读不到时给出 `role="alert"` 提示，并且**该 id 仍然继续参与筛选**——名称显示不出来不等于筛选条件该被丢掉，也不影响 URL 里其他合法条件。
  2. **draft 与 URL 的同步方式**。首版把「地址变了就重置未应用的表单」写成 `useEffect` + `setDraft`，被 `react-hooks/set-state-in-effect` 判为错误（lint 红）。改用 React 官方的「渲染期根据变化调整 state」模式：保存上一次渲染过的 `address`，不同就在渲染中直接 `setShown`/`setDraft`。这样后退、点 chip、粘贴链接都会正确刷新表单，且不触发额外一轮 effect。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：
  - `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-033-tag-usability.md --candidate f801ad1` → **CHECKS PASS**。base=`b6ab87e`、input=`f801ad1`、risk=L2、stages=(worker, review)、files=14、profiles=**frontend**、product_fingerprint=`cd5e125a92a8fd44ee0f1a6b3115b852176b48bd6cceca400f96d28304d2c3c7`，组内 format:check/lint/typecheck/vitest/build 五项 exit=0。
  - `cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build` 全绿；vitest **347 passed / 16 文件**，基线 **339**，净增 8（`ResourcePages.test.tsx` 21→25、`ClassificationPages.test.tsx` 12→15、`ResourceEditor.test.tsx` 29→30）。
  - `cd frontend && npm run test:e2e` → **38 passed**，基线 **37**，净增 1。
  - `cd backend && .venv/bin/python -m pytest` → **497 passed**，与基线持平（本任务未改后端，跑一次确认无连带影响）。
  - 环境：本地 macOS（Darwin 25.5.0）、Node 24、Vitest 4.1.11、Playwright chromium、Vite 8.2.2、react-router-dom 7.18.3。
  - 未运行：后端 ruff/mypy 与契约检查 —— 本任务无后端与契约改动，`check_task` 自动选组也只选了 frontend；不以旧 PASS 冒充。
- 实现中修正的自身错误（都由检查先红暴露，不是事后补叙）：
  - 上述 lint 红（`set-state-in-effect`），已按 React 官方模式重写。
  - 两条新写的 vitest 断言写错了事实：重名提示的真实文案是「已有同名标签，请换一个名称。」而非我先写的「这个名称已经存在」；详情页测试漏 mock `/notes?` 端点导致页面停在加载态。都改的是**测试自身**，产品代码未因此调整。
- 已知限制/未完成项：
  - URL 里的主题/标签名称需要额外一次读取，因此点开 chip 后已选 chip 会先短暂显示「正在读取名称…」。可接受：筛选结果本身不等这次读取。
  - 筛选条件进了 URL，但**分类管理页与「我的心得」页的浏览状态仍未进 URL**，本任务未扩展到那里。
  - 仍不支持 OR 筛选（多 `tag_id` 依旧是 AND），属本任务明示的非目标；契约 `:146` 未动。
  - 分类管理页仍不显示标签使用数量、无批量解绑（调研 D 项，未做）。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：`dcd0301`（含需求、实现与测试证据；代码实现 SHA `f801ad1`，`f801ad1..dcd0301` 仅为本记录的证据写回，不含代码改动。`check_task.py --candidate f801ad1` CHECKS PASS，base=`b6ab87e`、files=14、profiles=frontend、product_fingerprint=`cd5e125a92a8fd44ee0f1a6b3115b852176b48bd6cceca400f96d28304d2c3c7`、risk=L2 stages=(worker, review)）。base..candidate 的完整 diff 已导出到 scratchpad 的 `TASK-033-full-diff.patch`，供无 Bash 的只读 Reviewer 直接 Read。
- Review：**待执行**。本次会话仍以 `/Users/yuklimching` 为启动目录，项目级 `.claude/agents/reviewer.md` 未注册，无法在此派出运行器层面真只读的 Reviewer（沿用 TASK-032 的处理：不用带 Bash 的 Agent 冒充）。接手会话应在 StudyPilot 目录下开启，对 `b6ab87e..dcd0301` 做首次完整 Review。重点建议：`ResourceLibrary` 的 URL ↔ 筛选映射是否与改动前的查询完全等价（尤其默认值不写 URL、page 重置、topic_unassigned 分支）、渲染期 setState 的同步是否会产生额外渲染或状态错位、名称解析缓存是否可能重复请求或泄漏、`TagCreateField` 在三个宿主表单里是否真的不会误提交外层 form。
- Acceptance：L2 → N/A（风险路由不要求独立验收）。
- 最终状态/风险/用户操作：status=**IN_REVIEW**。实现与自动检查已完成且全绿，L2 执行链剩独立 Review 一步。分支 `agent/coordinator/TASK-033-tag-usability` 目前仅在本地，未推送、未开 PR。
- 非阻断遗留项：见「实现与测试」的已知限制段（名称解析的短暂占位、其他页面浏览状态未进 URL、仍无 OR 筛选、管理页无使用量），均为本任务明示的非目标或可接受取舍。
- 日期与决定日志：2026-09-05 用户在 PR #37 合并后授权本任务；同日在提出的三个 chip 跳转方案中选定「全部筛选条件进 URL」并要求合为一个任务，主 Agent 已当面说明该选择使范围明显大于最初描述的「chip 可点，改动很小」，用户确认按完整范围执行。同日主 Agent 在基线 `b6ab87e` 亲自复核 6 项现状事实后登记为 L2，并入 TASK-032 的 MERGED 状态收尾。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
