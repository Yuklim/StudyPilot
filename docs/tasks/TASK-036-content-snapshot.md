# TASK-036：正文快照（`content_snapshots` 表 + 手动录入 + 详情页展示）

```toml
schema_version = 2
id = "TASK-036"
status = "IN_REVIEW"
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
  - 共享工作树监测：跑长检查前后各记一次未跟踪文件 `docs/research/阅读器与标注能力调研.md` 的 sha256，两次均为 `f56cad6b…`，**本次无第三方并发写入**。运行 `check_task` 时按既有做法把该未跟踪目录临时移出、跑完原样放回，未删除或修改。
- 已知限制/未完成项：
  - **图片未冻结**：快照中的图片引用仍指向原站，原站失效时图片一并失效，因此当前冻结**并不完整**。这不是疏漏而是排期：可靠取回图片字节需要绕开 CORS，只有浏览器扩展做得到（后端取得到但本任务明示不出网）。已写入契约 4.13。
  - **不渲染 Markdown**：详情页展示的是源码。渲染与阅读体验属阅读器任务。
  - **无自动抓取**：正文只能手动粘贴。`FAILED` 状态形态已建好但本阶段不产生。
  - `SnapshotStore.require_resource` 直接查 `learning_resources`，未复用 `ResourceStore.find` 的「FILE 资料须 READY 才算可见」规则。差异只在一个理论边界：对一个仍在 PENDING 的 FILE 资料，快照端点会返回 404 SNAPSHOT_NOT_FOUND 而不是 404 RESOURCE_NOT_FOUND —— 两者同码同状态，不泄露信息也不改变行为。为避免与 `resource_store.py`（不在 allowed_paths）耦合而未复用。
  - 一份资料仍限一份快照（`UNIQUE(resource_id)`）。多版本快照与版本对比未做，放宽该唯一约束即可支持。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填。
- Review：L3 独立只读 Reviewer，待填。
- Acceptance：L3 独立只读 Integration/Acceptance，待填。
- 最终状态/风险/用户操作：待填。
- 非阻断遗留项：待填。
- 日期与决定日志：2026-09-06 用户在 PR #40 合并后转入阅读器方向讨论。主 Agent 通读调研文档并核实其援引的既有事实（来源互斥 CHECK、`original_files` 模式、Note 表形状）全部属实后，提出三点异议：① 调研 §7 把「快照」与「笔记 selector 字段」并列为「事后无法补做」，但后者可空列事后添加成本相同，不成立；② 调研 §10.6（格式）与 §10.5（图片）被标为可推迟，但按其自身的不可回溯逻辑必须在第一份快照落地前决定；③ 后端抓取会引入首次出网、SSRF 面、两个生产依赖与第二个提取器。用户据此逐条决定：Markdown、图片要冻结、扩展走 UI 页面、顺序取甲、PDF 先做原生版。主 Agent 据用户第 3 条决定进一步推导出图片冻结须与扩展同期（只有扩展能绕开 CORS 取到图片字节），遂将原「爬取前半」收窄为本任务的范围。用户另问及知乎/CSDN 的认证问题，结论为扩展方案下完全不需要凭证，并将「不引入第三方站点凭证」写入明示非目标。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
