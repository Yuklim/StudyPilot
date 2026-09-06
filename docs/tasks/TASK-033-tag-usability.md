# TASK-033：标签使用体验（就地新建标签 + 标签 chip 可点筛选 + 资料库筛选进 URL）

```toml
schema_version = 2
id = "TASK-033"
status = "MERGED"
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

- 候选 SHA（最终）：`26b2818`（代码修订 SHA `5f79e21`，`5f79e21..26b2818` 仅为第一轮报告与处置的证据写回，不含代码改动）。第一轮候选：`dcd0301`（含需求、实现与测试证据；代码实现 SHA `f801ad1`，`f801ad1..dcd0301` 仅为本记录的证据写回，不含代码改动。`check_task.py --candidate f801ad1` CHECKS PASS，base=`b6ab87e`、files=14、profiles=frontend、product_fingerprint=`cd5e125a92a8fd44ee0f1a6b3115b852176b48bd6cceca400f96d28304d2c3c7`、risk=L2 stages=(worker, review)）。base..candidate 的完整 diff 已导出到 scratchpad 的 `TASK-033-full-diff.patch`，供无 Bash 的只读 Reviewer 直接 Read。
- Review 第一轮（L2 独立只读，`b6ab87e..dcd0301`）：**PASS（含 F1～F4 四项非阻断）**。

  派发方式：本实现会话以 `/Users/yuklimching` 为启动目录，项目级 `.claude/agents/reviewer.md` 未注册（已实测：把该文件复制到用户级 `~/.claude/agents/` 后当场重试仍为 `Agent type 'reviewer' not found`，说明注册表在会话启动时一次性构建，中途放文件不生效）。因此改由同机另一个在 StudyPilot 目录下启动的会话 `studypilot-05` 代为派发。**执行审查的仍是 `.claude/agents/reviewer.md` 定义的只读实例（`tools: Read, Grep, Glob`，运行器层无 Bash、无写工具），全新实例、无上下文继承、独立于实现者。** 未用带 Bash 的 `Explore`/`general-purpose` 冒充。

  外部核实（派发会话以 Bash 提供，补上 Reviewer 自身无法自证的一环）：
  > 主 Agent（派发会话）已用 `diff` 核实：交给 Reviewer 的 `TASK-033-full-diff.patch` 与 `git diff b6ab87e..dcd0301` 逐字节一致（1008 行、14 文件），patch 忠实于仓库。此项补上了 TASK-032 的 Reviewer 曾列为覆盖缺口的一点（Reviewer 无 Bash，无法自证导出 patch 忠实于仓库）。

  报告原文：
  > ## 只读证明
  > 本 Agent 仅被授予 `Read`/`Grep`/`Glob`，无 `Write`/`Edit`/`NotebookEdit`、无 `Bash`。本次未写任何文件、未提交、未推送。
  >
  > ## 范围
  > - base `b6ab87e` → 候选 `dcd0301`（代码 SHA `f801ad1`）。审查依据：coordinator 导出的 `TASK-033-full-diff.patch`（1008 行 / 14 文件，其与 `git diff b6ab87e..dcd0301` 逐字节一致由主 Agent 以 Bash 核实，我无 Bash 不能自证，如实记为外部事实），并对工作树代码/测试文件定点交叉验证。`dca4671` 的 4 行 EVIDENCE 区改动不在候选内，未审。
  > - 范围合规：14 个文件全部在 `allowed_paths` 内，无后端、无 `docs/contracts/**`、无迁移。**无越界**。
  > - 既有断言：四个测试文件的 hunk 全为纯新增，**无删除或弱化的断言**。
  >
  > ## 逐项核查结论（重点四条）
  > **1. URL ↔ 筛选等价性 — 通过。** 发给后端的 `key` 构造顺序与旧代码逐字对应（`page,page_size,sort` 固定 → `q,source_type,learning_status,topic_unassigned|topic_id,tag_id*`）。空地址下 `readApplied` 产出 `sort=-created_at,page=1`、其余空，查询串与改动前首渲染完全一致（完成条件 9 成立）。`writeApplied` 不写默认值；`search()` 恒置 `page:1`；分页 `apply({...applied, page})` 保留全部维度。`page` 非法值（`''`/`abc`/`2.5`/负数）均回落 1。`topic_unassigned==='true'` 分支与 `ClassificationPicker.tsx:72-75` 的字面量 `'unassigned'` 一致。`tag_id` 用 `getAll`/`append`，顺序与重复原样保留。
  > **2. 渲染期同步 draft — 通过。** `shown !== address` 时同步 `setShown`/`setDraft`，条件收敛、不早返回（hooks 顺序稳定），不会死循环；地址只由用户自身导航改变，不存在「输入中被外部地址吞掉」。
  > **3. 名称解析 — 通过。** `names[id] === undefined` 才发请求，失败写 `''`，同一坏 id 不重复请求；`alive` 闭包 + `useOperation` 的 `alive` ref 双重防卸载后 setState；读不到名称的 id **仍进入查询串**（`ResourcePages.test.tsx` 断言 `getAll('tag_id')` 含 missing id），符合「不静默丢弃筛选条件」。
  > **4. TagCreateField 与三个宿主 — 通过。** 已确认 `ResourceForm.tsx:111-289` 的 `<form>` 包住 `:273` 的 Picker、`ResourceEditor` 的 `EditForm` 同样在 form 内；`TagCreateField` 为 `div` + `type="button"` + `Enter` 上 `preventDefault()`，不会误提交外层资料表单。失败/重名走 `useOperation` → `classificationError` → 原样呈现服务端 message，输入内容保留。
  >
  > ## Findings
  > **F1（非阻断，可记录后继续）— `重置` 在无已应用筛选时不清空未提交的草稿。** `ResourceLibrary.tsx:196-207`。触发：地址已是 `/resources`（无任何筛选参数），用户在搜索框输入文字、或在 Picker 里勾了几个标签（均未点「应用」），然后点「重置」。此时 `params.toString()` 前后都是 `''`，`shown === address`，渲染期同步不触发，`draft` 不被重置。改动前 `重置` 无条件 `setDraft(initialFilters)`，所以这是相对基线的行为回退。影响：按钮看起来没反应，未应用的勾选继续留在表单里（下一次点「应用」会带上）。屏幕上仍如实显示这些 chip，不产生「看不见的筛选」，用户手动清即可。本机单用户场景下影响轻微、可恢复。新增测试从 `?q=...&page=3` 出发做重置，恰好绕开了这个子分支。最小修复（一行，低风险）：在该 onClick 里补 `setDraft(draftOf(readApplied(new URLSearchParams())))`。
  > **F2（非阻断，可选建议）— 页内选到的「名称」可能把占位文案写进 `names` 缓存。** 若名称解析尚未返回就打开 Picker 并勾选/移除，`label()` 给出的 `'正在读取名称…'` 会被当作权威名称写入 `names[id]`，此后 effect 认为该 id 已解析、不再请求，chip 会一直显示该占位文案直到离开页面。触发窗口很窄，且**只影响显示，不影响筛选**（`search()` 只取 `.id`）。建议：写回 `names` 时过滤掉占位文案。
  > **F3（非阻断，观察）— 分页/再应用会清掉「读不到名称」的告警但条件仍在。** `apply()` 无条件 `setLookupFailed(false)`；坏 id 已在 `names` 中，effect 不会重跑，于是翻页后红字提示消失而该 id 仍在筛选。chip 上仍显示「（已不存在）」，信号未完全丢失，影响轻微。
  > **F4（非阻断，记录）— URL 可注入未校验的 `sort`/`source_type`/`learning_status`/超长 `q`。** `readApplied` 对这四项不做白名单校验。手改地址时后端返回校验错误，页面走既有 `ResourceError` 而不是白屏。完成条件 10 只约束 `tag_id`/`topic_id`，未承诺此项；本机单用户下不构成安全或数据风险。
  >
  > ## 覆盖与缺口
  > - 新增覆盖自洽：vitest `+8`（ResourcePages `+4`、ClassificationPages `+3`、ResourceEditor `+1`）与记录的 339→347 一致；e2e `+1` 与 37→38 一致。我**没有**运行任何检查，所有机械证据按 **NOT_RUN** 处理，只做数量与 diff 的自洽核对。
  > - 缺口一：完成条件 4（已选 20 个时新建入口禁用）无任何测试。缺口二：完成条件 6 的「资料详情 chip 为链接」无 RTL/e2e 断言。缺口三：F1 那条子分支无测试。三处均为一行实现、可从 diff 直接读出，按实际风险不作为阻断。
  >
  > ## 记录一致性
  > 「实现与测试」段与代码相符，无夸大，逐条核对属实。一处小账务不一致：候选内 TOML 为 `status = "IN_REVIEW"`，而《任务索引》该行写 `IN_PROGRESS`，建议写回证据时一并对齐。
  >
  > ## 剩余风险
  > 低。F1 是可见且可自行绕过的小回退；F2/F3 只影响 chip 上的文字，不影响发给后端的筛选条件；F4 只在手改地址时出现且有受控错误页。核心路径（空地址等价、应用筛选重置分页、刷新/后退/分享、chip 跳转、就地新建不丢草稿）均有代码与测试双向支撑。
  >
  > ## 结论
  > **PASS**（针对候选 `dcd0301`；含 F1～F4 四项非阻断问题，其中 F1 建议顺手用一行修掉；PASS 不等于零问题）。合并仍须由用户本人执行。

- 第一轮 findings 的处置（修订 SHA `5f79e21`，`dcd0301..5f79e21` 共 5 文件 +74 −8，全部在 `allowed_paths` 内）：
  - **F1 已修**。`ResourceLibrary.tsx` 的「重置」onClick 补 `setDraft(draftOf(readApplied(new URLSearchParams())))`，并留注释说明「地址本就为空时渲染期同步不会触发，必须在此显式清」。这是相对基线的真回退，按 Reviewer 建议修掉而不是记录接受。
  - **F2 已修**。把两处占位文案提为常量 `PENDING_NAME` / `MISSING_NAME`，写回 `names` 缓存时过滤掉它们，避免占位被当作权威名称缓存导致 chip 永久停在「正在读取名称…」。
  - **F3 记录接受，不修**。修法要么让 `apply()` 保留告警状态（翻页后仍红字，但那时告警已与当前动作无关），要么在每次 apply 后重跑解析（对已知坏 id 徒增请求）。chip 上仍显示「（已不存在）」，信号未丢失。责任角色 coordinator；若将来筛选区改为不展示 chip，需重评。
  - **F4 记录接受，不修**。四个维度的白名单校验属于对手改地址的防御，后端已有校验且前端有受控错误页；本机单用户、非安全/数据风险。责任角色 coordinator；若将来资料库对外暴露或引入分享链接的自动化生成，需重评。
  - **三处覆盖缺口全部补测**：新增 3 条 vitest —— 空地址下重置清草稿（缺口三 / F1 回归测试，已实测：临时移除 F1 修复后该用例转红，恢复后转绿，确认它真的能抓到这个回退）、资料详情 chip 为链接并指向 `/resources?tag_id=<id>`（缺口二）、已选 20 个时新建入口禁用且给出原因（缺口一）。
  - **索引账务已对齐**：`任务索引.md` 的 TASK-033 行由 `IN_PROGRESS` 改为 `IN_REVIEW`，与记录 TOML 一致。
- 修订后的检查（真实运行）：`check_task.py --candidate 5f79e21` → **CHECKS PASS**，base=`b6ab87e`、files=14、profiles=frontend、product_fingerprint=`1b6427d9ec88a40de39dd0f5a59539ee33da9a1bac31ef0916db92545b6dcf02`。`npm run format:check && lint && typecheck && test && build` 全绿，vitest **350 passed**（第一轮候选 347，净增 3 条新测试）；`npm run test:e2e` → **38 passed**（不变）；后端未改动。
- Review 第二轮（L2 独立只读，增量 `dcd0301..26b2818`，同一 Reviewer）：**PASS，No findings（新增）**。

  外部核实（派发会话以 Bash 提供）：
  > 主 Agent（派发会话）已用 `diff` 核实：`TASK-033-round2-incremental.patch` 与 `git diff dcd0301..26b2818` 逐字节一致（212 行、5 个文件）。另核实工作树 HEAD 正是 `26b2818`，除一个与本任务无关的未跟踪 HANDOFF markdown 外干净。

  报告原文：
  > ## 只读证明
  > 仅有 `Read`/`Grep`/`Glob`；无 `Write`/`Edit`/`Bash`。本轮未写任何文件、未提交、未推送。
  >
  > ## 范围与继承声明
  > - 本轮为**修订审查**：`dcd0301..26b2818`（代码修订 `5f79e21`；`5f79e21..26b2818` 只写任务记录与索引）。依据 coordinator 导出的增量 patch（212 行 / **5 文件**，其与 `git diff dcd0301..26b2818` 逐字节一致由主 Agent 以 Bash 核实，我无 Bash 不能自证），并对工作树（HEAD = `26b2818`）定点交叉验证。
  > - **显式继承**：第一轮我已完整审过 `b6ab87e..dcd0301`（14 文件、1008 行）的最终 diff 与相关调用链，结论 PASS。本轮增量只触及 `ResourceLibrary.tsx` 的三处（两个常量、重置 onClick 一行、`setNames` 过滤条件）与两个测试文件的纯新增，**未触及** `readApplied`/`writeApplied`/查询串组装/渲染期同步分支/`TagCreateField` 及其三个宿主/chip 链接/styles.css。这些部分的第一轮覆盖与结论直接继承，未重复审查；受影响上下文（`label()`、`named()`、`names` 缓存写入、重置路径、draft 同步）已在本轮重新推演。
  > - 结论指向新候选 `26b2818`。
  >
  > ## 逐项核查
  > **1. F1 修法 — 消除了原因，与渲染期同步不打架。** 重置 onClick 现为 `setValidation('')` → `setLookupFailed(false)` → `setDraft(draftOf(readApplied(new URLSearchParams())))` → `setParams(new URLSearchParams())`。地址本就为空时 `shown === address` 恒成立、渲染期同步不触发，新加的 `setDraft` 是唯一清草稿的路径 —— 正是 F1 缺的那条。地址非空时两者都会跑，但两者写入的内容完全相同（`q/source/status` 空、`sort='-created_at'`、`classification={topic:null,tags:[]}`，与基线 `initialFilters` 一致），只是对象标识不同；收敛到同一状态，无错位、无循环，最多一次多余渲染。不是遮症状：修的是「空地址下无人负责清草稿」这一结构缺口。
  > **2. `PENDING_NAME`/`MISSING_NAME` — 自洽，语义未丢。** `label()` 只是把两个字面量提为常量，分支逻辑逐字未变。`names` 的「问过且读不到」标记仍是空字符串，`MISSING_NAME` 纯属显示层、现被显式排除在缓存写入之外，与原语义等价。坏 id 仍继续参与筛选：本轮 diff 未触及 `applied`→`query` 任何一行，第一轮那条断言 `getAll('tag_id')` 含 missing id 的测试原样保留。极端情况（用户真建一个叫「正在读取名称…」或「（已不存在）」的标签）：该名称被过滤器挡在缓存外 → `names[id]` 保持 `undefined` → effect 按 id 取回真名 → chip 显示正确；代价仅一次多余请求，且「真名与占位同形」的显示歧义在改动前就存在，不是新引入。判为无害。
  > **3. 三条新测试 — 名副其实，非形式通过。** 重置那条先断言 `address() === ''` 锁死前提，再同时断言搜索框清空**与**「已选 0 个标签」（后者绑定 Picker 的真实 selection）；移除 F1 那一行则两条断言必红 —— 这是我读代码得出的判断。实现者另称做过变异验证（临时删除该行→转红→恢复→转绿）；**该声明未经 coordinator 复核，也未经我复核**，如实标注来源，我的结论不依赖它。详情页 chip 那条补上第一轮缺口二，断言 `role=link` + `href`，且吸取了第一轮漏 mock `/notes?` 的教训。20 上限那条用既有 `Picker` 帮助组件，断言 20 个时输入禁用 + 原因文案，**再移除一个断言恢复可用** —— 双向绑定 `full` 的计算而非静态属性。数量自洽：347 + 3 = 350，e2e 无改动仍 38，`check_task` files=14（增量 5 文件全在原 14 之内）。所有机械证据按 **NOT_RUN** 处理。
  > **4. F3/F4 记录接受 — 我独立复判，理由成立。** F3 触发需地址里带不可解析 id 且用户翻页/再应用；影响仅是红字告警提前消失，chip 仍显示「（已不存在）」、筛选结果依然正确。无数据损坏、无越权、不违反任何完成条件（条件 10 只要求「不崩溃、给出可理解提示、不丢其他条件」，首次进入时提示是给出的）。两种修法各有真实代价的说法我认可。F4 仅在手改地址时可达；值只经 `URLSearchParams` 编码后发给后端，或落在 `<select value>`，全仓此路径无 `dangerouslySetInnerHTML`，无注入面；后端校验 + 既有 `ResourceError` 兜底，不白屏。两条的 EVIDENCE 登记都写了影响、为何暂不修、责任角色与重评触发条件，符合规则要求。
  > **5. 范围与写回边界 — 合规。** 5 个文件全部在 `allowed_paths` 内；无后端、无 `docs/contracts/**`、无迁移、无依赖/锁文件变化。`26b2818` 对任务记录的改动全部落在 EVIDENCE 标记区之间：TOML 块、需求与范围、目标、非目标、完成条件、上下文包、「实现与测试」段均一字未动（按行核对与第一轮候选一致）。索引只改 TASK-033 那一行的状态字，与 TOML 对齐 —— 第一轮指出的账务不一致已消除。
  >
  > ## Findings
  > **No findings（新增）。** F1、F2 已在 `5f79e21` 真正修复并各自带回归测试；F3、F4 维持第一轮的非阻断定性，已按规则登记为剩余风险；第一轮列出的三处覆盖缺口全部补齐。本轮增量未引入新问题、未削弱任何既有断言（两个测试文件的 hunk 均为纯新增）。
  >
  > ## 覆盖与缺口
  > - 继承第一轮对 `b6ab87e..dcd0301` 的完整覆盖；本轮增量已逐行核。
  > - 剩余缺口（均为第一轮已判、且非承诺项）：F4 的四个维度无前端白名单校验测试；`tag_id` 在地址里重复出现时 Picker 的 React key 会重复（仅手改地址可达，第一轮已列为 trivial）。
  > - 我未运行任何检查；`check_task --candidate 5f79e21` CHECKS PASS、vitest 350、e2e 38、fingerprint `1b6427d9…` 全部按 **NOT_RUN** 记录，只做与 diff 的自洽核对（均自洽）。
  > - patch 与仓库逐字节一致、以及变异验证两项外部事实，分别由 coordinator（已核）与实现者（未经第三方核）提供，来源已如实标注。
  >
  > ## 剩余风险
  > 低。已登记的 F3/F4 只影响提示时机与手改地址的容错，不触碰安全、隐私、数据完整性或已确认契约；核心路径（空地址与基线等价、应用筛选重置分页、刷新/后退/分享、chip 跳转、就地新建不丢草稿、20 上限、坏 id 仍参与筛选）现已代码与测试双向绑定。
  >
  > ## 结论
  > **PASS**（针对新候选 `26b2818`，含继承的第一轮 `b6ab87e..dcd0301` 覆盖；F3、F4 为已明确处置并登记的非阻断遗留项，PASS 不等于零问题）。合并仍须由用户本人执行。

- 一处主 Agent 口径更正：我在派发第二轮时把增量说成「212 行 / 6 文件」，实测 `git diff --stat dcd0301..26b2818` 为 **5 个文件**（TASK-033 记录、任务索引、`ResourceLibrary.tsx`、`ResourcePages.test.tsx`、`ClassificationPages.test.tsx`），由派发会话指出、主 Agent 复核确认。以 5 为准。
- 变异验证的证据等级说明：F1 回归测试的变异验证（临时移除修复→用例转红→恢复→转绿）由主 Agent 本人执行，**未经独立第三方复核**。派发会话说明未复核的理由是：复核需临时改动实现者正在使用的同一个工作树，按 AGENTS.md「共享目录同一时刻一个写入者」不宜并发写入。Reviewer 的结论不依赖该声明，它是独立读测试代码得出的同向判断。此处如实标注来源与等级，不把它当作已被独立验证的事实。
- Acceptance：L2 → N/A（风险路由不要求独立验收）。
- 最终状态/风险/用户操作：status=**MERGED**。L2 执行链完整（Worker → 自动检查 → 独立只读 Reviewer 两轮 → PASS）；L2 不要求独立验收，Acceptance 为 N/A。最终候选 `26b2818` 已由**用户本人于 2026-09-06 05:40Z 执行合并**（PR #38，merge commit `1a72eb9`）；本状态登记按既有做法并入 TASK-034 的控制面提交。
- 非阻断遗留项（**2026-09-06 订正：下列 F3、F4 与「管理页仍无标签使用量」三项已由 TASK-035 的前置任务 TASK-034 实际解决**，合并于 PR #39 / `113f765`；原文保留以存续当时的判断依据，勿再当作未决项）：
  - **F3** —— 【已由 TASK-034 解决：告警改为从 `applied` + `names` 派生，翻页与再次应用不再抹掉】翻页或再次应用筛选会清掉「读不到名称」的红字告警，而该坏 id 仍在筛选中；chip 上仍显示「（已不存在）」，信号未完全丢失。暂不修的成本取舍见上（两种修法各有代价）。责任角色 coordinator；筛选区若改为不展示 chip 则需重评。
  - **F4** —— 【已由 TASK-034 解决：`readApplied` 加白名单与 200 字校验，非法值回落并提示「已忽略」、不再转发】`sort`/`source_type`/`learning_status`/超长 `q` 手改地址时不做前端白名单校验，由后端校验 + 既有错误页兜底。责任角色 coordinator；资料库若对外暴露或引入自动生成的分享链接则需重评。
  - 名称解析需一次额外读取，chip 会短暂显示「正在读取名称…」；筛选结果本身不等这次读取。
  - 分类管理页与「我的心得」页的浏览状态仍未进 URL；仍无 OR 筛选（契约 `:146` 未动）；管理页仍无标签使用量【该项已由 TASK-034 解决：分类端点新增 `resource_count`，管理页显示份数并链到筛选结果】 —— 均为本任务明示的非目标。
- 日期与决定日志：2026-09-05 用户在 PR #37 合并后授权本任务；同日在提出的三个 chip 跳转方案中选定「全部筛选条件进 URL」并要求合为一个任务，主 Agent 已当面说明该选择使范围明显大于最初描述的「chip 可点，改动很小」，用户确认按完整范围执行。同日主 Agent 在基线 `b6ab87e` 亲自复核 6 项现状事实后登记为 L2，并入 TASK-032 的 MERGED 状态收尾。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
