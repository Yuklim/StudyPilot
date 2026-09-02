# TASK-003 独立审查报告

## 1. 审查信息

- Reviewer：`qa_reviewer`
- 审查目标：TASK-003 第一阶段 API 与数据契约冻结候选
- 比较基线：`3b911834f2e44edd5bd25500b60275640e34a676`
- 冻结候选提交 SHA：`c5f7acb866ce8eeb7402e1b7cd4b819e3a6066dd`
- 候选父提交：`0c1ef24a72bdafb6702038ab5cdfb52f22eb7ff3`
- Merge-base：`3b911834f2e44edd5bd25500b60275640e34a676`
- 审查日期：2026-09-02
- 实际运行权限：`read-only`
- 权限证据：独立受限只读沙箱；临时文件写入被系统拒绝；未修改、提交、推送或合并
- 工作区：干净，HEAD 精确等于冻结候选，HANDOFF 已包含在候选中

## 2. Findings

### [P1] 禁止在影响变化错误中签发新的删除令牌

- 位置：`docs/contracts/openapi-v1.json:64`；`docs/contracts/API与数据契约基线.md:79`
- 违反的需求、任务或规则：TASK-003 第 8、22、28 项；架构 7.4；契约自身“错误响应绝不包含访问令牌或删除令牌”的规则。
- 触发场景：用户取得删除预览后关联对象发生变化，DELETE 返回 `409 DELETION_IMPACT_CHANGED`。
- 实际影响：409 错误的 `details.preview` 直接包含新的 `confirmation_token`，既违反令牌不得进入错误响应的安全保证，也弱化“重新预览—查看新影响—再次确认”的用户控制边界。
- 安全修复路径：409 只返回新影响摘要及 revision；用户确认查看后重新调用 deletion-preview 获取新令牌。同步修改中文规则、错误目录、OpenAPI 示例和 schema。

### [P1] 统一 REVIEW_DUE 资料归档时的复习计划语义

- 位置：`docs/contracts/API与数据契约基线.md:338`；`docs/contracts/API与数据契约基线.md:345`
- 违反的需求、任务或规则：TASK-003 第 14、17 项及“状态、进度和复习一致性”要求。
- 触发场景：将 `REVIEW_DUE` 资料归档，之后再恢复。
- 实际影响：转换矩阵要求计划同时转为 `PAUSED`，但后文要求保留 `SCHEDULED` 计划；同时字段规则规定 PAUSED 的 `due_date` 必须为 null。实现者无法判断应保留还是清空复习日期，可能造成计划丢失或生成违反契约的对象。
- 安全修复路径：明确唯一行为，并同步转换矩阵、计划字段不变量、归档/恢复事务、版本并发规则和 OpenAPI。若采用“保留 SCHEDULED、列表排除归档资料”，应删除矩阵中的 PAUSED 要求。

### [P1] 从 ResourceSummary 机器 schema 中彻底排除粘贴正文

- 位置：`docs/contracts/openapi-v1.json:247`；`docs/contracts/openapi-v1.json:249`
- 违反的需求、任务或规则：TASK-003 第 10、12、32 项；契约第 11 节关于 Summary/Detail 投影的规则。
- 触发场景：按 OpenAPI 生成或验证资料列表、复习列表和概览中的 `ResourceSummary`。
- 实际影响：Summary 继承包含 `pasted_content` 的 `LearningResource`，因而允许列表返回最多 1,000,000 字符的私人正文；Detail 又强制所有来源同时出现 `source_url` 和 `pasted_content`，与“仅对应来源返回字段”矛盾。
- 安全修复路径：建立不含来源正文的基础摘要 schema；使用按 `source_type` 判别的 WEB/PASTE/FILE Detail 联合 schema，确保 Summary 永远不含正文，Detail 只要求对应来源字段。

### [P2] 为 OriginalFile 定义可绑定的稳定变更版本

- 位置：`docs/contracts/API与数据契约基线.md:174`；`docs/contracts/API与数据契约基线.md:313`；`docs/contracts/API与数据契约基线.md:436`
- 违反的需求、任务或规则：TASK-003 第 11、27、28 项关于关联版本和稳定删除影响集合的要求。
- 触发场景：删除预览后，对账把 OriginalFile 从 READY 改为 FAILED，随后使用旧令牌删除。
- 实际影响：契约声称每个可变从属对象都有版本且 OriginalFile 以 ID+版本进入影响集合，但字段字典和 OpenAPI 都没有该版本或等价变更序号，无法保证状态变化会改变 `impact_revision`。
- 安全修复路径：为 OriginalFile 增加递增版本，或冻结明确等价的不可碰撞变更序号；规定状态、摘要或存储元数据变化时递增，并纳入删除 manifest。

### [P2] 在 OpenAPI 中表达核心对象的条件必填与可空规则

- 位置：`docs/contracts/openapi-v1.json:205`；`docs/contracts/openapi-v1.json:213`；`docs/contracts/openapi-v1.json:237`
- 违反的需求、任务或规则：TASK-003 第 10、31、32 项。
- 触发场景：机器校验 `FAILED` 但无 failure_code 的文件、`ARCHIVED` 但恢复状态仍为 ARCHIVED 的进度，或 `SCHEDULED` 但 due_date 为 null 的计划。
- 实际影响：OpenAPI 接受中文字段字典明确禁止的对象，契约测试和生成类型无法识别关键状态不变量。
- 安全修复路径：使用 OpenAPI 3.1 的 `if/then/else` 或判别联合表达 OriginalFile、LearningProgress、ActiveReviewPlan 的条件约束，并补充对应安全示例。

### [P2] 补齐每个请求体操作的统一错误状态

- 位置：`docs/contracts/openapi-v1.json:63`
- 违反的需求、任务或规则：TASK-003 第 6～8、20、31、32 项；契约第 2.2、2.4 节。
- 触发场景：除资料创建外的 JSON 操作收到畸形 JSON、错误 Content-Type，或 PATCH 缺少 required version。
- 实际影响：11 个其他请求体操作没有声明 `400 MALFORMED_REQUEST` 和 `415 CONTENT_TYPE_UNSUPPORTED`；PATCH 操作也未声明契约规定的 428。资料创建引用不存在的 topic/tag 时还缺少 404。Markdown 操作表同样遗漏，客户端无法稳定处理错误。
- 安全修复路径：建立逐 operation 错误矩阵，将 400/404/415/428 等适用状态同步写入 Markdown 和 OpenAPI，并为具体错误提供安全示例。

### [P2] 为每个 operation 提供可验证的成功示例

- 位置：`docs/contracts/openapi-v1.json:57`
- 违反的需求、任务或规则：TASK-003 第 6、31、32 项。
- 触发场景：前端、契约测试或文档工具尝试从单个 operation 获得完整成功/失败样例。
- 实际影响：只按响应 content 中的 `example/examples` 计算，35 个操作中有 26 个没有成功响应示例；multipart FILE 也没有安全上传示例。第 10.1 节的分组短例不能逐项验证每个接口。另有 `getTopic`、`getTag`、`getResourceNote` 缺少文档声称每个 operation 都具备的 `x-contract-section`。
- 安全修复路径：为每个非 204 operation 增加最小成功响应示例，为每种创建媒体类型提供请求示例，并补齐相关契约章节引用。

### [P2] 冻结 ALL 复习列表中 null due_date 的排序位置

- 位置：`docs/contracts/API与数据契约基线.md:113`；`docs/contracts/API与数据契约基线.md:120`
- 违反的需求、任务或规则：TASK-003 第 18、19 项关于稳定排序和空值语义的要求。
- 触发场景：`scope=ALL` 同时包含 SCHEDULED 和 PAUSED；PAUSED 的 `due_date` 为 null，并使用默认 `due_date,title,id` 排序。
- 实际影响：契约没有规定 null 在前还是在后，不同实现可能产生不同页序，导致翻页重复、遗漏或前端顺序漂移。
- 安全修复路径：明确 null 的固定位置，例如 PAUSED 始终排在有日期计划之后，再按 title/id 排序；同步写入 OpenAPI description。

### [P2] 在机器 schema 中拒绝带凭据或片段的来源 URL

- 位置：`docs/contracts/openapi-v1.json:193`；`docs/contracts/openapi-v1.json:250`
- 违反的需求、任务或规则：TASK-003 第 10、12、32 项；中文字段字典对 source_url 的限制。
- 触发场景：提交 `https://user:password@example.test/doc#private`。
- 实际影响：当前 `format: uri` 加 `^https?://` 会接受中文契约禁止的 userinfo 和 fragment；`source_url` 还缺少其他敏感字段已经使用的 `x-sensitive` 标记，可能使凭据进入持久化、响应处理或日志工具。
- 安全修复路径：复用单一 SourceUrl schema，明确禁止 userinfo 和 fragment，并在创建、更新、响应投影中统一标记敏感性和验证规则。

### [P2] 提供可复现的 HANDOFF 检查命令

- 位置：`docs/tasks/TASK-003-HANDOFF.md:105`
- 违反的需求、任务或规则：根 AGENTS 第 9、12 节；TASK-003 第 10、12 节。
- 触发场景：Reviewer 或 Integration Owner 尝试复现交接中的自定义 OpenAPI、权限范围、安全参数和敏感信息检查。
- 实际影响：规定的 `git diff --check` 被记录为不同命令 `git diff --cached --check`；第 107、110～116 行多数只写检查名称和 PASS，没有完整命令或已提交脚本。语义缺陷仍存在也说明这些 PASS 无法证明 TASK-003 的完整断言。
- 安全修复路径：运行并记录任务要求的精确命令；对自定义检查提交或完整记录可复现的只读命令、输入 SHA 和输出摘要。修订形成新候选后重新完整审查。

### [P3] 修正剩余 schema 名称和枚举标签映射

- 位置：`docs/contracts/API与数据契约基线.md:452`；`docs/contracts/openapi-v1.json:185`
- 违反的需求、任务或规则：TASK-003 第 13、32 项。
- 触发场景：开发者按操作表寻找 `ResourceSummaryPage`，或机器客户端读取 ReviewScope 中文标签。
- 实际影响：OpenAPI 中实际只有 `ResourcePage`；ReviewScope 是唯一缺少 `x-labels-zh-CN` 的稳定枚举，无法逐项映射中文标签。
- 安全修复路径：统一页面 schema 名称，并为 ReviewScope 补齐与中文表一致的标签映射。

## 3. 审查覆盖

- [x] 完整 diff：5 个授权路径，999 行新增/修改
- [x] 相关调用路径：20 paths、35 operations、63 schemas、11 个核心对象及模块所有权
- [x] 需求 5.1～5.10、架构 6～9/11、TASK-003 全部 32 项及验收条件
- [x] 测试和检查证据
- [x] 两份公共契约逐项映射
- [x] Host、令牌、Origin、Fetch Metadata、上传、删除、安全与隐私边界
- [x] 修改范围及 coordinator 控制面例外
- [x] 35 个 Markdown/OpenAPI operation 集合一致，operationId 唯一
- [x] 388 个 `$ref` 全部可解析
- [x] 所有业务 operation 均具备 Host、403、500；写操作具备 Token、Origin 和三个 Fetch Metadata 参数
- [x] `git diff --check`、JSON 解析、治理验证、3 个治理单测及 FastAPI OpenAPI 模型解析通过
- [x] 未发现真实密钥、邮箱、私钥、用户主机路径或个人数据模式

## 4. 测试缺口与剩余风险

- 缺少自动化语义检查来验证投影字段排除、条件可空性、逐 operation 错误状态/示例、敏感字段标记、状态矩阵和删除错误不得携带令牌。
- 后端、前端和端到端测试按本任务非目标未运行；未来实现必须覆盖跨站前置拒绝、DST/跨日统计、上传崩溃点和删除并发重放。
- 第三方 OpenAPI linter 未提供；FastAPI 模型解析只能证明结构可解析，不能发现上述语义矛盾。
- DELETE 携带 JSON、恶意文件扫描延期及仅限本地单用户运行仍是已知剩余风险。

## 5. 总体结论

- `CHANGES_REQUIRED`
