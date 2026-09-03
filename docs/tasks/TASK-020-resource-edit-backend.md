# TASK-020：资料基本信息与同类型来源内容编辑后端

```toml
schema_version = 2
id = "TASK-020"
status = "IN_PROGRESS"
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

- 待实现与实际验证；NOT_RUN 不等于 PASS。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- IN_PROGRESS；已核实依赖合并，待实现/测试后冻结候选。最终合并权限归用户。
<!-- EVIDENCE:END -->
