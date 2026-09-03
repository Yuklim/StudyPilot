# TASK-018：回归资料收集与随手心得的产品定位

```toml
schema_version = 2
id = "TASK-018"
status = "IN_REVIEW"
risk = "L3"
risk_reason = "用户明确调整基础闭环及优先级，涉及权威需求、背景及架构/契约的阶段说明；不改变运行时、标准接口或数据。按现行路径规则保留独立只读审查和验收。"
risk_flags = ["documentation", "architecture"]
owner = "requirements_owner"
base = "aaa1b5abfe929117f87d59b70d60040499a1d50f"
allowed_paths = ["项目需求说明.md", "项目背景与介绍.md", "README.md", "docs/architecture/MVP架构与技术选型提案.md", "docs/contracts/API与数据契约基线.md", "docs/contracts/openapi-v1.json", "docs/tasks/TASK-018-core-product-focus.md", "docs/tasks/任务索引.md"]
checks = ["contracts"]
```

## 需求与范围

- 用户依据（2026-09-03）：学习开始时间、时长、进度和学习后状态均要手填，不符合“随手记录”；产品初心是收集学习资料、随手记录学习心得，复习等功能后置；先把基础做好，再迭代扩展。
- 主 Agent 作为唯一 requirements_owner；coordinator 串行维护本任务/索引。使用 intake、implement、review、acceptance Skills；不另派实现 Worker。
- 只修订背景、需求、优先级及必要的阶段说明。核心操作无需填写学习开始时间/时长/百分比/学习后状态；记录保存时间不冒充实际学习开始时间，不推断投入、进度或掌握程度，不用假值凑旧接口。
- 保留现有技术选型、接口与数据模型、历史任务及测试证据。不规定自动计时、状态推断、笔记与学习历史合并存储或迁移方案。
- 架构只同步产品范围、功能追踪与后续顺序；契约只澄清旧完整目标与本轮核心交付的区别，OpenAPI 只改 info.description，不改 paths/schema/security/x-delivery-profile 或可用操作。
- 禁止所有未列路径，尤其源代码、测试、治理规则、依赖、安全配置、数据库/真实资料；本次不改变当前页面，不删除或重写既有记录。
- 依赖：从已核实 origin/main 的上述基线创建独立 worktree；原目录保持 TASK-017 和临时预览运行。PR #22 在本次核实为 OPEN（未合并），本任务不依赖其实现、不得登记为 MERGED，也不夹带其成果。未来心得页面需等待笔记后端合并。
- 默认串行，只有完成检查后启动独立只读 Reviewer，再单独只读 Acceptance。

## 完成条件

1. 背景/需求一致指向“收集资料→随手写心得→再次找到与回看”，心得内容为核心输入，不要求重复填两份记录或管理数字。
2. 开始时间/时长/进度/学习后状态退出默认心得流程；真实保存时间自动记录，不声称能测量实际学习或自动判断完成，不抹除旧数据。
3. 复习、详细统计、计时/百分比管理及 AI 等后置；下一开发重点是简化记录与接入心得页面、再补基础资料管理缺口，不因旧任务顺序自动推进扩展。
4. 需求各章节、架构范围/追踪/阶段安排与契约目标说明不再要求扩展先完成。现有接口、安全、技术和历史交付不变；OpenAPI 去掉 info.description 后与基线完全一致。
5. 文档/范围/敏感信息/JSON/OpenAPI 检查通过；未修改代码，不重跑功能测试，不把文档修订当作页面已完成。独立只读审查与验收通过，合并仍由用户执行。

## 上下文包

根规则、风险规则及上述 Skills；两份产品文档，架构第 1/2/10/11/12 节，契约第 1 节，OpenAPI info 与交付元数据。按最终 diff 读取必要上下文，不重读产品历史。准确检查：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-018-core-product-focus.md --worktree`；另做 JSON 深比较，仅允许 info.description 不同。临时 worktree 复用原仓库的 Python 环境，不安装依赖。

## 实现与测试

- 实现 SHA：`68efb5dd96ed42c4127ad29799b8f8a2dd13fdeb`；8 个文档/记录文件，需求与背景改为资料/随手心得/找回优先，旧管理字段退出默认表单，扩展后置；架构与接口说明明确新基础门槛且既有技术/数据约束保留。
- 自动检查：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-018-core-product-focus.md --worktree` 退出 0，STATIC / contracts / CHECKS PASS；8 文件，`product_fingerprint=5176307fcc5f1d74d05d4987f4234b06a9adf7e7cfc6c27a5e1f898ca8be7bb4`，范围/分支/敏感模式/JSON/OpenAPI 结构与 FastAPI 模型解析通过。
- JSON 深比较退出 0：Node 读取 `git show aaa1b5abfe929117f87d59b70d60040499a1d50f:docs/contracts/openapi-v1.json` 与工作区 JSON，先断言 info.description 不同，再各自删除该字段后 `assert.deepEqual(after,before)`；operations/schema/security/x-delivery-profile 完全不变。
- `git diff --check` 退出 0；`git diff --name-only -- backend frontend .agents .codex AGENTS.md` 输出为空。运行时/治理未改，不重跑已有功能测试，标记 NOT_RUN（不将旧 PASS 当作本轮功能测试）。
- 检查环境：隔离 worktree，复用原仓库 Python 3.13/FastAPI 环境，不安装依赖。首轮临时 `.venv` 整体符号链接被范围检查识别为未忽略文件而失败，已移除该临时链接，改用被忽略的实体 `.venv` 目录内链接现有 bin/lib/配置；未删除环境本体。第一次 Node 命令指定了不存在的路径，退出 127；改用已安装的 `node` 重跑通过。没有降低检查规则。
- 运行时代码、页面和数据不在本任务内；功能实现另立任务。
- 后续修订 SHA：`cd65d816253862fecfe6524ef5b2d79026ed84da`；只移动 README 产品方向与索引新任务行，避免与待合并 TASK-017 在相邻位置冲突，README “以下内容”相应改成“本文其余内容”。产品要求未变。首轮只读三路比较发现 README/索引文字冲突，移动后以 `git merge-tree base cd65d81 e36fcbe` 检查无冲突标记，Node 断言退出 0；此为模拟，不执行合并，不改变两分支。
- 修订后同一 `check_task --worktree` 命令退出 0，STATIC / contracts / CHECKS PASS；新 `product_fingerprint=92e94b7096f24719066548c83b9ea0fa6c9b26248e82c3b3dd48eab95a6f0bb2`，`git diff --check` 退出 0。OpenAPI 文件未再变，继承上一轮深比较证据。基线/产品范围不变，同一 Reviewer 只需增量复核。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 首轮候选：`2b66862b28c488f0c0d2460e2e1ea5ee29a18ada`，Reviewer 会话 `01a06692-43cc-7361-a5a5-f05e4c7d96e4`，运行器头 sandbox=read-only、approval=never，未改模型默认设置，进程退出 0。原文如下（仅去掉行末空格）：

PASS

- 基线/候选：`aaa1b5abfe929117f87d59b70d60040499a1d50f` → `2b66862b28c488f0c0d2460e2e1ea5ee29a18ada`（8 文件）
- 权限证据：`test -w .` 返回 `1`（不可写）；当前运行上下文用户 `yuklimching`（`uid=501`），实际按只读环境执行，无任何尝试写入操作。
- 覆盖：已审阅 `git diff` 的完整基线到候选差异（8 文件）及必要上下文，重点核对《项目需求说明》/《项目背景与介绍》/架构提案/契约文档/任务记录/索引。
- 结论：未发现阻断性问题。`docs/contracts/openapi-v1.json` 仅 `info.description` 有改动，`paths/schemas/security/x-delivery-profile` 未改；未出现页面代码、接口变更、数据模型变更、测试/治理规则改动或虚构时间/时长/状态默认值写入。
- 剩余风险（非阻断）：TASK-018仍处 `IN_REVIEW`，当前仅文档级收敛，功能是否可用仍依赖后续实现任务（尤其 `TASK-017` 相关后续页能力）。

- 最终增量 Review/Acceptance：待新候选报告；首轮 PASS 不直接代表修订后的候选。
- 当前 IN_REVIEW；不声明页面已改或 TASK-017 已合并。
<!-- EVIDENCE:END -->
