# TASK-018：回归资料收集与随手心得的产品定位

```toml
schema_version = 2
id = "TASK-018"
status = "MERGED"
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

- 2026-09-03 用户已合并；GitHub 核实 PR #23 MERGED，mergedAt=2026-09-03T09:32:01Z，mergeCommit=4b760010c8476ccda7e57f7a835a6cd21c547b84。以下为原候选与审查历史。

- 首轮候选：`2b66862b28c488f0c0d2460e2e1ea5ee29a18ada`，Reviewer 会话 `01a06692-43cc-7361-a5a5-f05e4c7d96e4`，运行器头 sandbox=read-only、approval=never，未改模型默认设置，进程退出 0。原文如下（仅去掉行末空格）：

PASS

- 基线/候选：`aaa1b5abfe929117f87d59b70d60040499a1d50f` → `2b66862b28c488f0c0d2460e2e1ea5ee29a18ada`（8 文件）
- 权限证据：`test -w .` 返回 `1`（不可写）；当前运行上下文用户为本机非特权用户（`uid=501`），实际按只读环境执行，无任何尝试写入操作。
- 覆盖：已审阅 `git diff` 的完整基线到候选差异（8 文件）及必要上下文，重点核对《项目需求说明》/《项目背景与介绍》/架构提案/契约文档/任务记录/索引。
- 结论：未发现阻断性问题。`docs/contracts/openapi-v1.json` 仅 `info.description` 有改动，`paths/schemas/security/x-delivery-profile` 未改；未出现页面代码、接口变更、数据模型变更、测试/治理规则改动或虚构时间/时长/状态默认值写入。
- 剩余风险（非阻断）：TASK-018仍处 `IN_REVIEW`，当前仅文档级收敛，功能是否可用仍依赖后续实现任务（尤其 `TASK-017` 相关后续页能力）。

- 最终候选：`292dd3c708639dc6116523bc062730df371fd4f1`。同一 Reviewer 会话增量复核，运行器 read-only / never，进程退出 0；继承首轮未变范围。报告原文如下（仅去掉行末空格）：

PASS（增量）
候选：`292dd3c708639dc6116523bc062730df371fd4f1`（基线未变：`aaa1b5abfe929117f87d59b70d60040499a1d50f`）。

权限确认：`test -w .` 返回 `1`，实际环境不可写；本次仅读文件与比对，无写入。
覆盖范围：仅比对 `2b66862b28c488f0c0d2460e2e1ea5ee29a18ada` 到 `292dd3...` 增量，3 文件变更（`README.md`、`docs/tasks/TASK-018-core-product-focus.md`、`docs/tasks/任务索引.md`）；复用首轮 `AAA...→2b6686...` 的风险/契约范围与结论。
结论：增量与用户描述一致：README 产品方向段落仅位置迁移与表述微调，索引行迁移到末尾，TASK-018 增补修订测试与首轮报告。未见页面、接口、数据模型、代码或契约变更，未触发新阻断缺口。
剩余风险：仅文档任务状态，功能实现与验收仍待后续任务/合并。

- 独立 Acceptance：会话 `01a06698-0918-7a91-ae8b-d643f21f2769`，与实现者和 Reviewer 独立；运行器 read-only / never、`test -w .` 返回 1，进程退出 0。初次报告及随后针对措辞的澄清原文如下（仅去掉行末空格）：

PASS。
候选：`292dd3c708639dc6116523bc062730df371fd4f1`；`HEAD`=`10f8f0cf0040b56f3ac6c4c26f27791b7b250605` 仅较候选多两份文档写回（任务文件与任务索引），无代码/接口改动。
权限与运行环境证据：`test -w .` 返回 `1`（不可写），本次仅读文件与比对；独立验收者不写。
完成条件映射：
1) 任务定义“资料收集→随手心得→后续复查”核心定位已落在需求/背景与任务记录中；2) 默认退出表单明确去掉学习开始时间/时长/进度/学习后状态并要求仅记录保存时间，不伪造度量；3) 复习、统计、计时、AI 明确后置且列为下一开发重点；4) `check_task` 与 8文件范围检出 PASS，`openapi-v1.json` 仅 `info.description` 变更，`paths/schemas/security/x-delivery-profile` 等未变，且保留 `product_fingerprint=92e94...` 的 JSON 深比较证据；5) 先验审阅会话 `01a06692-43cc-7361-a5a5-f05e4c7d96e4` 首轮+增量 PASS 已入 TASK EVIDENCE，且当前明确“页面未改、TASK-017 未合并依赖”。
残余风险：仅非阻断，功能页面与可用性尚待后续实现任务落地。

确认：报告第3条措辞为**错误表达**，非文档实质问题。
事实核对：`TASK-018` 第3条明确写“复习、详细统计、计时/百分比管理及AI后置；下一开发重点是简化记录与接入心得页面，再补基础资料管理缺口”。这与“需求8.1近期顺序”不冲突：8.1主要是概念对象（如`LearningProgress/StudyRecord`）的语义边界，不是近期排期。
候选仍为 `292dd3c708639dc6116523bc062730df371fd4f1`，`HEAD`仅有只读验收状态写回 (`10f8f0c`)；权限维持 `test -w .`=不可写；范围仍为文档/证据链，仅剩非阻断风险是功能页面与后续实现尚未交付。

- 协调者核对与处置：验收者已纠正“扩展是下一重点”的错误表达，但澄清中对“需求8.1”的指代又误指向架构/契约概念章节。主 Agent 只定向核对《项目需求说明.md》8.1 原文：“近期顺序：先简化默认学习记录操作并接入个人心得页面，再按实际缺口补齐资料管理和找回体验。”这与验收者已独立核对的本 TASK 完成条件 3 完全一致。以上两处错误仅在报告表述，不是需求文档变更，也无新的产品阻断；保留原报告避免伪造，明确引用纠正，不重复完整审查或启动第三个验收者。后续 Agent 以需求 8.1 与本任务条件为依据，不以报告中的错误引用排期。
- 最终状态：2026-09-03 ACCEPTED，文档/接口结构检查及独立审查、验收通过；候选后仅合法证据/状态写回。页面实现不在本任务内，未删除历史数据，未声明 TASK-017 已合并。用户决定最终合并。
- 已知限制：这是文档修订，当前默认学习表单仍未简化；后续页面任务必须兑现新的低负担闭环。PR #22 合并状态在开发前重新核实。
<!-- EVIDENCE:END -->
