# StudyPilot 多 Agent 开发制度使用指南

## 1. 这套制度解决什么问题

这套制度用于保证多个 Codex Agent 参与项目时：

- 每项工作都有明确目标、负责人和修改范围；
- 需求、技术决策和代码实现不会互相越权；
- 并行工作不会同时修改同一批文件；
- 所有变更都留下 Git、测试、审查和验收证据；
- 开发 Agent 不能自行审查并批准自己的变更；
- 最终合并决定仍由用户掌握。

制度由五层组成：

1. `AGENTS.md`：仓库长期规则；
2. `.codex/agents/*.toml`：角色职责与权限；
3. `docs/tasks/TASK-*.md`：单次任务授权；
4. `.agents/skills/*`：任务接收、开发、审查和验收流程；
5. Git、测试和后续 CI：可机械验证的门禁。

## 2. 两种 Agent 协作方式

### 2.1 同一任务内的子 Agent

同一 Codex 任务中的子 Agent 共享父任务的工作目录和 Git 状态。

适合并行执行：

- 代码库探索；
- 文档查证；
- 测试分析；
- 安全审查；
- 需求符合度检查；
- 日志和失败原因分析。

任务内只允许一个 Agent 写文件。其他同时运行的子 Agent 必须保持只读，避免互相覆盖文件和污染 Git 状态。

### 2.2 独立 worktree 开发任务

当两项工作需要真正同时写代码时，应创建两个独立 Codex worktree 任务。每个任务拥有：

- 独立任务单；
- 独立分支；
- 独立工作目录；
- 独立负责人；
- 独立审查和验收结果。

只有修改路径不重叠、公共契约已经确认且不存在前后依赖时，才允许并行写入。

## 3. 第一次使用前

### 3.0 建立首个 Git 基线

Worktree 必须从一个真实提交开始。新仓库在 `git rev-parse --verify HEAD` 成功前，不能启动并行开发。

一次性初始化流程：

1. 完成并审查 `TASK-000` 治理文件；
2. 配置用户自己的 Git `user.name` 和 `user.email`；
3. 由用户确认首次基线内容；
4. 在 `main` 创建首个基线提交；
5. 运行不带例外参数的治理检查；
6. 此后禁止直接在 `main` 开发。

初始化期间可使用：

```bash
python3 scripts/governance/validate_governance.py --allow-unborn
```

这只验证治理结构，不代表 worktree 制度已经可运行。

历史提交 `0b7e269` 是 TASK-000 在控制面分支规则写明前直接写入 `main` 的一次性启动收尾偏差。保留它用于审计，不重写历史，也不得把它当作今后的操作先例。

### 3.1 确认仓库规则

从仓库根目录启动一个新的 Codex 任务，并要求：

```text
读取并总结当前生效的 AGENTS.md、项目级 Agents 和可用的 StudyPilot Skills。
不要修改任何文件。
```

检查总结中是否包含：

- 任务单授权；
- 允许和禁止路径；
- Git 分支规则；
- 分阶段审查；
- 只读 Reviewer；
- 用户最终确认。

Codex 在会话开始时加载规则；修改 `AGENTS.md` 或 Agent 配置后，建议新开任务或重新启动会话。

### 3.2 检查治理文件

运行：

```bash
python3 scripts/governance/validate_governance.py
```

只有治理检查通过后，才开始第一项开发任务。

## 4. 标准开发流程

### 第一步：确认需求

需求负责人确认：

- 为什么需要该功能；
- 用户要完成什么；
- 包含什么；
- 不包含什么；
- 什么结果算完成。

需求负责人不选择技术，也不写功能代码。

### 第二步：创建任务单

复制 `docs/governance/templates/TASK_TEMPLATE.md` 到：

```text
docs/tasks/TASK-<编号>-<简短名称>.md
```

也可以要求 `coordinator` 使用 `$studypilot-task-intake` 创建或检查任务单。创建任务单属于受限控制面操作，不授权修改产品、架构或源代码。

每项任务固定使用以下证据文件：

```text
docs/tasks/TASK-XXX-<名称>.md
docs/tasks/TASK-XXX-HANDOFF.md
docs/tasks/TASK-XXX-REVIEW.md
docs/tasks/TASK-XXX-ACCEPTANCE.md
```

控制面由 `coordinator` 串行维护，但也必须走分支：任务登记使用 `agent/coordinator/<task-id>-intake`，审查与验收证据使用 `agent/coordinator/<task-id>-evidence`，合并事实登记使用 `agent/coordinator/<task-id>-closeout`。`coordinator` 不得直接向 `main` 提交。任务单达到 `READY` 后，intake 分支必须先由用户确认并合并到稳定 `main` 基线，才能创建开发 worktree。

### 第三步：判断是否可以并行

主协调 Agent 检查：

- 是否修改相同文件；
- 是否依赖同一未确认接口；
- 是否存在先后顺序；
- 是否需要同一份数据库或数据结构决策；
- 是否可以分别验收。

任一项无法独立时，任务必须串行。

### 第四步：创建工作分支或 worktree

单个开发任务使用：

```text
agent/<role>/<task-id>-<short-description>
```

在 Codex App 中选择项目的 Worktree 环境，并从最新稳定 `main` 开始。Codex 管理的 worktree 默认可能处于 detached HEAD；进入 worktree 后先选择 **Create branch here**，创建符合规则的任务分支，再允许写入和提交。

如果手动使用 Git，可在仓库外的专用目录创建 worktree；不要在仓库内部嵌套 worktree。

### 第五步：委派 Agent

示例提示：

```text
使用 resource_worker 完成 TASK-001。
先读取根 AGENTS.md、任务单和相关需求。
只修改任务允许的路径。
使用 $studypilot-implement-task 执行。
完成后不要自行合并，返回标准交接报告给 coordinator。
```

开发 Agent 不直接推进共享任务状态。交接报告记录比较基线和交接前的实现提交 SHA。`coordinator` 收到交接后，把报告保存为 `docs/tasks/TASK-XXX-HANDOFF.md` 并提交，所得提交才是冻结候选 SHA；候选不能在自身内容中引用自己的 SHA，精确值由之后的 REVIEW 和 ACCEPTANCE 记录。协调者再将任务登记为 `IN_REVIEW`。

如果需要任务内并行调查：

```text
主 Agent 负责写入。另启动两个只读子 Agent：
一个检查需求符合度，一个检查测试风险。
等待两者返回后再继续实现。
```

### 第六步：独立审查

实现、检查和交接报告全部提交后，记录该提交为冻结候选 SHA。新建一个权限明确选择为 **read-only** 的独立 Codex 审查任务，再调用 `qa_reviewer` 和 `$studypilot-review-change`，明确要求审查该 SHA 对稳定基线的完整差异。如果必须从现有父任务派生 Reviewer，应先把父任务实时权限切换为只读并验证；仅在 TOML 中写 `sandbox_mode = "read-only"` 不能代替实际权限确认。

```text
只读审查 TASK-001 对 main 的实际合并差异。
检查需求偏差、范围越界、正确性、安全性和测试缺口。
不得修改文件或创建提交。
```

Reviewer 按 `REVIEW_TEMPLATE.md` 输出，并记录实际运行权限。发现的问题由原开发 Agent 修复并形成新的候选 SHA，再重新审查新的完整合并差异。Reviewer 只把报告返回给 `coordinator`，不得自行写文件或创建提交。

`coordinator` 使用 evidence 分支原样保存报告。审查后只允许原样写入同一任务的 `REVIEW`、`ACCEPTANCE`，以及仅修改任务单与索引的状态字段和决定日志；不得改变 HANDOFF、任务目标、范围、允许路径、验收条件、代码、测试、配置、契约或治理规则。验收报告写回本身不要求再次验收。任何超出白名单的变更都会生成新的候选 SHA，使旧报告失效，并要求重新完整只读审查。

### 第七步：阶段验收

Integration Owner 必须在实际 **read-only** 权限中使用 `$studypilot-stage-acceptance`，检查：

- 需求和任务单；
- 完整 diff；
- 交接报告；
- 审查报告；
- 测试与检查证据；
- 未解决风险。

输出只能是：

- `PASS`：满足合并条件；
- `RETURN`：需要原 Agent 修订；
- `BLOCKED`：缺少决策、权限或外部条件。

Integration Owner 只把报告返回给 `coordinator`，不得修改文件、创建提交、解决冲突、cherry-pick、rebase 或合并。冲突退回原负责 Agent；任何修订形成新候选 SHA 后，都必须重新执行完整只读审查。协调者在 evidence 分支保存验收报告并更新相应状态。阶段验收通过不等于自动合并，最终只能由用户本人确认并执行。

## 5. 任务状态

任务单使用以下状态：

```text
DRAFT
→ READY
→ IN_PROGRESS
→ IN_REVIEW
→ IN_ACCEPTANCE
→ ACCEPTED
→ MERGED
```

异常状态：

- `RETURNED`：审查或验收退回；
- `BLOCKED`：缺少必要决定或条件；
- `CANCELLED`：用户取消。

只有唯一的 `coordinator` 可以维护共享任务状态和索引。任何其他 Agent 都不能直接推进状态，也不能跳过中间状态将任务标记为 `MERGED`；`MERGED` 必须来自用户已经完成合并这一事实。

## 6. 什么时候需要新增模块级 AGENTS.md

满足以下条件之一时，在实际模块根目录添加嵌套 `AGENTS.md`：

- 模块有不同的构建或测试命令；
- 模块有独特的安全边界；
- 模块有必须保持的公共接口；
- 模块需要特殊文件生成步骤；
- 根规则无法准确表达模块约束。

使用 `docs/governance/templates/MODULE_AGENTS_TEMPLATE.md` 创建。不要为了重复根规则而创建嵌套文件。

## 7. 哪些规则应交给自动化

以下内容在技术栈确定后应进入 CI，而不是只写在提示词中：

- 格式化；
- lint 和静态检查；
- 单元测试和集成测试；
- 构建；
- 依赖锁文件一致性；
- 密钥扫描；
- 迁移或接口契约检查。

根 `AGENTS.md` 负责说明“必须通过哪些门禁”，CI 负责机械执行，Reviewer 负责检查无法完全自动化的需求和设计问题。

## 8. 规则维护

- 只有反复出现、后果明显且无法完全机械检查的问题才加入根规则。
- 模块特有问题写入最近的模块级 `AGENTS.md`。
- 一次性任务要求写入任务单，不加入长期规则。
- 可重复流程写成 Skill，不在多个 Agent 文件中重复。
- 规则变更本身也需要审查。
- 每个阶段结束后检查过期规则，及时删除或收窄。

## 9. 推荐的日常启动指令

```text
你是 StudyPilot 的主协调 Agent。
先读取当前生效的 AGENTS.md、项目需求、角色配置和任务单。
使用 $studypilot-task-intake 检查任务是否具备写入条件。
仅在任务独立且边界不重叠时委派子 Agent。
任务内并行子 Agent保持只读；并行写入使用独立 worktree 任务。
实现后安排独立审查与阶段验收，未经我确认不得合并。
```
