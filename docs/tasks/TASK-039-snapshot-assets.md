# TASK-039：快照图片冻结（后端资产存储）

```toml
schema_version = 2
id = "TASK-039"
status = "IN_ACCEPTANCE"
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

- **实现 SHA**：第一轮 `e1e2b53`（base `e937201`，21 个文件）；**处置两位 Reviewer 的 F1 后为第二轮修订**，改动见下方「第一轮 Review 处置」。全部文件仍在 `allowed_paths` 内。
  - **数据层**：`models.py` 新增 `SnapshotAsset`（不继承 `Versioned` —— 资产只有新增与删除两种写）；`0005_snapshot_assets.py` 建表。`compare_metadata(context, Base.metadata) == []` 证明的是**字段层面**一致（表、列名/类型/可空/`server_default`、索引与唯一约束）——alembic 的 autogenerate **不比较 CHECK 约束，也不比较外键的 `ondelete`**，而这两项恰是本表语义的核心，因此该断言证明不到它们（此点由 R1 指出，原记录「证明逐字段一致」的措辞宽于证据，已更正）。这两部分为人工逐字比对，R1 独立复核后确认全部对上；`asset_store.py` 是新的只写该表的适配器，每个读都按所属资料收窄。
  - **存储层**：`images.py` 按文件头字节识别四种位图（PNG 另核 `IHDR`、WebP 另核 RIFF 第 8 字节的 `WEBP`）；`storage.py` 新增 `inspect_image`，与 `inspect` 共用 `_bytes` 但不走文件名与容器解析。**未新增任何生产依赖**。
  - **应用层**：`snapshot_assets.py` 的 `AssetService` 复用 `FileService` 的锁与 active 暂存集合（不自己调 `LocalFileStorage.begin`），顺序为「暂存 → 识别 → 提升 → 落行」；`snapshots.py` 的 `put`/`remove` 改为在同一事务内先清资产行、再写快照，提交后隔离字节。
  - **接口层**：`snapshot_assets.py` 有自己的 `MESSAGES` 与 `failure`（不复用快照那份，避免把资产错误码塞进快照的表），multipart 读取器按 `file_upload.py` 同形实现但去掉文件名与声明类型两处；四个路由挂在 `/api/v1/resources/{id}/snapshot/assets` 下。
  - **删除路径**：`resource_store.py` 的 `_deletion_snapshot` 经 `content_snapshots` join 出资产，写进 `manifest["snapshot_assets"]`、`DELETION_IMPACT_KEYS` 新增 `snapshot_asset_count`、`storage_keys` 并入资产键。
  - **回收**：`file_store.py` 的 `references()` 增读 `snapshot_assets`，同时纳入其 `storage_key` 与 `trash_key`。
  - **契约**：openapi 新增 4 个 schema、3 个响应组件、3 条路径共 4 个操作，并给 `DeletionImpact` 加 `snapshot_asset_count`（含两处示例）；中文契约新增 **§4.14**、4.12 关系表一行、第 9 节绑定字段清单、§10 操作表四行、§12 错误码三行与逐操作错误码四行，1.3 交付状态段补一句。**既有 `ContentSnapshot` schema 与三个快照操作的响应形状一字未改。**
- **命令与真实退出结果**（全部由实现者本人在本机运行，无第三方复核）：
  - `backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-039-snapshot-assets.md --worktree` → **CHECKS PASS**，`profiles=backend,contracts`，含 ruff format/lint、mypy、pytest、`uv build --offline` 与 OpenAPI 模型校验，各步 `exit=0`。**这一次是在第一轮 Review 的 F1 修复之后重跑的**（两位 Reviewer 都指出原记录没写明这一点）。
  - `pytest` → **550 passed**，基线 **525**，净增 **25**（新文件 `tests/test_snapshot_assets.py`；第二轮由 23 增至 25）。
  - `mypy .` → `Success: no issues found in 77 source files`。`ruff check` / `ruff format --check` → 全绿。
  - **未运行 `frontend` 与 `extension` 两组**：本任务在这两棵树下零改动，检查脚本据变更自动选组因而未选中它们。**这是结构性论据，不是观察到的计数相等** —— 完成条件 18 中「两组计数与基线完全一致」这一半没有实跑证据。
  - `--candidate ffd88c9 --static-only` → **STATIC PASS**，`files=21`，`product_fingerprint=32a1ca98b0b8749e0fcb3904f225560e9f95938e32d6ba31c847e21cf85c4f37`。该值与修复后 `--worktree` 那次算出的指纹相同，因此上面那条 `CHECKS PASS` 对应的确实是候选 `ffd88c9` 的内容。**第一轮候选 `e1e2b53` 的旧指纹行已删除**（它指向已被取代的 SHA）——两位 Reviewer 都指出删了旧行却没补新行，本行即为补齐。
  - 环境：macOS Darwin 25.5.0、`backend/.venv`（Python 3.13）、SQLite 文件库；每个用例用 `tmp_path` 独立的数据库与受控目录。
- **既有断言无删除、无弱化**：只改了两处，且都仍是精确相等 —— `test_migrations.py`（head `0004`→`0005`、表数 `13`→`14`）与 `test_resource_deletion.py`（影响字典多一个键，仍为整字典 `==`）。
- **第一轮 Review 处置（两位 Reviewer 独立发现同一缺陷；R2 判为阻断，已接受）**：
  - **F1 修复**：`api/snapshots.py` 的 `failure()` 原为 `MESSAGES[error.code]`。本任务让写/删快照首次触碰受控目录（`assets.isolate` → `quarantine` 可抛 `STORAGE_PATH_UNAVAILABLE`），该码不在那份 `MESSAGES` 里 —— KeyError 会在**正在构造错误响应的那个 handler 内部**抛出，逃出路由后由 Starlette 最外层返回**裸 500 纯文本**：没有 `code`、没有 `request_id`、不经 `protected_send` 因而也没有 `Cache-Control`。违反契约 §2.2 与第 86 行。**要害是本次引入的不对称**：同一个 diff 里的新文件 `api/snapshot_assets.py` 已用 `MESSAGES.get(..., UNKNOWN_ERROR)` 防了这一手，兄弟文件被漏掉。改为 `.get` 兜底并补 `STORAGE_PATH_UNAVAILABLE` 文案。
  - **契约同步**：openapi 给 `putResourceSnapshot`/`deleteResourceSnapshot` 补 `503` 响应与 `STORAGE_PATH_UNAVAILABLE` 错误码，两处 description 说明为何现在会触碰存储；中文契约 §10 两行、逐操作错误码两行、§4.13 写入语义段同步。
  - **回归用例并经变异验证**：`test_a_failed_isolation_still_answers_in_the_error_envelope` 断言 503 时仍是完整信封且 `request_id` 与响应头一致。**把修复回退后该用例失败于 `KeyError: 'STORAGE_PATH_UNAVAILABLE'`，与两位 Reviewer 描述的失败形态逐字相同**；恢复后通过。
  - **N2 条件 9 的直证补齐**：新增 `test_the_served_content_type_is_the_recognized_one_not_the_declared_one`（声明 `image/png`、字节是 GIF，断言响应头为 `image/gif`）。原先只有元数据被断言过，取字节的响应头那条是靠传递性推出的。
  - **N4 补断言**：删资料用例增加「资产行数归零」与「其后一次 `reconcile` 收走 trash」两条。若行残留，`references()` 会永久钉住其 trash 键，隔离区变成永久堆积 —— 正是设计决定 ⑤ 要避免的形态，此前无断言。
  - **不修的三条，及理由**：R1 的 **F2**（同址并发上传返回 500）—— `create` 全程持 `FileService.lock`，同进程内不可达，只有多进程共库才可能，本部署没有；**F3**（CHECK 正文与 `IMAGE_MEDIA_TYPES` 双源）—— 加第五种格式时必然要动迁移，测试会拦住，属可维护性提示；R2 的 **N1**（前端受影响处是四处而非记录里写的一处）—— 结论「不报错、只少报」属实，覆盖面已按 R2 的定位补全，见已知限制 2。
- **完成条件中仍未被测试直证的部分（如实标注，不以「不阻断」顶替「是否满足」）**：
  - **条件 6 部分满足**：「超限**在流式读取中途即中断**」——用例只证明了返回 413 且事后无残留字节；TestClient 无法区分「中途拒」与「读完再拒」。中断机制由 `part_data` 超限即抛加 `feed` 的总量上限**可由代码论证**，但不是测试证明的。
  - **条件 2 部分满足**：`downgrade` 全链路确实执行（降到 base 再重升到 14 张表），但「退回后 13 张表与 0004 一致」这一句没有对应断言。
  - **条件 20 部分满足**：用例直接调 `FileService.begin()`，证明的是 active 集合的语义，不是「上传端点确实走了它」；后者由 `api/snapshot_assets.py` 的调用点可证。
  - 条件 9 与 19 在第二轮后为**满足**（各有直证用例）。
- **已知限制/未完成项**：
  1. **本任务没有任何调用方**。扩展抓图上传与渲染替换都在 TASK-040，所以界面上看不到变化，表与端点当前无人调用。
  2. **删除预览的界面不显示图片张数**。后端已返回 `snapshot_asset_count`，但前端有**两份**各自固定六键的解析器，都忽略多余键因而**不会报错**，只会少报。**TASK-040 要改的是四处**（按 R2 的定位补全，原记录只写了第一处）：`frontend/src/api/client.ts` 的 `DeletionImpact` 接口与键表（服务于 409 `current_impact` 的展示）、`frontend/src/features/resources/api.ts` 的键表（`previewResourceDeletion` 实际走的这份）、以及 `ResourceDeletion.tsx` 的标签表。`frontend/e2e/notes-pages.spec.ts` 只取单个计数、非整对象断言，不受影响。因此 openapi 里 `DeletionImpact` 的 `additionalProperties: false` 加新 `required` 键在**形式上是破坏性变更**，对本仓库的实际消费者兼容。当前不可达（还没有调用方能产生资产），但扩展一旦开始写资产就是用户可见的漏报，必须在那之前补上。
  3. **取字节没有修复路径**。字节缺失或校验不符一律 `409 FILE_CORRUPTED`，不像 `original_files` 有 `reconcile` 的 PENDING/trash 恢复。资产没有 `status` 列，恢复语义要另设计。
  4. **提升与落行之间中断会留下孤儿字节**，由既有 24 小时回收清除（决定 ⑦ 的取舍）。反方向不可能发生。
  5. **跨快照不去重、不清洗 EXIF、不设张数上限** —— 均为登记时已写明的取舍，非交付后补记。
  6. **multipart 收紧后的分支几乎没有用例**（R2 的 N3）。部件数超限、重复 `source_url`、只有文件没有地址、两个 file 部件、超长头、重复头名、空文件等分支，R2 已**逐条读码核实**去向正确（422 或 400），但除 `source_url` 校验与正常路径外没有用例绑定。
  7. **`snapshot_asset_count` 未做上界断言**：openapi 只写 `minimum: 0`，与 `original_file_count` 的 `maximum: 1` 不同，因为按用户决定它本就无上限。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- **候选 SHA**：第一轮冻结候选 **`bb9004fe56f490c547ddf77e065e263da45ced63`**（`product_fingerprint=64b999ff…`，`files=21`）。经两位 Reviewer 第一轮处置后的**最终候选为 `ffd88c9f14f4bb67537da031ff382547f2a24048`**（`product_fingerprint=32a1ca98b0b8749e0fcb3904f225560e9f95938e32d6ba31c847e21cf85c4f37`，`files=21`，`CHECKS PASS`，pytest 550）。**本条写回所在的提交只改本记录的 EVIDENCE 标记区**：指纹不计任务记录，故最终候选的产品内容仍为 `ffd88c9`；该事实由主 Agent 用 `git diff ffd88c9..HEAD --name-only` 核实（仅 `docs/tasks/TASK-039-snapshot-assets.md` 一个文件）。

- **Review（L3，两位独立只读 Reviewer，各两轮，互不通信、无上下文继承）**：**PASS + PASS**。
  - 两位**独立发现了同一个缺陷**（R1 记为 F1/P2「建议修复」，R2 记为 F1「阻断」）。主 Agent 采纳较严的判定并实修。R2 对后果的追查比 R1 更远一层，是采纳阻断的直接依据：KeyError 在 `except ResourceError` 分支内抛出后，**同级的 `except Exception` 按 Python 语义不再接手**，异常逃出路由，由 Starlette 最外层返回纯文本 500，且因不经 `protected_send` 而连 `Cache-Control` 也没有。
  - **权限证据（两位各自自述，均未通过试写探测）**：工具白名单只有 `Read` / `Grep` / `Glob`；**无** `Write`/`Edit`/`NotebookEdit`，**未授予** `Bash`。因此两位**都无法运行任何命令**——`550 passed`、`CHECKS PASS`、变异验证三项机械证据**全部由实现者单方运行，无第三方复核**，两位均明确声明只能判断其与代码是否自洽、不能证实。两位也都无法独立核对候选 SHA 身份与指纹。
  - 报告原文见下方四节。

- **Acceptance（L3 独立只读）**：待填。

- **最终状态/风险/用户操作**：待填。

- **非阻断遗留项（按 `风险分级与检查规则.md:29` 的四要素登记）**：待 Acceptance 后与其结论一并登记。

- **日期与决定日志（续「实现与测试」段之后）**：2026-09-06 两位 Reviewer 第一轮返回后，主 Agent 接受 R2 的阻断判定并实修 F1，形成第二轮候选 `ffd88c9`；同一次修订顺带补齐 R2 的 N2 条件 9 直证与 N4 的两条断言，并把条件 6/2/20 如实标注为「部分满足」而非补测试或改写条件正文。两位第二轮均给出 PASS，并各自独立指出同一处证据卫生缺口（删除了第一轮候选的指纹行却未补第二轮的对应行），已在「实现与测试」段补齐。

---

### Review R1 · 第一轮原文（数据模型、存储与生命周期切片）

> ## 权限证据（运行器层）
>
> 我的工具白名单只有 **Read / Grep / Glob** 三个只读工具。没有 `Write`/`Edit`/`NotebookEdit`，也**没有 Bash**（因此无法执行任何命令、git 操作、跑测试或改权限配置）。我不能写文件、提交、推送、合并，也不能安装或运行任何东西。我未通过试写仓库文件探测权限——以上是运行器给我的配置本身。我全部结论基于阅读 `/tmp/sp-t039/T039.patch`（2093 行、21 个文件，逐行读完）与工作树源码；**我没有复跑任何检查**，任务记录中的机械证据仍是实现者单方运行。
>
> 候选 `bb9004f` / 基线 `e937201`：我无法用 git 独立验证 SHA 身份，按主 Agent 声明"工作树==候选"接受，并已核对 diff 中 21 个路径全部落在 `allowed_paths` 内。
>
> ## 逐项核查结论（你点名的 7 点）
>
> **1. 模型↔迁移一致性 —— 一致，但 `compare_metadata` 证明不到关键部分。**
> `compare_metadata(compare_type=True)` 能证明：表存在、列名/类型/可空/`server_default`、索引与唯一约束。它**不比较 CHECK 约束**（alembic autogenerate 根本不处理 CHECK），也**不比较 FK 的 `ondelete`**。这两项恰好是本表语义的核心，所以任务记录那句"证明迁移与模型逐字段一致"只在"字段"层面成立。我逐字手工比对了它证明不到的部分，结果**全部对上**：五条 CHECK 正文逐字相同（`media_type IN (...)`、`length(sha256) BETWEEN 64 AND 64`、`length(source_url) BETWEEN 1 AND 2048`、`length(storage_key) >= 1`、`size_bytes BETWEEN 1 AND 10485760`）；名字经 `naming_convention`（`models.py:54-61`）渲染后与迁移的 `op.f("ck_snapshot_assets_*")` 逐字相同；FK `ondelete="CASCADE"` 与名 `fk_snapshot_assets_snapshot_id_content_snapshots` 相同；`pk_/uq_snapshot_assets_snapshot_id/uq_snapshot_assets_storage_key/ix_snapshot_assets_snapshot_id` 四个名字与 `index=True`、`unique=True` 的渲染结果相同；两边都无 `server_default`（`id`/`created_at` 是 Python 侧 default）；`media_type` 长度 `String(10)` 两边一致。SQLite 运行期 `PRAGMA foreign_keys=ON`（`connection.py:52-79`），CASCADE 会真实级联（含 `learning_resources → content_snapshots → snapshot_assets` 两级）。
>
> **2. 三条销毁路径与事务边界 —— 正确。**
> - 替换正文/删快照：`application/snapshots.py:52-77`，`_drop_assets` 与 `SnapshotStore.put/delete` 在**同一个** `session_transaction` 内；`isolate()` 在函数返回（即已提交）之后才调用。两条失败路径都安全：`VERSION_CONFLICT`/`VERSION_REQUIRED`/`SNAPSHOT_NOT_FOUND` 是 flush 前抛的 `ResourceError`，`StaleDataError` 是 flush/commit 时抛的，**两者都走 `with ... begin()` 的回滚**，资产删除随之撤销，且 `isolate` 根本不会被执行。`test_a_refused_replacement_leaves_the_images_alone` 正好钉住了这一点（objects 仍 1、trash 仍 0）。
> - 删资料：`resource_store.py:298-305/336-338/363-364` 经 `content_snapshots` join 出全部资产，写进 manifest（`id`+`storage_key`，与契约 §9.2 新写的绑定口径一致）、计入 `snapshot_asset_count`、并入 `storage_keys`；`delete_resource:419-423` 沿用既有"先移文件再提交"顺序。
> - 我确认**没有第四条**删除/替换快照的路径：全仓 `SnapshotStore(` / `ContentSnapshot` 的写入点只有这三处。
>
> **3. 24 小时孤儿回收 —— 隔离后的字节可回收，任务记录的核心保证成立。**
> `file_store.py:100-102` 只对**存在的行**收 `storage_key` 与 `trash_key`。隔离总是发生在行删除并提交之后（`AssetService.isolate` 的注释与调用点都成立），此刻两个键都不再被任何行命名 → 24 小时后 `orphans()` 收走。`test_the_orphan_sweep_keeps_referenced_images_and_collects_released_ones` 两半都断言到位。并发面也干净：`reconcile` 与 `AssetService.create` 的 promote+落行共用同一把 `FileService.lock`（`main.py:36-37` 传的是同一个 `FileService`），且 `reconcile` 在每次 `discard` 前于锁内重算 `references()`（`files.py:129`），所以"已提升但未落行"的字节不会被扫掉。
> 唯一的角落：**活着的行会把它的 trash 副本钉住**——这正是"删资料先隔离再提交"那段窗口所需的保护；若隔离成功而事务回滚，该行会永久 409 且 trash 副本不被回收，但用户重试删除即自愈（`quarantine` 对已不存在的源是 no-op，行删掉后 trash 键即释放）。属可接受的残余风险，非缺陷。
>
> **4. 写入顺序与 discard 覆盖 —— 覆盖完整。**
> `snapshot_assets.py:84-93`：promote 在锁内，`transaction(register)` 用**裸 `except Exception`** 兜住全部失败分支（版本冲突、`IntegrityError`、DB 不可用、进程内任何异常）后 `discard` 已提升的字节；去重命中（`stored=False`）也 `discard`，且去重返回的是**既有行**、丢弃的是**刚生成的新随机键**，不会误删既有字节（`test_the_same_address_twice_is_one_row_and_one_copy` 断言 objects 仍为 1）。暂存键在 `api/snapshot_assets.py` 的 `finally: reader.close()` 中无条件 `files.release()`。若 `discard` 自身失败，字节只是变成孤儿，由回收兜底——与决定 ⑦ 自洽。反方向（有行无字节）确实不可能。
>
> **5. 并发与锁覆盖 —— 版本窗口是关闭的。**
> `precondition` 只是"读体前先拒"的预检；**真正生效的检查是 `register` 内再做一次 `writable_snapshot`**（`snapshot_assets.py:77`），它与插入同事务、且整段在 `files.lock` 内。所以"预检后快照被替换"会在最终 register 处得到 409 并丢弃字节，不会挂到新正文上。残余两点：① 若期间快照被**删除后重建**且版本又回到 1，图片会挂到新快照上（本机单用户、SQLite 写锁串行，实际不可达，不建议为此加锁）；② `(snapshot_id, source_url)` 的竞态见下方 F2。
>
> **6. 类型识别的绕过面 —— 后果被下游兜住，SVG 排除干净。**
> `images.py` 只看头部，因此 `PNG 头 + 任意负载` 的多格式文件会被接受、原样存、原样返回。实际后果被三层限制住：`Content-Type` 只能是四个固定字符串（还有 CHECK 约束兜底）、`X-Content-Type-Options: nosniff`、`Content-Disposition: attachment`，且门禁使得只有持令牌的同源 `fetch` 能取到（`<img src>`/`<script src>` 的 `sec-fetch-dest` 必然不是 `empty`，测试已钉死）。后端全程不解码图片。SVG 无法混入：能通过四个魔数中任何一个的字节序列都不是良构 XML，浏览器不会把它当 SVG 解析。**给 TASK-040 的一句提醒（不是本任务的 finding）**：渲染方必须用响应里的 `media_type` 构造 Blob，绝不能自选类型或直接导航到 blob URL，否则上述保护会被调用方自己拆掉。
>
> **7. 三个上限 —— 没有缝。**
> 流式累计 `> MAX_ASSET_BYTES` 即断（含恰好 10485760 允许通过，与 CHECK `BETWEEN 1 AND 10485760`、openapi `maximum` 三处边界完全一致）；`feed` 另有 `10 MiB + 64 KiB` 的报文总量上限，而非文件部件被限在 4 KiB×≤4 段，总量有界；`inspect_image` 的复核是纵深防御。`_bytes` 的 25 MiB 是严格更宽的外层界，唯一的"缝"是>25 MiB 的暂存文件会报 409 `FILE_CORRUPTED` 而非 413——该状态经端点不可达（流式先断），仅属措辞问题。
>
> ## Findings
>
> **F1 — `api/snapshots.py:41` 的 `MESSAGES[error.code]` 现在可被新代码路径打成 KeyError（P2，建议修复，不阻断）**
> 证据：本次改动让 `putResourceSnapshot`/`deleteResourceSnapshot` 首次触碰存储（`application/snapshots.py:61` 与 `:75` 的 `assets.isolate`），`LocalFileStorage.quarantine` 可抛 `ResourceError("STORAGE_PATH_UNAVAILABLE", 503)`；而 `api/snapshots.py:32-46` 的 `failure()` 用**下标**取 message，该码不在其 `MESSAGES` 中 → KeyError 在 `guarded` 的 `except` 分支内抛出、逃出路由 → Starlette 返回**裸 500 纯文本**，没有 `error` 信封、没有 `request_id`（该响应不经过 `protected_send`）。同一 diff 的新文件 `api/snapshot_assets.py:148` 恰恰用 `MESSAGES.get(..., UNKNOWN_ERROR)` 防了这一手，兄弟文件被漏掉，属本次引入的不对称。
> 当前场景影响与可能性：仅在受控目录不可用（卷丢失、权限、写满）时发生，本机个人使用下概率很低；数据侧安全（行已提交，字节退化为孤儿，24 小时回收），调用方重试会得到 409 并重读，可恢复。
> 最小安全修正：把该行改成 `MESSAGES.get(error.code, MESSAGES["UNKNOWN_ERROR"])` 并补一条 `STORAGE_PATH_UNAVAILABLE` 文案（1 行）；若要口径完全对齐，还需在 openapi 给这两个操作补 503 与 `x-error-codes`（这部分成本略高，属契约面，由 coordinator 定）。同类但更弱的一处：`uploadSnapshotAsset` 理论上可从 `promote` 得到未在 openapi 声明的 409 `FILE_CORRUPTED`（需暂存文件在 inspect 与 promote 之间被篡改，实际不可达），可一并记录不修。
>
> **F2 — 同一 `source_url` 的并发上传会返回 500 而非幂等 201（P3，可选建议）**
> `asset_store.py:73-92` 是"先查后插"，唯一约束 `uq_snapshot_assets_snapshot_id` 的 `IntegrityError` 会被 `create` 的裸 `except` 正确清掉字节后原样上抛，最终在 `api/snapshot_assets.py:338` 变成 500 `UNKNOWN_ERROR`。但 `create` 全程持 `files.lock`，**同进程内不可能发生**；只有多进程共库才可达，本部署没有。若日后要收敛，捕获 `IntegrityError` 后回查一次即可，不必现在改。
>
> **F3 — `models.py:317-319` 的 CHECK 正文硬编码四种类型，与 `IMAGE_MEDIA_TYPES` 双源（P3，可选建议）**
> 列类型由常量派生（`choices("media_type", *IMAGE_MEDIA_TYPES)`），CHECK 文本却是字面量。将来加第五种格式时二者会不同步（迁移届时也要改，测试会拦住），只是可维护性提示，不建议现在动。
>
> 以上没有一条命中"必须修复"的判据：无安全/隐私可达风险、无数据损坏或残留、未违反已确认需求与契约的实质承诺、核心场景全部有绑定到真实文件与真实 SQLite 的用例。
>
> ## 覆盖与未覆盖（明示）
>
> 已覆盖：`models.py`、`0005_snapshot_assets.py`、`asset_store.py`、`file_store.py::references`、`resource_store.py` 删除清单与隔离集合、`images.py`、`storage.py::inspect_image` 及其复用的 `_bytes/promote/discard/quarantine/orphans`、`application/snapshot_assets.py`、`application/snapshots.py`、`main.py` 装配，以及它们的调用链（`api/snapshots.py`、`files.py::FileService` 锁与 reconcile、`connection.py` 的 FK pragma、`local_access.py` 只读核对为零改动）、`test_snapshot_assets.py` 与两处既有断言的改动（均仍为精确相等，未弱化）。另外顺手核实了任务记录"已知限制 2"的准确性：`frontend/src/api/client.ts:139-156` 与 `features/resources/api.ts:118-135` 都只遍历自己那六个键、忽略多余键，因此新增 `snapshot_asset_count` **不会**打断前端解析，只会漏报——登记属实。
>
> **未覆盖（不要当作已审）**：`api/snapshot_assets.py` 的 multipart 解析器细节（我只核到与上限/暂存/错误分支相关的部分，边界解析、`python_multipart` 回调语义与 `file_upload.py` 的同形性留给 R2）；openapi 与中文契约的完整三方一致性（我只核了触及数据模型的字段、错误码与 `DeletionImpact` 两处示例）；`docs/tasks/任务索引.md` 与 TASK-039 记录正文（TASK-038 那处我确认只动了 `status` 与 EVIDENCE 区）；`extension/`、`frontend/`（零改动）；以及**全部机械证据**（我无 Bash，未跑 pytest/mypy/check_task，548/525 计数与指纹均未独立验证）。
>
> ## 剩余风险
>
> ① F1 的存储故障路径会给出非契约形状的 500；② 活着的资产行会钉住其 trash 副本（仅在"隔离成功而删除事务回滚"时出现，重试删除即自愈）；③ 取字节无修复路径（记录已登记）；④ 每次 `reconcile` 的每个候选键都会重算一次 `references()`，现在多一条全表查询，图片多时 CPU 开销线性上升，本机低流量可忽略。
>
> ## 结论
>
> **PASS** —— 指向 candidate `bb9004fe56f490c547ddf77e065e263da45ced63`。F1 建议顺手修（1 行）或按非阻断遗留项记录，F2/F3 为可选建议，均不构成返工条件。

### Review R2 · 第一轮原文（接口、契约与测试绑定切片）

> ## 权限证据（运行器层面）
>
> 我持有的工具白名单只有 **Read / Grep / Glob**。没有 Write/Edit/NotebookEdit，也**没有 Bash**，因此无法写文件、无法提交/推送/合并、无法执行任何命令（包括测试）。这是运行器给我的配置，不是我试写探测得来的。我未运行任何检查，实现者的机械证据我按"可信但未复核"对待。
>
> 审查对象：base `e937201` → candidate `bb9004f`，`/tmp/sp-t039/T039.patch` 全文已逐行读完（2093 行，21 个 `diff --git`），并按需回读工作树。
>
> ## Findings
>
> ### F1（阻断）替换/删除快照新引入了一条不走统一错误信封的崩溃路径，且两个既有操作的契约未随之更新
>
> - **代码事实**：`backend/src/studypilot/application/snapshots.py:61` 与 `:75` 新增 `assets.isolate(keys)`，它经 `application/snapshot_assets.py:533-535` 调 `infrastructure/files/storage.py:183-197` 的 `quarantine`，该函数（含其内部 `exists`/`_path`/`_directory`，`storage.py:59,63,148,152,197`）会抛 `ResourceError("STORAGE_PATH_UNAVAILABLE", 503)`。而 `backend/src/studypilot/api/snapshots.py:41` 是 `MESSAGES[error.code]`，`snapshots.py:20-29` 的 `MESSAGES` **没有** `STORAGE_PATH_UNAVAILABLE` 键。
> - **后果**：`guarded`（`api/snapshots.py:49-56`）进入 `except ResourceError` 分支后抛 `KeyError`；同级的 `except Exception` 不再接手（Python 语义），异常逃出路由，由 Starlette 最外层 `ServerErrorMiddleware`（在 `LocalAccessMiddleware` 之外）返回纯文本 500 —— **没有 `error.code`、没有 `request_id`、没有 `Cache-Control`**，并在服务端打印 traceback。这违反 `docs/contracts/API与数据契约基线.md:86`（"错误响应必须返回 request_id"）与 §2.2 统一错误外形、§12 开头"所有代码均使用第 2.2 节统一 ErrorResponse"。
> - **契约面**：`openapi-v1.json` 的 `putResourceSnapshot`/`deleteResourceSnapshot` 两个操作的 `responses` 与 `x-error-codes`、中文契约 §10 操作表与逐操作错误码表**都未加** 503/`STORAGE_PATH_UNAVAILABLE`，但实现已经能到达该失败模式。这是本候选新引入的三方不一致（资产四个端点自己的表是齐的，见下）。
> - **触发条件 → 影响与发生可能 → 最小修正**：触发需受控目录在隔离时刻不可用（数据目录被换成符号链接、`trash/` 建目录或 `os.replace` 失败）；本机个人使用下概率低但真实可达（把 StudyPilot 数据目录挪到外置盘/软链是常见操作），且同一条件在文件上传/下载端点上本来就返回干净的 503，此处却退化为裸 500；数据侧安全（事务已提交，未引用字节由 24h 回收兜底）。最小修正：`api/snapshots.py:41` 改为 `MESSAGES.get(error.code, MESSAGES["UNKNOWN_ERROR"])` 或补上该键（文件在 `allowed_paths` 内），并给 openapi 两个操作补 `503`/`STORAGE_PATH_UNAVAILABLE`、中文契约 §10 与逐操作表同步，配一条隔离失败仍返回信封的用例。成本≈一行代码 + 两处契约行。
> - 现有用例无一覆盖此路径（快照端点此前根本不碰存储），所以检查全绿不构成反证。
>
> ### N1（非阻断，登记不完整）已知限制第 2 条指错了实际生效的解析器
>
> `ResourceDeletion.tsx:7` 用的是 `frontend/src/features/resources/api.ts:382 previewResourceDeletion` → 同文件 `:118-136` 的 `deletionImpact`（**另一份**固定六键列表）。任务记录只提了 `frontend/src/api/client.ts:139`（那份实际服务于 409 `current_impact` 的展示）。两份都按固定键循环、忽略多余键，所以"不会报错、只少报"的结论**准确**；但覆盖面**不完整** —— TASK-040 要改四处：`client.ts:12` 接口、`client.ts:141` 键表、`features/resources/api.ts:120` 键表、`ResourceDeletion.tsx:13` 标签表。我另核了第二处受影响点：`frontend/e2e/notes-pages.spec.ts:273` 只取 `preview.impact.note_count`，非整对象断言，不受影响。故 openapi `DeletionImpact` 的 `additionalProperties:false` + 新 `required` 在形式上是破坏性变更，对本仓库实际消费者兼容。
>
> ### N2（非阻断）四条完成条件的措辞强于测试实际证明的
>
> - **条件 6**："在流式读取中途即中断"。`test_one_image_over_ten_mebibytes_is_refused` 只证明了 413 且事后无残留字节；TestClient 无法区分"中途拒"与"读完再拒"，且残留字节本来也会被 `close()→release()` 清掉。机制由 `api/snapshot_assets.py:253-258`（`part_data` 里超限即抛，`async for` 随之终止）+ `:284-288` 的总量上限可证，但**不是测试证明的**。
> - **条件 9**："`Content-Type` 为识别出的类型而非声明类型"。没有任何用例在"声明≠识别"的组合下检查**字节端点响应头**：`test_the_declared_content_type_never_decides_the_format` 只查了元数据 `media_type`，查响应头的那条声明与识别恰好都是 PNG。传递性成立（头取自 `row.media_type`），但直证缺一条。
> - **条件 2**："退回后 13 张表与 0004 一致"无断言。`test_migrations.py:40-49` 只做 downgrade-to-base（全链路确实执行了 0005 的 `downgrade`）与重升到 14。
> - **条件 20**：`test_an_upload_in_progress_is_not_swept_from_under_itself` 直接调 `files.begin()`，证明的是 `FileService` 的 active 语义，不是"上传端点确实走了它"；后者由 `api/snapshot_assets.py:249` 代码可证。
>
> ### N3（非阻断）multipart 收紧后的分支几乎没有用例
>
> 我逐条读码核了你点名的矩阵，结论正确：部件数 >4 → 422（`:210-213`）；重复 `source_url` → 422（`:276-277`）；只有 `source_url` 无文件 → 422（`:294-295`）；只有文件无 `source_url` → 走 `AssetUpload` 校验 → 422（`:296-299`）；两个 file 部件 → 422（`:246-248`，靠 `self.key` 已置）；累计头 >4096 → 400（`:227-230`）；重复头名 → 400（`:232-235`）；空文件 → 422（`:270-271`）。这些分支**只有 `source_url` 校验与 happy path 有用例**。另附一条给 TASK-040 的事实：`headers_finished` 以 `filename` 参数判定是否为文件部件（`:245`），因此手工构造的、不带 `filename=` 的 `file` 部件会被当成未知字段而 422；浏览器 `FormData.append('file', blob)` 总会带 filename，故无实际影响。
>
> ### N4（非阻断）删资料路径的行删除与后续回收无断言
>
> `test_deleting_the_resource_counts_and_isolates_its_images` 只断言 `objects` 空、`trash` 2 份，**没有**断言 `snapshot_assets` 行已消失，也没有在删资料后跑一次 `reconcile` 证明 trash 里的字节最终会被收走。这条依赖二级 `CASCADE`（`connection.py:22` 默认 `PRAGMA foreign_keys=ON`，可证），但如果行残留，`file_store.py:100-102` 会把 `trash_key` 永久保护住，隔离区就变成永久堆积 —— 正是决定 ⑤ 想避免的形态。建议 TASK-040 前补一条断言。
>
> ## 已核实为一致 / 无问题的部分
>
> - **契约三方一致（资产侧）**：`asset_store.FIELDS`（7 项）≡ openapi `SnapshotAsset.required`（7 项，`additionalProperties:false`）≡ 中文契约 §4.14 表（7 行）；测试 `test_snapshot_assets.py:1313-1321` 断言键集完全相等。`storage_key` 不在 `project()`、不在错误 `details`（只可能是 `{}` 或 `{current_version}`）、不在列表、不在删除预览响应（`resource_store.py:351-356` 的 `current_impact` 只含计数；带 `storage_key` 的只有内部 `impact_manifest`，与 §9.2 新写的"ID + 存储键"一致）。
> - **错误码三方一致（资产侧）**：openapi 四个操作的 `x-error-codes` 与中文契约逐操作表逐字相同；代码能 raise 的 12 个码全部在 `api/snapshot_assets.py:122-135` 的 `MESSAGES` 内，`MESSAGES.get(...)` 兜底目前不掩盖任何码。唯一未登记的理论码是上传路径经 `promote→read` 的 `FILE_CORRUPTED`（同进程持锁、暂存文件不可能被改，实际不可达）。
> - **`If-Match`**：`version_header` 复用无语义偏差（同为强 ETag 单值，指向快照版本，与 §4.14 明写一致）。上传在读 body 前依次做 `version_header` → `precondition`（`api/snapshot_assets.py:312-317`），428/409/404 三种拒绝都发生在 `AssetUploadReader` 构造之前，一个字节都不会落盘；`create()` 在事务内二次 `writable_snapshot` 复查版本；删除的 428 在 `AssetStore.remove` 的第一行。测试 `:1396-1405` 断言了 `stored(runtime) == []`。
> - **路由**：两个 router 前缀共存无遮蔽 —— Starlette 路由正则整串锚定，`/snapshot` 不会吞掉 `/snapshot/assets`；`redirect_slashes=False` 与既有快照 router 同形。
> - **既有断言无删除、无弱化**：`test_migrations.py` 三处仍是精确相等；`test_resource_deletion.py:126-134` 仍是整字典 `==`（只多一键）。新增 23 条与 548−525 吻合，且 `test_resource_deletion.py:174` 等其余影响断言不受影响。
> - **条件 16**：`local_access.py` 确在 21 个文件之外；`test_the_bytes_endpoint_is_unusable_as_an_image_source` 两半都真（`sec-fetch-dest: image` → `REQUEST_ORIGIN_FORBIDDEN`，去令牌 → `LOCAL_TOKEN_REQUIRED`）。
> - **条件 19**：referenced 存活 + 行删后被收走，同一用例两半齐全。
> - **条件 17**：openapi 里 `ContentSnapshot` 与三个快照操作条目在 diff 中均为上下文行、未改（成功响应形状确实一字未动 —— F1 说的是它们新增的**失败**模式）。
> - **`frontend`/`extension` 零改动**：我按 `diff --git` 逐条枚举，21 个文件中无一位于这两棵树，也无 `package.json`/lockfile/tsconfig/playwright 配置。**论据边界**：`frontend/e2e/*` 是打真后端跑的，所以"零改动 ⇒ 计数必然相等"这个推论本身不普适；成立的形式是"零改动 + 后端新增键被两处 TS 解析器容忍 + e2e 无精确对象断言"，这三点我已逐条核过（见 N1）。按此，实现者的结论正确，理由需要补上后半段。
>
> ## 未覆盖（不以沉默暗示已审）
>
> 未运行任何命令，pytest/mypy/ruff/check_task 的退出结果全部未复核；未审 `0005` 迁移与 `models.py` 的字段级细节（只核到 `compare_metadata==[]` 与 `media_type` String(10) 足够容纳四个值的程度）、`images.py` 的魔数边界穷举、`resource_store` 之外的删除链路细节 —— 这些属 R1 切片；未审 `extension/` 与 `frontend/` 的运行时行为（只做了本报告所述的静态核对）；未审治理脚本与索引文本细节。
>
> ## 结论
>
> **CHANGES_REQUIRED**，指向 candidate `bb9004f`，阻断项仅 F1（最小修正约一行代码 + 两处契约行）。N1–N4 为非阻断，建议按上述定位记录并交由 TASK-040 或本轮顺手处理。

### Review R1 · 第二轮增量复核原文（`bb9004f` → `ffd88c9`）

> 权限不变：本轮仍只有 **Read / Grep / Glob**，无 Bash、无写工具；未执行任何命令，未复跑测试。
>
> ### 增量范围核对：无第五处未描述的产品改动
>
> `/tmp/sp-t039/T039r2.patch` 共 5 个文件、215 行，**唯一改动的生产代码是 `api/snapshots.py`（MESSAGES 加一条 + `[]`→`.get`）**。其余为测试、openapi、中文契约、任务记录。这意味着我上一轮审的数据模型、迁移、`asset_store`/`file_store`/`resource_store`、`images.py`/`storage.py`、`application/snapshot_assets.py`、`application/snapshots.py` **在本轮零改动**，上轮结论可直接继承。
>
> 两处任务记录改动不在你的四条描述里，我核过，都属**自曝而非拔高**，不构成问题：新增「完成条件中仍未被测试直证的部分」一节（条件 6/2/20 标为部分满足），以及已知限制 2 改写、新增第 6 条（R2 的 N3）、原第 6 条顺延为 7。我抽查了其中与我相关的三条：条件 2 的说法属实（`test_migrations.py:40-49` 确实降到 base 再重升断言 14 张表，**没有**对 0004 的 13 张表断言）；条件 20 属实（用例直接调 `FileService.begin()`，端点走它是靠 `api/snapshot_assets.py:249` 的调用点证明）；条件 9/19 现有直证，标为满足属实。
>
> 唯一需要补的记录项：**旧的 `--candidate e1e2b53 --static-only → STATIC PASS / files=21 / product_fingerprint=64b999…` 一行被删除，但没有为新候选补上对应行**，现在「实现与测试」段没有任何指纹/静态核对证据。按 AGENTS §6「记录输入指纹/提交」，冻结前应补 `ffd88c9` 的那一行（若打算写进 EVIDENCE 区亦可，但不能两处都空）。非阻断，属证据卫生。
>
> ### 修复本身：正确，且 `.get` 不掩盖"返回了契约里没写的码"
>
> `.get` 兜底替换的只是 **message**，`code` 与 `status` 仍原样出现在信封里——所以未登记的码不是被藏起来，而是从"根本没有响应体"变成"可见、可 grep、带 `request_id` 的 503/xxx"。这严格优于原来的裸 500。它确实**丢掉了一个偶然的 fail-loud 信号**（以前漏配文案会在测试里炸），但用 KeyError 当契约完整性的守卫本来就是错的守卫：正确的守卫是 openapi 的 `x-error-codes` 与用例，而不是让用户拿到一个无 `code`、无 `request_id`、不经 `protected_send`（因而连 `Cache-Control` 都没有）的 500。这也与同 diff 的 `api/snapshot_assets.py:148` 形态统一，消除了我上轮点名的不对称。新用例 `test_a_failed_isolation_still_answers_in_the_error_envelope` 的打桩点正确：`main.py:35-37` 让 `FileService.storage` 与 `AssetService.storage` 是同一个 `LocalFileStorage` 实例，patch 它的 `quarantine` 确实能命中 `AssetService.isolate` 的调用；断言覆盖了状态码、四键信封、`code`、`request_id` 与响应头一致。变异验证（回退后 `KeyError: 'STORAGE_PATH_UNAVAILABLE'`）与我上轮独立推导的失败形态逐字一致。
>
> ### 契约补的 503：与实际可达失败模式恰好对应，未补多
>
> - **未补多**：`getResourceSnapshot` 不碰存储，未加 503 ✓。`put`/`delete` 的 503 只在快照**有资产**时可达（`isolate` → `quarantine` → `exists`/`_path`/`_directory`/`os.replace`），确实存在。
> - **未补漏**：我复核了 `isolate` 这条新链路能抛的全部码——只有 `STORAGE_PATH_UNAVAILABLE`。`quarantine` 不会抛 `FILE_CORRUPTED`（`exists()` 与 `_path()` 的失败一律是 503），`_drop_assets` 只碰数据库。所以这两个操作的新增可达码就是一个，登记刚好。
> - **仍未登记的一处**：`uploadSnapshotAsset` 经 `promote → read` 的 `409 FILE_CORRUPTED`。它需要暂存文件在 `inspect_image` 求哈希与 `promote` 复核之间被第三方改写，而这两步在同一个持锁调用内、目录 0700、键为随机 uuid——我上轮判为实际不可达，本轮维持。此处未登记与"只登记实际可达失败模式"这条判据是一致的，不是遗漏；若要形式完备，补 `FILE_CORRUPTED` + 409 到该操作即可，我不要求。
>
> ### F2 / F3 不修的理由：成立，记录准确
>
> F2 的理由复核成立：`AssetService.create`（`application/snapshot_assets.py:84-93`）promote 与 register 全程持 `FileService.lock`，同进程内两个上传不可能同时穿过 `by_source` 检查，唯一约束冲突只有多进程共库才可达，本部署单进程。F3 属可维护性提示，且加第五种格式必然要写新迁移、`test_migrations` 的 `compare_metadata` 与表数断言会拦。记录里对这两条的复述与我上一轮的原意一致，没有把"我判为可选建议"写成"我认为无问题"，也没有把 R2 的阻断判断安到我头上（明确写"R2 判为阻断"）。
>
> ### `compare_metadata` 措辞更正：如实，不夸大也不缩小
>
> 新写法把它证明到的范围限定为"表、列名/类型/可空/`server_default`、索引与唯一约束"，并明写 alembic autogenerate **不比较 CHECK 约束、不比较 FK 的 `ondelete`**——这与事实相符，也与我上轮的表述一致；接着说这两项为人工逐字比对、经 R1 独立复核确认，同样属实（我上轮逐条比对了五条 CHECK 正文与全部约束名、`ondelete`、命名约定渲染结果，全部对上，并已在报告中写明）。它没有把我的复核说成"我跑了什么"，也没有把人工比对包装成机器证据。F1 段落对失败形态的描述（handler 内部 KeyError → 逃出路由 → 裸 500 纯文本、无 `code`/`request_id`/`Cache-Control`）经我复核准确；所引契约 `§2.2 统一错误外形` 与第 86 行「错误响应必须返回 request_id」两处引用均对得上。
>
> ### 结论
>
> **PASS** —— 覆盖新候选 `ffd88c9f14f4bb67537da031ff382547f2a24048`。
>
> - **继承的上轮范围**（本轮零改动，结论原样有效）：`models.py` 的 `SnapshotAsset`、`0005_snapshot_assets.py`、`asset_store.py`、`file_store.py::references`、`resource_store.py` 的影响清单与隔离集合、`images.py`、`storage.py::inspect_image`、`application/snapshot_assets.py`、`application/snapshots.py`、`main.py` 装配，以及上轮核过的七个专项（模型↔迁移逐字一致、三条销毁路径与事务边界、24 小时回收对隔离字节的可回收性、写入顺序与 discard 覆盖、锁覆盖、类型识别绕过面、三处上限）。上轮 F1 已闭合，F2/F3 维持"可选建议，不修"。
> - **本轮未覆盖**：`api/snapshot_assets.py` 的 multipart 分支（R2 切片，且记录已如实登记为"读码核实、无用例绑定"）；openapi/中文契约中与本次 503 无关的部分；`docs/tasks/任务索引.md`；`extension/`、`frontend/`（零改动）；**全部机械证据**——550 passed、变异验证、`CHECKS PASS` 均为实现者单方运行，我无 Bash，一律未独立验证，也未核对新候选的 SHA 身份与指纹。
> - **剩余风险**：与上轮相同的四项（活行钉住其 trash 副本的角落场景、取字节无修复路径、`references()` 在 reconcile 中的重复查询开销、条件 6/2/20 的部分直证），另加本轮新增的一项记录项——新候选缺 `--static-only` 指纹行，建议冻结前补齐。

### Review R2 · 第二轮增量复核原文（`bb9004f` → `ffd88c9`）

> 只读权限不变：本轮仍只有 Read/Grep/Glob，无写工具、无 Bash，未运行任何命令。已逐行读完 `/tmp/sp-t039/T039r2.patch`（215 行，5 文件），并回读工作树 `api/snapshots.py`、`test_files.py:35-37`、`main.py:35-37` 核实生效路径。
>
> ### 1. 增量范围：与描述相符，只有一处未被你列出
>
> 5 个文件全部在 `allowed_paths` 内，逐 hunk 核对与你列的 1–7 一一对应，**没有夹带产品改动**。未被你描述的第五处是**删除**而非新增：
>
> - `docs/tasks/TASK-039-snapshot-assets.md` 删掉了 `--candidate e1e2b53 --static-only → STATIC PASS，files=21，product_fingerprint=64b999f…` 那一行，**未补第二轮的对应行**。同时 `check_task.py --worktree → CHECKS PASS` 那行原文保留，没写明是在第二轮改动之后重跑的（`pytest 550` 暗示重跑过，但记录本身没说）。删掉指向旧 SHA 的指纹是对的，但按 `风险分级与检查规则.md:50`「复用条件」，新候选需要自己的指纹/文件数与真实退出结果。**请在冻结 EVIDENCE 时补：第二轮 `--candidate ffd88c9 --static-only` 的 `files`/`product_fingerprint`，并明确 `CHECKS PASS` 对应的是修复后的工作区。** 非阻断，但属验收前必须闭合的证据卫生项。
>
> 另外记录里新增了 R1 的两处内容（`compare_metadata` 不比较 CHECK 与 `ondelete` 的措辞更正、F2/F3 不修理由）。这属于新候选的实现记录更新，不是"借证据写回改目标/路径/检查"——我逐 hunk 确认 **`allowed_paths`、`checks`、`risk`、以及"完成条件 1–20"正文均无 hunk**，完成条件没有被改写去迁就证据，这是正确做法。但 R1 的结论我无法背书（不在我切片内），其报告原文仍须按 §6 原文写进 EVIDENCE 区，实现段的转述不能替代。
>
> ### 2. F1 已闭合，契约面不多不漏
>
> - 代码：`api/snapshots.py:47` 已是 `MESSAGES.get(error.code, MESSAGES["UNKNOWN_ERROR"])`，并补 `:30` 的 `STORAGE_PATH_UNAVAILABLE` 文案；`status_code=error.status` 未动，503 与信封四字段齐全，且响应仍走 `protected_send`（因而带 `x-request-id`/`Cache-Control`）。
> - 契约恰好对应：put/delete 因本任务新获得的可达失败模式**有且只有** `STORAGE_PATH_UNAVAILABLE`（`isolate → quarantine` 只经 `exists/_path/_directory/os.replace`，不会产生 `FILE_CORRUPTED`）。openapi 两处加了 `503 → StorageUnavailable`（该组件已存在，`$ref` 可解析）与 `x-error-codes`，中文契约 §10 两行、逐操作两行、§4.13 一段同步 —— **没有补多（未误加 FILE_CORRUPTED），也没有补漏**。
> - 顺带修掉了我上轮没点名的一处失准：§10 的 PUT 行原写「只写快照表」，而 `put` 自第一轮起就会删资产行；现改为「写快照表，并作废该快照已冻结的图片、隔离其字节」。§4.13 新增的「此时快照本身的写入已提交，未被引用的字节退化为孤儿并由 24 小时回收清除」与 `application/snapshots.py:60-62` 的实际顺序一致，属实。
>
> ### 3. 三条新用例：都证明了它们声称的事
>
> - `test_a_failed_isolation_still_answers_in_the_error_envelope`：`service(client)` 返回 `app.state.files`（`test_files.py:36`），其 `.storage` 与 `AssetService.storage` 是 `main.py:35-37` 里的**同一个实例**，所以在实例上打 `quarantine` 桩确实会命中 `isolate` 的调用点；打桩函数签名 `(key)` 与实例属性调用一致。断言键集精确等于四字段、code、request_id 与响应头一致 —— 正是 F1 的失败形态。只覆盖 delete 分支，但修复点是 put/delete 共用的 `failure()`，够用。变异验证（回退后 `KeyError`）与我上轮的独立分析逐字吻合，但**是你跑的，我未复核**。
> - `test_the_served_content_type_is_the_recognized_one_not_the_declared_one`：`upload(..., data=GIF, media="image/png")` → 声明 `image/png`、字节是 GIF，**"声明≠识别"的组合确实成立**，且同时断言了元数据 `image/gif`、响应头 `image/gif`、字节原样。条件 9 的直证补齐，我上轮的 N2 该条关闭。（附带还证明了 `source_url` 的 `.png` 后缀不参与判定。）
> - N4 两条断言：行数归零证明二级 CASCADE 真的落到 `snapshot_assets`；`reconcile(now+25h)` 后 trash 清空成立——`quarantine` 的 `os.utime(target, None)` 把宽限期起点设为隔离时刻，25h 的时间线足够。N4 关闭。
> - 计数：+2 用例 = 25，与 `550 passed` 自洽；既有断言仍无删除、无弱化。
>
> ### 4. 条件 6/2/20 标"部分满足"的处置：认可
>
> 完成条件正文一字未改、也没有把"部分满足"包装成"满足"，这正是底线要求的正面做法。三条里条件 6、20 要真证需要能观察服务端何时停止读流／何时进 active 集合，成本与收益不成比例，代码可证已足够；条件 2 是三者中最便宜的（在现有迁移用例里加一次 `downgrade` 到 `0004` 并断言 13 表，约 3 行），**属可选建议，不作为条件**。
>
> 措辞我逐句核过新增文本，**没有发现仍强于证据的地方**：条件 9/19 写"满足"属实；已知限制 6 转述我的 N3 与我的报告一致；已知限制 2 的四处定位与 `client.ts:12/141`、`features/resources/api.ts:120`、`ResourceDeletion.tsx:13` 逐一对得上，`additionalProperties:false` 的破坏性判断表述准确。
>
> ### 5. 结论
>
> **PASS**，指向 candidate `ffd88c9f14f4bb67537da031ff382547f2a24048`。无阻断项。剩余非阻断项：上述第 1 条的第二轮指纹/重跑登记（验收前补）、条件 6/2/20 的部分满足登记、N3 的 multipart 分支无用例、已知限制 2 的前端四处需在 TASK-040 关闭。
>
> **本轮继承的上轮审查范围**：`e937201..bb9004f` 中我的切片结论全部继承——资产四端点的字段/错误码三方一致、`storage_key` 全路径不外露、`If-Match` 三分支顺序与"拒绝时零字节"、multipart 收紧后各分支去向（逐条读码）、双 router 无遮蔽、`DeletionImpact` 加键对前端两处解析器与 e2e 的兼容性、既有断言完整性、21 文件中 `frontend/`/`extension/` 零改动的枚举核实。增量未触及其中任何一项，除本报告点名的 `api/snapshots.py::failure`、两个快照操作的契约条目与三处测试改动。
>
> **未覆盖**：本轮与上轮均未执行任何命令 —— `550 passed`、`CHECKS PASS`、变异验证三项皆为实现者自报，我只能判断其与代码一致，不能证实；R1 切片（0005 迁移与模型的 CHECK/`ondelete` 人工比对、`images.py` 魔数边界、F2/F3 的原始判断）未复核，记录中"R1 独立复核后确认全部对上"这句由 R1 自己的报告负责；`frontend/`/`extension/` 运行时行为未测；本轮未重读 `base..ffd88c9` 全量 diff，只读了 `bb9004f..ffd88c9` 加上一轮已完整读过的上下文。

<!-- EVIDENCE:END -->
