# TASK-039：快照图片冻结（后端资产存储）

```toml
schema_version = 2
id = "TASK-039"
status = "IN_PROGRESS"
risk = "L3"
risk_reason = "四项各自都是 L3 判入条件：① 新表 `snapshot_assets` 与 0005 迁移（关键数据模型）；② 新增公共 API 操作与错误码，并首次让后端返回**外部站点的原始字节**给浏览器消费（安全面）；③ 改动资料安全删除的影响清单与受控文件隔离路径 —— 漏掉即产生已删除资料的图片字节永久滞留在受控目录（数据残留）；④ 冻结资产与快照正文同为不可回溯资产，归属语义（挂快照还是挂资料）、替换时的作废语义与去重键在第一版必须定对，事后迁移无法为存量数据补齐。不改核心表 `learning_resources`、不改其来源互斥 CHECK、不改本机访问门禁、后端仍不出网。"
risk_flags = ["migration", "public-api", "security", "critical-data", "sensitive-storage", "deletion"]
owner = "coordinator"
base = "e9372015c42e55856ae8ba47884506444822f374"
allowed_paths = [
  "backend/migrations/versions/0005_snapshot_assets.py",
  "backend/src/studypilot/main.py",
  "backend/src/studypilot/api/resources.py",
  "backend/src/studypilot/api/snapshots.py",
  "backend/src/studypilot/api/snapshot_assets.py",
  "backend/src/studypilot/api/file_upload.py",
  "backend/src/studypilot/application/snapshots.py",
  "backend/src/studypilot/application/files.py",
  "backend/src/studypilot/infrastructure/database/file_store.py",
  "backend/src/studypilot/application/snapshot_assets.py",
  "backend/src/studypilot/infrastructure/database/models.py",
  "backend/src/studypilot/infrastructure/database/snapshot_store.py",
  "backend/src/studypilot/infrastructure/database/asset_store.py",
  "backend/src/studypilot/infrastructure/database/resource_store.py",
  "backend/src/studypilot/infrastructure/files/storage.py",
  "backend/src/studypilot/infrastructure/files/images.py",
  "backend/src/studypilot/modules/resources/snapshots.py",
  "backend/src/studypilot/modules/resources/assets.py",
  "backend/tests/**",
  "docs/contracts/API与数据契约基线.md",
  "docs/contracts/openapi-v1.json",
  "docs/tasks/TASK-038-extension-capture.md",
  "docs/tasks/TASK-039-snapshot-assets.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

### 用户授权/相关需求章节

- 2026-09-06 用户合并 TASK-038（PR #43，merge `e937201`）后指示「继续 TASK-039」，并当面确认三项范围决定：
  1. **后端先行**：本任务只做后端资产存储，扩展侧的抓图、上传与正文渲染改写另起 TASK-040。理由是与 TASK-037（工程基线）→ TASK-038（功能）那次成功的拆法同形，两个 diff 都能被认真审完；代价是本任务交付时用户界面上看不到任何变化（见「已知取舍」第 1 条）。
  2. **尽量全冻结**：不设每篇张数上限，单图上限放宽到 10 MiB。用户明确接受「单份资料可能占几百 MB 本机空间、采集耗时变长」这一代价。
  3. **确认页每次新开标签页**（TASK-038 遗留 A2）**不在本任务插队修**，并入 TASK-040 一起改。
- 需求依据：`docs/contracts/API与数据契约基线.md` §4.13 已明文登记「快照中的图片仍指向原站，尚未冻结 …… 冻结图片属二进制资源，需与受控文件目录配合，留待后续任务」。
- 上游遗留：TASK-038 遗留 **G（图片不冻结）** 的重评触发条件即为本任务。

### 目标

1. 让一份正文快照可以拥有**任意多张已冻结的图片字节**，存放在既有的受控文件目录里，与快照同生命周期。
2. 提供上传、列出、取字节、删除四个操作，使 TASK-040 的扩展能在采集时把页面上已加载的图片交给本机保存。
3. 保证资产在**快照被替换、快照被删除、资料被删除**三条路径上都不留下孤儿字节。

### 非目标（明示不做）

- **不做扩展侧任何改动**。`extension/` 一个字不改，抓图、上传时机与失败降级属 TASK-040。
- **不做前端任何改动**。`frontend/` 一个字不改；把正文里的原站图片地址替换成本机资产、以及 Markdown 渲染，都属 TASK-040 及其后的阅读器方向。
- **不改写快照正文**。见下方关键设计决定 ②。
- **后端仍不出网**：不发起任何对外网络请求、不引入 HTTP 客户端或图像处理依赖。图片字节只能由调用方上传。TASK-036 建立的 `test_backend_makes_no_outbound_network_calls` 文本扫描继续有效，本任务不得使其失效。
- **不改本机访问门禁**（`local_access.py` 一个字不改）。见关键设计决定 ④。
- **不做跨快照/跨资料的字节去重**，不做图片压缩、缩略图、格式转换或 EXIF 清洗。
- **不冻结 SVG**。见关键设计决定 ③。
- **不做多版本快照**、不做资产的版本化修改（资产只有新增与删除两种写）。

### 禁止范围

所有未列入 `allowed_paths` 的路径；额外禁止项：`extension/**`、`frontend/**`、`backend/src/studypilot/infrastructure/security/**`、`scripts/governance/**`、`AGENTS.md` 与 `docs/governance/**`。

### 依赖/前置条件

- 基线 `e937201`（main，TASK-038 已合并）。
- 依赖既有且不改动的三处事实：`LocalFileStorage` 的 `staging`/`objects`/`trash` 私有随机键存储、`content_snapshots` 表（0004）、本机访问门禁。

### 顺带完成的状态登记

`docs/tasks/TASK-038-extension-capture.md` 在 `allowed_paths` 内，**仅用于把它的 `status` 由 `ACCEPTED` 登记为 `MERGED`**（用户 2026-09-06 已合并 PR #43，merge commit `e937201`），并在其 EVIDENCE 区如实更新三处：合并事实、A2 的去向改为 TASK-040 并记下已核实的零新增权限方案、以及那行模板残留的重复「非阻断遗留项：待填」改为指向上方真正的 A–L 清单。依据是根 `AGENTS.md` §5「合并后……状态登记可并入下一个已授权任务的控制面提交」，不为收尾另造 PR。**除此之外不改该记录一个字**，尤其不触碰其目标、风险、路径、检查与实现测试记录。

### 并行

否。唯一写入者 `coordinator`，串行。TASK-040 必须在本任务合并后才能开始 —— 它依赖本任务冻结的契约形状。

## 关键设计决定

以下七条是本任务的实质内容，均为在写代码前必须定死、事后无法为存量数据补做的选择。

### ① 资产挂在快照上，不挂在资料上；表为 `snapshot_assets`

现有两张表都装不下图片，这一点已逐条核实：

| 表 | 为什么装不下 |
| --- | --- |
| `content_snapshots` | `content` 是 `Text`（Markdown 正文），且 `UNIQUE(resource_id)` —— 一份资料一份正文，没有承载多张二进制的位置 |
| `original_files` | `UNIQUE(resource_id)` —— 一份资料只能有一个原件；且 `formats.py::MEDIA_TYPES` 白名单只有 pdf/doc/docx/md/txt，**不含任何图片类型** |

新表 `snapshot_assets` 的外键指向 `content_snapshots.id`（`ondelete="CASCADE"`）而非 `learning_resources.id`。理由：图片是**某一份正文**的组成部分，不是资料的独立附件；挂在快照上时「换了正文 → 旧图作废」是外键的自然语义，挂在资料上则需要额外的一致性维护。

### ② 正文一字不改；原站地址 → 本机资产的映射走旁路

本任务**不改写快照正文里的图片地址**。`content_snapshots.content` 保持采集时的原样（图片仍写着原站 URL）。资产表用 `source_url` 记录这张图在正文里的地址，调用方在**渲染时**按 `source_url` 把正文中的引用换成本机资产地址。

为什么不改写正文（本任务最重要的一条）：

- 改写正文意味着每传一张图就要 `PUT` 一次正文，而 `putResourceSnapshot` 是整份替换且带版本前置条件 —— 一篇 50 张图的文章会产生 50 次版本推进与随时可能失败的冲突重试链，任何一次中断都留下「正文改了一半」的状态。
- 原站地址是**溯源信息**。正文被改写后就再也无法回答「这张图当初来自哪里」，而这正是冻结要保住的东西之一。
- 旁路映射让资产成为纯粹的增量：没有资产时正文照样可读（图片指向原站，退化回今天的行为），有资产时渲染方替换。**降级路径天然存在，不需要额外设计。**

### ③ 按字节魔数识别类型，只收四种，明确排除 SVG

新增 `infrastructure/files/images.py`，按文件头字节识别 `image/png`、`image/jpeg`、`image/gif`、`image/webp` 四种，**不信任**上传方声明的 `Content-Type`、不信任 `source_url` 的后缀、不信任原站响应头 —— 这三者都由不可信的外部页面决定。

不复用 `formats.py::recognize`：它按**文件名后缀**查表并对复杂容器派生子进程做结构校验，两项对图片都不适用（资产没有用户提供的文件名，且不需要容器解析）。

**排除 SVG 是安全决定，不是省事**：SVG 是可执行 XML，可携带 `<script>` 与外链。冻结一张 SVG 等于把外站脚本存进本机受控目录，而本机 UI 与后端同源。四种位图格式没有这个性质。

### ④ 字节只能用 fetch 取，`<img src>` 直连会被门禁拒绝——这是门禁正确工作

本机访问门禁对每个 `/api/v1/*` 请求要求 `sec-fetch-dest: empty`、`sec-fetch-mode: cors`、`sec-fetch-site: same-origin` 三个头齐备，外加 `x-studypilot-token`。浏览器发出的 `<img src>` 请求 `sec-fetch-dest` 为 `image` 且不带任何自定义头，**必然被拒**。

因此取字节的端点只能由已持令牌的调用方用 `fetch()` 取回，再经 `URL.createObjectURL(blob)` 交给 `<img>`。这条约束必须写进契约，否则后来者会以为端点可以直接塞进 `src` 并误判为缺陷。

**明确不采纳**的替代方案：放宽门禁接受 `sec-fetch-dest: image`、或改用 URL 内令牌。前者削弱一道已加固的安全边界来换取渲染便利；后者会把令牌写进图片地址，从而进入浏览器历史、referrer 与前端日志。二者都是拿安全换省事。

### ⑤ 资产字节必须让既有的孤儿回收认识，否则第二天会被删掉

`FileService.reconcile()` 每 60 秒跑一次，把受控目录里**修改时间超过 24 小时、且不在 `FileRepository.references()` 里**的文件直接 `discard()`。而 `references()` 只遍历 `original_files`（`file_store.py:87-93`）。

因此若资产字节直接放进 `objects/`，它们对这套回收而言就是孤儿：**上传当天一切正常，第二天图片全部消失，且不会有任何报错** —— 数据库行还在，字节没了，表现为取字节时 409。

两条可行路径，本任务选后者：

- 给资产另开一个存储区（`orphans()` 只扫 `staging`/`objects`/`trash` 三个区，新区天然不被扫）。代价是资产从此没有任何回收，隔离后的字节永久堆积，等于把问题推给将来。
- **扩展 `references()` 让它同时认识 `snapshot_assets` 的键**。一套回收、一套隔离宽限期，语义与原件完全一致：行还在 → 字节受保护；行被删、字节进 `trash/` → 24 小时后被回收。**本任务选这条。**

连带的一致性要求：上传时的暂存键必须走 `FileService.begin()`（它把键登记进 `self.active`，使回收不会删掉正在写入的暂存文件），不能自己调 `LocalFileStorage.begin()` 绕过。

### ⑥ 三条销毁路径必须同时闭合

| 路径 | 现状 | 本任务必须做什么 |
| --- | --- | --- |
| 替换正文（`putResourceSnapshot`） | 现有实现整份替换 `content`，`version + 1` | 同一事务内隔离并删除该快照的**全部**资产 —— 新正文与旧图片不再对应 |
| 删除快照（`deleteResourceSnapshot`） | 删快照行 | 同上 |
| 删除资料（`confirmResourceDeletion`） | `resource_store.py:400` 只隔离 `original_files` 中 `status == "READY"` 的 `storage_key`；影响清单 `DELETION_IMPACT_KEYS` 六个计数**不含快照，更不含资产** | 把资产的 `storage_key` 并入待隔离集合，并在影响清单中新增 `snapshot_asset_count` |

第三条是**本任务发现的、必须处理的实质问题**：`content_snapshots` 与新表都靠外键 `CASCADE` 删行，但 `CASCADE` 只删数据库行，**删不掉磁盘上的字节**。若不处理，用户删除一份资料后，它的全部图片会永久滞留在受控目录里 —— 既是磁盘泄漏，也是「用户以为删干净了但没有」的数据残留。

新增 `snapshot_asset_count` 会改变删除预览的公共响应形状，属公共契约变更，已计入 L3。

### ⑦ 先落字节再落行；中途死掉只留可回收的孤儿字节，绝不留指向空处的行

上传的写入顺序固定为：暂存 → 识别类型 → 提升到 `objects/` → 插入数据库行。**不引入 `PENDING` 状态机**（`original_files` 那套是为「先建行、后传字节」的上传流程服务的，资产的字节在建行前就已经在手上）。

两个方向的中断各自的后果：
- 提升成功、插入失败或进程死亡 → `objects/` 里多一份无人引用的字节，24 小时后被既有回收清掉（因为决定 ⑤ 让回收认识资产键，**未被任何行引用**的键仍然是孤儿）。
- 插入成功、字节不在 → 不可能发生，因为插入在提升之后。

反过来（先插行后提升）会产生「行说有图、磁盘上没有」的状态，而资产没有 `original_files` 那套 `status`/`reconcile` 修复机制，那种行会永久返回错误。

## 完成条件

可观察结果，逐条须有证据：

1. **建表**：0005 迁移新建 `snapshot_assets`，字段至少为 `id`、`snapshot_id`(FK → `content_snapshots.id`, CASCADE, index)、`source_url`、`storage_key`(unique)、`media_type`、`size_bytes`、`sha256`、`created_at`；`UNIQUE(snapshot_id, source_url)`；`media_type` 以 CHECK 约束枚举四种位图类型。升级后表数由 13 增至 14，`test_migrations.py` 的精确相等断言随之更新且仍为精确相等。
2. **迁移可回退**：`downgrade` 能把库退回 0004，且退回后 13 张表与 0004 一致。
3. **上传**：`POST /api/v1/resources/{id}/snapshot/assets` 接受一次一张图的 multipart 上传（字段 `file` 与 `source_url`），成功返回 201 与该资产的元数据；**响应中不出现 `storage_key`**（内部存储键不外露）。
4. **上传须带版本前置条件**：请求携带 `If-Match` 为**当前快照版本**；缺失 428、不符 409 且不写入任何字节。上传成功**不推进**快照 `version`（资产是旁路，与 TASK-035 的批量关联不推进资料版本同形）。
5. **类型按字节判定**：正确的 PNG/JPEG/GIF/WebP 字节被接受；把 PNG 字节声明成 `image/svg+xml` 仍按 PNG 接受；把任意非图片字节（含一段合法 SVG 文本、一段 HTML、一个 PDF）声明成 `image/png` 一律 415 `ASSET_TYPE_UNSUPPORTED`，且不落库、不留字节。
6. **大小上限**：单图上限 10 MiB（10 × 1024 × 1024）。超限返回 413 `ASSET_TOO_LARGE`，且**在流式读取中途即中断**，不把超限内容读进内存或落到磁盘。**不设每篇张数上限**（用户决定，见已知取舍第 2 条）。
7. **同图去重**：同一 `source_url` 在同一快照内重复上传不产生第二行、不产生第二份字节；返回既有资产（幂等）。
8. **列出**：`GET /api/v1/resources/{id}/snapshot/assets` 返回该快照的全部资产元数据（含 `source_url`，不含 `storage_key`），顺序稳定。
9. **取字节**：`GET /api/v1/resources/{id}/snapshot/assets/{asset_id}/bytes` 返回原始字节，`Content-Type` 为**识别出的**类型而非上传方声明的类型，并带 `X-Content-Type-Options: nosniff` 与 `Cache-Control: private, no-store`。字节与上传时的 `sha256`、`size_bytes` 逐字节一致（复用 `LocalFileStorage.read` 的校验，损坏即 409 而非返回半份内容）。
10. **删除单张**：`DELETE /api/v1/resources/{id}/snapshot/assets/{asset_id}` 带 `If-Match` 快照版本；成功 204，行被删且字节被隔离到 `trash/`。
11. **替换正文清空资产**：对已有 3 张资产的快照做一次 `putResourceSnapshot`，之后列出资产为空，且 3 份字节都已从 `objects/` 移入 `trash/`（不是留在原处、也不是直接 unlink）。
12. **删除快照清空资产**：同上，经 `deleteResourceSnapshot` 验证。
13. **删除资料清空资产**：删除一份带资产的资料后，其全部资产字节已被隔离；删除预览的影响清单包含新增的 `snapshot_asset_count` 且计数正确；确认令牌在资产数量变化后失效（沿用既有 `impact_revision` 机制，须有用例证明资产计入了 revision）。
14. **归属隔离**：用 A 资料的 `resource_id` 取 B 资料快照的资产返回 404 `SNAPSHOT_ASSET_NOT_FOUND`，不泄露该资产是否存在；资料不存在、快照不存在、资产不存在三种情形的响应码与既有快照端点的口径一致。
15. **后端不出网**：`test_backend_makes_no_outbound_network_calls` 仍绿，且本任务未新增任何生产依赖（`pyproject.toml` 不在 `allowed_paths` 内，因此这一条是结构性保证）。
16. **门禁未改**：`local_access.py` 在最终 diff 中为零改动；且有一条用例证明缺 `x-studypilot-token` 或 `sec-fetch-dest` 不为 `empty` 时，取字节端点同样被拒（即 ④ 所述行为已被机器固定，而非只写在文档里）。
17. **契约三方一致**：openapi 新增的 schema 与操作、中文契约 §4.14、后端实际返回三者的字段集合与错误码逐项对应；既有 `ContentSnapshot` schema 与三个既有快照操作的**响应形状一字未改**（新增的是并列的资产操作，不是改造快照对象）。
18. **测试计数只增不减**：backend pytest 数量在基线之上净增，既有断言无删除、无弱化；`frontend` 与 `extension` 两组的计数应与基线**完全一致**（本任务不碰这两处）。
19. **资产不被孤儿回收误删**：`FileRepository.references()` 覆盖 `snapshot_assets` 的 `storage_key` 与其 `trash_key`；须有用例把资产字节的 mtime 改到 24 小时以前后跑一次 `reconcile()`，断言字节仍在、且取字节仍然成功。同一用例须证明**行被删后**的资产字节在同样条件下**会**被回收（否则隔离就成了永久堆积）。
20. **暂存不被误删**：资产上传走 `FileService.begin()`，上传进行中的暂存键在 `self.active` 内，`reconcile()` 不会删它。

## 上下文包

- 规则：`AGENTS.md`（V2 总则）、`docs/governance/风险分级与检查规则.md`。
- 必读源文件（均已在登记阶段读过，实现时按需回读）：
  - `backend/src/studypilot/infrastructure/files/storage.py` —— 复用的私有随机键存储，注意 `KEY` 正则只认 `staging|objects|trash` 三个区，`_bytes` 用 `MAX_FILE_BYTES`(25 MiB) 作上界，资产的 10 MiB 上限须在其之上另行判定，不能靠它兜底。
  - `backend/src/studypilot/api/file_upload.py` —— 有界流式 multipart 解析器，资产上传按同形实现（部件数上限、头大小上限、边读边算 sha256、超限即断）。
  - `backend/src/studypilot/api/snapshots.py` / `application/snapshots.py` / `infrastructure/database/snapshot_store.py` —— 资产端点的错误处理、版本头解析、短事务形态照此实现。
  - `backend/src/studypilot/infrastructure/database/resource_store.py:255-403` —— `_deletion_snapshot` 与 `confirm_deletion`，完成条件 13 改这里。
  - `backend/src/studypilot/infrastructure/security/local_access.py:17` 的 `FETCH` 常量 —— 关键设计决定 ④ 的依据，只读不改。
  - `backend/src/studypilot/api/files.py` —— 取字节端点的响应头照此形态。
- 契约章节：`docs/contracts/API与数据契约基线.md` §4.13（ContentSnapshot，本任务在其后新增 §4.14）、§12（错误码）、操作清单与操作表。
- 新增错误码：`SNAPSHOT_ASSET_NOT_FOUND`(404)、`ASSET_TYPE_UNSUPPORTED`(415)、`ASSET_TOO_LARGE`(413)。复用既有 `RESOURCE_NOT_FOUND`、`SNAPSHOT_NOT_FOUND`、`VERSION_REQUIRED`、`VERSION_CONFLICT`、`VALIDATION_ERROR`、`MALFORMED_REQUEST`、`CONTENT_TYPE_UNSUPPORTED`。
- 检查命令：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-039-snapshot-assets.md --worktree`（自动选组：路径范围、分支/基线、空白、敏感模式、JSON、OpenAPI、backend、契约）。`checks` 留空即按变更自动选组，不减项。

## 已知取舍（登记时即知，非交付后补记）

1. **本任务交付时用户界面上看不到任何变化**。表建好、端点通了，但没有任何调用方 —— 扩展与前端都在 TASK-040。这是用户明确选择的拆法。风险是「建好了但没人用」的表若形状定错，要等 TASK-040 才暴露；缓解办法是完成条件 3–14 全部按 TASK-040 的真实调用顺序编写用例（上传→列出→取字节→替换正文→资产清空）。
2. **不设每篇张数上限**是用户明确决定。代价：单份资料的资产总量无上界，一篇图多的长文可能占用几百 MB 本机空间，且 TASK-040 的采集耗时随图片数线性增长。**这不是疏漏**；若日后磁盘占用成为实际问题，再另起任务加总量上限，届时须处理「已超限的存量资料怎么办」。
3. **跨快照不做字节去重**：同一张图出现在两份资料里会存两份。理由是引用计数会让三条销毁路径都变成「减一后判零再隔离」，复杂度与出错面显著上升，而本机个人使用场景下重复图片的空间代价可接受。
4. **不清洗 EXIF**：冻结的是原始字节。个人本机使用、图片来自用户自己正在看的公开网页，且清洗需引入图像处理依赖（与「不引入依赖」冲突）。
5. **`content_snapshots` 至今不在删除影响清单里**（TASK-036 遗留，非本任务引入）。本任务只新增 `snapshot_asset_count`，**不顺手补 `content_snapshot_count`** —— 那会改动一条与本任务无关的既有公共响应，且 TASK-036 的完成条件 3 已按「快照随 CASCADE 消失」验收过。如需补，另起任务。

## 实现与测试

- 实现 SHA/变更摘要：待填
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：待填
- 已知限制/未完成项：待填

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：L3，两位独立只读 Reviewer，待填
- Acceptance：L3，独立只读，待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项（仅有真实问题时）：待填
- 日期与决定日志：2026-09-06 用户合并 TASK-038（PR #43，merge `e937201`）后指示继续 TASK-039，并就三项范围问题作出决定：后端先行（扩展另起 TASK-040）、尽量全冻结（不设张数上限、单图 10 MiB）、确认页标签页复用并入 TASK-040。主 Agent 在登记阶段核实了四项既有事实作为设计依据：`content_snapshots.content` 为 Text 且 `UNIQUE(resource_id)`、`original_files` 为 `UNIQUE(resource_id)` 且 media-type 白名单不含图片、`LocalFileStorage` 的三区私有随机键存储可直接复用、本机访问门禁的 `FETCH` 常量要求 `sec-fetch-dest: empty` 因而 `<img src>` 必然被拒。并在核 `resource_store.py:255-403` 时发现删除资料的隔离集合只覆盖 `original_files`、影响清单六个计数不含快照与资产 —— 若不处理，`CASCADE` 删行删不掉磁盘字节，会产生已删除资料的图片永久滞留，遂将其列为完成条件 13。 实现开工前复核 `application/files.py` 与 `file_store.py` 时又发现第二处同类问题：`reconcile()` 的 24 小时孤儿回收只认识 `original_files`，资产字节放进 `objects/` 会在次日被静默删除（行还在、字节没了）。据此扩大 `allowed_paths` 两个文件、新增关键设计决定 ⑤ 与完成条件 19/20，并在登记阶段（尚未冻结候选、尚未进入实现）完成本次范围修订。
<!-- EVIDENCE:END -->
