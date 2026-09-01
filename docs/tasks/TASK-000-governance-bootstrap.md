# TASK-000：建立多 Agent 开发治理基线

## 1. 基本信息

- 状态：`BLOCKED`
- 负责人角色：`repo_maintainer`
- 创建人：主协调 Agent
- 创建日期：2026-09-01
- 目标阶段：开发制度初始化
- 基线分支或提交：`main` / `bb40c56`

## 2. 背景与依据

用户要求建立一套支持 Codex 多 Agent 协作的开发制度，包括明确职责和边界、Git 维护、规则文档、分阶段审查和验收。

## 3. 目标

- 初始化 StudyPilot Git 仓库；
- 建立仓库级 Agent 规则；
- 建立项目专属 Agent 角色；
- 建立任务接收、开发、审查和验收 Skills；
- 提供任务、交接、审查、验收和模块规则模板；
- 提供用户可执行的制度使用指南；
- 提供不依赖项目技术栈的治理验证脚本。

## 4. 非目标

- 不进行应用技术选型；
- 不创建产品源代码目录；
- 不实现任何 StudyPilot 产品功能；
- 不连接 GitHub 远程仓库；
- 不创建尚无法确定的构建、测试或 CI 命令。

## 5. 允许修改路径

- `AGENTS.md`
- `.gitignore`
- `.codex/**`
- `.agents/**`
- `docs/governance/**`
- `docs/tasks/TASK-000-*`
- `docs/tasks/任务索引.md`
- `scripts/governance/**`

## 6. 禁止修改路径

- `项目背景与介绍.md`
- `项目需求说明.md`
- 尚未批准的产品、架构或源代码目录

## 7. 前置条件与依赖

- [x] 用户已明确要求建立多 Agent 开发制度
- [x] 已查阅当前 Codex 子 Agent、AGENTS.md、Skills 和 worktree 机制
- [x] 当前目录无既有 Git 历史
- [x] 没有其他活跃写入任务

## 8. 功能要求

1. 根规则必须区分任务内共享工作区子 Agent 与独立 worktree 写入任务。
2. 所有角色必须声明职责和明确禁止范围。
3. Reviewer 必须保持只读。
4. 所有写入任务必须有任务单和允许路径。
5. 开发、审查和验收必须由不同阶段处理。
6. 最终合并必须保留用户决定权。
7. 治理文件必须可以被脚本验证。

## 9. 验收条件

- [x] Git 仓库已初始化
- [x] 根 `AGENTS.md` 已建立
- [x] 13 个项目 Agent 已建立并通过 TOML 解析
- [x] 4 个仓库 Skill 已建立并通过 Skill Creator 验证器
- [x] 工作流、角色、Git 门禁和模板已建立
- [x] 默认与工作区 Python 均能通过治理验证
- [x] 两轮缺陷审查已完成，发现的问题已修订
- [x] 修订后的缺陷复核无未解决 finding
- [ ] 实际 `read-only` 环境中的正式独立复审已通过
- [x] 初始 Git 提交已创建

## 10. 必须执行的检查

```text
python3 scripts/governance/validate_governance.py
Skill Creator quick_validate.py（分别检查四个 Skill）
TOML 标准解析
敏感信息模式扫描
Markdown 行尾空白检查
```

## 11. 审查要求

- Reviewer：独立只读治理审查子 Agent
- 重点：规则冲突、Codex 实际边界、角色重叠、Skill 可执行性和用户操作完整性

## 12. 交接要求

- 提供全部新增治理文件；
- 提供验证结果；
- 说明尚未启用的 GitHub/CI 门禁；
- 提供初始分支和提交 SHA；
- 说明用户下一步如何创建第一个正式开发任务。

## 13. 决策与状态记录

| 日期 | 状态或决定 | 责任人 | 说明 |
| --- | --- | --- | --- |
| 2026-09-01 | IN_REVIEW | repo_maintainer | 治理文件已建立并通过本地验证，等待独立审查 |
| 2026-09-01 | CHANGES_REQUIRED | qa_reviewer | 发现缺少 Git HEAD、控制面授权闭环、Reviewer 实际权限和最终合并权不一致四项问题 |
| 2026-09-01 | IN_REVIEW | repo_maintainer | 已补充首次基线规则、coordinator 控制面、实际只读权限校验和用户唯一合并权，等待复审 |
| 2026-09-01 | CHANGES_REQUIRED | governance_audit | 发现验证器未确认 `main` 基线、Integration Owner 合并边界仍有歧义 |
| 2026-09-01 | BLOCKED | repo_maintainer | 两项缺陷已修订且复核无未解决 finding；Git 作者身份已配置，正式只读复审和初始提交仍待完成 |
| 2026-09-01 | BLOCKED | repo_maintainer | 已在 `main` 创建初始基线 `bb40c56`；仅剩实际 `read-only` 环境中的正式复审门禁 |
