# StudyPilot 第一阶段 API 与数据契约基线

## 1. 文档身份、范围与来源

- 契约版本：`1.0.0`
- HTTP 基路径：`/api/v1`
- 适用范围：第一阶段个人、本地、单用户 MVP。
- 含义权威：本文件。机器可读 HTTP 快照为同目录的 `openapi-v1.json`；二者冲突时停止实现并修订契约，不能由实现 Agent 猜测。
- 明确延期：账户、多用户、公网部署、云存储、自动备份、正文解析、恶意文件扫描、AI、RAG、练习题和学习 Agent 均不属于本契约。

规则来源标记：`[需求]` 表示来自《项目需求说明》；`[架构]` 表示来自已批准的 TASK-001 架构；`[细化]` 表示 `architecture_owner` 在批准范围内补齐的可实现技术参数。字段和接口若未单独标记，继承所在小节的来源标记。

### 1.0 TASK-018 产品优先级修订（不改变接口） `[用户确认]`

2026-09-03 用户将当前核心收敛为“收集资料、随手记心得、再次找回”，学习时间/时长/进度/学习后状态不再是心得记录的输入要求，复习与详细统计后置。新的产品范围与完成门槛以《项目需求说明》第 5/8 节为准。

本文件及 OpenAPI 中“完整 MVP/完整目标/最终要求”从此指保留的既有接口设计全集（包含后续扩展），不是当前核心版必须全部实现的功能清单；下文“最终 MVP 验收仍要求完整目标通过”只适用于声明交付该全集的版本，不能据此继续把复习/统计作为当前核心验收前置条件。第 1.3 节及 x-delivery-profile 仍如实界定每项运行时能力，不因优先级调整新增、关闭或更名操作。

标准 paths/schemas、必填字段、状态/时间含义、安全、事务及历史数据保护均不变。个人心得与既有结构化学习记录不是同一种写入；页面不能通过虚构开始时间、时长、状态或进度来满足旧接口。默认心得交互简化、旧历史访问保全及可能的兼容调整留给后续实现任务；本次不授权数据合并、迁移、删除或绕过契约。

### 1.1 初学者术语表

| 术语 | 通俗解释 |
| --- | --- |
| API | 前端向后端读取或修改数据的约定入口。 |
| OpenAPI | 用 JSON 描述 API 地址、字段和错误的标准“接口说明书”。 |
| schema | 一类数据的结构说明，包括字段、类型和限制。 |
| 枚举 | 只能从固定代码中选择的值；数据库保存英文代码，中文仅用于显示。 |
| 分页 | 把大量结果按页返回；本契约使用页码和每页数量。 |
| 幂等 | 同一个动作重复执行，不会不断产生额外结果；例如重复添加同一标签关联。 |
| UTC | 全球统一时间基准；时间点存成 UTC，界面再按本地时区显示。 |
| 状态机 | 状态只能沿明确允许的路线变化，例如文件从 `PENDING` 到 `READY`。 |
| 乐观并发 | 修改时带上读到的版本号；若数据已被别处修改则返回冲突，避免旧页面静默覆盖新数据。 |
| 令牌 | 随机且不可猜的临时凭据；客户端只能原样带回，不从中解析信息。 |
| bootstrap | 前端启动后取得本次后端进程本地访问令牌的初始化请求。 |
| multipart | HTTP 上传文件时同时携带文件和表单字段的编码方式。 |
| 事务 | 一组数据库修改要么全部成功，要么全部撤销。 |
| 原子提升 | 把同一文件系统中的暂存文件一次性改名为最终文件，外部不会看到半个文件。 |
| 对账 | 比较数据库记录与磁盘文件并安全修复不一致；重复执行结果相同。 |
| 破坏性变更 | 会让已有客户端、数据或调用方式失效的契约修改。 |

### 1.2 版本与兼容原则 `[架构][细化]`

`v1` 内允许新增可选响应字段、新错误码和新接口，但不得删除/改名字段、改变字段含义、收紧既有输入、改变枚举代码或成功状态码。客户端必须忽略未知响应字段；服务端必须拒绝未知写入字段。破坏性变更需要独立契约任务、影响分析、迁移方案、独立审查、验收和用户合并；不能由功能任务顺带修改。当前不启用代码自动生成。

### 1.3 TASK-009 阶段性交付与当前可用范围 `[用户确认][架构]`

2026-09-03 用户明确同意补充本节：本阶段交付网页/粘贴资料，文件上传由后续任务完成，最终需求不变。此安排对应已批准架构第 12 节分别交付“资料/分类后端”和“原始文件后端”的顺序。

本文件第 5、8、10 节及 `openapi-v1.json` 的标准 paths/schemas 描述**完整 MVP 目标**，不是当前程序全部已可调用的能力清单。同一操作允许按本节明确的输入子集分阶段交付；TASK-009 当前运行时的可用性及未开放输入响应以本节为准，不能把完整目标中的 FILE 分支视为本阶段已承诺可用。最终字段、媒体类型、成功响应、安全及数据规则仍保留，不删减、不改名，不宣称完整 MVP 已完成。

TASK-011/012 已完成分类后端与页面，TASK-013/014 已完成 FILE 后端和上传/下载页面，TASK-015/016 已完成学习记录后端与页面。TASK-017 接入个人笔记后端，随该任务测试、独立审查、验收通过并由用户合并后交付，笔记页面尚未接入；本节只同步实际交付范围，不改变标准契约。

| 当前可用操作 | 交付范围 |
| --- | --- |
| `bootstrapLocalSession` | 沿用 TASK-008 的本机启动令牌协议 |
| `createResource` | `application/json` 的 WEB/PASTE 与 `multipart/form-data` 的 FILE；成功为原定 `201 ResourceEnvelope`，FILE 仅落盘并提交 READY 后成功 |
| `listResources` / `getResource` | 原定列表筛选/摘要与详情读取；FILE 只显示 READY 元数据，不表示已解析 |
| `downloadOriginalFile` | 按文件 ID 下载 READY 原件；大小/hash 校验、附件头及失败保护遵守第 8 节 |
| `listTopics` / `createTopic` / `getTopic` / `updateTopic` / `deleteTopic` | TASK-011：既定主题创建/读/改/删除未使用项；保留版本、规范化唯一与引用保护 |
| `listTags` / `createTag` / `getTag` / `updateTag` / `deleteTag` | TASK-011：既定标签创建/读/改/删除未使用项；不增加颜色字段或级联资料删除 |
| `attachResourceTag` / `detachResourceTag` | TASK-011：既定幂等关联/解除；不写资料主要主题、正文或学习状态 |
| `listResourceStudyRecords` / `createResourceStudyRecord` / `listStudyRecords` | TASK-015：既定历史分页与学习记录/当前进度原子写入，遵守版本、状态矩阵、复习计划前置条件和时间规则；不开放复习计划/结果写操作 |
| `listResourceNotes` / `createResourceNote` / `getResourceNote` / `updateResourceNote` / `deleteResourceNote` | TASK-017：既定个人笔记增删改查与稳定分页；严格正文、所属资料及版本保护，只写 Note，不改变资料、进度或原件，不提供全文搜索或回收站 |

- TASK-009～012 对 multipart 的临时 `415 CONTENT_TYPE_UNSUPPORTED` 限制由 TASK-013 的实际文件实现解除；合法 FILE 表单按第 5/8 节处理，其他媒体类型仍拒绝。缺失令牌或非法来源仍优先按第 7 节返回对应 `403`，不读正文或操作文件/数据库。
- JSON 请求的 FILE 不属于 WEB/PASTE JSON schema，仍为 `422 VALIDATION_ERROR`。已开放的 WEB/PASTE 校验、错误、事务和只读投影必须完整符合其契约，不能借分阶段交付降低这些要求。
- OpenAPI 顶层 `x-delivery-profile` 是本阶段机器可读清单；其余标准 operation/schema 保留为完整目标。当前不启用自动生成；以后若生成客户端，必须先按该清单限制可用操作/请求媒体类型，不能直接将完整目标文档当作当前运行时契约或生成已可上传的界面。该清单是版本说明，不新增运行时能力查询接口。其他未列入操作不因存在 schema 就获得本阶段可调用承诺。
- TASK-013～017 的单任务证据记录相应实现、测试、独立 Review 和验收；上述交付元数据与代码一起审查，不能仅改清单就声称实现。资料修改/删除、笔记页面、复习、统计等未列能力仍未开放；最终 MVP 验收仍要求完整目标通过。本节不授权回退已交付能力或改变 schema。

## 2. 通用 HTTP 约定

### 2.1 标识、JSON、响应与请求编号 `[细化]`

- 所有对象 ID 均为服务端生成的 UUID v4 小写字符串。
- JSON 属性使用 `snake_case`。请求出现未声明字段时返回 `422 VALIDATION_ERROR`。
- 除 `204` 和文件下载外，成功响应统一为 `{ "data": ... }`。
- 列表统一为 `{ "data": [...], "page": { "number", "size", "total_items", "total_pages", "has_more" } }`。
- 每次请求都有不可预测的 `request_id`；错误响应必须返回它。响应可同时发送 `X-Request-Id`，两者相同。
- `PATCH` 中省略字段表示“不修改”；显式 `null` 只允许用于字段表标记为可空且可更新的字段，表示清空。其他 `null` 返回 `422`。
- 写请求只接受契约列出的媒体类型。普通 JSON 写请求必须为 `application/json`；文件创建是唯一接受 `multipart/form-data` 的业务接口。

资源示例：

```json
{"data":{"id":"018f1f58-4eb2-4a0d-a716-fb81b1960001","version":1}}
```

分页示例：

```json
{"data":[],"page":{"number":2,"size":20,"total_items":0,"total_pages":0,"has_more":false}}
```

### 2.2 统一错误外形 `[架构]`

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "没有找到这份资料。",
    "details": {},
    "request_id": "req_7cc640f6b1764ed0"
  }
}
```

- `error.code` 是前端判断错误类别的稳定英文代码。
- `error.message` 是可向用户显示的简洁中文，不作为程序判断依据。
- `error.details` 只含安全、可操作的字段错误或新影响摘要。
- `error.request_id` 供排错关联；它不是用户数据。
- 错误响应绝不包含正文、笔记、磁盘路径、SQL、堆栈、完整原始文件名、访问令牌或删除令牌。

| HTTP | 稳定错误码 | 使用场景 |
| ---: | --- | --- |
| 400 | `MALFORMED_REQUEST` | JSON、multipart 或查询语法无法解析。 |
| 403 | `HOST_FORBIDDEN` | Host/authority 不可信、重复或被转发头替代。 |
| 403 | `LOCAL_TOKEN_REQUIRED` / `LOCAL_TOKEN_INVALID` | 本地令牌缺失或不匹配；旧启动令牌按无效处理。 |
| 403 | `REQUEST_ORIGIN_FORBIDDEN` | Origin 或 Fetch Metadata 缺失、`null`、跨站或未知。 |
| 403 | `DELETION_TOKEN_REQUIRED` / `DELETION_TOKEN_INVALID` | 删除确认头缺失或令牌绑定错误。 |
| 404 | `RESOURCE_NOT_FOUND`、`TOPIC_NOT_FOUND`、`TAG_NOT_FOUND`、`NOTE_NOT_FOUND`、`FILE_NOT_FOUND` | 对象不存在或不属于路径中的父对象。 |
| 409 | `DUPLICATE_TOPIC` / `DUPLICATE_TAG` | 规范化名称重复。 |
| 409 | `VERSION_CONFLICT` | `expected_version` 或 `If-Match` 已过期。 |
| 409 | `INVALID_STATE_TRANSITION` / `STATE_CONFLICT` | 当前状态不允许请求动作或额外字段不满足。 |
| 409 | `SOURCE_TYPE_MISMATCH` | PATCH 提交了与资料已有且不可变的 `source_type` 不匹配的来源字段。 |
| 409 | `TAXONOMY_IN_USE` | 主题或标签仍被资料使用。 |
| 409 | `FILE_STATE_UNAVAILABLE` / `FILE_CORRUPTED` | 文件未 READY 或对账发现不一致。 |
| 409 | `DELETION_TOKEN_REPLAYED` | 一次性删除令牌已经消费。 |
| 409 | `DELETION_IMPACT_CHANGED` | 预览后资料或关联集合变化；`details.current_impact` 只返回新摘要和 revision，绝不返回新令牌。 |
| 410 | `DELETION_TOKEN_EXPIRED` | 删除确认令牌超过有效期。 |
| 413 | `FILE_TOO_LARGE` | 上传超过 26,214,400 字节。 |
| 415 | `CONTENT_TYPE_UNSUPPORTED` / `FILE_TYPE_UNSUPPORTED` | 写入媒体类型或文件签名/格式不支持。 |
| 422 | `VALIDATION_ERROR` | 字段类型、范围、互斥、日期、筛选或排序无效。 |
| 428 | `VERSION_REQUIRED` | 必需的版本前置条件缺失。 |
| 500 | `UNKNOWN_ERROR` | 未分类服务错误；仅用 request_id 排查。 |
| 503 | `STORAGE_PATH_UNAVAILABLE` | 受控存储目录不可安全访问。 |

### 2.3 分页、搜索、筛选与排序 `[需求][细化]`

- 查询参数：`page` 默认 `1`、最小 `1`；`page_size` 默认 `20`、最小 `1`、最大 `100`。
- 页码超过末页返回 `200` 空数组；`total_pages=0` 时任何页都无结果。
- 同类筛选的多个值采用“任一匹配”，不同筛选之间采用“同时满足”；资料的多个 `tag_id` 特例为“全部标签都具有”。
- 省略筛选表示不限；显式空字符串、空数组、非法 UUID、倒置范围均返回 `422`。
- 排序使用白名单字段；前缀 `-` 表示降序。所有排序最后追加 `id` 升序作为稳定决胜项，因此翻页不会因相同时间而随机换位。
- 不接受任意数据库列名。未知搜索、筛选或排序参数返回 `422 VALIDATION_ERROR`；不把未知参数静默忽略。
- 文本搜索在 Unicode NFKC 规范化、大小写折叠和连续空白折叠后做“包含”匹配。`progress_min/max` 两端都包含；时间范围 `from` 包含、`to` 不包含。语法正确但不存在的筛选 ID 返回空页，不返回 404。
- `topic_id` 与 `topic_unassigned=true` 互斥；`topic_unassigned=false` 等同省略。`ReviewScope` 默认 TODAY；ALL 同时包含 SCHEDULED 与 PAUSED，其他三个 scope 只包含 SCHEDULED。按 `due_date` 升序时，PAUSED 的 null 永远排在所有有日期计划之后；降序时仍排在最后，然后按 `title,id` 决胜，不能依赖数据库默认 null 顺序。

| 列表 | 搜索/筛选白名单 | 排序白名单与默认值 |
| --- | --- | --- |
| 资料 | `q` 只搜标题、来源名称、保存原因；`topic_id`、`topic_unassigned`、重复 `tag_id`、重复 `source_type`、重复 `learning_status`、`progress_min/max`、`created_from/to`、`updated_from/to` | `created_at`、`updated_at`、`title`、`progress_percent`；默认 `-created_at,id` |
| 单资料学习记录 | `started_from/to` | `started_at`、`created_at`、`duration_seconds`；默认 `-started_at,id` |
| 全局学习记录 | 在上项基础上增加 `resource_id`、`topic_id` | 同上 |
| 复习列表 | `scope=TODAY/OVERDUE/UPCOMING/ALL`、`time_zone`、`topic_id`、`q`（同资料搜索） | `due_date`、`title`；默认 `due_date NULLS LAST,title,id`，`-due_date` 也固定 NULLS LAST |
| 主题统计 | `q` 搜主题名称；`time_zone` | `name`、`resource_count`、`completion_rate`、`study_seconds`；默认 `name,id` |

### 2.4 乐观并发 `[细化]`

可修改对象的 `version` 从 `1` 开始，每次实际修改加一；无变化的幂等请求不加版本。JSON 修改请求携带 `expected_version`。没有请求体的删除使用强版本头 `If-Match: "<整数>"`。缺失返回 `428`，不匹配返回 `409 VERSION_CONFLICT`，`details` 只含 `current_version`。资料删除不使用 `If-Match`，因为专用删除令牌已经绑定完整版本与影响集合。只读、追加历史和幂等标签关联不需要版本前置条件。

## 3. 稳定枚举

| 枚举 | 英文代码（持久化/API） | 中文显示标签 |
| --- | --- | --- |
| `ResourceSourceType` | `WEB` / `FILE` / `PASTE` | 网页 / 文件 / 粘贴内容 |
| `LearningStatus` | `UNREAD` / `IN_PROGRESS` / `COMPLETED` / `REVIEW_DUE` / `ARCHIVED` | 未读 / 学习中 / 已完成 / 待复习 / 已归档 |
| `OriginalFileStatus` | `PENDING` / `READY` / `FAILED` | 保存中 / 可用 / 保存失败 |
| `ReviewPlanStatus` | `SCHEDULED` / `PAUSED` | 已安排 / 已移出复习列表 |
| `ReviewResultType` | `UNDERSTOOD` / `NEEDS_REVIEW` | 已掌握 / 仍需复习 |
| `ReviewScope` | `TODAY` / `OVERDUE` / `UPCOMING` / `ALL` | 今天 / 已逾期 / 未来 / 全部 |

中文文案可优化，但不得改变英文代码或重写已有历史。

## 4. 对象字段字典

通用概念类型：`uuid` 为 UUID 字符串，`instant` 为带时区 RFC 3339 时间点，`date` 为 `YYYY-MM-DD` 本地日历日期，`int` 为整数。示例均为虚构值。`C/U` 表示创建/更新时客户端可写；`R` 表示只读。敏感字段不得进入普通日志；`内部` 字段不出现在业务响应。

### 4.1 LearningResource（resources 所有）

| API 名称 | 类型/示例 | C/U | 必填/可空/默认/限制 | 敏感 | 所有者与不变量 |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid / `018f...0001` | R | 必有，不空 | 否 | resources；服务端生成 |
| `title` | string / `FastAPI 入门` | C/U | 必填，不空，去首尾空白后 1～200 字符 | 否 | resources |
| `source_type` | enum / `WEB` | C | 必填，不空，创建后不可变 | 否 | resources；三种之一 |
| `source_url` | uri / `https://example.test/guide` | C/U | WEB 必填；其他类型必须省略；最大 2048 | 是 | resources；只允许 http/https，无凭据和片段 |
| `pasted_content` | string / `# 学习摘录` | C/U | PASTE 必填；其他类型必须省略；1～1,000,000 字符 | 是 | resources；原文，不参与第一阶段统一搜索 |
| `source_name` | string / `示例文档站` | C/U | 可空，最大 120；`null` 清空 | 是 | resources |
| `save_reason` | string / `用于理解路由` | C/U | 可空，最大 1000；`null` 清空 | 是 | resources；参与搜索 |
| `topic_id` | uuid | C/U | 可空，默认 null；`null` 清空 | 否 | resources 唯一写入；taxonomy 只验证存在 |
| `version` | int / `3` | R | 必有，>=1 | 否 | resources；元数据/来源内容变化递增 |
| `created_at` | instant | R | 自动填充，不空 | 否 | resources；UTC |
| `updated_at` | instant | R | 自动填充，不空 | 否 | resources；查看/下载不改变 |

FILE 创建时不接受 `source_url`/`pasted_content`，并在同一成功响应中组合一个 READY `original_file`。资源详情还组合只读的 `progress`、`tags` 和 `review_plan`；这些投影仍由各自模块拥有，不成为 LearningResource 的重复真相。

### 4.2 OriginalFile（resources 所有）

| API 名称 | 类型/示例 | C/U | 必填/可空/默认/限制 | 敏感 | 所有者与不变量 |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | R | 必有 | 否 | resources |
| `resource_id` | uuid | R | 必有，唯一 | 否 | resources；FILE 资料恰好一个 |
| `original_name` | string / `notes.pdf` | R | 1～255；仅显示/下载，绝不拼路径 | 是 | resources |
| `staging_key` | string | R/内部 | PENDING 可有，READY 后清空 | 是 | infrastructure；随机受控相对键 |
| `storage_key` | string | R/内部 | 最终键唯一，不出 API | 是 | infrastructure；不得接受客户端路径 |
| `size_bytes` | int / `2048` | R | 1～26,214,400 | 否 | resources；流式实测 |
| `media_type` | string / `application/pdf` | R | 规范化允许值 | 否 | resources；由内容识别确定 |
| `sha256` | string / 64 位十六进制 | R | 固定 64 小写字符 | 是 | resources；普通列表不返回，详情可返回 |
| `status` | enum / `READY` | R | 默认 PENDING | 否 | resources；仅允许规定转换 |
| `failure_code` | string | R | FAILED 时非空；否则 null；不含路径/文件名 | 否 | resources |
| `version` | int / `2` | R | 必有，默认 1；状态、failure_code、大小、媒体类型、SHA-256 或受控存储元数据实际变化时递增 | 否 | resources；删除影响绑定此值 |
| `created_at` / `updated_at` | instant | R | 自动，不空 | 否 | resources |

普通列表、复习列表和概览中的 `OriginalFileSummary` 只返回 `id`、`original_name`、`size_bytes`、`media_type` 和固定为 `READY` 的 `status`；不返回 `sha256`、`resource_id`、`failure_code`、`version` 或时间字段。完整 `OriginalFile` 只在 FILE 资料详情中返回。

### 4.3 DeletionConfirmation（resources 所有）

| API 名称 | 类型/示例 | C/U | 必填/可空/默认/限制 | 敏感 | 所有者与不变量 |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | R/内部 | 必有 | 否 | resources |
| `token_digest` | string | R/内部 | 令牌 SHA-256 摘要，不保存原令牌 | 是 | resources；唯一 |
| `resource_id` | uuid | R/内部 | 必有；逻辑绑定，不设随资料级联外键 | 否 | resources |
| `resource_version` | int | R/内部 | 预览版本 | 否 | resources |
| `impact_manifest` | object | R/内部 | 排序后的对象 ID+版本/不可变序号全集 | 是 | resources；非仅数量 |
| `impact_revision` | string | R | 64 位摘要，可返回 | 否 | resources |
| `expires_at` | instant | R | 创建后 5 分钟 | 否 | resources |
| `used_at` | instant | R/内部 | 可空，默认 null；消费后一次写入 | 否 | resources |
| `created_at` | instant | R/内部 | 自动 | 否 | resources |
| `confirmation_token` | string | R/仅预览响应 | 至少 256 位随机，不持久化 | 是 | resources；仅响应一次，前端只在确认对话内存中保存 |

记录在资料删除后仍保留至安全回收期（至少 24 小时），以识别重放。

### 4.4 LearningProgress（learning 所有）

| API 名称 | 类型/示例 | C/U | 必填/可空/默认/限制 | 敏感 | 所有者与不变量 |
| --- | --- | --- | --- | --- | --- |
| `resource_id` | uuid | R | 必有，唯一 | 否 | learning；每份可见资料恰一条 |
| `status` | enum / `IN_PROGRESS` | 通过 StudyRecord | 必有，默认 UNREAD | 否 | learning |
| `progress_percent` | int / `35` | 通过 StudyRecord | 0～100，默认 0 | 否 | learning；100 不自动完成 |
| `started_at` | instant | R | 可空；首次进入学习中自动填充 | 否 | learning |
| `completed_at` | instant | R | 可空；进入 COMPLETED 自动填充 | 否 | learning |
| `archived_from_status` | enum | R | ARCHIVED 时必有且不能是 ARCHIVED；其他时 null | 否 | learning；恢复目标 |
| `version` | int | R | 默认 1，实际变更递增 | 否 | learning；学习记录请求校验 |
| `updated_at` | instant | R | 自动 | 否 | learning；查看不改变 |

### 4.5 Topic（taxonomy 所有）

| API 名称 | 类型/示例 | C/U | 必填/可空/默认/限制 | 敏感 | 所有者与不变量 |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | R | 必有 | 否 | taxonomy |
| `name` | string / `Python` | C/U | 去首尾空白后 1～80 | 否 | taxonomy；NFKC+大小写折叠后唯一 |
| `description` | string | C/U | 可空，最大 500；null 清空 | 是 | taxonomy |
| `version` | int | R | 默认 1 | 否 | taxonomy |
| `created_at` / `updated_at` | instant | R | 自动 | 否 | taxonomy |
| `normalized_name` | string | R/内部 | 必有，不出 API | 否 | taxonomy；只用于唯一约束 |

删除被引用 Topic 返回 409；客户端须先通过 resources 逐份重分配或清空 `topic_id`。

### 4.6 Tag（taxonomy 所有）

| API 名称 | 类型/示例 | C/U | 必填/可空/默认/限制 | 敏感 | 所有者与不变量 |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | R | 必有 | 否 | taxonomy |
| `name` | string / `待实践` | C/U | 去首尾空白后 1～50 | 否 | taxonomy；NFKC+大小写折叠后唯一 |
| `version` | int | R | 默认 1 | 否 | taxonomy |
| `created_at` / `updated_at` | instant | R | 自动 | 否 | taxonomy |
| `normalized_name` | string | R/内部 | 必有，不出 API | 否 | taxonomy |

颜色不属于已确认需求，不进入当前对象。删除有关联的 Tag 返回 409，先逐份解除关联。

### 4.7 ResourceTag（taxonomy 所有）

| API 名称 | 类型/示例 | C/U | 必填/可空/默认/限制 | 敏感 | 所有者与不变量 |
| --- | --- | --- | --- | --- | --- |
| `resource_id` | uuid | 由关联接口 | 必有 | 否 | taxonomy；资源存在 |
| `tag_id` | uuid | 由关联接口 | 必有 | 否 | taxonomy；标签存在 |
| `created_at` | instant | R | 自动 | 否 | taxonomy |
| `association_version` | int | R | 固定 1 | 否 | taxonomy；复合唯一 `(resource_id,tag_id)`；删除后重加是新关联 |

PUT 添加与 DELETE 移除是幂等的，避免整组标签覆盖造成并发丢失。

### 4.8 Note（notes 所有）

| API 名称 | 类型/示例 | C/U | 必填/可空/默认/限制 | 敏感 | 所有者与不变量 |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | R | 必有 | 否 | notes |
| `resource_id` | uuid | C(路径) | 必有，不可改 | 否 | notes |
| `content` | string / `这里记录个人理解。` | C/U | 去首尾后 1～50,000；不空 | 是 | notes；只存个人笔记，不混入 AI 内容 |
| `version` | int | R | 默认 1 | 否 | notes |
| `created_at` / `updated_at` | instant | R | 自动 | 否 | notes |

第一阶段笔记不进入资料统一搜索；删除笔记是直接删除，但资源整体删除时进入影响确认集合。

### 4.9 StudyRecord（learning 所有，追加后不可改）

| API 名称 | 类型/示例 | C/U | 必填/可空/默认/限制 | 敏感 | 所有者与不变量 |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | R | 必有 | 否 | learning |
| `resource_id` | uuid | C(路径) | 必有 | 否 | learning |
| `started_at` | instant | C | 必填 | 否 | learning |
| `duration_seconds` | int / `1800` | C | 必填，0～86,400 | 否 | learning；负值拒绝 |
| `progress_before/after` | int | C | 均 0～100；before 必须等于当前值 | 否 | learning |
| `status_before/after` | enum | C | before 必须等于当前值 | 否 | learning |
| `summary` | string | C | 可空，最大 5000 | 是 | learning |
| `questions_next` | string | C | 可空，最大 5000 | 是 | learning |
| `created_at` | instant | R | 自动 | 否 | learning；历史不可覆盖、修改或删除 |

请求提交 `expected_progress_version`、`started_at`、`duration_seconds`、前后进度和前后状态；服务端在同一事务读取当前值，验证 before 与当前值完全相等，再追加记录并更新 LearningProgress。任何一步失败全部回滚。

### 4.10 ActiveReviewPlan（reviews 所有）

| API 名称 | 类型/示例 | C/U | 必填/可空/默认/限制 | 敏感 | 所有者与不变量 |
| --- | --- | --- | --- | --- | --- |
| `resource_id` | uuid | C(路径) | 必有，唯一 | 否 | reviews；每资料最多一条 |
| `due_date` | date / `2026-09-12` | C/U | SCHEDULED 必填；PAUSED 必须 null | 否 | reviews；保持日历日期，不换算 UTC |
| `status` | enum | C/U | 默认 SCHEDULED | 否 | reviews |
| `version` | int | R | 默认 1 | 否 | reviews |
| `created_at` / `updated_at` | instant | R | 自动 | 否 | reviews |

安排计划会在同一事务令学习状态进入 REVIEW_DUE（ARCHIVED 资料拒绝）；暂停计划时请求必须给出 `return_learning_status=IN_PROGRESS` 或 `COMPLETED`，并事务性退出 REVIEW_DUE。

### 4.11 ReviewRecord（reviews 所有，追加后不可改）

| API 名称 | 类型/示例 | C/U | 必填/可空/默认/限制 | 敏感 | 所有者与不变量 |
| --- | --- | --- | --- | --- | --- |
| `id` | uuid | R | 必有 | 否 | reviews |
| `resource_id` | uuid | C(路径) | 必有 | 否 | reviews |
| `planned_date` | date | R | 来自完成时当前计划 | 否 | reviews |
| `completed_at` | instant | C | 可省略，默认服务端当前时间 | 否 | reviews |
| `result` | enum / `UNDERSTOOD` | C | 必填 | 否 | reviews |
| `notes` | string | C | 可空，最大 5000 | 是 | reviews |
| `next_review_date` | date | C | 可空；NEEDS_REVIEW 时必填 | 否 | reviews |
| `created_at` | instant | R | 自动 | 否 | reviews；历史不可覆盖、修改或删除 |

有下次日期时更新计划并保持 REVIEW_DUE；无下次日期只允许 UNDERSTOOD，计划转 PAUSED，学习状态转 COMPLETED。计划、记录和学习状态在同一事务更新。

OpenAPI 中 `ReviewRecord` 用条件 schema 固化上述规则：`NEEDS_REVIEW` 必须有非空 `next_review_date`；`UNDERSTOOD` 可以为 null。正向示例覆盖这两种合法形状；`x-rejected-examples` 只记录应被拒绝的反例，不得当作有效 schema 示例。

### 4.12 关系、唯一性与删除/保留语义 `[架构][细化]`

| 关系 | 基数与唯一约束 | 资料删除时 | 单独删除时 |
| --- | --- | --- | --- |
| Topic—LearningResource | Topic 1 对资料 0..*；资料 `topic_id` 可空 | 资料删除不影响 Topic | Topic 有引用即 409；先经 resources 重分配/清空 |
| LearningResource—OriginalFile | FILE 资料恰好 1，其他恰好 0；`resource_id`、存储键唯一 | 经确认并按 trash 协议删除 | 不提供单独删除/替换原件接口 |
| LearningResource—LearningProgress | 恰好 1；`resource_id` 唯一 | 经确认删除 | 不可单独删除 |
| LearningResource—Note | 1 对 0..* | 纳入影响集合，经确认删除 | 可按版本单独删除 |
| LearningResource—StudyRecord | 1 对 0..*；记录不可变 | 纳入影响集合，经确认删除 | 不提供修改/删除接口，当前值变化不能覆盖历史 |
| Tag—ResourceTag—LearningResource | 多对多；`(resource_id,tag_id)` 复合唯一 | 关联纳入影响集合并删除，Tag 保留 | Tag 有关联即 409；关联可幂等解除 |
| LearningResource—ActiveReviewPlan | 1 对 0..1；`resource_id` 唯一 | 纳入影响集合，经确认删除 | 不物理删除；移出列表时转 PAUSED |
| LearningResource—ReviewRecord | 1 对 0..*；记录不可变 | 纳入影响集合，经确认删除 | 不提供修改/删除接口，新结果不能覆盖历史 |
| LearningResource—DeletionConfirmation | 逻辑 1 对 0..*，不建级联外键 | 至少保留 24 小时以拒绝重放 | 过期且过安全回收期后清理 |

资料元数据用 `LearningResource.version`；OriginalFile 和其他可变从属对象使用自身 `version`；ResourceTag 使用不可变 `association_version=1`；不可变历史使用其 ID 与创建序号。删除 `impact_manifest` 绑定这些稳定值的全集，因此任意一增、一删或一改都会改变 `impact_revision`。

## 5. 资料来源与创建契约 `[需求][细化]`

一份资料恰好一种主要来源：

| 请求媒体类型 | 必须字段 | 必须省略 | 修改限制 |
| --- | --- | --- | --- |
| JSON WEB | `source_type=WEB,title,source_url` | `pasted_content,file` | 可改 URL；不能改类型 |
| JSON PASTE | `source_type=PASTE,title,pasted_content` | `source_url,file` | 可改原文；不能改类型 |
| multipart FILE | `source_type=FILE,title,file` | `source_url,pasted_content` | 原件不可替换；需新建资料 |

三者可带 `source_name`、`save_reason`、可空 `topic_id` 和最多 20 个不重复 `tag_ids`。JSON 中 `tag_ids` 是 UUID 数组；multipart 中是重复的 `tag_ids` 表单字段。响应只返回摘要/详情，不回显全部粘贴正文；详情通过 `pasted_content` 显式返回，因此属于敏感响应。文件创建只有达到 `OriginalFile.READY` 才返回 `201`；不暗示正文已解析。

所有 WEB 创建、修改和详情共同引用唯一 `SourceUrl` schema。服务端必须真正解析 URL，并同时满足：协议仅 http/https，username/password 均为空，fragment 为空；查询字符串允许保留。仅靠前缀字符串判断不够。`SourceUrl` 标记为敏感字段，不进入普通日志；例如 `https://user:password@example.test/doc#private` 必须返回 `422 VALIDATION_ERROR`。

`ResourcePatch` 不允许同时提交 `source_url` 和 `pasted_content`，这种请求在查询数据库前按 schema 返回 `422 VALIDATION_ERROR`。只提交一个来源字段时，服务端还必须与现有资料的不可变 `source_type` 比对：WEB 仅接受 `source_url`，PASTE 仅接受 `pasted_content`，FILE 两者都拒绝；不匹配返回 `409 SOURCE_TYPE_MISMATCH`，不修改任何数据。

## 6. 学习状态、进度与复习一致性

### 6.1 转换矩阵 `[需求][细化]`

`✓` 允许，括号内是额外条件；`—` 表示相同状态，可记录学习但必须至少改变进度或包含总结；`×` 返回 `409 INVALID_STATE_TRANSITION`。

| 从\到 | UNREAD | IN_PROGRESS | COMPLETED | REVIEW_DUE | ARCHIVED |
| --- | --- | --- | --- | --- | --- |
| UNREAD | — | ✓（首次自动 started_at） | × | × | ✓（记住 UNREAD） |
| IN_PROGRESS | ✓（同请求 progress_after 必须为 0） | — | ✓（自动 completed_at） | ✓（必须先/同时已有 SCHEDULED 计划） | ✓（记住 IN_PROGRESS） |
| COMPLETED | × | ✓（清空当前 completed_at，历史保留） | — | ✓（必须安排计划；保留 completed_at） | ✓（记住 COMPLETED） |
| REVIEW_DUE | × | ✓（仅暂停计划且明确返回 IN_PROGRESS） | ✓（完成复习且无下次日期，或暂停时明确返回 COMPLETED） | — | ✓（保留 SCHEDULED 计划及 due_date） |
| ARCHIVED | 仅当记忆值为 UNREAD | 仅当记忆值为 IN_PROGRESS | 仅当记忆值为 COMPLETED | 仅当记忆值为 REVIEW_DUE | — |

- 进度必须为整数 0～100。达到 100 不自动改为 COMPLETED；状态需要用户明确提交。
- 手动回到 UNREAD 时，非零进度不会静默清零；客户端必须在同一 StudyRecord 请求显式提交 `progress_after=0`。
- 归档保留进度、started_at、completed_at 和历史；普通资料/复习列表默认排除 ARCHIVED，明确筛选可查看。
- REVIEW_DUE 表示已经学习过且存在复习需要；SCHEDULED 计划进入该状态，暂停或无下次安排的完成复习退出该状态。安排计划只允许当前为 IN_PROGRESS、COMPLETED 或 REVIEW_DUE；UNREAD/ARCHIVED 返回 409。完成复习要求当前计划为 SCHEDULED 且学习状态为 REVIEW_DUE。
- 归档 REVIEW_DUE 时，LearningProgress 与 StudyRecord 在同一事务更新，LearningProgress.version 递增；ActiveReviewPlan 保持 SCHEDULED、保留 due_date 且版本不变，但所有复习列表排除已归档资料。恢复只能回到记忆的 REVIEW_DUE，LearningProgress.version 再递增，原计划重新可见。归档/恢复都不暂停计划、不清空日期，也不伪造复习结果。
- 学习记录与 LearningProgress、复习动作与 ActiveReviewPlan/ReviewRecord/LearningProgress 均在单一数据库事务中更新。

### 6.2 时间规则 `[架构][细化]`

- 时间点用带时区 RFC 3339 字符串交换，例如 `2026-09-02T10:30:00+08:00`；后端规范化为 UTC 保存并以 `Z` 返回。
- 用户选的复习日是本地日历日期 `YYYY-MM-DD`，不能转成 UTC 时间点，因此跨时区后仍显示同一日期。
- 日期相关接口要求有效 IANA `time_zone`（如 `Asia/Shanghai`）。`TODAY` 是 `due_date ==` 该时区当前日期；`OVERDUE` 是 `<`；`UPCOMING` 是 `>`。
- 一周为用户时区周一 00:00 到下一周一 00:00 的半开区间。学习时长按实际学习区间与该本地周的重叠秒数计算，不能简单假定一天永远 24 小时；夏令时切换由时区数据库处理。
- 跨日学习记录保留一个 UTC `started_at` 和秒数；界面按用户时区显示。统计按区间重叠拆分，不把全部时长粗略归到开始日。
- `created_at` 创建时自动填；`updated_at` 仅在该对象实际修改时更新。进入 IN_PROGRESS 首次填 `started_at`；离开再回来不覆盖最早开始时间。进入 COMPLETED 填当前 `completed_at`；转回 IN_PROGRESS 清空当前值，但历史仍在 StudyRecord。REVIEW_DUE、归档/恢复不覆盖已有完成时间。查看、搜索、统计和下载均不改变时间字段。

## 7. 本地访问安全协议 `[架构][细化]`

### 7.1 规范来源与启动令牌

- 默认打包演示的 UI 来源是 `http://127.0.0.1:8000`，可信 authority 是 `127.0.0.1:8000`；默认开发 UI 来源是 `http://127.0.0.1:5173`，同源 `/api` 代理固定转向可信后端 authority `127.0.0.1:8000`。若用户显式更改启动端口，进程启动时只从该配置计算一次新的完整规范值，之后仍必须精确匹配；不自动信任 `localhost`、IPv6、其他端口或局域网地址。
- 后端只监听 `127.0.0.1`。可信 Host/`:authority` 必须是配置的单一规范值；重复 Host、绝对形式目标不一致、`Forwarded`/`X-Forwarded-Host` 试图覆盖均拒绝。开发代理必须把后端实际收到的 Host 固定为可信 API authority，不能动态转发用户 Host。
- 每次后端启动使用系统安全随机源生成至少 32 字节（256 位）令牌；后端重启立即使旧令牌失效。比较使用恒定时间算法。
- `GET /api/v1/local-session` 仅在 Host 正确、`Sec-Fetch-Site=same-origin`、`Sec-Fetch-Mode=cors`、`Sec-Fetch-Dest=empty` 时返回令牌；`Origin` 可缺失，若存在必须等于规范 UI 来源。响应 `Cache-Control: no-store`。
- 前端只把令牌放在当前页面内存；不得进入 URL、Cookie、localStorage、sessionStorage、IndexedDB、Git、日志或错误。关闭/刷新页面后重新 bootstrap。
- 所有其他 `/api/v1` 读、下载、写请求都必须带 `X-StudyPilot-Token`。所有 POST/PUT/PATCH/DELETE 还必须有精确 Origin 和上述三个 Fetch Metadata 值。检查必须在解析请求体、查询数据库、创建暂存文件或任何副作用之前完成。
- CORS 只允许规范 UI 来源、实际方法以及 `Content-Type`、`X-StudyPilot-Token`、`X-StudyPilot-Deletion-Token`、`If-Match`；不允许 `*` 或凭据 Cookie。它是附加防线，不替代授权。
- 非浏览器客户端只能由用户从本次可信 UI 手动取得当次内存令牌，并同时显式发送规范来源头；不存在无令牌调试后门。交互式 API 文档遵守同一规则。

### 7.2 前置判定顺序

1. 解析 HTTP 起始行和头（限制大小/重复），校验 Host/authority；失败 403。
2. 处理 OPTIONS 预检：校验 Origin、请求方法和请求头白名单；不读取业务体、不访问数据库；合法返回 204，非法 403。
3. local-session 按 bootstrap 规则校验请求上下文并返回；不接受业务数据。
4. 其他 API 校验 `X-StudyPilot-Token`；失败 403。
5. 写请求再校验 Origin 和全部 Fetch Metadata；失败 403。
6. 之后才检查 Content-Type、读取/解析请求体、访问数据库或文件。

### 7.3 请求判定表

| 场景 | 结果 | 前置副作用 |
| --- | --- | --- |
| 正常同源 GET + 正确 Host/令牌 | 放行到业务校验 | 可查询数据库 |
| 正常同源写入 + 正确 Host/令牌/Origin/三个 Fetch 头 | 放行到媒体类型和业务校验 | 此前无 |
| local-session 正常同源 fetch，无令牌 | 200；只返回本次令牌 | 不查业务数据库 |
| 任意业务读取/下载无令牌或旧令牌 | 403 | 不查数据库/文件 |
| 恶意 HTML form（urlencoded/text/plain/multipart） | 403 | 不解析体、不建暂存文件 |
| `cross-site` 或 `same-site` fetch，即使令牌字段伪造 | 403 | 不读体/数据库/文件 |
| 写入 Origin 缺失、`null` 或非完整匹配 | 403 | 同上 |
| Fetch Metadata 缺失、未知值、dest/mode 不符 | 403 | 同上 |
| 合法预检 | 204，仅列出白名单 | 不要求业务令牌，不进业务路由 |
| 非白名单预检 | 403 | 无副作用 |
| 错误、重复或转发覆盖 Host | 403 | 在 token/体/数据库之前 |
| 非浏览器客户端仅有 token、没有来源上下文 | 写入 403；读取可在正确 Host+token 下进行 | 无写副作用 |

## 8. 文件上传、下载与对账 `[架构][细化]`

### 8.1 识别与限制

单文件上限 25 MiB，即 26,214,400 字节；空文件拒绝。扩展名、浏览器媒体类型和原名都不可信，必须结合规范化扩展名、文件签名/容器结构和内容校验：

| 格式 | 扩展名 | 必须验证 | 规范媒体类型 |
| --- | --- | --- | --- |
| PDF | `.pdf` | 文件头 `%PDF-`，结构可被保守识别 | `application/pdf` |
| Word OpenXML | `.docx` | ZIP 容器且含 `[Content_Types].xml`、`word/document.xml`；拒绝路径穿越项 | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| Word 旧格式 | `.doc` | OLE Compound File 固定签名 | `application/msword` |
| Markdown | `.md` / `.markdown` | 合法 UTF-8、无 NUL | `text/markdown; charset=utf-8` |
| TXT | `.txt` | 合法 UTF-8、无 NUL | `text/plain; charset=utf-8` |

浏览器声明与识别结果矛盾、双扩展伪装或不完整容器均返回 `FILE_TYPE_UNSUPPORTED`。这是格式识别，不宣称恶意内容扫描；扫描能力明确延期。

原始名只保留基名显示，删除控制字符和路径分隔影响，最多 255 字符；磁盘键始终是服务端随机值。下载仅允许 READY 且大小/SHA-256 与数据库一致，通过文件 ID 查找，不接受路径参数。响应使用 `Content-Disposition: attachment`（ASCII 安全回退名 + RFC 5987 编码名）、规范 Content-Type、`X-Content-Type-Options: nosniff`、`Cache-Control: private, no-store`；不内联执行文件。

### 8.2 上传状态机与崩溃恢复

1. 安全头全部通过后，流式读取到与最终目录同卷的随机暂存键，同时实施上限、格式校验并计算 SHA-256；刷新文件。
2. 第一数据库事务建立 LearningResource、LearningProgress 和 OriginalFile(PENDING)，保存唯一暂存/最终键、大小、类型和摘要。PENDING 资源不在普通列表可见。
3. 提交后复核暂存文件，以同卷原子替换提升到最终键并刷新目录。
4. 第二事务复核最终文件，把 OriginalFile 改为 READY。只有该事务提交后返回 `201`。
5. 失败时尽力清理当前请求尚未登记的暂存文件；已有记录由对账处理，不能返回成功。

允许转换只有 `PENDING→READY`、`PENDING→FAILED`、损坏的 `READY→FAILED`；FAILED 不恢复为 READY，用户需重新添加。对账在每次启动、之后每 60 秒运行；PENDING 超过 10 分钟视为超时。无引用暂存/最终/trash 文件至少等待 24 小时，并再次确认无活动上传和无数据库引用才回收。

| 崩溃点 | 对账结果 |
| --- | --- |
| PENDING 提交前 | 数据库无记录；24 小时后回收无引用暂存文件 |
| PENDING 提交后、提升前 | 有效暂存则幂等提升；无效/缺失则 FAILED |
| 提升后、READY 提交前 | 最终文件大小/hash 一致则补记 READY；否则隔离并 FAILED |
| READY 后文件缺失/不符 | 立即 READY→FAILED，禁止下载并报告损坏 |

所有修复必须幂等。READY 只表示原件可靠保存，不表示正文已经解析。

## 9. 删除确认协议 `[需求][架构][细化]`

1. `POST /resources/{id}/deletion-preview` 不删除数据；生成 5 分钟、一次性、至少 256 位不透明令牌。响应列出安全影响计数、资料版本、`impact_revision` 和过期时间，不返回正文、笔记或完整文件名。
2. 服务端保存令牌摘要，并把令牌绑定到资料 ID/版本，以及按类型和 ID 排序的 OriginalFile、Note、StudyRecord、ActiveReviewPlan、ReviewRecord、ResourceTag 的 ID+版本（不可变历史用创建序号）全集。只比较数量不够。
3. 用户确认后，DELETE 在 `X-StudyPilot-Deletion-Token` 专用头提交原令牌；URL、JSON、日志均不得出现。
4. 同一数据库写事务中验证未过期/未用/绑定正确并重算全集。变化时旧令牌立即作废，返回 `409 DELETION_IMPACT_CHANGED`；`details.current_impact` 只给当前资料版本、影响计数和 `impact_revision`，不得包含确认令牌或过期时间。OpenAPI 用 `DeletionImpactChangedErrorResponse` 把这一统一 `ErrorResponse` 场景收窄为不可多字段的机器 schema。界面展示新摘要，用户确认查看后必须重新调用 deletion-preview 才能取得新令牌。
5. 一致时先把 READY 文件原子移动到同卷 trash 隔离键，再标记令牌已用、删除关联及资料并提交；提交成功后异步/对账清理 trash。文件移动失败则数据库回滚。
6. 移动后提交前崩溃：数据库仍有 OriginalFile，对账从 trash 恢复最终键。提交后清理前崩溃：数据库已无记录，对账在 24 小时宽限后回收 trash。结果不确定时返回失败，绝不谎称成功。
7. 成功响应是 `204`。同令牌重放即使首次响应丢失也返回 `409 DELETION_TOKEN_REPLAYED`；过期 410；绑定其他资料 403。

主题/标签有引用时默认 `409 TAXONOMY_IN_USE` 并只返回安全计数。主题重分配/清空只能逐份调用 resources 修改资料；taxonomy 不直接写 `topic_id`，不会静默级联删除资料。

## 10. API 操作清单

所有路径均以 `/api/v1` 开头。表中“写安全”指令牌 + 精确 Origin + Fetch Metadata；“读安全”指令牌；所有操作都先校验 Host。OpenAPI 的每个 operation description 链接本节与对应规则。

| 方法与路径 | 用途/所有者 | 输入与成功 | 可预期错误/副作用 |
| --- | --- | --- | --- |
| GET `/local-session` | bootstrap / api | Fetch 头；200 `LocalSession` | 200/403/500；无业务副作用，只返回启动时已生成的进程内令牌 |
| GET `/resources` | 资料列表 / resources | 资料筛选分页；200 `ResourcePage` | 200/403/422/500；只读 |
| POST `/resources` | 三来源创建 / resources | JSON WEB/PASTE 或 multipart FILE；201 `ResourceDetail` | 201/400/403/404/413/415/422/500/503；创建资料，文件仅 READY 成功 |
| GET `/resources/{resource_id}` | 详情 / resources | 路径 ID；200 `ResourceDetail` | 200/403/404/500；只读 |
| PATCH `/resources/{resource_id}` | 修改元数据/同源内容 / resources | `ResourcePatch`；200 详情 | 200/400/403/404/409/415/422/428/500；写入并递增版本 |
| POST `/resources/{resource_id}/deletion-preview` | 删除预览 / resources | 写安全；200 `DeletionPreview` | 200/403/404/500；只创建确认记录 |
| DELETE `/resources/{resource_id}` | 确认删除 / resources | 专用删除头；204 | 204/403/404/409/410/500/503；不可逆删除，按第9节恢复 |
| PUT `/resources/{resource_id}/tags/{tag_id}` | 幂等关联 / taxonomy | 无体；200 `ResourceTag` | 200/403/404/500；首次创建关联，已有不变 |
| DELETE `/resources/{resource_id}/tags/{tag_id}` | 幂等解除 / taxonomy | 无体；204 | 204/403/404/500；关联不存在仍 204 |
| GET `/resources/{resource_id}/notes` | 笔记列表 / notes | 分页；200 `NotePage` | 200/403/404/422/500；只读 |
| POST `/resources/{resource_id}/notes` | 新增笔记 / notes | `NoteCreate`；201 Note | 201/400/403/404/415/422/500；创建 |
| GET `/resources/{resource_id}/notes/{note_id}` | 笔记详情 / notes | ID；200 Note | 200/403/404/500；只读 |
| PATCH `/resources/{resource_id}/notes/{note_id}` | 修改笔记 / notes | `NotePatch`；200 Note | 200/400/403/404/409/415/422/428/500；写入 |
| DELETE `/resources/{resource_id}/notes/{note_id}` | 删除笔记 / notes | If-Match；204 | 204/403/404/409/428/500；删除 |
| GET `/resources/{resource_id}/study-records` | 单资料历史 / learning | 分页/时间筛选；200 `StudyRecordPage` | 200/403/404/422/500；只读 |
| POST `/resources/{resource_id}/study-records` | 记录学习并更新当前值 / learning | `StudyRecordCreate`；201 `StudyRecordResult` | 201/400/403/404/409/415/422/500；事务写入 |
| GET `/study-records` | 全局近期活动 / learning | 分页/筛选；200 页面 | 200/403/422/500；只读 |
| GET `/topics` | 主题列表 / taxonomy | 分页、`q`；200 `TopicPage` | 200/403/422/500；只读 |
| POST `/topics` | 创建主题 / taxonomy | `TopicCreate`；201 Topic | 201/400/403/409/415/422/500；创建 |
| GET `/topics/{topic_id}` | 主题详情 / taxonomy | ID；200 Topic | 200/403/404/500；只读 |
| PATCH `/topics/{topic_id}` | 修改主题 / taxonomy | `TopicPatch`；200 Topic | 200/400/403/404/409/415/422/428/500；写入 |
| DELETE `/topics/{topic_id}` | 删除未使用主题 / taxonomy | If-Match；204 | 204/403/404/409/428/500；删除，不级联资料 |
| GET `/tags` | 标签列表 / taxonomy | 分页、`q`；200 `TagPage` | 200/403/422/500；只读 |
| POST `/tags` | 创建标签 / taxonomy | `TagCreate`；201 Tag | 201/400/403/409/415/422/500；创建 |
| GET `/tags/{tag_id}` | 标签详情 / taxonomy | ID；200 Tag | 200/403/404/500；只读 |
| PATCH `/tags/{tag_id}` | 修改标签 / taxonomy | `TagPatch`；200 Tag | 200/400/403/404/409/415/422/428/500；写入 |
| DELETE `/tags/{tag_id}` | 删除未使用标签 / taxonomy | If-Match；204 | 204/403/404/409/428/500；删除，不级联资料 |
| GET `/reviews` | 到期/逾期/未来列表 / reviews | scope/time_zone/筛选分页；200 `ReviewPlanPage` | 200/403/422/500；只读 |
| PUT `/reviews/{resource_id}` | 安排或改期 / reviews | `ReviewScheduleRequest`；200 `ReviewPlanResult` | 200/400/403/404/409/415/422/500；计划+学习状态事务写入 |
| DELETE `/reviews/{resource_id}` | 移出复习列表 / reviews | `ReviewPauseRequest` JSON；200 `ReviewPlanResult` | 200/400/403/404/409/415/422/500；计划暂停+状态事务写入 |
| POST `/reviews/{resource_id}/complete` | 完成复习 / reviews | `ReviewCompleteRequest`；201 `ReviewCompleteResult` | 201/400/403/404/409/415/422/500；追加历史并事务更新 |
| GET `/resources/{resource_id}/review-records` | 复习历史 / reviews | 分页；200 `ReviewRecordPage` | 200/403/404/422/500；只读 |
| GET `/analytics/overview` | 概览 / analytics | `time_zone`；200 `OverviewAnalytics` | 200/403/422/500；实时只读聚合 |
| GET `/analytics/topics` | 主题统计 / analytics | `time_zone`/分页/搜索排序；200 `TopicAnalyticsPage` | 200/403/422/500；实时只读聚合 |
| GET `/files/{file_id}/download` | 原件下载 / resources | 文件 ID；200 binary | 200/403/404/409/500/503；只读，不改时间 |

DELETE review 带 JSON 是契约列明的例外；它仍是写请求并必须先做安全前置校验，再读取请求体。

### 10.1 每个操作的成功/失败示例索引

上一张 35 行操作表的最后一列是逐 operation 响应状态矩阵（含成功与错误）；错误状态码对应第2.2节稳定错误码。OpenAPI 中每个非 204 operation 都在自己的成功响应 content 内给出可验证示例，每个 operation 也给出至少一个带安全示例的错误响应；WEB、PASTE 和 multipart FILE 三种创建媒体均有独立请求示例。以下短例仅作索引，不替代各 operation 示例：

以下为逐 operation 的稳定错误码矩阵（所有代码均使用第2.2节统一 ErrorResponse）：

| operationId | 可返回的 error.code |
| --- | --- |
| `bootstrapLocalSession` | `HOST_FORBIDDEN`, `REQUEST_ORIGIN_FORBIDDEN`, `UNKNOWN_ERROR` |
| `listResources` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `VALIDATION_ERROR`, `UNKNOWN_ERROR` |
| `createResource` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `REQUEST_ORIGIN_FORBIDDEN`, `MALFORMED_REQUEST`, `TOPIC_NOT_FOUND`, `TAG_NOT_FOUND`, `FILE_TOO_LARGE`, `CONTENT_TYPE_UNSUPPORTED`, `FILE_TYPE_UNSUPPORTED`, `VALIDATION_ERROR`, `STORAGE_PATH_UNAVAILABLE`, `UNKNOWN_ERROR` |
| `getResource` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `RESOURCE_NOT_FOUND`, `UNKNOWN_ERROR` |
| `updateResource` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `REQUEST_ORIGIN_FORBIDDEN`, `MALFORMED_REQUEST`, `RESOURCE_NOT_FOUND`, `TOPIC_NOT_FOUND`, `VERSION_CONFLICT`, `SOURCE_TYPE_MISMATCH`, `CONTENT_TYPE_UNSUPPORTED`, `VALIDATION_ERROR`, `VERSION_REQUIRED`, `UNKNOWN_ERROR` |
| `deleteResource` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `REQUEST_ORIGIN_FORBIDDEN`, `RESOURCE_NOT_FOUND`, `DELETION_TOKEN_REQUIRED`, `DELETION_TOKEN_INVALID`, `DELETION_TOKEN_REPLAYED`, `DELETION_IMPACT_CHANGED`, `DELETION_TOKEN_EXPIRED`, `STORAGE_PATH_UNAVAILABLE`, `UNKNOWN_ERROR` |
| `previewResourceDeletion` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `REQUEST_ORIGIN_FORBIDDEN`, `RESOURCE_NOT_FOUND`, `UNKNOWN_ERROR` |
| `attachResourceTag` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `REQUEST_ORIGIN_FORBIDDEN`, `RESOURCE_NOT_FOUND`, `TAG_NOT_FOUND`, `UNKNOWN_ERROR` |
| `detachResourceTag` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `REQUEST_ORIGIN_FORBIDDEN`, `RESOURCE_NOT_FOUND`, `TAG_NOT_FOUND`, `UNKNOWN_ERROR` |
| `listTopics` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `VALIDATION_ERROR`, `UNKNOWN_ERROR` |
| `createTopic` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `REQUEST_ORIGIN_FORBIDDEN`, `MALFORMED_REQUEST`, `DUPLICATE_TOPIC`, `CONTENT_TYPE_UNSUPPORTED`, `VALIDATION_ERROR`, `UNKNOWN_ERROR` |
| `getTopic` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `TOPIC_NOT_FOUND`, `UNKNOWN_ERROR` |
| `updateTopic` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `REQUEST_ORIGIN_FORBIDDEN`, `MALFORMED_REQUEST`, `TOPIC_NOT_FOUND`, `DUPLICATE_TOPIC`, `VERSION_CONFLICT`, `CONTENT_TYPE_UNSUPPORTED`, `VALIDATION_ERROR`, `VERSION_REQUIRED`, `UNKNOWN_ERROR` |
| `deleteTopic` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `REQUEST_ORIGIN_FORBIDDEN`, `TOPIC_NOT_FOUND`, `TAXONOMY_IN_USE`, `VERSION_CONFLICT`, `VERSION_REQUIRED`, `UNKNOWN_ERROR` |
| `listTags` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `VALIDATION_ERROR`, `UNKNOWN_ERROR` |
| `createTag` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `REQUEST_ORIGIN_FORBIDDEN`, `MALFORMED_REQUEST`, `DUPLICATE_TAG`, `CONTENT_TYPE_UNSUPPORTED`, `VALIDATION_ERROR`, `UNKNOWN_ERROR` |
| `getTag` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `TAG_NOT_FOUND`, `UNKNOWN_ERROR` |
| `updateTag` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `REQUEST_ORIGIN_FORBIDDEN`, `MALFORMED_REQUEST`, `TAG_NOT_FOUND`, `DUPLICATE_TAG`, `VERSION_CONFLICT`, `CONTENT_TYPE_UNSUPPORTED`, `VALIDATION_ERROR`, `VERSION_REQUIRED`, `UNKNOWN_ERROR` |
| `deleteTag` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `REQUEST_ORIGIN_FORBIDDEN`, `TAG_NOT_FOUND`, `TAXONOMY_IN_USE`, `VERSION_CONFLICT`, `VERSION_REQUIRED`, `UNKNOWN_ERROR` |
| `listResourceNotes` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `RESOURCE_NOT_FOUND`, `VALIDATION_ERROR`, `UNKNOWN_ERROR` |
| `createResourceNote` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `REQUEST_ORIGIN_FORBIDDEN`, `MALFORMED_REQUEST`, `RESOURCE_NOT_FOUND`, `CONTENT_TYPE_UNSUPPORTED`, `VALIDATION_ERROR`, `UNKNOWN_ERROR` |
| `getResourceNote` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `RESOURCE_NOT_FOUND`, `NOTE_NOT_FOUND`, `UNKNOWN_ERROR` |
| `updateResourceNote` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `REQUEST_ORIGIN_FORBIDDEN`, `MALFORMED_REQUEST`, `RESOURCE_NOT_FOUND`, `NOTE_NOT_FOUND`, `VERSION_CONFLICT`, `CONTENT_TYPE_UNSUPPORTED`, `VALIDATION_ERROR`, `VERSION_REQUIRED`, `UNKNOWN_ERROR` |
| `deleteResourceNote` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `REQUEST_ORIGIN_FORBIDDEN`, `RESOURCE_NOT_FOUND`, `NOTE_NOT_FOUND`, `VERSION_CONFLICT`, `VERSION_REQUIRED`, `UNKNOWN_ERROR` |
| `listResourceStudyRecords` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `RESOURCE_NOT_FOUND`, `VALIDATION_ERROR`, `UNKNOWN_ERROR` |
| `createResourceStudyRecord` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `REQUEST_ORIGIN_FORBIDDEN`, `MALFORMED_REQUEST`, `RESOURCE_NOT_FOUND`, `VERSION_CONFLICT`, `INVALID_STATE_TRANSITION`, `STATE_CONFLICT`, `CONTENT_TYPE_UNSUPPORTED`, `VALIDATION_ERROR`, `UNKNOWN_ERROR` |
| `listStudyRecords` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `VALIDATION_ERROR`, `UNKNOWN_ERROR` |
| `listReviews` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `VALIDATION_ERROR`, `UNKNOWN_ERROR` |
| `scheduleReview` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `REQUEST_ORIGIN_FORBIDDEN`, `MALFORMED_REQUEST`, `RESOURCE_NOT_FOUND`, `VERSION_CONFLICT`, `INVALID_STATE_TRANSITION`, `STATE_CONFLICT`, `CONTENT_TYPE_UNSUPPORTED`, `VALIDATION_ERROR`, `UNKNOWN_ERROR` |
| `pauseReview` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `REQUEST_ORIGIN_FORBIDDEN`, `MALFORMED_REQUEST`, `RESOURCE_NOT_FOUND`, `VERSION_CONFLICT`, `INVALID_STATE_TRANSITION`, `STATE_CONFLICT`, `CONTENT_TYPE_UNSUPPORTED`, `VALIDATION_ERROR`, `UNKNOWN_ERROR` |
| `completeReview` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `REQUEST_ORIGIN_FORBIDDEN`, `MALFORMED_REQUEST`, `RESOURCE_NOT_FOUND`, `VERSION_CONFLICT`, `INVALID_STATE_TRANSITION`, `STATE_CONFLICT`, `CONTENT_TYPE_UNSUPPORTED`, `VALIDATION_ERROR`, `UNKNOWN_ERROR` |
| `listResourceReviewRecords` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `RESOURCE_NOT_FOUND`, `VALIDATION_ERROR`, `UNKNOWN_ERROR` |
| `getOverviewAnalytics` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `VALIDATION_ERROR`, `UNKNOWN_ERROR` |
| `listTopicAnalytics` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `VALIDATION_ERROR`, `UNKNOWN_ERROR` |
| `downloadOriginalFile` | `HOST_FORBIDDEN`, `LOCAL_TOKEN_REQUIRED`, `LOCAL_TOKEN_INVALID`, `FILE_NOT_FOUND`, `FILE_STATE_UNAVAILABLE`, `FILE_CORRUPTED`, `STORAGE_PATH_UNAVAILABLE`, `UNKNOWN_ERROR` |


| 操作组 | 成功示例 | 失败示例 |
| --- | --- | --- |
| local-session | `200 {data:{token:"<本次内存令牌>",expires_on_restart:true}}`（文档占位符，不是真令牌） | `403 HOST_FORBIDDEN` |
| resources 创建/读/改 | `201/200 {data:{id:"018f...0001",source_type:"WEB",version:1,...}}` | `422 VALIDATION_ERROR` 或 `404 RESOURCE_NOT_FOUND` |
| 删除预览/执行 | `200 {data:{impact:{note_count:2,...},expires_at:"..."}}` / `204` | `409 DELETION_IMPACT_CHANGED` |
| taxonomy 与标签关联 | `201 {data:{id:"...",name:"Python",version:1}}` / `200 ResourceTag` / `204` | `409 DUPLICATE_TOPIC` 或 `TAXONOMY_IN_USE` |
| notes | `201/200 {data:{id:"...",content:"个人理解",version:1,...}}` / `204` | `409 VERSION_CONFLICT` |
| study-records | `201 {data:{record:{...},progress:{...}}}` / `200 page` | `409 INVALID_STATE_TRANSITION` |
| reviews | `200 plan result` / `201 complete result` / `200 page` | `409 STATE_CONFLICT` |
| analytics | `200 {data:{resource_total:4,...}}` | `422 VALIDATION_ERROR`（无效 time_zone） |
| download | `200 application/pdf` | `409 FILE_STATE_UNAVAILABLE` |

安全失败统一示例：

```json
{"error":{"code":"LOCAL_TOKEN_REQUIRED","message":"需要当前运行会话。","details":{},"request_id":"req_7cc640f6b1764ed0"}}
```

## 11. 请求/响应 schema 要点

- `ResourceSummary`：使用 `WebResourceSummary` / `PasteResourceSummary` / `FileResourceSummary` 按 `source_type` 判别。WEB/PASTE 的 `original_file` 必须为 null；FILE 必须返回 READY `OriginalFileSummary`。列表、复习和概览不返回 `source_url`、`pasted_content`、`sha256` 或其他原件详情字段。
- `ResourceDetail`：使用 `source_type` 判别的 `WebResourceDetail`、`PasteResourceDetail`、`FileResourceDetail` 联合；WEB 只额外返回敏感 `source_url`，PASTE 只额外返回敏感 `pasted_content`，FILE 只返回非空且 READY 的 `original_file`，不得出现其他来源字段。
- `ResourcePatch`：必含 `expected_version`，至少一个可修改字段；`source_url` 与 `pasted_content` 不得同时出现，且只能匹配现有资料的 WEB/PASTE 来源，不匹配返回 `409 SOURCE_TYPE_MISMATCH`；`topic_id/source_name/save_reason` 可显式 null。
- Topic/Tag/Note PATCH 必含 `expected_version` 和至少一个业务字段。
- StudyRecordCreate 必含 `expected_progress_version`、`started_at`、`duration_seconds`、`progress_before/after`、`status_before/after`；服务端必须核对 before，不能信任客户端。
- ReviewScheduleRequest 必含 `expected_progress_version`、可空 `expected_plan_version`（首次为 null）、`due_date`；ARCHIVED 拒绝。
- ReviewPauseRequest 必含两个当前版本和 `return_learning_status`；只能为 IN_PROGRESS/COMPLETED。
- ReviewCompleteRequest 必含两个版本、result，可选 notes/completed_at/next_review_date；NEEDS_REVIEW 必须有 next_review_date。
- `ReviewListItem` 组合计划和 `ResourceSummary`，使列表能显示标题、主题和当前进度，而不复制权威字段。
- OverviewAnalytics 包含全部资料（包括 ARCHIVED）的总数和五状态计数、当前学习、今天复习、最近 5 份资料、最近 5 条学习记录、本周秒数；不保存为第二套事实。当前学习和今天复习排除 ARCHIVED。
- TopicAnalytics 包含 topic、resource_count、completed_count、completion_rate（0～1，分母 0 时为 0）和 study_seconds。

OpenAPI 3.1 使用 JSON Schema 联合类型（如 `type:["string","null"]`）表达可空，使用 `oneOf` 表达 WEB/PASTE 两种 JSON 创建结构；multipart FILE 使用独立 schema。事务、前置拒绝顺序、对账和删除恢复无法完全由 OpenAPI 表达，因此各 operation 的 description 用 `x-contract-section` 指向本文件第 6～9 节。

## 12. 需求—契约—OpenAPI 三向追踪

| 需求 | 本文承载 | OpenAPI paths / schemas |
| --- | --- | --- |
| 5.1 添加资料 | 第4.1/4.2、5、8节 | `/resources` POST；`WebResourceCreate`、`PasteResourceCreate`、`FileResourceCreate`、`OriginalFile` |
| 5.2 基本信息 | 第4、6.2节 | `LearningResource`、`ResourceDetail`、`LearningProgress`、`ActiveReviewPlan` |
| 5.3 资料库 | 第2.3、9、10节 | `/resources` GET、`/resources/{id}` GET/PATCH/DELETE、deletion-preview、download |
| 5.4 分类搜索筛选 | 第2.3、4.5～4.7、10节 | resources 查询；topics/tags CRUD；resource-tag PUT/DELETE |
| 5.5 状态进度 | 第4.4/4.9、6节 | study-records POST/GET；`LearningStatus`、`LearningProgress` |
| 5.6 个人笔记 | 第4.8、10节 | notes GET/POST/PATCH/DELETE；`Note` |
| 5.7 学习记录 | 第4.9、6.2、10节 | 单资源/全局 study-records；`StudyRecord` |
| 5.8 复习管理 | 第4.10/4.11、6、10节 | reviews list/schedule/pause/complete、review-records；review schemas |
| 5.9 概览统计 | 第2.3、6.2、10～11节 | `/analytics/overview`、`/analytics/topics`；analytics schemas |
| 5.10 页面入口 | 第10节提供全部页面可调用入口 | 上述全部 paths；前端页面实现延期，不在本任务 |
| 架构6 模块所有权 | 第4、10节每项 owner | tags 与各 operation tags/description |
| 架构7 公共 API/错误/删除 | 第2、9、10节 | 全部 paths、`ErrorResponse`、`DeletionPreview` |
| 架构8 概念对象 | 第4节 | components/schemas 中 11 个同名对象 |
| 架构9 安全与隐私 | 第7～9节 | `LocalToken`、复用 header 参数、403/409/410/413/415/503 响应 |
| 架构11 可追踪性 | 本表 | OpenAPI operationId 与 schema 名称稳定映射 |

## 13. 技术细化决定汇总

以下不是新产品功能，而是为后续实现消除猜测的技术参数：UUID v4；字段长度与版本规则；页码分页 20/100；稳定排序 ID 决胜；上传 25 MiB；删除令牌 5 分钟；上传 PENDING 超时 10 分钟；启动及每 60 秒对账；孤儿/trash 至少 24 小时宽限；IANA 时区和周一周界；UTF-8 文本、PDF/DOC/DOCX 保守格式识别；Topic/Tag NFKC+大小写折叠唯一；PUT/DELETE 标签关联幂等。

这些决定的变更也必须走契约变更流程。后续数据库迁移必须保持本文件的所有权、唯一性、关系、版本、UTC/日期和历史不可覆盖不变量；不得从当前 SQLite 实现反向改变公共契约。
