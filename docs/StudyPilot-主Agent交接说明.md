# StudyPilot 主 Agent 交接说明

> 更新日期：2026-09-04  
> 用途：为后续主 Agent 提供当前项目事实、职责边界、任务状态和安全续接步骤。本文是交接资料，不是新的产品授权，不替代任务单、契约、测试、Review 或 Acceptance 结论。

## 1. 当前接手结论

- 用户今后只与当前对话中的主 Agent 交互；主 Agent 负责理解目标、登记任务、判断风险、协调 Worker/Reviewer/Acceptance、汇总证据并向用户汇报。
- 旧对话已停止开发，不与当前主 Agent 并行写入。共享目录同一时刻只能有一个写入者。
- 侧栏保存目录 `/Users/yuklimching/Documents/Study` 不是 Git 仓库，只作为项目工作目录参考。
- 真正代码仓库是 `/Users/yuklimching/Desktop/StudyPilot`，远程为 [Yuklim/StudyPilot](https://github.com/Yuklim/StudyPilot.git)。所有仓库命令必须显式使用真实仓库路径。
- 当前工作分支为 `agent/frontend_worker/TASK-023-resource-safe-delete-pages`，工作树干净；远程 `origin/main` 已包含 TASK-022 的合并提交 `51b427f5722427246b4ebc460f3aa6f2e0585338`。
- 当前未授权任何真实用户资料删除、回收站清理或公网部署操作。
- 合并事实以 GitHub PR #27 的合并提交 `51b427f5722427246b4ebc460f3aa6f2e0585338` 和任务索引 `MERGED` 记录为准；若看到 TASK-022 文件顶部仍为 `ACCEPTED`，只能做状态字段收口，不能重写已完成的实现、测试、Review 或 Acceptance 证据。

## 2. 项目初心与产品边界

StudyPilot 是个人本机运行的学习资料与随手心得工具：帮助用户保存网页、文件和粘贴内容，之后再次找到资料并回看自己的想法。

必须保持的产品原则：

- 默认心得只写内容，由系统记录保存时间；不要求用户填写学习时长、进度、状态或学习后状态。
- 既有学习历史必须保留，不能把心得自动改写成虚构学习事实，也不能因界面简化而删除旧数据。
- 风格保持简约、平滑圆角、温暖手帐，可使用自然生活元素；不要用假资料、假统计或无效按钮伪装未完成能力。
- 复习、详细统计、正文解析、AI、RAG 和学习 Agent 均是后置能力，必须有单独授权和任务记录。
- 不做陌生用户注册、多用户高并发或直接公网部署；当前安全边界是本机个人空间。

权威事实来源按优先级使用：用户当前明确指令、当前 Git/main 与任务记录、`项目需求说明.md`、`docs/contracts/`、根 `AGENTS.md` 及适用嵌套规则。发生冲突时先核实，不能用旧聊天、推测或本文件覆盖权威需求和契约。

## 3. 角色职责与禁止越权

### 主 Agent / coordinator

- 唯一用户入口；维护任务号、状态、分支、允许路径、风险、证据和索引。
- 可在任务明确授权后兼任唯一 Worker，但不能把自检称为独立 Review 或 Acceptance。
- 负责检查范围、测试证据绑定、Review/Acceptance 结论和剩余风险；不进行第三次完整代码复审。
- 不在 `main` 开发、提交、推送或合并；最终合并只能由用户执行。

### Worker

- 每个任务只有一个最终写入者，严格限制在任务 `allowed_paths`。
- 负责实现、补测试、运行任务检查并报告真实退出结果。
- 不得扩大需求、修改未授权契约、接触真实用户资料或自行降低风险级别。

### 独立 Reviewer

- 适用于 L2/L3；检查最终候选的完整差异、调用链、安全边界和测试覆盖。
- 必须由运行器实际限制为只读；仅在 TOML、口头说明或“没有写入”不能证明权限。
- 不修改文件、不提交、不推送、不合并、不修复、不另派 Agent。
- `PASS` 表示没有未处置的阻断问题；若无法证明真实只读，结论必须是 `BLOCKED`。

### 独立 Acceptance / Integration

- L3 必须在有效 Review 通过后执行；只核对候选、完成条件、跨模块证据和剩余风险，不重做完整代码审查。
- 同样必须由实际只读运行器执行，不能使用可写运行时冒充独立验收。
- 未通过或权限无法证明时，不得把任务标为 `ACCEPTED`。

### 用户

- 用户决定是否允许下一任务、是否推送、是否创建/查看 PR，以及是否最终合并到 `main`。
- 主 Agent 不代替用户合并，不代替用户执行真实资料删除。

## 4. 风险路由与状态规则

- L1：低风险文档或局部调整，自动检查和主 Agent 自检即可。
- L2：普通业务实现，Worker 后由一名独立只读 Reviewer 审查。
- L3：删除、认证/安全、关键数据、公共 API、迁移或重大跨模块变更，必须经过 Worker → 独立只读 Review → 独立只读 Acceptance。
- 只读权限必须是运行器真实限制；规则文件中的 `sandbox_mode = "read-only"` 只是配置意图，实际探针仍需证明源码目录不可写。
- 新任务必须先查重、从已合并稳定主线建立任务分支、登记授权范围和精确允许路径，再开始写入。
- 任务状态只能依据真实证据推进：`DRAFT → READY → IN_PROGRESS → IN_REVIEW → IN_ACCEPTANCE → ACCEPTED → MERGED`；权限或依赖缺失时使用 `BLOCKED`，不能用 `PASS` 掩盖阻塞。

## 5. 已完成与当前任务

### TASK-022：资料安全删除后端

- 用途：提供“删除影响预览 → 一次性令牌确认 → 安全删除”的后端能力。
- 覆盖：影响计数、资料与关联对象版本绑定、令牌摘要存储、影响变化失效、级联关联删除、Topic/Tag 本体保留、FILE 原件同卷 trash 隔离及既有对账回收。
- 非目标：删除页面、回收站/撤销、批量删除、文件替换、复习、统计、解析、AI 和真实资料操作。
- 已完成：PR #27 已合并，合并提交 `51b427f5722427246b4ebc460f3aa6f2e0585338`；任务索引记录为 `MERGED`。
- 验证：后端统一检查通过，pytest `471/471 PASS`；独立 Review 与 Acceptance 均已通过。

### TASK-023：资料安全删除页面

- 用途：在资料详情页接入已冻结的 `previewResourceDeletion` / `deleteResource` 接口，让用户先查看影响摘要，再明确确认删除。
- 目标：展示不可逆警告和安全计数；令牌只留在当前页面内存；确认只经 `X-StudyPilot-Deletion-Token` 专用头发送；成功要求 `204` 空响应并返回资料库；影响变化、重放、过期、无效和服务错误均受控提示。
- 非目标：不改后端、数据库或公共契约；不做回收站/撤销、批量删除、文件替换、复习、统计、解析、AI 或真实资料操作。
- 分支：`agent/frontend_worker/TASK-023-resource-safe-delete-pages`
- 基线：`51b427f5722427246b4ebc460f3aa6f2e0585338`
- 产品候选：`e7576b4416ea5b0520d6a3c986d502310bcb7b35`
- 实现提交：`213604ba582cc98db98b94a4b91b8142154f8df3`
- 严格 `204` 修正：`e7576b4416ea5b0520d6a3c986d502310bcb7b35`
- 验证：统一检查 `CHECKS PASS`；前端 format/lint/typecheck/build 全部通过，Vitest `315/315 PASS`；product fingerprint 为 `1fe1c67703bf3fa52d35e487de67b19240d5c458c5e203ec9fa016f780e8d47e`。
- Review：独立只读 CLI Review 已 `PASS`，No findings；已核实 `frontend/src`、`backend/src` 不可写。
- Acceptance：当前仍需另一场独立只读 Acceptance 的有效结论；先前可写运行器的 Acceptance 只能判 `BLOCKED`，不能复用为通过。用户提供的 CLI Review `PASS` 只覆盖 Review，不等于 Acceptance。
- 当前任务状态：`IN_ACCEPTANCE`；未推送、未创建 PR、未合并。

## 6. TASK-023 继续步骤

1. 使用真正只读的独立 CLI/运行器，先验证 `frontend/src`、`backend/src` 不可写。
2. 让 Acceptance 只核对候选 `e7576b4416ea5b0520d6a3c986d502310bcb7b35`、完成条件和已有 `315/315 PASS` 证据；禁止修改、提交、推送、合并或委派。
3. 若 Acceptance `PASS`，主 Agent 只写回 TASK-023 的 EVIDENCE 区和索引状态，推进为 `ACCEPTED`；若权限或条件不满足，保持 `BLOCKED`/`IN_ACCEPTANCE` 并如实记录。
4. Acceptance 通过后，由用户决定是否允许推送该分支、创建 PR 供本地查看；主 Agent不合并 `main`。
5. 在用户明确授权前，不启动删除页面之外的新产品任务，不操作真实资料，不擅自处理现有 5173/8000 预览进程。

## 7. 安全与 Git 操作底线

- 所有测试使用隔离合成数据；不修改、删除或扫描真实用户资料内容。
- 删除令牌不得出现在 URL、JSON 请求体、Cookie、localStorage、sessionStorage、IndexedDB、日志、任务报告或错误文本中。
- 不使用 `git reset --hard`、强制推送、重写共享历史、删除他人分支或未经授权切换/覆盖用户修改。
- 不在 `main` 开发或提交；任务分支必须从核实的已合并主线建立。
- 测试失败、工具缺失、权限未验证、网络受限或服务仍是旧进程时，必须明确标注 `FAIL`、`NOT_RUN` 或 `BLOCKED`，不能宣称成功。
- 任何真实资料删除都必须经过后端预览、用户明确确认和既定安全协议；本交接文档不构成删除授权。

## 8. 交接时的最小核对命令

以下命令只用于确认仓库身份、分支和工作树，不改变状态：

```bash
git -C /Users/yuklimching/Desktop/StudyPilot status --short --branch
git -C /Users/yuklimching/Desktop/StudyPilot log -1 --oneline --decorate
git -C /Users/yuklimching/Desktop/StudyPilot rev-parse --show-toplevel
test -d /Users/yuklimching/Documents/Study/.git && echo unexpected-git || echo sidebar-is-not-git
```

开始任何新任务前，先阅读根 `AGENTS.md`、`docs/tasks/任务索引.md`、相关 TASK 最终证据、`项目需求说明.md` 对应章节和 `docs/contracts/` 对应章节；不要回看全部长聊天或整仓扫描。

## 9. 权威文件索引

- [根协作规则](../AGENTS.md)
- [任务索引](tasks/任务索引.md)
- [TASK-022：资料安全删除后端](tasks/TASK-022-resource-safe-delete-backend.md)
- [TASK-023：资料安全删除页面](tasks/TASK-023-resource-safe-delete-pages.md)
- [项目需求说明](../项目需求说明.md)
- [API 与数据契约基线](contracts/API与数据契约基线.md)
- [风险分级与检查规则](governance/风险分级与检查规则.md)
- [前端模块规则](../frontend/AGENTS.md)
