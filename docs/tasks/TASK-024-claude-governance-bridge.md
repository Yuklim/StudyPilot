# TASK-024：为 Claude Code 建立治理桥接与系统兜底

```toml
schema_version = 2
id = "TASK-024"
status = "ACCEPTED"
risk = "L3"
risk_reason = "新增根规则入口 CLAUDE.md、settings 权限门禁与只读 Agent，触及治理规则如何被 Claude 读取与执行，属治理/门禁改动。"
risk_flags = ["governance"]
owner = "coordinator"
base = "51b427f5722427246b4ebc460f3aa6f2e0585338"
allowed_paths = [
  "CLAUDE.md",
  ".claude/settings.json",
  ".claude/agents/reviewer.md",
  ".claude/CLAUDE.md",
  "docs/tasks/TASK-024-claude-governance-bridge.md",
  "docs/tasks/任务索引.md",
]
checks = ["governance"]
```

## 需求与范围

- 用户授权：用户决定后续使用 Claude Code 开发，授权"新建配置"，采用"标准·系统兜底"方案；TASK-023 验收写回已单独提交固化（`c866c98`，在其分支）。
- 目标：
  1. 建根 `CLAUDE.md`，用 `@AGENTS.md` 单源引用现有根规则，让 Claude 会话能读到 AGENTS.md V2（Claude 默认不读 AGENTS.md，需桥接；规则正文仍只存于 AGENTS.md，不双源）。
  2. 建 `.claude/settings.json`：用 `permissions.deny` 做系统兜底硬门禁（禁越路径写、禁直接 push/merge main、禁破坏性 git），使 AGENTS.md 的部分底线从"提示"变为"系统拒绝"。
  3. 建只读 `reviewer` Agent（`.claude/agents/reviewer.md`，仅授予读工具，无写工具），供后续 L2/L3 独立只读审查复用。
- 非目标：不改根 `AGENTS.md` 正文、不改 Codex（`.codex/**`、`.agents/**`）文件、不改 `risk-policy.json`、不改 frontend/backend 代码、不建 skills/多角色/全套 hooks、不把 TASK-023 并入 main。
- 禁止范围：所有未列入 allowed_paths 的路径；不改任何产品代码、契约、数据库或已合并历史证据。
- 依赖/前置条件：已确认稳定 main 基线 `51b427f`（TASK-022 合并点）；TASK-023 仍在自身分支，未并入。
- 并行：否。

## 完成条件

1. 根 `CLAUDE.md` 通过 `@AGENTS.md` 引用现有根规则，正文不复制 AGENTS.md，Claude 会话启动能读到该引用。
2. `.claude/settings.json` 存在且包含 `permissions.deny`，能系统拒绝：对仓库外/敏感路径的 `Write/Edit/NotebookEdit`、`git push` 到 main、`git merge main`、`git reset --hard`、`git push -f`/强推。不产生语法错误，不影响用户明确允许的读写。
3. `.claude/agents/reviewer.md` 存在，frontmatter 声明为只读（tools 白名单仅读工具，无 Write/Edit/NotebookEdit），description 明确"独立只读审查，不改文件/不提交/不推送/不合并"。
4. TASK-024 记录 + `任务索引.md` 登记（沿用现有索引格式）。
5. 不破坏现有 Codex 流程：根 AGENTS.md、.codex/**、.agents/** 保持不变（本任务未改，核验无 diff 即可）。
6. governance 自动检查/校验通过（若 `check_task.py` 对治理路径可跑则通过；否则说明原因）。

## 上下文包

- 规则：根 `AGENTS.md` V2；本任务。不改动也不重读全仓历史。
- 参考：Claude Code 官方文档（CLAUDE.md 用 `@AGENTS.md` 桥接；`permissions.deny` 裸工具名会从上下文移除工具、deny 优先于 allow；subagent `tools` 白名单不含写工具即只读）。
- 准确命令：
  - 校验 JSON：`python -m json.tool .claude/settings.json`
  - 校验 TASK-024 索引/记录存在：读 `docs/tasks/任务索引.md` 含 TASK-024 行
  - governance 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-024-claude-governance-bridge.md --worktree`（若治理检查支持新路径则运行，否则记录 NOT_RUN 原因）

## 实现与测试

- 实现 SHA/变更摘要：候选 `9562b76`（提交 "fix(governance): allow git checkout main via ask not deny"，上一产品候选 `304c1e1` "feat(governance): add Claude Code rule bridge and system guardrails"；两者合为最终候选）。新增根 `CLAUDE.md`（`@AGENTS.md` 桥接）、`.claude/settings.json`（deny/ask 权限兜底）、`.claude/agents/reviewer.md`（tools 白名单只读 Agent）、`docs/tasks/TASK-024-claude-governance-bridge.md` 记录与 `任务索引.md` 登记。`9562b76` 仅删 `.claude/settings.json` 中 deny 的 `Bash(git checkout main)` 一行，将其落回 ask 层。
- 命令与真实退出结果（2026-09-04，TASK-024 分支工作树，base `51b427f`）：
  - `python3 -m json.tool .claude/settings.json` → 合法 JSON，exit 0。
  - `check_task.py --task docs/tasks/TASK-024-claude-governance-bridge.md --worktree` → `STATIC PASS`，profile=governance，`Governance V2 PASS`（validate_governance exit 0）、ruff check/format 通过、治理单测 23 tests OK，`CHECKS PASS`，exit 0。（输出中 `missing-tool`/`fake-test` 两行是该脚本自带的负向回归演示，设计上验证"工具缺失会如实报错"，非真实失败。）
  - product_fingerprint：`302acf6a946dde1bade7d014cbd05dec9bcacb5956d5e44a9aa57eef6349dbd9`。
  - `git diff --check` 无空白错误；确认无 frontend/src、backend/src、AGENTS.md、.codex、.agents 改动。
- 已知限制/未完成项：`.claude/settings.json` 的 `permissions.deny/ask` 依赖 Claude 对规则字符串的匹配；本任务只在配置层建立，未做端到端"真实触发"验证（需在真实 Claude 会话中确认 deny 是否拦截越界 git/write，push refspec 变体如 `HEAD:main` 仅落 ask）。不改 AGENTS.md 正文是刻意为之（避免双源）；后续调整根规则应单独治理任务。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：`9562b76`（完整候选；`304c1e1` + `9562b76` 合并；基线 `51b427f`）。
- Review：独立只读 Reviewer 审查候选 `304c1e1`（base..candidate 完整 diff）→ PASS，附 2 项非阻断（checkout main deny 过度、字符串规则边界）；修订 `9562b76` 后同一 Reviewer 复核增量 `304c1e1..9562b76` → PASS，确认 checkout main 落 ask、其余 deny 未误伤、JSON 合法。两轮均真实只读、未修改文件。
- Acceptance：独立只读 Acceptance（真实只读运行器 Explore，运行器层排除全部写工具）核对候选 `9562b76` 与 6 条完成条件：CLAUDE.md @引用无双源、settings deny 覆盖 push/merge main/reset --hard/强推且 checkout main 落 ask、reviewer.md tools 仅只读、TASK-024 记录与索引登记、AGENTS.md/.codex/.agents/frontend/backend 零改动、governance 检查证据一致；JSON 经 `python3 -m json.tool` 校验合法。Findings: No findings；结论 `PASS`。Acceptance 全程未修改、提交、推送、合并。
- 非阻断遗留项：`.claude/settings.json` 的 deny/ask 真实拦截效果需在真实 Claude 会话中确认（端到端触发验证），记录为已知限制；push refspec 变体仅落 ask。
- 最终状态/风险/用户操作：ACCEPTED；候选 `9562b76`（`304c1e1`+`9562b76`）已通过独立只读 Review 与 Acceptance，等待用户决定是否推送、创建 PR 和合并。合并到 main 后，CLAUDE.md / .claude/settings.json / reviewer Agent 即供 Claude Code 开发使用。
- 日期与决定日志：2026-09-04，用户授权开始 TASK-024（Claude 治理桥接与系统兜底）。

<!-- EVIDENCE:END -->
