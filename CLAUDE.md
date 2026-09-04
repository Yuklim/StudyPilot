# StudyPilot — Claude Code 工作入口

本仓库的权威协作规则是 [AGENTS.md](AGENTS.md)（多 Agent 开发总则 V2）及其嵌套规则
（[frontend/AGENTS.md](frontend/AGENTS.md)、[backend/AGENTS.md](backend/AGENTS.md)）。
Claude Code 默认不读取 AGENTS.md，因此本文件用 `@` 导入使其进入 Claude 会话上下文。

@AGENTS.md

## 对 Claude（本会话执行者）的补充说明

- 规则正文只存在于 `AGENTS.md`，本文件**不复制**规则内容，避免双源漂移。修改规则应回到 `AGENTS.md`（属治理改动，需任务与独立审查）。
- 底线要求（不直接 push/merge main、不用 `git reset --hard`/强推、不越任务 `allowed_paths`、独立 Review/Acceptance 必须真实只读等）已在 `.claude/settings.json` 中尽量以 `permissions.deny` 系统兜底；`settings.json` 只是辅助防线，规则与人工确认仍是最终依据。
- 若需独立只读审查，使用 `.claude/agents/reviewer.md`（仅授予读工具，无写工具）。
- 后续开发沿用仓库既有流程：一任务一分支一 TASK 记录、风险分级、用户独占最终合并。
