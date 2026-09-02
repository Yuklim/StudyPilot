# TASK-003 第二轮独立审查报告

## 1. 审查信息

- Reviewer：`qa_reviewer`
- 审查目标：TASK-003 第二轮冻结候选
- 比较基线：`3b911834f2e44edd5bd25500b60275640e34a676`
- 冻结候选提交 SHA：`f76a97d768dfba7b63616b09576cbf6db8c413f8`
- 候选父提交：`0e4ec3f29c41f533e30d37d921a86e7b0ad49252`
- Merge-base：`3b911834f2e44edd5bd25500b60275640e34a676`
- 审查日期：2026-09-02
- 实际运行权限：`read-only`
- 权限证据：运行环境为 restricted/read-only；Git 写入临时缓存被系统以 `Operation not permitted` 拒绝；未修改文件、创建提交、推送或合并
- 工作区：干净；HEAD 精确等于冻结候选
- 分支：`agent/coordinator/TASK-003-evidence-r2`

## 2. Findings

P0、P1：No findings.

### [P2] 收窄 ResourceSummary 的文件投影并排除 SHA-256

- 位置：`docs/contracts/openapi-v1.json:254`、`docs/contracts/openapi-v1.json:255`；`docs/contracts/API与数据契约基线.md:173`、`docs/contracts/API与数据契约基线.md:557`
- 违反的需求、任务或规则：TASK-003 第 10、12、32 项；中文契约关于 `sha256` 不进入普通列表及来源投影互斥的规则。
- 触发场景：返回 FILE 资料列表、复习列表或概览中的 `ResourceSummary`。
- 实际影响：`ResourceSummary.original_file` 直接引用完整 `ReadyOriginalFile`，因此非空时必须返回敏感 `sha256`，与“普通列表不返回”矛盾；该 schema 也允许 FILE 的 `original_file=null`，或 WEB/PASTE 携带文件对象，未保持来源关系。
- 安全修复路径：建立不含 `sha256` 等详情字段的 `OriginalFileSummary`，并以按 `source_type` 判别的 Summary 联合 schema 保证 FILE 必有 READY 文件摘要、WEB/PASTE 必为 null。

### [P2] 修正四个 PATCH 成功示例的实际更新结果

- 位置：`docs/contracts/openapi-v1.json:46`、`docs/contracts/openapi-v1.json:87`、`docs/contracts/openapi-v1.json:100`、`docs/contracts/openapi-v1.json:119`
- 违反的需求、任务或规则：TASK-003 第 6、20、31、32 项；中文契约第 2.4 节。
- 触发场景：开发者或契约测试依据 `updateResource`、`updateTopic`、`updateTag`、`updateResourceNote` 的成功示例实现更新。
- 实际影响：请求分别修改保存原因、清空主题说明、修改标签名和笔记正文，但成功响应仍返回旧值、旧 `version=1` 和未变化的 `updated_at`。示例暗示成功修改可以不生效且不递增版本。
- 安全修复路径：让每个响应反映请求后的值，将实际修改对象版本递增至 2，并使用晚于创建/旧更新时间的 `updated_at`。

### [P2] 为 ReviewRecord 补齐结果与下次日期的条件 schema

- 位置：`docs/contracts/API与数据契约基线.md:295`；`docs/contracts/openapi-v1.json:250`
- 违反的需求、任务或规则：TASK-003 第 10、31、32 项。
- 触发场景：复习历史返回 `result=NEEDS_REVIEW`、`next_review_date=null`。
- 实际影响：中文字段字典规定 `NEEDS_REVIEW` 必须有下次日期，但 `ReviewRecord` 机器 schema 接受上述非法历史对象；实际只读验证也确认该对象通过 schema。
- 安全修复路径：在 `ReviewRecord` 中增加与 `ReviewCompleteRequest` 一致的 `if/then` 条件，并加入正反示例。

### [P2] 在 ResourcePatch 中表达来源字段互斥

- 位置：`docs/contracts/API与数据契约基线.md:559`；`docs/contracts/openapi-v1.json:263`
- 违反的需求、任务或规则：TASK-003 第 12、31、32 项。
- 触发场景：PATCH 同时提交 `source_url` 和 `pasted_content`，或对不匹配的现有来源类型提交来源字段。
- 实际影响：当前机器 schema 接受同时包含两个来源字段的请求，与“一份资料恰好一种主要来源”和中文修改限制不一致；生成客户端和契约测试无法提前识别非法组合。
- 安全修复路径：至少用 `oneOf`/`not` 禁止两个来源字段同时出现；同时在 operation 描述和错误矩阵中明确服务端按现有 `source_type` 校验不匹配字段时的稳定错误。

### [P2] 消除 createResource 的无错误码 409 响应

- 位置：`docs/contracts/openapi-v1.json:30`、`docs/contracts/openapi-v1.json:31`；`docs/contracts/API与数据契约基线.md:456`、`docs/contracts/API与数据契约基线.md:502`
- 违反的需求、任务或规则：TASK-003 第 6～8、31、32 项。
- 触发场景：`createResource` 返回契约声明的 HTTP 409。
- 实际影响：该 operation 声明 409，但其 `x-error-codes` 没有任何映射到 409 的错误码；复用的 409 示例是该 operation 不允许的 `VERSION_CONFLICT`。客户端无法稳定判断此响应。
- 安全修复路径：若创建流程没有合法 409 场景，删除 Markdown/OpenAPI 中的 409；否则定义有依据的稳定错误码，并同步错误目录、operation 矩阵和专用示例。

### [P2] 提供首轮要求的可复现专项检查命令

- 位置：`docs/tasks/TASK-003-HANDOFF.md:118`、`docs/tasks/TASK-003-HANDOFF.md:119`、`docs/tasks/TASK-003-HANDOFF.md:120`
- 违反的需求、任务或规则：根 AGENTS 第 9、12 节；首轮 REVIEW 第 90～96 行；TASK-003 第 10、12 节。
- 触发场景：Reviewer 或 Integration Owner 尝试复现“11 项专项断言”、引用/安全交叉检查及 Markdown—OpenAPI 映射。
- 实际影响：交接仍只记录检查名称、PASS 和结果摘要，没有完整命令或已提交脚本；首轮该 P2 未真正修复，也无法重现声称通过的断言逻辑。独立复验已经发现其断言遗漏上述语义问题。
- 安全修复路径：在 HANDOFF 中完整记录只读命令、输入 SHA 和输出摘要，或经任务授权提交可复现检查脚本；形成新候选后重新审查完整差异。

P3：No findings.

## 3. 审查覆盖

- [x] 完整差异：6 个文件，1193 行新增、2 行删除
- [x] 路径范围：实现提交仅修改两份授权契约；其余为 coordinator 允许的任务状态、索引、HANDOFF 和首轮 REVIEW
- [x] 20 paths、35 operations、35 个唯一 operationId
- [x] 11 个核心对象及 74 个 OpenAPI schemas
- [x] 432 个 `$ref` 全部可解析
- [x] Markdown/OpenAPI 的路径、方法、响应状态及 `x-error-codes` 双向集合
- [x] 三来源投影、状态转换、OriginalFile version、NULL 排序和 SourceUrl
- [x] Host、本地令牌、Origin、Fetch Metadata、CORS、安全拒绝顺序
- [x] 上传状态机、崩溃恢复、READY 门槛和下载约束
- [x] 删除影响集合、一次性令牌、影响变化、重放及 trash 恢复
- [x] 敏感信息扫描和范围检查

首轮 findings 复验结果：

- 3 个 P1：3/3 已修复。
- 7 个 P2：5 个已完整修复；逐 operation 示例仅结构性补齐但成功语义仍错误；可复现 HANDOFF 命令未修复。
- 1 个 P3：已修复。
- 新发现 4 个 schema/错误矩阵问题，详见以上 findings。

实际执行结果：

- `git diff --check 3b911834...f76a97d...`：PASS
- JSON 语法检查：PASS
- FastAPI OpenAPI 模型解析：PASS
- 治理验证：30 项 PASS
- 治理单测：3/3 PASS
- Markdown—OpenAPI 双向映射：35/35 PASS
- 安全参数交叉检查：PASS
- 257 个现有 schema/request/response 示例的可用 AJV 关键字验证：0 个结构失败
- 敏感模式扫描：未发现密钥、私钥、JWT、用户主机路径或真实邮箱；仅发现有意保留的 `example.test` 安全反例
- 审查结束时 HEAD、父提交、merge-base 和工作区状态未变化

## 4. 测试缺口与剩余风险

- 仓库没有支持 JSON Schema Draft 2020-12 全语义和格式校验的第三方 OpenAPI linter；现有 AJV 6 不验证 `unevaluatedProperties` 等 2020-12 关键字。
- 后端、前端和端到端测试按任务非目标未运行。
- DELETE 携带 JSON、恶意文件扫描延期和仅限本地单用户运行仍是已声明风险。
- 当前缺少已提交或完整记录的专项语义检查，无法作为后续 CI 或验收的可重复证据。

## 5. 总体结论

- `CHANGES_REQUIRED`
