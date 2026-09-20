# TASK-077：补登记 TASK-074 与 TASK-076（控制面）

```toml
schema_version = 2
id = "TASK-077"
status = "ACCEPTED"
risk = "L1"
risk_reason = "纯控制面登记：只改 docs/tasks 下三份任务记录的 status 字段、各自 EVIDENCE 区里的合并事实，以及索引表的两行。不碰代码、规则、门禁、契约与迁移，不改任何任务的目标/风险/路径/检查。docs/tasks/** 不在 risk-policy.json 的 high_risk_paths 里；风险标志 documentation → L1。执行链：1 Worker → 自动检查 + 自检 → 主 Agent 汇总；独立 Review 与验收 N/A。本任务不产生任何产品行为变化，登记内容全部可由 git 合并事实独立复核。"
risk_flags = ["documentation"]
owner = "coordinator"
base = "92040256a423cdb2d70d2997e191dd56c0d96bfa"
allowed_paths = [
  "docs/tasks/TASK-074-citation-metadata.md",
  "docs/tasks/TASK-076-index-registration-guard.md",
  "docs/tasks/TASK-077-pending-registrations.md",
  "docs/tasks/任务索引.md",
]
checks = ["governance"]
```

## 需求与范围

### 用户授权

2026-09-20 用户合并 PR #83（TASK-076）后回「已合并」。TASK-076 的证据区把「下一个已授权任务的控制面提交必须补 TASK-074 的索引行并标 MERGED」列为**到期动作**，独立验收也把它点名为「合并后请优先执行」的唯一兜底。本任务就是执行它，并顺带把 TASK-076 自己的合并登记做掉。

### 目标

1. **TASK-074 补登记**：记录 `status` → `MERGED`，并在索引里**补上它缺失的那一行**（合并事实：用户 2026-09-20 合并 PR #81，merge `48f232e`）。这一行是 TASK-073/074 并行时按新规则主动让出的——074 不是索引持有者，登记延后至今。
2. **TASK-076 补登记**：记录 `status` → `MERGED`，索引行状态同步（合并事实：用户 2026-09-20 合并 PR #83，merge `9204025`）。
3. **顺带验证新门禁对真实场景确实咬得住**：TASK-074 是 `MERGED ⇒ 必须有索引行` 这条校验的第一个真实对象。补行前后各跑一次 `validate_governance.py`，把「只标 MERGED 不补行 → FAIL」的实测结果记进来——这是 TASK-076 唯一没能用真实数据验过的一条。

### 非目标 / 禁止范围

- 不改任何任务的目标、风险、允许路径、检查要求、实现与测试记录；只动 `status` 与 EVIDENCE 区内的合并事实。
- 不碰代码、`AGENTS.md`、`scripts/governance/**`、契约、迁移。
- 不给 TASK-077 自己预写 MERGED（它要等用户合并）。
- 所有未列入 `allowed_paths` 的路径。

### 依赖与并行

依赖：TASK-074（`48f232e`）与 TASK-076（`9204025`）均已合并进 main，合并事实已用 `git log`/`git show` 核对。基线即 `9204025`。
并行：否。本任务是索引的唯一持有者。

## 完成条件

- `TASK-074` 记录与索引行均为 `MERGED`，索引行内容如实（范围摘要、候选 SHA、检查与审查结论、合并事实）。
- `TASK-076` 记录与索引行均为 `MERGED`。
- 补行前的实测：把 074 标成 MERGED 而**不**补行时，`validate_governance.py` 必须 FAIL 并指名 `TASK-074 is MERGED but was never registered`；补行后 exit 0。两个结果都记进本记录。
- `python3 scripts/governance/check_task.py --task docs/tasks/TASK-077-pending-registrations.md --worktree` → CHECKS PASS。
- L1：无独立 Review、无独立验收（N/A）。

## 上下文包

- 规则：`AGENTS.md` 第 5 节（合并后核实用户合并事实、状态登记并入下一个已授权任务的控制面提交）、第 3 节（并行时索引的唯一持有者）。
- 门禁：`scripts/governance/validate_governance.py` 的 `index_errors`（TASK-076 新增）。
- 来源：`docs/tasks/TASK-074-citation-metadata.md` 与 `docs/tasks/TASK-076-index-registration-guard.md` 的证据区。

## 实现与测试

- 变更摘要（一次提交，见候选 SHA）：
  - `TASK-074`：记录 `status` → `MERGED`，证据区补合并事实（PR #81，merge `48f232e`）并写明索引行延后的原因；**索引里补上它缺失的那一行**（范围、候选 `f81e3c3`、backend 593 与 CHECKS PASS、L3 Review + 验收均 PASS、openapi 示例遗留随 TASK-075、合并事实）。
  - `TASK-076`：记录 `status` → `MERGED`，证据区补合并事实（PR #83，merge `9204025`）；索引行状态同步。
  - `TASK-077`：本记录与索引行。
- **新门禁在真实数据上的实测（本任务的第三个目标）**——TASK-074 是 `MERGED ⇒ 必须有索引行` 这条校验的第一个真实对象：
  - 只把 074 的记录标成 MERGED、**故意不补索引行**：`python3 scripts/governance/validate_governance.py` → `FAIL: docs/tasks/任务索引.md: TASK-074 is MERGED but was never registered`，**exit=1**。
  - 补上索引行后同一条命令 → `Governance V2 PASS`，**exit=0**。
  - 这是 TASK-076 唯一没能用真实数据验过的一条（当时 074 的记录还不在那个分支上）。现在验过了：**它确实拦得住「登记只做了一半」**。
  - **第二次实测（非计划内，被自己的门禁抓了个正着）**：写本记录时把 TASK-077 的 `status` 置成 ACCEPTED、却忘了同步索引行，`check_task.py` 当场 FAIL——`docs/tasks/任务索引.md:24: index says READY, record says ACCEPTED`，同时 `test_repository_structure` 也红（它断言 `gov.validate() == []`）。同步索引行后恢复 PASS。这条「行状态必须等于记录 status」的校验，在真实工作流里抓到的第一个对象就是写它的人。
- 命令与结果（本机 macOS 25.5.0）：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-077-pending-registrations.md --worktree` → **CHECKS PASS**（profile=governance：`validate_governance.py` exit 0、ruff check、ruff format --check、unittest 29 tests OK）。
- 自检（L1 无独立 Review，故此处如实列出我自己核过什么）：两条合并事实都用 `git log --oneline origin/main` 与 `git show origin/main:<记录>` 独立核对——`48f232e` 是 PR #81 的合并提交、`9204025` 是 PR #83 的合并提交，两者都在 `origin/main` 上；三份记录**只动了 `status` 字段与 EVIDENCE 区**，目标/风险/allowed_paths/检查/实现与测试记录一字未改（可由 `git diff` 复核）。
- 已知限制/未完成项：
  - 本任务自己的 MERGED 登记同样要等用户合并后由下一个任务补——**不预写**。
  - 新门禁仍管不住「合并后既没人标 MERGED、也没人补行」（TASK-076 的非阻断遗留 4）。本次 074 的登记是靠 TASK-076 证据区里写明的「下一步」催出来的，不是机器催的。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：本记录写回后的提交（一次提交内含全部登记与证据）。
- Review：L1，N/A（按第 4 节 L1 执行链：1 Worker → 自动检查 + 自检 → 主 Agent 汇总）。
- Acceptance：L1，N/A。
- 最终状态/风险/用户操作：**ACCEPTED**。风险：纯登记，无产品行为变化；写错的后果是索引与记录不一致，而这恰好被 TASK-076 新加的门禁在 CI 上拦住（本次已实测两个方向）。**需要用户操作：合并 PR。**
- 非阻断遗留项：
  1. 本任务的 MERGED 登记留给下一个已授权任务（不预写 MERGED）。
  2. `openapi-v1.json` 的 `deleteResource` 409 示例仍缺 `citation_count` 与 `highlight_count`（TASK-074 的遗留，随 TASK-075 补）——本任务不碰契约，仅在索引行里如实标注。
- 日期与决定日志：2026-09-20 用户合并 PR #83 后回「已合并」→ 执行 TASK-076 证据区列明的到期动作。
<!-- EVIDENCE:END -->
