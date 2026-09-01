# StudyPilot Git 与合并门禁

## 1. 当前可执行规则

- `main` 只保存已经验收并由用户确认的稳定内容。
- 所有开发从独立任务分支开始。
- 一个写入任务对应一个任务单、分支和 worktree。
- 开发 Agent 不得合并自己的变更。
- Reviewer 保持只读。
- Integration Owner 只能给出是否达到合并门槛的建议。
- 最终合并由用户决定。

仓库必须先有一个用户确认的 `main` 基线提交，才能创建开发 worktree。首次基线提交完成前，治理检查应视为未就绪，任何功能开发不得开始。

## 2. 分支命名

```text
agent/<role>/<task-id>-<short-description>
```

示例：

```text
agent/resource-worker/TASK-001-resource-create
agent/learning-worker/TASK-002-progress-tracking
```

禁止使用无法追溯任务和负责人的名称，例如 `test`、`temp`、`new-feature`。

Codex 管理的 worktree 默认可能处于 detached HEAD。创建 worktree 后必须先使用 **Create branch here** 或等价 Git 操作建立符合上述命名规则的分支，然后才能写入和提交。

## 3. 提交要求

提交格式：

```text
<type>(<module>): <summary>
```

允许的 `type`：

- `feat`：新增用户或系统行为；
- `fix`：修复缺陷；
- `test`：只修改测试；
- `docs`：只修改文档；
- `refactor`：不改变外部行为的结构调整；
- `chore`：仓库、工具和维护工作。

每个提交必须：

- 只属于一个任务；
- 只包含该任务拥有的文件；
- 可以独立解释和审查；
- 不包含密钥、临时文件和无关格式化；
- 在交接报告中提供 SHA。

## 4. 合并前必须具备的证据

- 状态为 `READY` 后开始的任务单；
- 开发 Agent 交接报告；
- 完整实际合并 diff；
- 规定测试和检查的真实结果；
- 独立只读审查报告；
- 阶段验收 `PASS`；
- 用户最终确认。

任一项缺失都不得声称任务可合并。

## 5. 连接 GitHub 后启用的保护

项目建立远程仓库后，在 `main` 的 Ruleset 或 Branch protection 中启用：

1. 禁止直接推送到 `main`；
2. 所有变更必须通过 Pull Request；
3. 禁止 force push；
4. 禁止删除 `main`；
5. 要求所有会话或审查意见解决后才能合并；
6. 技术栈确定并建立 CI 后，要求所有必要 status checks 通过；
7. 如果存在第二位人工协作者，要求至少一位非作者批准最新变更；
8. 管理员也不应日常绕过以上规则。

个人单独开发时，GitHub 的人工批准规则可能无法满足，因此不要设置一个自己无法完成的强制审批。此时使用：

- 独立只读 Reviewer 报告；
- CI status checks；
- 阶段验收报告；
- 用户本人手动确认合并。

AI Reviewer 是额外证据，不等同于 GitHub 的人工批准，也不能替代自动测试。

## 6. CI 状态检查的添加时机

技术栈确定后，由 `repo_maintainer` 和 `architecture_owner` 共同提出检查清单。至少考虑：

- 格式化检查；
- 静态分析或 lint；
- 单元测试；
- 集成测试；
- 构建；
- 密钥扫描；
- 依赖和锁文件一致性；
- 公共契约检查。

只有命令已经在本地和 CI 中实际验证后，才能把对应检查设置为 `main` 的 required status check。

## 7. 合并后的处理

- 将任务状态更新为 `MERGED`；
- 在任务索引中记录最终提交或 PR；
- 删除或归档已完成 worktree；
- 保留任务、交接、审查和验收记录；
- 将真正具有长期价值的经验更新到最近的 `AGENTS.md`；
- 不要把一次性问题无限扩写为全局规则。
