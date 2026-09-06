# TASK-036：正文快照（`content_snapshots` 表 + 手动录入 + 详情页展示）

```toml
schema_version = 2
id = "TASK-036"
status = "MERGED"
risk = "L3"
risk_reason = "新增数据库表与迁移（0004）、新增公共 API 操作与契约对象，三项各自都是 L3 判入条件。更实质的是：本任务确立「资料的正文可以与 source_url 并存」这一新的数据语义 —— 在此之前 `learning_resources` 的来源互斥 CHECK 意味着 WEB 资料只有链接、没有正文。快照一旦开始写入即成为**不可回溯**的资产（原文改版或消失后无法重建），因此表结构、正文格式与降级语义在第一版就必须定对，事后迁移无法补齐历史内容。此外新表与 `learning_resources` 之间是 CASCADE 外键，删除资料会连带删除快照，属关键数据模型。不改核心表、不改既有互斥 CHECK。"
risk_flags = ["public-api", "migration", "critical-data", "business", "tests"]
owner = "coordinator"
base = "3fbca1f02c88703e0d50bd744e5c54636ccc55d5"
allowed_paths = [
  "backend/migrations/versions/0004_content_snapshots.py",
  "backend/src/studypilot/infrastructure/database/models.py",
  "backend/src/studypilot/infrastructure/database/snapshot_store.py",
  "backend/src/studypilot/modules/resources/snapshots.py",
  "backend/src/studypilot/application/snapshots.py",
  "backend/src/studypilot/api/snapshots.py",
  "backend/src/studypilot/main.py",
  "backend/tests/test_snapshots.py",
  "backend/tests/test_migrations.py",
  "docs/contracts/openapi-v1.json",
  "docs/contracts/API与数据契约基线.md",
  "frontend/src/api/client.ts",
  "frontend/src/features/resources/api.ts",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ContentSnapshot.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/features/resources/fixtures.ts",
  "frontend/src/styles.css",
  "frontend/e2e/resource-pages.spec.ts",
  "docs/tasks/TASK-036-content-snapshot.md",
  "docs/tasks/TASK-035-tag-bulk-relink.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

- 用户授权与决策链（2026-09-06，均为用户在本轮讨论中明确选定）：
  1. 阅读器方向优先于 AI；
  2. 正文快照采用 **Markdown**（非 sanitized HTML）；
  3. 图片**需要**冻结，但落点在扩展任务（理由见下）；
  4. 浏览器扩展**走 UI 页面写入，不改安全边界**；
  5. 实施顺序取「甲」：正文快照 → 浏览器扩展 → PDF 阅读器；
  6. PDF 先做原生数字版，扫描版（需 OCR）后续。
- 需求依据：`docs/research/阅读器与标注能力调研.md` §7.1（用户已确认的「快照 + 原文链接」方向）；`项目背景与介绍` 4.1「资料分散且容易失去上下文」。注意该调研文档自述为**调研而非架构决定**，其建议须经本任务重新判断后方可采纳。
- 复核过的现状事实（主 Agent 亲自在基线 `3fbca1f` 核实）：
  1. `learning_resources` 的来源互斥 CHECK（`0001_initial.py:123-125` 与 `models.py:114-116` 双份）规定 `WEB` 资料 `pasted_content IS NULL`。**快照放新表不触碰该约束** —— CHECK 只约束 `learning_resources` 自身的列，因此 WEB 资料同时拥有 `source_url` 与新表中的正文完全合法，核心表零迁移。
  2. 现有迁移到 `0003`，本任务为 `0004`。
  3. `original_files` 的 `status`(`PENDING/READY/FAILED`) + `failure_code` 互斥 CHECK 模式（`models.py:137,148-151`）可直接借鉴为快照的降级语义。
  4. **后端目前对外网络请求为零**（全仓 `grep httpx|requests\.|urlopen` 无命中），且生产依赖里既无 HTTP 客户端也无 HTML 提取库（`pyproject.toml:10-20`）。
  5. `original_files` 为 `UNIQUE(resource_id)` 且 media_type 白名单只含 pdf/doc/docx/markdown/plain，**不能承载快照或图片**。
  6. 运行时数据库 `var/studypilot.db` **不存在** —— 应用尚无真实数据，因此本任务不面对存量迁移问题，「不可回溯」的窗口自用户首次真实使用起算。

### 目标

1. **新表 `content_snapshots`（0004 迁移）**：一份资料至多一份快照（当前阶段 `UNIQUE(resource_id)`，为将来多版本留出放宽空间），外键 `ondelete=CASCADE`。字段方向依调研 §10.4，由本任务定稿：
   - `resource_id`、`format`（当前仅 `MARKDOWN`，以 CHECK 约束枚举，为将来 `HTML` 留位）、`content`（Markdown 正文）、`char_count`、`sha256`、`captured_at`、`captured_from_url`（可空；手动录入时为空，抓取时可能因重定向与 `source_url` 不同）、`extractor`（标识与版本；手动录入记为 `manual`）、`status`(`READY`/`FAILED`) + `failure_code`（沿用 `original_files` 的互斥 CHECK 形态，为将来自动抓取的降级留位）。
2. **公共 API**：`getResourceSnapshot`（读）、`putResourceSnapshot`（整份写入或替换，Markdown 正文）、`deleteResourceSnapshot`（删除快照、资料保留）。写入与删除按既有通则携带版本前置条件；`putResourceSnapshot` 为整份替换，语义与「重新保存一份当时的正文」一致。
3. **手动录入入口（本任务唯一的正文来源）**：资料详情页可粘贴/替换/删除正文快照，并展示已存快照（当前阶段以纯文本形式展示 Markdown 源码即可，**渲染属阅读器范畴，不在本任务**）。
4. **降级与不阻断**：无快照是正常状态，不影响资料的任何既有功能；`status=FAILED` 的形态先建好但本任务不产生该状态（无自动抓取）。
5. **契约同步**：openapi 新增对象与三个操作；中文契约新增对象小节、操作清单、错误码、以及一段说明「为何 WEB 资料的正文放在新表而不放宽互斥 CHECK」。

### 非目标 / 禁止范围

- **不做任何抓取**：后端**不得**发起任何对外网络请求，不引入 HTTP 客户端或 HTML 提取依赖。理由（本任务的关键设计决定）：① 那将是后端首次出网，且 URL 由用户提供，引入 SSRF 面，需配套地址过滤设计；② 需新增两个生产依赖；③ 会产生**第二个提取器** —— 调研推荐的 Defuddle 是 JS 库、只能跑在扩展里，后端得另找 Python 实现，两者产出的 Markdown 长期混存于同一资料库，而快照是永久资产。按顺序甲，扩展是下一个任务，自动抓取在那里一次做对。
- **不引入任何第三方站点凭证**（知乎/CSDN 等的登录态、cookie、扫码登录一律不做）。扩展方案下完全不需要：扩展读的是用户已登录、已渲染的页面，会话由浏览器自己持有，StudyPilot 永不接触凭证。引入凭证只会让本机工具变成第三方会话的保管者，徒增泄露面与维护负担。
- **不做图片冻结**：冻结图片需要有人取回图片字节 —— 后端能取但已被上一条排除；UI 页面多半取不到（跨域 `fetch` 读字节要对方给 CORS 头，图床常不给）；**扩展能取**（host permissions 绕开 CORS）。因此图片冻结与扩展同期（TASK-037），本任务的快照中图片引用仍指向原站。此为已知的不完整冻结，见「已知限制」。
- **不做 Markdown 渲染、不做阅读器、不做标注**：本任务只解决「正文进库」，展示与锚定属后续任务。
- **不给 `notes` 加 selector 字段**：调研 §7.2 建议预留，但该字段可空、事后添加成本相同（存量笔记在两种情况下都没有锚点），不具备与快照同等的时间压力，不捆入本任务。
- 不改 `learning_resources` 的任何列与约束（含来源互斥 CHECK）、不改 `original_files` 与 `LocalFileStorage`、不改 taxonomy 与 notes 的任何行为。
- 不改 `security/local_access.py`（扩展走 UI 页面，安全边界在 TASK-037 也不动）。
- 不动未列路径。

- 依赖/前置条件：TASK-035 已由用户合并（PR #40，merge `3fbca1f`）。无未合并依赖。
- 并行：否，单写入者 `coordinator`（主 Agent 亲自充当 Worker；L3 的 Review 与 Acceptance 由独立只读子 Agent 执行）。
- 状态收尾并入本任务控制面提交：把 TASK-035 由 `ACCEPTED` 标 **MERGED**（merge `3fbca1f`、PR #40）。

## 完成条件

1. `0004` 迁移可升可降：`upgrade` 建表，`downgrade` 删表；`test_migrations.py` 的既有升降级用例覆盖到 0004 且全绿。
2. 一份资料至多一份快照；重复 `PUT` 为整份替换而非追加，替换后 `char_count`/`sha256`/`captured_at` 随之更新。
3. 删除资料时快照随之消失（CASCADE），且不影响其他资料的快照。
4. 删除快照后资料本身、其标签、心得、学习数据、原件一律不变。
5. WEB 资料在拥有快照后，`source_url` 仍然保留且可读 —— 「快照 + 原文链接」两者并存，且 `learning_resources` 的来源互斥 CHECK 未被触碰（有测试对 WEB/PASTE/FILE 三种资料各写一次快照并断言资料投影不变）。
6. `format` 只接受 `MARKDOWN`；`content` 长度上限与既有 `pasted_content` 一致（1～1,000,000 字符），越界或空内容在触库前 `422`。
7. `status`/`failure_code` 的互斥约束成立：`FAILED` 必须带 `failure_code`，非 `FAILED` 必须不带（与 `original_files` 同形）。
8. 写入与删除的版本前置条件与既有通则一致（缺失 `428`、不匹配 `409 VERSION_CONFLICT` 且 `details` 只含 `current_version`），并有测试证明冲突时无写入。
9. 资料不存在时读/写/删快照均 `404 RESOURCE_NOT_FOUND`，无写入。
10. 无快照时读取返回明确的「不存在」而非空对象，且前端据此显示可理解的空态。
11. **后端未引入任何对外网络请求与相关依赖**：有检查证明 `backend/src` 中无 HTTP 客户端调用，`pyproject.toml` 生产依赖未新增。
12. 前端：资料详情页可粘贴保存、替换、删除快照并看到已存正文；错误（版本冲突、资料不存在）有可理解提示且不自动重试。
13. `cd backend && ruff format --check . && ruff check . && mypy . && pytest` 全绿（基线 505，只增不减）；`cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build` 全绿（基线 360，本任务后应 >360）；`npm run test:e2e` 全绿（基线 40），并新增至少一条走真实后端的快照录入用例。
14. `check_task.py --task docs/tasks/TASK-036-content-snapshot.md --candidate <SHA>` CHECKS PASS，记录 product_fingerprint。
15. L3 执行链完整：独立只读 Reviewer 审 `3fbca1f..candidate` 完整 diff；独立只读 Acceptance（第三个只读实例）核对上述 15 条完成条件与跨模块证据。两者原文写回 EVIDENCE 区。

## 上下文包

根 `AGENTS.md` + `backend/AGENTS.md` + `frontend/AGENTS.md` + 本记录 + `docs/research/阅读器与标注能力调研.md` §3、§7.1、§10（作为**调研输入**，其建议须由本任务重新判断，不得当作已批准决定）。

只读参照（不改）：`backend/migrations/versions/0001_initial.py:110-130`（来源互斥 CHECK 原文）与 `0003_resource_title_nullable.py`（迁移写法与 `batch_alter_table` 先例）、`models.py:134-175`（`OriginalFile` 的 status/failure_code/CHECK 组织方式）、`infrastructure/database/resource_store.py`（投影与事务写法）、`api/notes.py`（带版本请求体的 428 处理先例 `move_body`）、`security/local_access.py`（本任务不改，但需确认新路由被既有方法+前缀规则覆盖）。

契约章节：`docs/contracts/API与数据契约基线.md:164`（版本规则）、`:229-233`（`impact_revision`/令牌，用于说明本任务不套用）、`:369`（三类创建与 `pasted_content`）、`:373`（`ResourcePatch` 来源字段互斥）、`:491`（引用保护与不静默级联）。

准确命令：
- `cd backend && ruff format --check . && ruff check . && mypy . && pytest`
- `cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test && npm run build`
- `cd frontend && npm run test:e2e`
- `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-036-content-snapshot.md --candidate <SHA>`

跑长检查前后各记一次共享工作树中未跟踪文件的 sha256 与 mtime（本机存在用户并行会话写入同一工作树的先例）。

不做全仓扫描。

## 实现与测试

- 实现 SHA/变更摘要：`ce22d2a`，相对基线 `3fbca1f` 共 18 个代码/契约文件（加任务记录、TASK-035 收尾与索引，`check_task` 记 files=21）。
  - **数据层**：`models.py` 新增 `ContentSnapshot`；`0004_content_snapshots.py` 建表。READY 与 FAILED 两态由一条 `capture_state` CHECK 互斥约束（READY 必有 `content`/`char_count`/`sha256` 且无 `failure_code`，FAILED 反之），形态照搬 `OriginalFile.failure_state`。FAILED 本任务不产生，但形态先建好，避免后续自动抓取时再来一次迁移。
  - **新模块**：`modules/resources/snapshots.py`（`SnapshotPut` 校验，纯空白正文拒绝但其余空白原样保留）、`infrastructure/database/snapshot_store.py`（读/整份写/删，含版本前置）、`application/snapshots.py`（短事务，`StaleDataError` 经新事务重新分类为 `VERSION_CONFLICT`，不重放写）、`api/snapshots.py`（三条路由）。
  - **写入语义**（实现中定稿的一处设计）：首次写入省略 `expected_version` 返回 **201**；已有快照必须携带，缺失 **428**、不匹配 **409**；对**尚不存在**的快照携带 `expected_version` 返回 **404 SNAPSHOT_NOT_FOUND**。最后一条是刻意的：调用方声称要替换第 N 版，而根本没有快照，这是过期认知而非一次新写入，静默当作创建会掩盖客户端的状态错误。
  - **契约**：openapi 新增 `ContentSnapshot`/`SnapshotPut`/`ContentSnapshotEnvelope` 三个 schema、`ResourceOrSnapshotNotFound` 响应组件与三个操作（纯新增，0 删除）。中文契约新增 **4.13 ContentSnapshot** 小节（含「为什么另建表而不放宽互斥 CHECK」「冻结语义」「写入语义」「本阶段边界」四段）、交付状态段、操作清单、操作表三行、错误码 `SNAPSHOT_NOT_FOUND`、逐操作错误码三行，以及 4.12 关系表新增一行。**节号选 4.13 而非插队为 4.12**：4.12 被已合并的 TASK-022 记录引用，改号会波及旧记录。
  - **前端**：`api/client.ts` 注册 `SNAPSHOT_NOT_FOUND`；`resources/api.ts` 新增三个调用（读到 404 时返回 `null` 而非抛错 —— 没有快照是正常状态）；新增 `ContentSnapshot.tsx` 挂在资料详情页，可粘贴/替换/删除并展示 Markdown **源码**（渲染属阅读器范畴，非本任务）。
- 实现中发现并修正的三个真问题（两个是我自己引入的缺陷，一个是既有防线拦住了我）：
  1. **重新读取时整个区块会闪没**。首版把加载态写成组件级早返回（`if (!result) return <p>正在读取正文…</p>`），于是保存后触发重读时，连标题带按钮整块消失。这是真实体验缺陷，不只是测试问题。改为把加载/错误态放进 `<section>` 内部，区块本身常驻。
  2. **读取失败抢占了页面级警报**。首版读取失败复用 `ResourceError`（`role="alert"`），导致资料详情页出现第二个 alert，撞红了 `ClassificationPages.test.tsx` 里既有的无作用域 `findByRole('alert')`。判断：一个可选次级区块的**后台读取**失败不该发出 assertive 警报，`role="alert"` 应留给用户主动发起的**写入**失败。改为礼貌提示 + 「重新读取正文」按钮。**未修改那个既有测试**（它不在本任务 allowed_paths 内，且问题出在我的设计而非它）。
  3. **删除被客户端白名单拦下**。`client.ts` 有一份「哪些 DELETE 可携带 `If-Match`」的显式路径白名单，快照路径不在其中，删除时报 `INVALID_REQUEST`。这是既有防线正确工作，按需在白名单里显式加入 `/resources/{id}/snapshot`（长度 6 段、末段为 `snapshot`）。
- 测试侧的一处坑，记下来免得后来者再踩：`findByText('# 冻结的标题', { exact: false })` 会匹配到 **textarea 的内容**（React 给受控 textarea 设 `defaultValue`，在 DOM 里是文本子节点），因此断言会在写入完成前就通过。三条前端用例改为断言已存快照的元数据（`共 N 字`），它只在快照真正落库后才出现。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：
  - `check_task.py --task docs/tasks/TASK-036-content-snapshot.md --candidate ce22d2a` → **CHECKS PASS**。base=`3fbca1f`、risk=L3、stages=(worker, review, acceptance)、files=21、profiles=**backend,contracts,frontend**、product_fingerprint=`f30a93e1c787894ff383307f126a3c0ee86c31c7c535544d56c4ec9f2cc14c4c`。
  - `cd backend && ruff format --check .`（71 files already formatted）/ `ruff check .` / `mypy .`（70 source files）全绿；`pytest` → **513 passed**，基线 **505**，净增 8。
  - `cd frontend && npm run format:check && lint && typecheck && test && build` 全绿；vitest **363 passed**，基线 **360**，净增 3。
  - `npm run test:e2e` → **41 passed**，基线 **40**，净增 1（真实后端上粘贴正文、刷新后仍在、删除后回到空态，并断言快照与原文链接并存）。
  - 环境：本地 macOS（Darwin 25.5.0）、Python 3.13.9 / pytest 8.4.2、Node 24、Vitest 4.1.11、Playwright chromium、Vite 8.2.2。
  - 未运行：无 —— 本任务含迁移、契约与前后端，`check_task` 自动选组已覆盖三组。
  - **「后端不出网」这条防线的边界（按 Reviewer F3 补登）**：`test_backend_makes_no_outbound_network_calls` 按**文本**扫 `backend/src` 下的四个 token（`import httpx`/`import requests`/`urllib.request`/`aiohttp`）。它挡得住「顺手加了个 HTTP 客户端」这类**意外**引入，**挡不住刻意绕过**：`from httpx import get`、`from requests import Session`、`from urllib import request`、`import http.client`、`import socket`、`import urllib3`、`subprocess` 调 curl 全不匹配；扫描范围也只有 `backend/src`，不含 `backend/migrations` 与 `scripts/`。设计意图是防意外而非防对抗，完成条件 11 要的也是「有检查证明」而非「不可绕过的保证」。另一条相关事实：`httpx2` 是 dev 依赖（TestClient 需要），所以测试环境里 import 得到 —— 单看「生产依赖没变」并不能挡住 `src` 里的误引用，这条文本扫描确实在做额外的事。
  - **一处机械检查的盲区（实现中实测发现，值得后来者知道）**：测试数据库由**迁移**建表，模型上的 CHECK 运行时并不生效；而 `compare_metadata` 只比对名称与列，**不比对 CHECK 正文**。实测：把模型里 `capture_state` 的 `IS NOT NULL` 撤掉、迁移保持正确，`test_migrations.py` 仍然全绿。因此模型与迁移的 CHECK 正文必须人工保持一致 —— F1 能藏住，正是因为这条缝隙。
  - 共享工作树监测：跑长检查前后各记一次未跟踪文件 `docs/research/阅读器与标注能力调研.md` 的 sha256，两次均为 `f56cad6b…`，**本次无第三方并发写入**。运行 `check_task` 时按既有做法把该未跟踪目录临时移出、跑完原样放回，未删除或修改。
- 已知限制/未完成项：
  - **图片未冻结**：快照中的图片引用仍指向原站，原站失效时图片一并失效，因此当前冻结**并不完整**。这不是疏漏而是排期：可靠取回图片字节需要绕开 CORS，只有浏览器扩展做得到（后端取得到但本任务明示不出网）。已写入契约 4.13。
  - **不渲染 Markdown**：详情页展示的是源码。渲染与阅读体验属阅读器任务。
  - **无自动抓取**：正文只能手动粘贴。`FAILED` 状态形态已建好但本阶段不产生。
  - `SnapshotStore.require_resource` 直接查 `learning_resources`，未复用 `ResourceStore.find` 的「FILE 资料须 READY 才算可见」规则。差异只在一个理论边界：对一个仍在 PENDING 的 FILE 资料，快照端点会返回 404 SNAPSHOT_NOT_FOUND 而不是 404 RESOURCE_NOT_FOUND —— 两者同码同状态，不泄露信息也不改变行为。为避免与 `resource_store.py`（不在 allowed_paths）耦合而未复用。
  - 一份资料仍限一份快照（`UNIQUE(resource_id)`）。多版本快照与版本对比未做，放宽该唯一约束即可支持。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA（最终）：**`150921b`**（代码修订 SHA **`97ec829`**，base `3fbca1f`）。第一轮候选：`fba1e8e`（代码 `ce22d2a`）。`97ec829..150921b` 仅为第一轮报告与处置的证据写回。**注意（A1 更正）**：「实现与测试」段（EVIDENCE 标记区外）**仍记第一轮的** fingerprint `f30a93e1…`（绑定已被取代的代码 SHA `ce22d2a`）；**最终指纹 `c0b72e28…`（绑定 `97ec829`）只出现在本区下方的第二轮处置里**。我原先在此写成「该段记录的是最终值」，是错的 —— 经 Acceptance 指出、主 Agent 复核确认（`:131` 为 `f30a93e1…`）。检查本身的有效性不受影响：真正的绑定关系 `97ec829 → c0b72e28` 记录准确。
- Review 第一轮（L3 独立只读，`3fbca1f..fba1e8e`）：**CHANGES_REQUIRED**（F1 阻断，F2/F3 非阻断）。

  身份与派发：`.claude/agents/reviewer.md` 定义的**第六个**全新只读实例（`tools: Read, Grep, Glob`，无 Bash、无写工具），无上下文继承，由同机在项目目录下启动的会话 `studypilot-05` 代为派发（本会话未注册项目级 Agent）。本轮改进：主 Agent 在**证据写回完成后**才请求派发，HEAD 不再移动，因而不存在前两次「带过期简报开工 + 中途更正」的环节。

  外部核实（派发会话以 git 提供）：候选后端 diff 中 `learning_resources` 仅作为 FK 目标出现，无任何 ALTER/CHECK 改动（**仅为机械印证；表级语义由 Reviewer 独立论证**）；`pyproject.toml`/`uv.lock`/`package.json`/`package-lock.json` 全部零改动；未跟踪调研文件 sha256 仍为 `f56cad6b…`，本轮无并发写入。

  报告原文（逐字，仅还原传输转义的 `<`/`>`）：

  > ## 只读证明
  >
  > 本实例仅有 `Read`/`Grep`/`Glob`，无 `Write`/`Edit`/`Bash`，未做任何写入、提交或推送。
  > 审的是 base `3fbca1f` → 候选 `fba1e8e` 的完整最终 diff（导出 patch 1587 行/21 文件，与工作树 HEAD 交叉验证一致），以及基线侧只读对照文件。机械证据（check_task、pytest 513、vitest 363、e2e 41、变异验证）按 **NOT_RUN** 处理，我未复跑、未复核其执行过程。
  >
  > ## Findings
  >
  > ### F1（必须修复，阻断）`capture_state` CHECK 在 SQLite 下漏掉了它最该挡的那一种组合
  >
  > - 位置：`backend/src/studypilot/infrastructure/database/models.py:258-264`、`backend/migrations/versions/0004_content_snapshots.py:46-52`
  > - 触发：写入 `status='FAILED'` 且 `failure_code IS NULL`（content/char_count/sha256 均 NULL）。
  > - 证据（三值逻辑，逐支求值）：分支 A `status='READY' AND …` → FALSE；分支 B `status='FAILED' AND length(failure_code) > 0 AND …` 中 `length(NULL) > 0` → **NULL**，故 B → NULL；`FALSE OR NULL` → **NULL**。SQLite 的 CHECK **只在表达式为 FALSE 时才违反，NULL 视为满足**。⇒ 该行被接受。
  > - 对照：它声称"照搬 `OriginalFile.failure_state`"（注释 `models.py:257`、迁移 docstring、任务记录），但 `models.py:148-151` 的原文是 `(status = 'FAILED' AND failure_code IS NOT NULL AND length(failure_code) > 0) OR …` —— **多的正是 `failure_code IS NOT NULL`**，靠它把 NULL 支拉成 FALSE。新 CHECK 删掉了这一句。仓库里还有一条既有用例专打这个组合：`backend/tests/test_database.py:185` 的 `{"status": "FAILED", "failure_code": None}` 断言 IntegrityError —— 新表没有对应用例，所以这个洞没被抓到（`test_snapshots.py` 全程只走 READY，`FAILED` 无任何测试）。
  > - 影响与可能性：**当前运行期为零**——本任务无任何代码路径写 FAILED。但完成条件 7 原文要求"`FAILED` 必须带 `failure_code` …（与 `original_files` 同形）"，该条件**事实上不成立**，且实现记录与迁移注释对此的陈述不准确。真正的代价在时间上：本任务把"FAILED 形态先建好"的唯一理由就是"避免后续再来一次迁移"，而按现状 TASK-037 接入自动抓取时仍须发 0005 用 `batch_alter_table` 重建表才能补上——引入的复杂度没有换来它承诺的收益。
  > - 最小安全修正（现在 ≈ 两处各加 4 个词，且 `var/studypilot.db` 不存在、0004 未合并，可原地改）：两处均改为 `(status = 'FAILED' AND failure_code IS NOT NULL AND length(failure_code) > 0 AND …)`；并补一条比照 `test_database.py:180-209` 的表级参数化用例（至少含 `{"status":"FAILED","failure_code":None}`、`{"status":"READY","failure_code":"x"}`、`{"status":"FAILED","content":…}`），使完成条件 7 首次获得覆盖。
  > - 依 `docs/governance/风险分级与检查规则.md:23`"违反已确认需求/契约或**必要完成条件**"→ 阻断。
  >
  > ### F2（非阻断，建议顺手修）超长 `If-Match` 走成 500 而非 428
  >
  > `backend/src/studypilot/api/snapshots.py:99-103`：正则 `"[1-9][0-9]*"` 允许任意长度数字，随后 `int(...)` 无保护。Python 3.13 对 `int(str)` 有 4300 位上限，超出抛 `ValueError`，被 `guarded` 的兜底 `except Exception` 收成 **500 UNKNOWN_ERROR**。中间件仅限制头部总量 16384 字节（`local_access.py:71`），故 5000 位数字可达。既有两处先例 `api/notes.py:131-134`、`api/taxonomy.py:137-140` 都专门包了 `try/except ValueError → 428`——本文件把这层看似冗余的保护去掉了。影响：本机、需有效令牌与同源，无写入、无信息泄露，仅错误码与契约（缺失/无效版本 → 428）不符。修正：照抄两处先例的 `try/except`。
  >
  > ### F3（非阻断，属记录完整性）不出网这条防线的边界未登记
  >
  > - 断言**确实可失效**（我独立读码判定，不依赖变异自述）：`test_snapshots.py:753-766` 的 `offenders` 由真实文件内容计算，`backend/src` 下任一处出现 `import httpx` / `import requests` / `urllib.request` / `aiohttp` 即转红。非恒真。
  > - 边界比实现者自述的**还大一点**：`from httpx import get`、`from requests import Session`、`from urllib import request`、`import http.client`、`import socket`、`import urllib3`、`subprocess` 调 curl 全部不匹配；扫描范围只有 `backend/src`，不含 `backend/migrations` 与 `scripts/`。反方向它没被说小：整文件文本匹配（含注释/字符串）只会更严，不会更松。
  > - 对本任务是否够用：**够**。完成条件 11 原文是"**有检查证明** `backend/src` 中无 HTTP 客户端调用，`pyproject.toml` 生产依赖未新增"，要的是检查而非不可绕过的保证；且我核对候选 diff 中 `pyproject.toml` 依赖段零改动。补充一条值得知道的事实：`httpx2` 是 dev 依赖（`backend/pyproject.toml:24`，TestClient 需要），所以测试环境里 import 得到——单靠"生产依赖没变"并不能挡住 src 里的误引用，这条文本扫描确实在做额外的事。
  > - 但"防意外不防对抗"这个取舍**未写进记录**属实。§6 要求检查记录含必要摘要，一条已知有边界的防线不登记边界，会让后来者高估它。既然 F1 已要求重新冻结，请在同一轮把这一句补进"实现与测试"（标记区外，正是该轮可改之处）。可选建议：token 换成按 import 行的正则，或加断言"生产依赖集合 == 冻结名单"。
  >
  > ## 对你列的八条重点的独立结论
  >
  > 1. **未碰来源互斥 CHECK：成立。** 0004 全文只有 `create_table`/`drop_table`，`learning_resources` 仅作为 FK 目标出现；`models.py:113-118` 的 `exclusive_source` 与基线逐字一致。表级效果正确：该 CHECK 只求值 `learning_resources` 自身的列，新表行不进入其求值范围。`test_snapshots.py:636-662` 对 WEB/PASTE/FILE 各写一次快照并断言资料投影整份相等，是真实证据。
  > 2. **迁移与模型一致、升降级正确：成立（F1 是内容缺陷，不是一致性缺陷）。** 8 条 CHECK、UQ、FK、PK 的名字与 `op.f()` 全部匹配命名约定（`models.py:50-58`）；`choices()` 得出 `String(8)`/`String(6)` 与迁移 length 一致；`UTCDateTime.impl = DateTime`，故迁移用 `sa.DateTime()` 才是对的（`DateTime(timezone=True)` 反而会被 `compare_metadata` 判不等）；`version` 双方都有 `server_default="1"`。`test_migrations.py` 的 `compare_metadata(...) == []` 是有效机械绑定。降级：0004 只 drop 新表；关键是 0001 的非空守卫（`0001_initial.py:444-450`）不含新表——但快照的 FK 非空，有快照必有 `learning_resources` 行，守卫必被触发，且整段降级共用一个事务（`connection.py:82-115` 与更新后的 `test_migrations.py:64-71` 断言 head 仍停在 0004），因此**不存在"静默丢弃快照"的路径**。
  > 3. **READY/FAILED 写法：见 F1，现状挡不住。** 至于"现在就建好形态"值不值：形态修正后我认为可以接受（成本一条 CHECK，且确实省掉一次 SQLite 表重建），但**必须连同 F1 的表级测试一起交付**——没有测试的预留形态正是本次出问题的原因。
  > 4. **对不存在的快照带 `expected_version` 返回 404：站得住，且契约写清楚了。** 语义正确（调用方认知过期，不该静默变成创建），三处一致：`snapshot_store.py:412-415`、中文契约 4.13「写入语义」、openapi `SnapshotPut.expected_version` 的 description 与 PUT 的 404 响应组件。测试 `test_snapshots.py:704-709` 直接绑定。
  > 5. **见 F3。** 结论：可失效、非恒真；边界比自述更大；对本任务够用；未登记边界需在下一轮补记。另：该测试末行 `assert create_app() is not None` 实质恒真、不提供额外保证，属填充，建议删或换成有意义的断言。
  > 6. **CASCADE 是真的 FK 级联。** `create_database_engine` 默认 `foreign_keys=True` 并在 connect 时 `PRAGMA foreign_keys=ON`（`connection.py:16-30, 52-79`），测试用的 `session_factory` 来自该引擎；`LearningResource`/`ContentSnapshot` 之间**没有任何 ORM `relationship`**，`session.execute(delete(LearningResource)…)` 也不做 Python 级级联——所以 `test_snapshots.py:688-691` 的 `count == 0` 只能由数据库级 CASCADE 产生。反向隔离（删快照不动资料）由 `:681-685` 的整份投影相等断言。**一处缺口**：该用例在删资料前已先删掉 `kept` 的快照，最后断言的是全表 0 行，因此完成条件 3 后半"不影响**其他资料**的快照"实际未被断言（把 `kept` 的快照留着、末尾断言剩 1 行即可覆盖）。风险很低，列为覆盖缺口。
  > 7. **前端两点都成立。** `getResourceSnapshot`（`api.ts:1521-1524`）只吞 `cause.code === 'SNAPSHOT_NOT_FOUND'`，按**错误码**而非状态码判断——资料不存在会以 `RESOURCE_NOT_FOUND` 抛出、路径拼错得到的其它 404 也照样抛出，不存在掩盖。白名单新增支（`client.ts:54-58`）要求恰好 6 段 + `parts[3]==='resources'` + UUID + `parts[5]==='snapshot'`，紧到不能再紧；它只决定 `ifMatchVersion` 能否附加（`client.ts:513-521`），`resourceDeleteTarget` 与 deletionToken 那条路径一字未动，没有放宽。
  > 8. **范围/断言/契约/叙述。** 21 个改动文件全部在 `allowed_paths` 内（`fixtures.ts` 在名单内但未改，属允许未用）。既有断言**无删除无弱化**：唯一被改的既有断言是 `test_migrations.py` 三处（head `0003→0004` ×2、表数 `12→13`），仍是精确相等，且 13 张表正确。契约三方一致我逐项核对：`SnapshotPut` 的 4 个字段与 openapi properties 集合相同；`ContentSnapshot` 的 14 个 required 与 `snapshot_store.FIELDS` 的 14 项完全对应；错误码表、逐操作 x-error-codes、操作清单与后端实际返回一致。TASK-035 的改动限于 toml `status` 与 EVIDENCE 区末行、索引一行，符合 §6 写回边界。
  >
  > ## 实现者自陈的三个问题 + 一处测试坑（核其属实）
  >
  > - **整块闪没**：属实且修法有效。`useResourceQuery.ts:26` 在 key 变化时把 `result` 判为 `undefined`，若按早返回写就是整块消失；现在 `<section>` 常驻，只有内部三分支切换（`ContentSnapshot.tsx:1227-1259`）。
  > - **读取失败抢占 alert**：属实。失败态用 `role="status"`（`:1236`），`role="alert"` 只留给用户主动写入的失败（`:1322`）。`ClassificationPages.test.tsx` **不在候选 diff 的 21 个文件中，一字未改**——它说的"改的是自己的设计而非那个测试"成立。
  > - **删除被白名单拦下**：属实，见第 7 条。
  > - **三条前端用例是否真能失效**：能。用例一在 PUT 之前 GET 恒抛 404，`共 12 字` 只可能在写入落库后出现；用例二真正的断言是 PUT body 含 `expected_version: 1` 与 DELETE 的 `ifMatchVersion: 1`（`waitFor` + `mock.calls`）；用例三断言恰好 1 次 PUT 且出现"没有自动重试"。改用元数据 `共 N 字` 而非正文，确实规避了 textarea 文本子节点误命中。e2e 用 `Array.from(body).length`（码点计数）与后端 `len()` 一致，`section` 作用域也正确。
  >
  > ## 覆盖与缺口
  >
  > 已覆盖：并存语义（三种来源）、整份替换、版本前置（428/409/details 只含 current_version）、资料缺失 404、非法输入 8 组 422、提交失败回滚且不泄露内部标识、迁移升降级与 metadata 对齐、CASCADE 与反向隔离、前端空态/写入/替换/删除/冲突、e2e 走真实后端。
  > 缺口：① **完成条件 7 无任何测试**（F1）；② 完成条件 3 后半"其他资料快照不受影响"未断言；③ 完成条件 9 的 DELETE 分支未测（读码正确；注意 DELETE 缺 `If-Match` 时先返 428 再谈 404，与既有先例同序）；④ 无 openapi ↔ Pydantic/FIELDS 的自动绑定用例（仓库有 `test_resource_updates.py:477-481` 这类先例），当前人工核对一致，仅是后续漂移风险。
  > 观察（不要求返工）：FAILED 状态在前端会渲染成"共 　字"+空 `<pre>`，当前不可达；`content` 含 NUL 字符时 SQLite `length()` 截断会走成 500 而非 422，与基线 `pasted_content` 的 `bounded_length` 同性质，属既有形态。
  >
  > ## 剩余风险
  >
  > F1 修好后，本次剩余风险集中在"已登记的边界"：不出网靠文本扫描 + 依赖集合（F3）、图片未冻结、单快照唯一约束、`require_resource` 不复用 FILE-READY 可见性规则（同码同状态，我确认不泄露信息）。均已在记录中如实登记或由本报告补充。
  >
  > ## 结论
  >
  > **CHANGES_REQUIRED** —— 唯一阻断项是 F1（`capture_state` 对 `status='FAILED' AND failure_code IS NULL` 失效，完成条件 7 不成立，且与所声称的 `OriginalFile` 同形不符）。建议同轮一并处理 F2（低成本、对齐既有先例）与 F3 的记录补登，改完请重新冻结候选，我可只审 `previous_candidate..new_candidate` 的增量并继承本轮其余覆盖。

- 第一轮 findings 的处置（修订 SHA `97ec829`）：
  - **F1 已修，并先自己复现了缺陷再动手**。用 `sqlite3` 建一张同形临时表实测：原写法下 `INSERT ('FAILED', NULL, NULL, NULL, NULL)` **被接受**；`SELECT (('FAILED'='READY') OR ('FAILED'='FAILED' AND length(NULL)>0)) IS NULL` 返回 1，证实整条 CHECK 求值为 NULL；补上 `failure_code IS NOT NULL` 后同一插入**被拒绝**。模型与迁移两处均已修正，并在模型注释里写明「这句 `IS NOT NULL` 是承重的，不是冗余」及其原因。
  - **补齐完成条件 7 的覆盖**：新增 `test_invalid_content_snapshots_rejected`，比照 `test_database.py:180-209` 的表级参数化写法，12 组非法组合，首组正是 `{"status": "FAILED", "failure_code": None, ...}`。**已变异验证**：把**迁移**里的 `IS NOT NULL` 撤掉 → 该用例报 `DID NOT RAISE IntegrityError` 转红；还原后转绿。（第一次变异我只改了模型、用例仍绿 —— 这本身就暴露了上面记录的那处盲区：运行时约束来自迁移，不是模型。）
  - **F2 已修**：`version_header` 的 `int()` 包上 `try/except ValueError → 428`，与 `notes.py`/`taxonomy.py` 两处既有先例同形，并加注释说明正则允许任意长度而 `int()` 有 4300 位上限。新增用例传 5000 位版本号断言 428。**已变异验证**：去掉该保护 → 用例报 `assert 500 == 428` 转红。
  - **F3 已补登**：边界写进「实现与测试」段（见上），并采纳 Reviewer 补充的更完整清单（`from urllib import request`、`import http.client`、`import socket`、`import urllib3`、`subprocess`，以及扫描范围不含 `migrations`/`scripts`）。**未**改动扫描实现本身 —— 完成条件 11 要的是「有检查证明」，收严 token 属可选建议，留作遗留项。
  - **删除恒真填充断言**：`assert create_app() is not None` 已移除（连带清理了随之未用的 import）。
  - **补上两处覆盖缺口**：① 完成条件 3 后半 —— 删资料前把 `kept` 的快照放回去，末尾断言全表**剩 1 行**且该快照内容仍可读，从而真正验到「不影响其他资料的快照」；② F2 的 428 用例同时覆盖了完成条件 9 的 DELETE 分支。
- 修订后的检查（真实运行）：`check_task.py --candidate 97ec829` → **CHECKS PASS**，base=`3fbca1f`、files=21、profiles=backend,contracts,frontend、product_fingerprint=`c0b72e2813d00df70294032a5c1e2f9a29fe27e1edec9541f05b8a38e744ce1c`。backend `pytest` **525 passed**（第一轮候选 513，净增 12 = 参数化 12 组约束用例 −1 删除的恒真用例 +1 的 428 用例）、ruff/mypy 全绿；frontend 全绿、vitest **363**、e2e **41**（前端本轮未改）。跑检查前后未跟踪文件哈希一致（`f56cad6b…`），本轮无并发写入。
- Review 第二轮（L3 独立只读，增量 `fba1e8e..150921b`，同一 Reviewer）：**PASS**，仅 O1/O2 两条非阻断记录项。

  报告原文（逐字，仅还原传输转义的 `<`/`>`）：

  > ## 只读证明
  >
  > 本实例仍只有 `Read`/`Grep`/`Glob`，无 `Write`/`Edit`/`Bash`；本轮未做任何写入、提交、推送。
  > 本轮为**修订审查（增量）**：审 `fba1e8e..150921b` 的完整增量 patch（5 文件 / +164 −11，与工作树 HEAD 交叉验证）及受影响上下文（`test_migrations.py`、`test_database.py` 先例、`local_access.py` 头部限额）。**显式继承第一轮对 `3fbca1f..fba1e8e` 的全部其余覆盖**——前端（`ContentSnapshot.tsx`/`api.ts`/`client.ts`/三条 vitest/e2e）、契约三方一致、并存语义、CASCADE 机制、白名单、404 吞法、范围合规、既有断言未弱化等均**零改动**，第一轮结论原样适用于新候选。本结论指向 **`150921b`**。
  > 机械证据（check_task `c0b72e28…`、pytest 525、vitest 363、e2e 41、两处变异验证）一律按 **NOT_RUN** 处理：我未复跑，也未复核实现者变异验证的执行过程；下列判断全部建立在独立读码之上。
  >
  > ## 第一轮 findings 的处置核验
  >
  > **F1 —— 已修，判定关闭。** 模型 `models.py:260-267` 与迁移 `0004:40-47` 我逐字符比对，两处 CHECK 正文**完全一致**（含新插入的 `AND content IS NULL ` 换行位置）。修后语义正确：`status='FAILED'` 且 `failure_code IS NULL` 时，分支 B 在 `failure_code IS NOT NULL` 处求值为 FALSE（短路，不再产生 NULL），分支 A 因 `status='READY'` 为 FALSE，整体 FALSE → SQLite 拒绝。READY 路径（应用唯一会写的状态）分支 A 一字未动，无回归。模型注释把这句标为"承重"，准确。
  >
  > **新增 12 组参数化用例：真能失效，且每组各有其命中的约束。** 我逐组验证基准行 + 覆盖后落在哪条 CHECK：首组（`FAILED`/`failure_code=None`/三项 NULL）正是原缺陷组合，命中修好的 `capture_state`——撤回迁移里的 `IS NOT NULL` 即插入成功、转为 `DID NOT RAISE`，与实现者自述的转红形态一致（我按代码独立推得，非采信）；`{"status":"READY","failure_code":"why"}`、`{"status":"FAILED","failure_code":"why"}`（content 仍非空）、READY 缺 content/char_count/sha256 三组，均命中 `capture_state` 的另一侧；`PAUSED`→`status`、`HTML`→`format`、`content=""`→`content_length`、`char_count=0`→`char_count_bounds`、`sha256="short"`→`sha256_length`、`extractor=""`→`extractor_length`。无一组是平凡真或平凡假。写法（`with pytest.raises(IntegrityError), factory.begin() as session:`，异常在 `begin()` 退出提交时抛出）与先例 `test_database.py:197` 同形。完成条件 7 **首次获得真实覆盖**。
  >
  > **F2 —— 已修，判定关闭。** `api/snapshots.py:103-109` 的 `try/except ValueError → 428 … from None` 与 `notes.py:131-134`、`taxonomy.py:137-140` 逐行同形；只捕 `ValueError`，而对纯数字串 `int()` 只可能抛 `ValueError`（4300 位上限即以 ValueError 报出），**没有吞掉别的异常**。新用例传 5000 位版本号：头部总量约 5.2KB，远低于中间件 16384 字节上限（`local_access.py:71`），所以确实走到 `int()`；无该保护时会被 `guarded` 兜成 500 → `error(..., 428, ...)` 转红，可失效。该用例同时补上了完成条件 9 的 DELETE 分支（资料存在但版本头非法 → 428；带合法版本头且资料不存在 → 404，路径读码正确）。
  >
  > **F3 —— 已补登，判定关闭（含一处措辞更正，见下）。** 边界写进「实现与测试」，并采纳了我补充的更完整清单与 `httpx2` 为 dev 依赖这一事实。未改扫描实现，理由（完成条件 11 要的是"有检查证明"而非"不可绕过"）我认同，与我第一轮结论一致。
  >
  > **恒真填充断言已删**（连带未用 import；文件内其余 `create_app` 用法为 conftest 的 `client` fixture，不受影响）。
  >
  > **两处覆盖缺口已补，且补得对。** 删资料前把 `kept` 的快照放回（201），删 `doomed` 后断言全表**剩 1 行**并回读 `kept` 的正文——这既保留了原有的 FK 级联证明（2→1 只能由数据库级 CASCADE 产生，两表间仍无 ORM `relationship`），又真正验到"不影响其他资料的快照"。完成条件 3 两半均已覆盖。
  >
  > **净增 12 与 525 自洽**：新增测试函数 12 个参数 = +12；513+12=525。
  >
  > ## 关于「机械检查盲区」的独立判断
  >
  > **1. 盲区真实存在，且比记录里写的更宽一点。** Alembic 的 autogenerate/`compare_metadata` 只对它实现了比较器且方言能反射的对象做比较：表增删、列增删、列 nullable、索引、唯一约束、外键；类型仅在 `compare_type=True` 时比、server_default 仅在 `compare_server_default=True` 时比。**CHECK 约束根本不在比较管线里**——不只是"不比正文"，连"迁移里整条 CHECK 漏掉"也不会被发现。而 `test_migrations.py:31` 只传了 `{"compare_type": True}`，**没传 `compare_server_default`**，所以 server_default 差异同样看不见（例如 `version` 的 `server_default="1"` 若两边不一致，全绿）；FK 的 `ON DELETE` 动作也不属于可靠比较项。前提那半句（测试库由迁移建表，模型侧 CHECK 运行时不生效）我已由 `conftest.py:36` → `support.py:44` 的 `command.upgrade` 独立确认。**未被盲区覆盖的部分**同样要说清楚：`test_migrations.py:27-30` 的 `set(get_table_names()) == {*Base.metadata.tables, "alembic_version"}` 和 compare_metadata 对列/类型/nullable/索引/唯一约束的比较都是有效绑定。
  >
  > **2. 「只记录、不加机械绑定」在本任务里是恰当的**（我按你要求正面表态，不含糊）。理由三条：① 这是**仓库既有形态**，不是本任务引入的，13 张表里 12 张都在同一条缝里；② 本任务已经把最要紧的绑定补上了——12 组约束用例跑在**迁移建出来的库**上，测的正是运行时真正生效的那份 DDL，模型侧文本即便漂移也只会误导读者、不会让数据库行为出错；③ 通用绑定（SQLite 的 `Inspector.get_check_constraints()` 能从 sqlite_master 解析出 name+sqltext，技术上可行）需要跨全部 13 张表做文本归一化比较，极可能翻出 0001/0002/0003 的既有差异，而 `test_database.py` 等文件不在本任务 `allowed_paths` 内——那是一个独立的治理/基础设施任务，不该塞进 TASK-036。按风险规则第 28 行「不要求穷举所有异常……除非已成为明确完成条件」，我不为此发起第三轮。建议把可行手段（`get_check_constraints()`）写进遗留项，方便下个任务接手。
  >
  > **3. 我更正自己第一轮的一处过度陈述。** 第一轮第 2 点我写了「`test_migrations.py` 的 `compare_metadata(...) == []` 是有效机械绑定」并以此支撑"迁移与模型一致"——**这是把该检查的效力说大了**：它绑定的是表/列/类型/nullable/索引/唯一约束，**不含 8 条 CHECK 的存在与正文，也不含 server_default**。我第一轮关于 CHECK 名称、正文、`String(8)/String(6)`、`UTCDateTime.impl=DateTime`、`version` 的 `server_default="1"` 的一致性结论，实际依据是我**逐条人工比对**（当时确实做了并写在报告里），不是 compare_metadata。结论不变，依据来源更正如上。为不让这条更正只停留在口头：本轮我**重新人工比对了全部 8 条 CHECK 与 server_default**（`format`/`status`/`capture_state`/`content_length`/`char_count_bounds`/`sha256_length`/`extractor_length`/`positive_version`，以及 `version server_default="1"`），模型与迁移**逐字符一致**，FK 的 `ON DELETE CASCADE` 两侧一致且由运行时用例端到端证明。
  >
  > ## 本轮新增的非阻断观察
  >
  > - **O1（记录精度，不必为此重新冻结）** 「实现与测试」里那句"`compare_metadata` 只比对名称与列"两头都不准：它比的**多于**"名称与列"（还有类型、nullable、索引、唯一约束），而漏的**多于**"CHECK 正文"（整条 CHECK 的存在、以及未开启的 server_default 比较）。同段"净增 12 = 12 组 −1 恒真用例 +1 的 428 用例"的分解也不成立——被删的恒真断言在既有测试**函数体内**、新增的 428 断言也加在**既有测试函数内**，两者都不改变用例计数；净增就是参数化的 12 组，总数 525 本身正确。这两处都在标记区外，修它要再造候选，不值得；本报告原文写回 EVIDENCE 即可完成更正。
  > - **O2（体例，写回时顺手清理，不构成新候选）** EVIDENCE 区现有**两条 Acceptance 条目**（新增的"待执行"一条与原"待填"一条）并存，属重复；`候选 SHA：待填` 也待本轮写回时补为 `150921b`。EVIDENCE 区编辑不形成新候选，可在写回中一并处理。
  >
  > ## 范围与写回边界核验
  >
  > 增量 5 文件（`0004_content_snapshots.py`、`api/snapshots.py`、`models.py`、`tests/test_snapshots.py`、`docs/tasks/TASK-036-content-snapshot.md`）**全部在 `allowed_paths` 内**，累计仍是 21 文件。任务记录的改动落在两处：**「实现与测试」段新增两条（标记区外）** + EVIDENCE 区。按 §6，"任何实现/契约/配置/测试修订形成新候选"，本轮既有代码修订，更新「实现与测试」正是该段的用途，**这是形成新候选的正当理由，不是借证据写回改标记区外内容**——我确认 `risk`/`risk_flags`/`allowed_paths`/`checks`/目标/完成条件/非目标**一字未改**，`status` 仍为 `IN_REVIEW`。第一轮报告以引用块逐字写回，符合"原文写回"。
  >
  > ## 覆盖与缺口（针对新候选）
  >
  > 第一轮四项缺口：①（条件 7 无测试）已关闭；②（条件 3 后半）已关闭；③（条件 9 的 DELETE 分支）已关闭；④ **openapi ↔ Pydantic/FIELDS 无自动绑定用例仍在**（人工核对一致，属后续漂移风险，已在遗留项登记）。新增遗留：模型↔迁移的 CHECK 正文/server_default 无机械绑定（已登记，判为可接受，见上）。
  >
  > ## 剩余风险
  >
  > 不出网靠文本扫描 + 依赖集合（边界已完整登记）；模型侧 CHECK 文本与 server_default 只有人工保证（本轮已人工复核一致，且运行时行为由 12 组表级用例覆盖）；图片未冻结、单快照唯一约束、`require_resource` 不复用 FILE-READY 可见性、FAILED 态前端渲染为空 `<pre>`（当前不可达）、NUL 字符走 500 —— 均已如实登记，无一触及安全或数据底线。
  >
  > ## 结论
  >
  > **PASS**（针对新候选 `150921b`，代码修订 `97ec829`）。第一轮唯一阻断项 F1 已实修并首次获得可失效的表级覆盖；F2/F3 与两处覆盖缺口、恒真填充断言均已处置。本轮 findings 仅 O1/O2 两条非阻断项（记录精度与 EVIDENCE 体例），**不要求返工、不必重新冻结候选**，由主 Agent 在写回时闭环记录即可。PASS 不等于零问题：上列剩余风险与遗留项须原样进入 EVIDENCE，交由独立 Acceptance 与用户判断。

- 第二轮 findings 的处置（均在 EVIDENCE 标记区内，**不形成新候选**）：
  - **O2 已修**：候选 SHA 字段已填 `150921b`；并列重复的 Acceptance 条目已删，本区只剩一条。（一处过程记录：删除时我第一次只删掉了模板那条「待填」，漏掉第一轮自己新增的那条，仍是两条 —— 与 TASK-035 修同类 finding 时**同一个失误**。是写回后的条目计数校验当场发现并补删的。成因是每轮 Review 写回都会新增一条「Acceptance：待执行」，而模板那条从未被清理；根治办法是首次写回时就替换而非追加。）
  - **O1 部分采纳 —— 我实测后发现 Reviewer 的更正本身也不准确，且错在更吓人的方向，故按实测记录，不照抄。** 我原句「`compare_metadata` 只比对名称与列，不比对 CHECK 正文」确实不够精确（它还比类型、nullable、索引、唯一约束）；但 Reviewer 的替代说法「**CHECK 约束根本不在比较管线里**，连整条 CHECK 从迁移里漏掉也不会被发现」**经实测不成立**。三组实验（每次只改一处、跑 `test_migrations.py::test_upgrade_is_repeatable_and_matches_models`、随即还原并确认工作树与 HEAD 无差异）：

    | 变化 | `compare_metadata` 是否发现 |
    | --- | --- |
    | 从迁移里**整条删掉** `sha256_length` CHECK | **发现** —— 报 `('add_constraint', CheckConstraint(...))`，用例转红 |
    | CHECK **名称**与命名约定不匹配（本任务实现初期实际发生过） | **发现** —— 报 `('remove_constraint', CheckConstraint(...))` |
    | 同名 CHECK 只改**正文**（`length(sha256) = 64` → `= 32`） | **不发现**，全绿 |
    | 迁移列去掉 `server_default="1"` | **不发现**，全绿（未传 `compare_server_default`） |

    **证据等级（写回 Acceptance 时升级）**：上表最初为主 Agent 单方实测；其后**派发会话以自包含探针（内存 SQLite + `alembic.autogenerate.compare_metadata`，未接触本仓库任何文件）在隔离环境独立复现，四组逐条一致**。因此这是本任务中唯一一组经第三方独立复现的机械事实，等级高于其余变异验证（后者仍为实现者自述）。

    准确结论是：**CHECK 的存在与名称受机械绑定保护，正文不受；`server_default` 完全不受。** 这比双方原先的说法都窄——盲区是真的，但没有大到「整条漏掉都不知道」。这一条重要，因为把盲区说得过大，会让后来者不再信任一个实际有效的检查。Reviewer 关于 `server_default` 未开启比较、以及运行时约束来自迁移而非模型这两点，实测均属实。
  - **O1 的第二处更正照收**：「净增 12 = 12 组 −1 恒真用例 +1 的 428 用例」这个分解确实不成立 —— 被删的恒真断言与新增的 428 断言都在**既有测试函数体内**，不改变用例计数。净增就是参数化的 12 组，总数 525 正确。
  - **Reviewer 的自我更正已知悉并认可其处理方式**：它承认第一轮把 `compare_metadata` 的效力说大了，且没有停在口头 —— 本轮重新人工比对了全部 8 条 CHECK 与 `server_default`。审查者的旧结论不因写进记录就免于复审，这一点做到了。
- Acceptance（L3 独立只读，第七个实例，独立于实现者与两轮 Reviewer）：**PASS**，15 条完成条件逐条核对全部满足，5 条非阻断 findings。

  身份与派发：`.claude/agents/reviewer.md` 定义的第七个全新只读实例（`tools: Read, Grep, Glob`，无 Bash、无写工具），无上下文继承。**本次在证据写回完成、HEAD 不再移动之后才请求派发**（TASK-034 曾因中途派发产生三条本可避免的 findings），派发会话另已逐项核实写回状态后才派出。

  报告原文（逐字，仅还原传输转义的 `<`/`>`）：

  > 核对完成。以下为独立只读 Acceptance 报告。
  >
  > ## 只读证明与核对对象
  >
  > 本实例仅有 `Read`/`Grep`/`Glob`，无 `Write`/`Edit`/`Bash`，本轮未做任何写入、提交、推送、重跑。
  > 核对对象：base `3fbca1f` → 最终候选 `150921b`（代码 `97ec829`）的完整 diff（导出 patch 1740 行 / **21 文件**），并与工作树 HEAD `f5217e0` 的跟踪文件交叉对照。全部机械证据（check_task `c0b72e28…`、pytest 525、vitest 363、e2e 41、实现者的多处变异验证）按 **NOT_RUN** 处理，下列判断均建立在独立读码与文件核对之上。我不复审 Reviewer 已完成的代码级结论，只核对完成条件、证据绑定与跨模块自洽。
  >
  > ## 15 条完成条件逐条核对
  >
  > | # | 条件 | 证据位置 | 结论 |
  > | --- | --- | --- | --- |
  > | 1 | 0004 可升可降，既有升降级用例覆盖到 0004 且全绿 | `0004_content_snapshots.py:29-90`（只 create/drop 新表）；`backend/tests/test_migrations.py:32,47,67` head 改 `0004`、表数 `12→13`、非空守卫用例 head 仍停 0004 | 满足（"全绿"为实现者所跑，NOT_RUN） |
  > | 2 | 至多一份快照；PUT 整份替换，`char_count`/`sha256`/`captured_at` 随之更新 | `models.py` `resource_id ... unique=True` + 迁移 `uq_content_snapshots_resource_id`；`snapshot_store.py:put` 逐字段重写含 `captured_at=utc_now()`；`test_snapshots.py:81-93` 断言 version 2 / 新 sha256 / 新 char_count | 满足（`captured_at` 更新只由读码确认，无断言，见 A5） |
  > | 3 | 删资料连带删快照；不影响其他资料的快照 | `test_snapshots.py:702-709`：`kept` 快照放回 → 删 `doomed` → 全表**剩 1 行**且 `kept` 正文可回读；FK `ondelete=CASCADE` 两侧一致，两表间无 ORM relationship | 满足（第一轮缺口已真闭合） |
  > | 4 | 删快照后资料/标签/心得/学习数据/原件不变 | `snapshot_store.delete` 只 `session.delete(record)`；`test_snapshots.py:145-147` 对资料详情做整份投影相等断言（该投影含 `tags`/`progress`/`original_file`） | 满足（心得未创建，属平凡真，与 TASK-035 O1 同类，已由"只写快照表"结构性保证） |
  > | 5 | WEB 快照与 `source_url` 并存，互斥 CHECK 未触碰 | `models.py` 变更为纯插入（`@@ -239,6 +239,59 @@`），`LearningResource` 一字未改；0004 中 `learning_resources` 仅作 FK 目标；`test_snapshots.py:104-124` WEB/PASTE/FILE 各写一次并断言投影不变 | 满足 |
  > | 6 | `format` 仅 MARKDOWN；content 1～1,000,000；越界/空在触库前 422 | `modules/resources/snapshots.py`（`Literal["MARKDOWN"]`、`StringConstraints(1,1e6)`、`not_blank`、`extra=forbid,strict`）；校验在 `command_body` 内、早于 store；`test_snapshots.py:728-738` 8 组 422 | 满足 |
  > | 7 | `FAILED` 必带 `failure_code`，非 FAILED 不带（与 `original_files` 同形） | 迁移 `0004:46-52` 与 `models.py` CHECK **逐字符一致**，两处均含 `failure_code IS NOT NULL`；我独立按 SQLite 三值逻辑逐支求值：FAILED+NULL → 分支 A FALSE、分支 B 在 `IS NOT NULL` 处 FALSE ⇒ 整体 **FALSE ⇒ 拒绝**（第一轮的 NULL 求值路径已消除）。12 组参数化用例我逐组独立推演基准行+覆盖后命中的约束：**12 组全部真能失效，无一平凡**（首组=原缺陷组合命中 `capture_state`；另有 `content_length`/`char_count_bounds`/`sha256_length`/`extractor_length`/`format`/`status` 各自命中）。用例跑在 **迁移建出来的库** 上（`conftest.py:33-44` `database` → `migrate(engine)` → `session_factory`），即运行时真正生效的 DDL | **满足（第一轮不成立，第二轮已实修并首次获得可失效覆盖）** |
  > | 8 | 版本前置与通则一致（428 / 409 只含 `current_version`），且冲突不写入 | `api/snapshots.py:195-204`、`snapshot_store.put/delete`、`api/snapshots.py:128-142`（`details` 仅 `current_version`）；`test_snapshots.py:132-144, 741-748` 覆盖 428/409 并在冲突后回读断言正文未变 | 满足 |
  > | 9 | 资料不存在时读/写/删均 404 RESOURCE_NOT_FOUND，无写入 | `snapshot_store.require_resource` 在三条路径首位；`test_snapshots.py:167-169` 覆盖 GET/PUT/非 UUID。**DELETE 对不存在资料的 404 无任何用例**（该文件所有 delete 均打在存在的 `kept` 上）；参数求值序 `identity()` → `version_header()` → `require_resource()` 我已读码确认与 notes/taxonomy 先例同序 | 满足（行为成立；DELETE 分支仅读码，见 A2） |
  > | 10 | 无快照返回明确"不存在"，前端空态可理解 | 后端 404 `SNAPSHOT_NOT_FOUND`（非空对象）；`api.ts:getResourceSnapshot` 只按**错误码**吞该码返回 `null`；`ContentSnapshot.tsx` 空态文案；vitest 用例一 + e2e `还没有保存正文` | 满足 |
  > | 11 | 有检查证明 `backend/src` 无 HTTP 客户端调用，生产依赖未新增 | `test_snapshots.py:822-834` 真实读文件计算 offenders（可失效、非恒真）；`pyproject.toml`/`uv.lock` **完全不在 diff 中**，且不在 `allowed_paths` | 满足（按原文"有检查证明"判定；"不可绕过"非本条要求，边界已在记录登记） |
  > | 12 | 前端可粘贴/替换/删除并看到正文；错误可理解且不自动重试 | `ContentSnapshot.tsx`（区块常驻、写入失败 `role="alert"`+"没有自动重试"、`busy` 去重）；`ResourcePages.test.tsx` 三条用例（断言 `共 12 字` 元数据而非 textarea 文本、PUT body 含 `expected_version:1`、DELETE `ifMatchVersion:1`、冲突时恰好 1 次 PUT） | 满足 |
  > | 13 | 后端/前端/e2e 全绿，计数只增不减，新增一条走真实后端的 e2e | 记录 line 226：pytest **525**（基线 505）、vitest **363**（基线 360）、e2e **41**（基线 40）；`frontend/e2e/resource-pages.spec.ts:1250-1285` 新用例真跑后端（粘贴→刷新仍在→删除回空态→断言快照与原文链接并存，`Array.from(body).length` 与后端 `len()` 同为码点计数） | 满足（计数与用例存在性可核；绿灯为实现者所跑，NOT_RUN） |
  > | 14 | check_task CHECKS PASS 并记 fingerprint | 记录 line 226：`--candidate 97ec829` → CHECKS PASS、files=21、fingerprint `c0b72e28…` | 满足（NOT_RUN；但记录内有一处自述不实，见 A1） |
  > | 15 | L3 链完整，两份报告原文写回 | 第一轮报告 line 159-217（含 **CHANGES_REQUIRED** 结论与 F1 全文，逐字引用块）、第二轮 line 231-280（PASS，O1/O2）；Acceptance = 本实例，独立于实现者与两轮 Reviewer | 满足 |
  >
  > ## 跨模块 / 治理核对
  >
  > - **范围**：21 个改动文件逐一比对 `allowed_paths`，**全部命中**；`fixtures.ts` 在名单内未改（允许未用）。禁止范围确实未动：`resource_store.py`、`security/local_access.py`、`pyproject.toml`、`0001-0003` 迁移、`ClassificationPages.test.tsx` 均不在 diff 中；`learning_resources` 的列与互斥 CHECK 一字未改。
  > - **安全边界**：新路由落在 `/api/v1/` 前缀内，`LocalAccessMiddleware` 按方法+前缀统一守门（写要求 token+Origin+Sec-Fetch，`if-match` 已在既有 `CORS_HEADERS` 内），无需也未修改安全文件 —— 与任务"只读参照"预期一致。
  > - **契约三方自洽**：openapi `ContentSnapshot.required` 14 项 ⇄ `snapshot_store.FIELDS` 14 项 ⇄ 前端 `ContentSnapshot` 接口逐字段对应；`SnapshotPut` 四字段与 Pydantic 一致（`additionalProperties:false` ⇄ `extra="forbid"`）；错误码表、逐操作 x-error-codes、操作清单与后端实际返回一致；命名约定 `ck_%(table_name)s_%(constraint_name)s` 使模型 `capture_state` 等 8 条 CHECK 名与迁移 `op.f(...)` 精确对齐。
  > - **`compare_metadata` 敏感度**：记录最终写入的版本（EVIDENCE line 284-293 实测表 + 遗留项 line 300"存在与名称有绑定，正文与 server_default 没有"）**与你给的权威表完全相符**。被证伪的"整条漏掉也不会被发现"仅存在于第二轮 Reviewer 的**逐字引用**中，且紧接其后即被实测表更正 —— 逐字写回义务与更正义务两者兼顾，处理得当。
  > - **写回纪律**：`150921b..f5217e0` 我以文件内容侧核对，`status=IN_ACCEPTANCE`、15 条完成条件、目标、`risk`/`risk_flags`/`allowed_paths`/`checks` 与"实现与测试"段均与候选一致；索引该任务行同步为 IN_ACCEPTANCE（§6 明确允许）。第二轮代码修订带动"实现与测试"段更新属 §6 形成新候选的正当路径，非借证据写回。
  > - **重复条目**：`^- Acceptance` 现仅 line 296 **一条**，实现者自陈的漏删已补齐，复核属实。
  >
  > ## Findings（均非阻断，无阻断项）
  >
  > - **A1（记录不实，EVIDENCE 内可零成本更正）** `docs/tasks/TASK-036-content-snapshot.md:150` 称"「实现与测试」段记录的 fingerprint 为最终值 `c0b72e28…`"。实际该段 `:131` 记的是 **`f30a93e1…`，绑定已被取代的代码 SHA `ce22d2a`**；最终值只出现在 EVIDENCE `:226`。触发：读者只读标记区外的实现记录，或以 line 150 为索引去核对指纹。影响：证据与被测内容的绑定叙述不准（真正的绑定 `97ec829 → c0b72e28` 在 line 226 本身是正确的，检查有效性不受影响）。修复：改 line 150 那半句为"该段仍记第一轮指纹，最终指纹见下"—— 属 EVIDENCE 区编辑，**不形成新候选**。
  > - **A2（覆盖缺口 + 一处结论略微说满）** 完成条件 9 的 **DELETE-资料不存在-404 分支无任何用例**（`backend/tests/test_snapshots.py` 内 delete 全部打在存在的资料上）。第二轮 Reviewer 称缺口③"已关闭"，实际新增的 5000 位版本号用例关闭的是 428 分支，404 分支它自己也注明是"读码正确"。我独立读码确认行为正确（`api/snapshots.py:229-234` 参数求值序 → `require_resource` → 404）。风险极低，不要求返工，建议登记为遗留项。
  > - **A3（前端文案，用户可见）** `frontend/src/features/resources/ContentSnapshot.tsx:76` 提示"需要最新内容请用**上方**的「打开原网页」"，但该链接在 `ResourceDetail.tsx:97` 之后、`:102-121` 的"原始网页"区块内 —— 实际在快照区块**下方**，指向错误。同文件 `:69-71` 的空态文案"只存链接的话…"以 WEB 语境写成，却对 PASTE/FILE 资料同样渲染（组件不感知 `source_type`，而条件 5 要求三种来源都能存快照）。触发：任意资料详情页；影响：仅措辞误导，无功能/数据影响。两轮 Reviewer 均未提及。
  > - **A4（既有契约漂移，非本任务引入）** `docs/contracts/openapi-v1.json:9-45` 的 `x-delivery-profile.available_operations` 未加入三个快照操作；该清单自 `stage: "TASK-022"` 起即未更新，**TASK-035 的 `detachAllTagResources`/`mergeTag` 同样缺席**（已合并且经三方审查）。中文契约的"当前可用操作"表已正确新增一行。既有先例 `backend/tests/test_resource_updates.py:485` 会断言该清单包含对应 operationId，故这是一条**机器可读却已停更**的字段。不属本任务完成条件，也不是本任务造成，建议作为独立治理项登记。
  > - **A5（微小覆盖观察）** 条件 2 的 `captured_at` "随之更新"由 `snapshot_store.put` 保证但无断言（时间分辨率下断言也易脆），`content` 值本身的替换已被断言。不要求返工。
  >
  > ## 剩余风险与是否阻断
  >
  > 剩余风险与记录中已登记的一致，且我逐条确认其登记属实、不触及安全或数据底线：不出网靠文本扫描（防意外不防对抗，边界已完整登记）、模型↔迁移的 CHECK **正文**与 `server_default` 无机械绑定（存在与名称有绑定；运行时行为已由 12 组跑在迁移库上的用例覆盖）、openapi↔FIELDS 无自动绑定用例（人工核对一致）、图片未冻结、不渲染 Markdown、无自动抓取、单快照唯一约束、`require_resource` 不复用 FILE-READY 可见性（同码同状态，不泄露信息）。加上本报告 A1-A5，均**不阻断交付**。
  >
  > 须向用户明确：① 全部机械证据由实现者单方运行，两轮 Reviewer 与本 Acceptance 三个只读实例一律 NOT_RUN，无人复跑；② 除 `compare_metadata` 一组由派发会话在隔离环境独立复现外，其余变异验证为实现者自述、无第三方复核，我的结论不依赖该自述；③ 分支仅在本地，合并须用户本人执行。
  >
  > ## 结论
  >
  > **PASS**（针对最终候选 `150921b`，代码 `97ec829`）。15 条完成条件逐条核对**全部满足**：条件 7 的第一轮实质缺陷已实修且首次获得 12 组真能失效、跑在迁移 DDL 上的覆盖；条件 3 后半已真断言；条件 9 行为成立但 DELETE 分支仅读码（A2）；条件 11 按原文"有检查证明"判定成立。范围、写回纪律与契约三方自洽均核对通过。findings 五条全为非阻断（记录精度、覆盖缺口登记、前端文案、既有清单漂移），其中仅 A1 建议在 EVIDENCE 区顺手更正、不形成新候选。

- Acceptance findings 的处置：
  - **A1 已修**（EVIDENCE 区内，不形成新候选）：见本区顶部候选 SHA 条目的更正。我原先声称「实现与测试」段记的是最终指纹，实际那里是第一轮的 `f30a93e1…`；已改为如实说明并指向最终值所在。
  - **A2 记录接受**：完成条件 9 的 DELETE-资料不存在-404 分支确无用例，行为由读码确认正确。同时确认 Acceptance 对第二轮 Reviewer 的纠正成立 —— 5000 位版本号用例关闭的是 428 分支，不是 404 分支，第二轮称缺口③「已关闭」说满了。登记为遗留项。
  - **A3 记录接受，但这是本轮最该反省的一条**：文案「需要最新内容请用**上方**的『打开原网页』」指向错误 —— 我复核确认 `ContentSnapshot` 挂在 `ResourceDetail.tsx:97`，而「原始网页」区块在 `:103` 之后，链接实际在**下方**；空态文案「只存链接的话…」是 WEB 语境却对 PASTE/FILE 同样渲染（组件确不感知 `source_type`）。两轮 Reviewer 都没发现，因为它们的精力集中在 SQL 三值逻辑、flush 顺序、断言可失效性上，**没有人以用户视角把页面读一遍**。这不是谁失职，是审查视角的结构性盲区。是否立即修由用户决定（修则形成新候选、需增量复核）。
  - **A4 不在本任务处理，登记为独立治理项**：`openapi-v1.json` 的 `x-delivery-profile.available_operations` 自 `stage: "TASK-022"` 起停更。我复核确认：清单 35 条，**TASK-035 的 `detachAllTagResources`/`mergeTag` 与本任务三个快照操作全部缺席**，而 `test_resource_updates.py:485`、`test_learning.py:684`、`test_taxonomy.py:483` 三处测试都在读这个字段。属既有契约漂移，非本任务引入，也不在本任务 `allowed_paths` 与完成条件内。
  - **A5 记录接受**：`captured_at` 的更新由实现保证、无断言，时间分辨率下断言本身也脆。不返工。
- **须向用户明确的三点（Acceptance 要求原样保留）**：① 全部机械证据由**实现者单方运行**，两轮 Reviewer 与 Acceptance 三个只读实例一律 **NOT_RUN**，无人复跑；② 除 `compare_metadata` 一组由派发会话在隔离环境独立复现外，其余变异验证均为**实现者自述、无第三方复核**，三个实例的结论均不依赖该自述；③ 分支仅在本地，合并须用户本人执行。
- 最终状态/风险/用户操作：status=**ACCEPTED**。L3 执行链完整：Worker → 自动检查（CHECKS PASS）→ 独立只读 Reviewer 两轮（CHANGES_REQUIRED → 处置 → PASS）→ 独立只读 Acceptance（PASS）。三个审查实例互不相同（本任务用到第六、第六、第七个 reviewer 实例；第二轮为同一实例做增量复核），均只有 Read/Grep/Glob、无 Bash 与写工具、无上下文继承。最终候选 `150921b`（代码 `97ec829`）待**用户本人执行合并**。合并后按既有做法把记录/索引标 MERGED。
- 非阻断遗留项：
  - **「后端不出网」的文本扫描防意外不防对抗**（边界已在「实现与测试」段完整登记）。Reviewer 的可选建议是改成按 import 行的正则、或加断言「生产依赖集合 == 冻结名单」。暂不做的理由：完成条件 11 要的是「有检查证明」，且当前形态已能挡住真实场景里的意外引入。责任角色 coordinator；若将来后端确需出网（例如 TASK-037 改变边界），须连同这条防线一起重评。
  - **模型与迁移之间，CHECK 的正文与 `server_default` 无机械绑定**（存在与名称有绑定，正文与 server_default 没有 —— 见上方 O1 的实测表）。这不是本任务引入的，是仓库既有形态（13 张表同处一条缝），但 F1 正是藏在这里。判为可接受：本任务已把最要紧的绑定补上 —— 12 组约束用例跑在**迁移建出来的库**上，测的正是运行时真正生效的那份 DDL；模型侧文本若漂移只会误导读者，不会让数据库行为出错。可行的通用手段（Reviewer 提供，留给下个任务接手）：SQLite 的 `Inspector.get_check_constraints()` 能从 `sqlite_master` 解出 name + sqltext，可据此做跨表的文本归一化比较；但它需要覆盖全部 13 张表、极可能翻出 0001/0002/0003 的既有差异，且相关文件不在本任务 `allowed_paths` 内，属独立的治理/基础设施任务。责任角色 coordinator；重评触发条件：下次新增带复杂 CHECK 的表，或专门做该基础设施任务时。
  - **图片未冻结**：快照中的图片仍指向原站，冻结并不完整。落点在扩展任务（只有它能绕开 CORS 取到图片字节）。已写入契约 4.13。
  - 不渲染 Markdown、无自动抓取、单快照唯一约束、`require_resource` 不复用 FILE-READY 可见性规则 —— 均见「实现与测试」的已知限制段，Reviewer 已逐条确认无信息泄露或行为差异。
  - Reviewer 列出的两条观察（FAILED 态在前端会渲染成空 `<pre>`，当前不可达；`content` 含 NUL 字符时走 500 而非 422，与基线 `pasted_content` 同性质）—— 均不要求返工。
  - 无 openapi ↔ Pydantic/FIELDS 的自动绑定用例（仓库有此类先例），当前为人工核对一致，属后续漂移风险。
  - **（A2）完成条件 9 的 DELETE-资料不存在-404 分支无用例**：行为由读码确认正确（求值序 `identity` → `version_header` → `require_resource`，与 notes/taxonomy 先例同序）。责任角色 coordinator；重评触发条件：下次触碰快照 API 的任务顺手补一条。
  - **（A3）前端两处文案不准**：① 「需要最新内容请用**上方**的『打开原网页』」—— 该链接实际在快照区块**下方**；② 空态文案以 WEB 语境写成，却对 PASTE/FILE 资料同样渲染（组件不感知 `source_type`）。仅措辞误导，无功能或数据影响。**用户已决定（2026-09-06）：先合并，留到下个任务修**，理由是应用尚无真实用户与数据（`var/studypilot.db` 不存在），一句指错方向的提示当前伤不到任何人；修它则形成新候选、需增量复核与 Acceptance 再确认。责任角色 coordinator；**承接任务：下一个触碰 `ContentSnapshot.tsx` 的任务（预计为阅读器方向的 TASK-037/038）必须一并修掉这两处文案**，并注意其成因不是笔误而是覆盖盲区 —— 该组件的三条 vitest 与一条 e2e 全在断言「文案存在」，没有一条能验证「这句话说的是不是真的」。
  - **（A5）`captured_at` 随写入更新无断言**：由实现保证，时间分辨率下断言易脆。不返工。
- 合并事实（TASK-037 控制面提交写回）：用户本人合并 PR #41，merge commit `32c3750d9a7a8f08674b50144792eeaf3f609515`，其第二父提交为分支末端 `171586d`；最终候选 `150921b` 是 `171586d` 的祖先，其后的三个提交（`f5217e0`、`d16a0b7`、`171586d`）全部是 EVIDENCE 区的证据写回，不含产品变化，故未重新冻结。status 由 ACCEPTED 改为 **MERGED**。A3（`ContentSnapshot.tsx` 的两处文案缺陷）经用户明确批准延期——「可以先合并，因为现在还没有用户使用，可以下个任务再做」——已列入 TASK-037 的完成条件第 9 条；在 TASK-037 合并前 A3 仍未修复。
- 日期与决定日志：2026-09-06 用户在 PR #40 合并后转入阅读器方向讨论。主 Agent 通读调研文档并核实其援引的既有事实（来源互斥 CHECK、`original_files` 模式、Note 表形状）全部属实后，提出三点异议：① 调研 §7 把「快照」与「笔记 selector 字段」并列为「事后无法补做」，但后者可空列事后添加成本相同，不成立；② 调研 §10.6（格式）与 §10.5（图片）被标为可推迟，但按其自身的不可回溯逻辑必须在第一份快照落地前决定；③ 后端抓取会引入首次出网、SSRF 面、两个生产依赖与第二个提取器。用户据此逐条决定：Markdown、图片要冻结、扩展走 UI 页面、顺序取甲、PDF 先做原生版。主 Agent 据用户第 3 条决定进一步推导出图片冻结须与扩展同期（只有扩展能绕开 CORS 取到图片字节），遂将原「爬取前半」收窄为本任务的范围。用户另问及知乎/CSDN 的认证问题，结论为扩展方案下完全不需要凭证，并将「不引入第三方站点凭证」写入明示非目标。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
