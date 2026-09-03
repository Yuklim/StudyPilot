# TASK-020：资料基本信息与同类型来源内容编辑后端

```toml
schema_version = 2
id = "TASK-020"
status = "ACCEPTED"
risk = "L3"
risk_reason = "实现既定资料修改接口，涉及用户原文、主题归属、版本竞争和事务保存；同步交付清单，保留独立只读审查与验收，不改模型或迁移。"
risk_flags = ["business", "critical-data", "tests"]
owner = "resource_worker"
base = "91350b73b49e91ea0ef07e10038adc4a88d511a8"
allowed_paths = ["backend/src/studypilot/modules/resources/contracts.py", "backend/src/studypilot/api/resources.py", "backend/src/studypilot/application/resources.py", "backend/src/studypilot/infrastructure/database/resource_store.py", "backend/tests/test_resource_updates.py", "backend/tests/test_taxonomy.py", "README.md", "docs/contracts/API与数据契约基线.md", "docs/contracts/openapi-v1.json", "docs/tasks/TASK-019-quick-notes.md", "docs/tasks/TASK-020-resource-edit-backend.md", "docs/tasks/任务索引.md"]
checks = ["backend", "contracts"]
```

## 需求与范围

- 用户“已合并”承接上一轮约定的资料基本信息编辑。已核实 PR #24 于 2026-09-03T11:13:22Z 合并为 base，原工作区干净。需求依据《项目需求说明》5.2/5.3、8.1；契约 2.1/2.2/2.4、4.1、5、10 中 `updateResource`/`ResourcePatch` 已批准。
- 本任务先完成后端；页面编辑入口在后续依赖本任务合并的前端任务接入，不把接口完成说成页面完成。主 Agent 为唯一 resource_worker，串行维护任务与交付说明；不另派机械 Worker，最终各一次独立只读 Review、Acceptance。
- 实现 PATCH `/api/v1/resources/{resource_id}`：标题、来源名称、保存原因、主要主题；WEB 可修改 URL，PASTE 可修改原文，FILE 原件不可替换。省略不改，三类可空字段可 null 清空；标题去首尾空白，粘贴原文原样保留；复用 URL 解析规则，不访问远程网址。
- 必带正整数 expected_version；缺失 428、类型/字段错误 422、来源不符 409、版本过期 409，仅返回安全 current_version；实际变更加版本和更新时间，无变化请求保持版本/时间，提交成功后才返回成功。竞争/提交失败不自动重试写入。
- 复用本机访问门禁；未授权请求在读取正文/数据库前拒绝。保留 FILE 可见性门禁、归档资料可编辑；不改进度、心得、学习历史、复习计划、标签关联、主题本身或原始文件。
- 交付元数据仅修改中文契约 1.3 与 OpenAPI 顶层 x-delivery-profile；增加既有 updateResource 的可用声明，不修改标准 paths/schemas/security 或其他操作。README 清楚区分后端与页面；TASK-019 仅记录实际合并事实。
- 集成范围补充：旧分类测试精确维护交付操作总数及未开放集合，本次增加 updateResource 后同步该单项断言为 26 个操作，保留其他未开放能力约束；不修改分类业务或降低保护。
- 禁止所有未列路径；尤其是前端、模型/迁移、访问安全、依赖/锁、治理规则、真实数据、资料删除、富文本/解析/自动保存、复习/统计/AI。无并行写入。

## 完成条件

1. 三来源资料可按既定字段更新、重新读取并持久保存；null/省略、原文保留、版本/时间及无变化语义正确。
2. 严格校验、媒体类型/JSON/来源互斥/不可变字段、缺失资料/主题、过期版本、FILE 非 READY 不可见等覆盖；未授权操作无正文读取与数据库副作用，错误不泄露内容。
3. 事务失败完整回滚、两请求同版本竞争不会覆盖成功写入；已有学习/心得/文件/标签不被修改；主题重分配后列表筛选、搜索和旧主题引用保护同步有效。
4. 相关后端检查、构建和契约校验通过；测试仅隔离临时数据；标准 OpenAPI 除交付元数据外深比较不变。前端未改，复用 TASK-019 的 249/26 证据，不重复跑。
5. 最终候选经独立实际只读 Review 与另一独立验收；真实证据写回，用户决定合并；下一任务为页面编辑入口。

## 上下文包

根/后端规则、上述需求/契约章节、resources 四层及现有 notes/taxonomy 的版本/事务模式；仅按需读取。使用 intake/implement/review/acceptance Skills。检查命令：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-020-resource-edit-backend.md --worktree`；新增用例集中 `backend/tests/test_resource_updates.py`。不改已合并的标准字段与模型。

## 实现与测试

- 实现 SHA：`6e31c0e70ff5d83571f0bf56b76be14626067117`，12 文件。增加既定 ResourcePatch 验证、受保护路由、事务与 ORM 版本更新；复用原 URL 校验和 FILE 可见性判定，原文不 trim。标准 OpenAPI 不变，仅交付元数据增加 updateResource。
- 2026-09-03 运行 `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-020-resource-edit-backend.md --worktree`：退出 0，CHECKS PASS；输入指纹 `d8a724dd477b3b99b29e41651a85c67f6a0c15048035fdf9f0e01f9ad65bbe8e`、12 文件、L3。Ruff 格式/静态检查、mypy（59 源文件）、pytest **466/466**（含新增 51 项，6.71 秒）、`uv build --offline` 的 wheel/sdist、FastAPI OpenAPI 结构校验全部通过；Python 3.13.9、pytest 8.4.2，本机隔离临时数据库/文件，不接触真实资料。
- 新增测试覆盖三来源保存/重启、无变化/省略/null/版本时间、心得/旧学习记录/标签/原件不变、实际原件下载、主题重分配及引用保护/搜索筛选、严格输入/媒体/JSON/安全先于正文、非 READY 文件隐藏及归档编辑、提交与 flush 失败回滚、实际 ORM 旧版本冲突和双线程竞争一成功一受控失败。错误仅安全代码/编号/版本，不泄露正文或路径。
- 检查后仅校正 ResourceError docstring 和 README 的旧“只有三个接口”说明；运行时代码、测试、依赖/配置/契约没有再变。最终 `--worktree --static-only` 退出 0，指纹 `37dc8bae8c54883cbb4f3d3c63f09eecdd104cc7fe3071ea6d7a506e1eded6cb`；静态检查不是重跑功能测试，以上测试按无行为变化复用。`git diff --check` 退出 0。
- Node 深比较相对 base：删除 x-delivery-profile 后标准 OpenAPI 完全相同，可用操作只增加 updateResource，退出 0。前端/模型/迁移未修改；本次不重跑 249 前端单元或 26 浏览器测试，沿用 TASK-019 的前端基线证据，不宣称新后端已经过新一轮浏览器联测；本任务新增入口仅后端，页面交由下一任务真实联测。
- 开发中的失败已处理：初轮新增 51 项通过但 lint 标记合成全角测试文字，改等价 Unicode 转义；第一次统一检查 mypy 缺测试变量类型、旧分类测试仍断言 25 个可用操作、uv 沙箱无法访问既有缓存。补类型并在登记范围后将断言精确更新为 26 和 updateResource，不降低其他检查；以批准的缓存权限离线构建，完整统一检查重跑通过，无遗留失败。
- 已知限制：仅后端无编辑页面，不更换资料类型/FILE 原件；SQLite 写竞争可能受控 500，失败不自动重试，客户端需重新读取核对。不新增原文修订历史/回收站、不做删除或解析/AI；用户保留最终合并权。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- IN_REVIEW；实现与真实测试证据齐全，待独立只读 Review；随后由另一独立只读 Agent 核对完成条件。最终合并权限归用户。

- 2026-09-03 冻结候选：`536bf9bbc3d8f6ff454f3121fb38387bee671ae5`；主 Agent 静态核对通过，最终指纹与上述一致。独立 Reviewer 会话 `01a06706-0c29-7922-b55f-c5a549efb597`，运行器头显示 `model: gpt-5.3-codex-spark`、`sandbox: read-only`、`approval: never`；读取期间因模型额度耗尽退出 1，未生成最终报告。运行器原始错误：`You've hit your usage limit for GPT-5.3-Codex-Spark.`
- BLOCKED：实现及 466 项测试结果保留；Review 未完成，不能标记 PASS/No findings，Acceptance 未启动。等待用户授权本次使用其他可用模型完成独立只读审查/验收，或等待默认模型额度恢复；不自动更改用户模型偏好，不使用重置额度，不跳过门禁，不创建待合并 PR。

- 2026-09-03 用户明确授权“使用其他模型”。本次审查/验收临时指定 `gpt-5.5`，不修改默认模型配置、不兑换额度；从冻结候选 `536bf9bbc3d8f6ff454f3121fb38387bee671ae5` 继续。上次中断无最终报告，新 Reviewer 须覆盖完整最终 diff；原代码/测试保持不变，恢复 IN_REVIEW。

- 独立 GPT-5.5 Review：会话 `01a0670d-cb7d-7153-89f3-cd7622860ba6`，运行器头确认 `model: gpt-5.5`、`sandbox: read-only`、`approval: never`，退出 0；未改默认配置。报告原文如下（仅去行末空格）：

PASS。

实际权限：sandbox=read-only、approval=never；命令中 `git/xcrun` 尝试写 `/tmp` cache 被 `Operation not permitted` 拒绝，未修改/提交/联网写/委派。

已按 `git diff --unified=3` 分文件完整审查 `base=91350b73b49e91ea0ef07e10038adc4a88d511a8` 到 `candidate=536bf9bbc3d8f6ff454f3121fb38387bee671ae5` 的 12 文件 diff；确认之后 HEAD 仅任务证据写回。覆盖 ResourcePatch 省略/null/原文保留、来源不可变、ORM 版本/事务、非 READY FILE 隐藏、安全门禁先于正文、学习/心得/标签/原件不越界及测试绑定。

证据复用：未重跑 466 后端测试；复用任务中绑定指纹 `37dc8bae8c54883cbb4f3d3c63f09eecdd104cc7fe3071ea6d7a506e1eded6cb` 的 lint/format/mypy/pytest/build/contracts PASS。我实际执行 `--static-only`，结果 `STATIC PASS` 且明确 `PROFILE_TESTS NOT_RUN`。

No findings。限制：未做前端联测，本任务仅后端。

- 主 Agent 核对：Review 对冻结候选完整覆盖且无 findings；实现、检查输入与完成条件未变，已有 466 项测试和构建证据可复用。IN_ACCEPTANCE，交另一独立只读 Agent 核对证据与五项完成条件，不重复代码审查；未宣称页面已接入。

- 独立 GPT-5.5 Acceptance：会话 `01a06711-b208-7280-bd13-b77d1e3042c7`，独立于实现者和 Reviewer；运行器头确认 `model: gpt-5.5`、`sandbox: read-only`、`approval: never`，退出 0。原文如下（仅去行末空格）：

PASS。

产品候选：`536bf9bbc3d8f6ff454f3121fb38387bee671ae5`；证据 HEAD：`f2ec4d8e42a833f8a3a8f49b0c7e26bccdac9dc2`。本次运行环境为只读、approval `never`；未写文件、未提交、未委派，且独立于实现者和 Reviewer 会话 `01a0670d-cb7d-7153-89f3-cd7622860ba6`。

已实际运行指定静态命令一次，退出 0：`EVIDENCE_ONLY PASS 536bf9...f2ec4d...; no product tests rerun`。五项条件映射成立：更新语义、校验与安全、回滚/竞争/主题联动、466 后端/构建/契约证据复用、独立 Review 与本验收均齐。剩余风险为已声明边界：前端编辑入口尚未接入，需后续任务处理；最终合并仍由用户决定。

- 主 Agent 最终核对：ACCEPTED，无未处置的审查问题；沿用已验证的 466 项测试及构建，未重复开发或全套测试，默认模型配置未改。产品候选仍为 `536bf9bbc3d8f6ff454f3121fb38387bee671ae5`，后续仅状态与证据写回。保留仅后端、无前端编辑入口、无原文修订历史/回收站、SQLite 写竞争可能受控失败需重读等已声明限制。待用户合并，下一任务接入资料编辑页面；Agent 不代合并。
<!-- EVIDENCE:END -->
