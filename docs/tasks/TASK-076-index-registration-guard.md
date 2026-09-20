# TASK-076：并行任务的索引登记规则与机器校验

```toml
schema_version = 2
id = "TASK-076"
status = "IN_REVIEW"
risk = "L3"
risk_reason = "改根规则 AGENTS.md 与 scripts/governance/ 下的校验脚本：前者是协作底线正文，后者在 CI 的「仓库治理检查」里每个 PR 都跑、失败即拦住合并，属第 4 节的「治理权限/门禁」。risk-policy.json 的 high_risk_paths 也把 AGENTS.md 与 scripts/governance/** 列为高风险路径，命中即取最高级。定 L3：1 Worker → 自动检查 → 独立只读 Reviewer → 独立只读 Integration/Acceptance。新增的是会 FAIL 的门禁，误判会拦住无辜的 PR，因此判别性用例与「现仓库必须 PASS」是硬完成条件。"
risk_flags = ["governance"]
owner = "coordinator"
base = "eeb4399d65c0efedc08e020f0853c9c0fb473333"
allowed_paths = [
  "AGENTS.md",
  "scripts/governance/validate_governance.py",
  "scripts/governance/test_validate_governance.py",
  "docs/governance/多Agent开发制度使用指南.md",
  "docs/tasks/TASK-022-resource-safe-delete-backend.md",
  "docs/tasks/TASK-073-pdf-reader.md",
  "docs/tasks/TASK-076-index-registration-guard.md",
  "docs/tasks/任务索引.md",
]
checks = ["governance"]
```

## 需求与范围

### 用户授权

2026-09-20 TASK-073 与 TASK-074 并行，合并 073 后 074 的 PR 冲突。用户问「为什么每次同时进行两个任务都会有一个冲突，能否改进」。主 Agent 给出三条候选改法，用户先在救火方案里选定「撤回 074 分支上的索引行」（已执行），随后对「要不要现在就把改进写死成规则」答**「现在就开一个」**。

### 目标

1. **规则**：在 `AGENTS.md` 写明——并行任务中**只有一个**可以把 `docs/tasks/任务索引.md` 列进 `allowed_paths`；其余任务不写索引，其索引行由后续已授权任务的控制面提交补登记，**最迟在把该任务标记为 MERGED 时完成**。
2. **机器校验**：在 `scripts/governance/validate_governance.py` 的 `validate()` 里新增索引一致性校验（CI「仓库治理检查」每个 PR 都跑，也进 `check_task.py` 的 governance 组）：
   - 每个索引行都能解析出任务号与记录文件名（表格写坏立刻暴露）；
   - 索引里任务号唯一；
   - 行指向的记录文件存在，且文件名以该任务号开头；
   - 行里的状态是 `STATES` 之一；
   - **状态为 MERGED 的记录必须有索引行**（其余状态可以暂时没有——这正是并行延后登记的窗口）；
   - 有行时，**行里的状态必须与记录 toml 的 `status` 一致**。
3. **测试**：`test_validate_governance.py` 每条校验一正一反，反例必须让 `validate()` 报错；并补一条**真实解析回归**：现有索引里 TASK-064 的标题含 `![图片](image:N)`，嵌套方括号会骗过朴素正则（登记阶段的探针已被骗过一次），校验必须能正确解析这一行。
4. **补上现存失真**：`TASK-022` 记录 `status = "ACCEPTED"` 而索引行写 MERGED；合并事实已核（`51b427f` 是 PR #27 的合并提交且在 main 上），把记录改为 MERGED。这是全仓唯一一处不一致（登记阶段全量扫过 73 行索引 + 全部 schema_version=2 记录）。
5. **顺带控制面登记**：`TASK-073` 登记 MERGED（用户 2026-09-20 合并 PR #82，merge `eeb4399`）。

### 非目标 / 禁止范围

- **不做 `.gitattributes` 的 `merge=union`**：union 会在「两边改同一行」时静默留下重复行，控制面文件静默出错比冲突更糟；而目标 1 已让并行任务不必都写索引，union 的收益消失。理由记录在案，不再重复评估。
- **不做「所有记录都必须有索引行」**：那会否定并行延后登记，与目标 1 自相矛盾。只兜住 MERGED。
- 不改风险分级、角色表、并行的其他约束（worktree 上限等）、`.codex/**`、`.claude/**`。
- 不碰 `backend/**`、`frontend/**`、`extension/**`、契约与迁移。
- **不动 `TASK-074` 的记录与索引行**：该记录此刻只在未合并的 PR #81 上，本分支没有它，而 Agent 被 deny 规则禁止执行 merge。074 的索引行与 MERGED 状态留给它合并之后的下一个已授权任务——按新规则本来就该这样，正好当第一个实例。
- 所有未列入 `allowed_paths` 的路径。

### 依赖与并行

依赖：无。基线 `eeb4399`（PR #82 合并后的 main）。
并行：**否**。本任务改的是所有任务共用的门禁，不与其他任务并行。按目标 1 的规则，本任务是索引的唯一持有者。

### 主 Agent 登记的实现决定（非用户决定，Review 可挑战）

- **校验放 `validate_governance.py` 而不是 `check_task.py`**：前者在 CI 每个 PR 上跑且不依赖任务记录，索引失真是仓库级不变量，不该只在跑任务检查时才发现。
- **「MERGED ⇒ 有行」而不是「记录 ⇒ 有行」**：前者兜住真正的失败模式（永远忘了补登记），后者会把并行的正常窗口判成错误。每个任务最终都会 MERGED，所以这条最终覆盖全部任务。
- **按表格列解析而不是一条大正则**：任务标题里可以出现 Markdown 链接与嵌套方括号（TASK-064 已经有），解析必须先切列再取链接。

## 完成条件

- `AGENTS.md` 落地规则且总字节仍 < 16 KiB（`validate_governance.py` 自带这条上限检查，超了会自己 FAIL）。
- 六条索引校验全部实现；每条有反例用例，**去掉该条校验或造一个违例，对应用例必须变红**（判别性在记录里写明验证方式）。
- 解析回归用例覆盖 TASK-064 那种带嵌套方括号的标题。
- `validate_governance.py` 对**修正后的当前仓库** exit 0（含「TASK-074 已合并但暂无索引行」这一未来场景的等价用例）。
- `TASK-022` 记录状态与索引一致；`TASK-073` 记录与索引均为 MERGED。
- `python3 scripts/governance/check_task.py --task docs/tasks/TASK-076-index-registration-guard.md --worktree` → CHECKS PASS。
- L3：独立只读 Reviewer 审 `base..candidate` 最终 diff；独立只读 Integration/Acceptance 核完成条件与跨模块证据。

## 上下文包

- 规则：`AGENTS.md` 第 3 节（并行与共享目录写入者）、第 5 节（单任务记录与分支、合并后登记）。
- 实现：`scripts/governance/validate_governance.py` 的 `validate()`／`STATES`／`REQUIRED`／`parse_task()`；`scripts/governance/test_validate_governance.py` 的行为式写法（不锁文案）。
- 数据：`docs/tasks/任务索引.md` 的表格格式（73 行，`| [标题](./TASK-xxx-name.md) | 状态 | 角色 | 范围 | 依赖 |`）。
- 策略：`docs/governance/risk-policy.json` 的 `high_risk_paths`（含 `AGENTS.md`、`scripts/governance/**`）。
- 检查：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-076-index-registration-guard.md --worktree`。

## 实现与测试

- 实现 SHA：`0eed3c5`（控制面登记 `f8912a9`）。变更摘要：
  - **`AGENTS.md`**（两句，第 3 节与第 5 节各一句）：并行任务中只有一个可以把 `docs/tasks/任务索引.md` 列进 allowed_paths，其余不写索引（附一句为什么：表按最新在上插行，两个分支插在同一锚点必然冲突）；延后的索引行最迟在标 MERGED 时补齐、且行状态与记录 `status` 必须一致，由 `validate_governance` 校验。改后 9601 字节，仍在脚本自带的 16 KiB 上限内。
  - **`validate_governance.py`**：新增常量 `INDEX_PATH` 与两个纯函数。`index_rows(text)` 解析索引表——**先按 `" | "` 切列再在首列里取链接**，因为任务标题里可以有 Markdown 链接和嵌套方括号（TASK-064 的标题含 `![图片](image:N)`）；解析不出任务号或文件名的行带 `ok=False` 返回，由调用方报错而不是静默跳过。`index_errors(text, records, files)` 六条：行可解析、任务号唯一、链接指向存在且同号的记录、状态值属 `STATES`、**状态为 MERGED 的记录必须在册**、有行时行状态必须等于记录 `status`。`validate()` 里收集 `{任务号: status}` 与实际文件名后调用它。
  - **为什么是「MERGED ⇒ 有行」而不是「记录 ⇒ 有行」**：后者会把并行延后登记的正常窗口判成错误，与本任务要立的规则自相矛盾；前者兜住的是**「登记只做了一半」**——记录标了 MERGED、索引没补。**它管不住「合并后既没人标 MERGED、也没人补行」，那个窗口是无界的**（第一轮 Review 指出：原先写的「每个任务最终都会 MERGED，所以最终覆盖全部任务」不成立，已改）。要管住那一类得有「main 上的合并事实 → 必须登记」的判据，需要读 git 历史，属另一条不变量，本任务不扩。
  - **补上的两处真实失真**：`TASK-022` 记录 `status` 漏登（证据区早已写明 MERGED 与合并提交 `51b427f`，仅 toml 字段停在 ACCEPTED；合并事实已独立核对——`51b427f` 是 PR #27 的合并提交且在 main 上）；`TASK-073` 登记 MERGED（用户 2026-09-20 合并 PR #82，merge `eeb4399`），记录与索引行同步。
  - **`docs/governance/多Agent开发制度使用指南.md` 未改**：全文没有一处提到索引（已 grep 确认），没有会过时的说法要同步。路径留在 allowed_paths 里是上限，不是必须改。
- 新测试 5 条（治理套件 23 → 28）与**变异测试实证**：
  - `test_index_parses_titles_with_nested_brackets`：拿**真实索引**跑，全部 74 行都要解析成功，并单独断言 TASK-064 那行取到了正确的文件名。
  - `test_index_rejects_broken_rows`：重复行 / 指向别的任务的记录 / 记录不存在 / 非法状态值 / 解析不出的行——**逐条对上错误原因**（不是只断言「有错」），某条校验被删时会红在那一条上。
  - `test_index_allows_a_deferred_row_only_until_merged`：记录在册而索引暂无行，未 MERGED 时不算错（并行窗口）；标成 MERGED 就必须报 `never registered`。
  - `test_index_status_must_match_the_record`：行状态与记录不一致要报；索引有行而记录不存在时只由链接检查负责，不重复报状态。
  - `test_validate_actually_runs_the_index_check`：把 `index_errors` 换成哨兵，`validate()` 必须把结论带出来——**因为仓库本身是干净的，「校验写好了」和「校验被接进 validate()」是两件事**。
  - **变异测试（7 个变异全部被抓）**：逐条删掉六条校验、把解析换成会被嵌套方括号骗的朴素正则、把 `validate()` 里的调用摘掉——每种都让对应用例变红。第七条（摘掉接线）在第一版测试下**是绿的**，正是它促成了上面那条哨兵用例。
  - 实地反证：把 `TASK-022` 的状态改回 ACCEPTED，`validate_governance.py` 立刻 `FAIL: docs/tasks/任务索引.md:75: index says MERGED, record says ACCEPTED`——新校验在真实仓库上确实咬得住，且除此之外零误报（全量扫过 74 行索引与全部 schema_version=2 记录）。
- 命令与结果（本机 macOS 25.5.0，工作区在 `0eed3c5`）：
  - `python3 scripts/governance/check_task.py --task docs/tasks/TASK-076-index-registration-guard.md --worktree` → **CHECKS PASS**（profile=governance：`validate_governance.py` exit 0、`ruff check --isolated`、`ruff format --check --isolated --line-length 100`、`unittest discover` **28 tests OK**）。
  - 输出里的 `missing-tool` / `fake-test` 两行是 `check_task.py` 自带的负向回归演示（验证「工具缺失会如实报错」），非真实失败；TASK-024 的记录里已有同样说明。
- 修正后重跑（工作区在第二候选）：`check_task.py --task ... --worktree` → **CHECKS PASS**（`validate_governance.py` exit 0、ruff check、ruff format --check、unittest **29 tests OK**）。
- 已知限制/未完成项：
  - 校验只保证索引与记录的**结构与状态**对得上，不校验摘要文案是否如实——那是 Review 的事。
  - 不覆盖「两个记录文件声明同一个任务号」：已有的 id/文件名校验挡住了大部分，完整覆盖要另立不变量，本任务不扩。
  - `TASK-074` 的索引行与 MERGED 状态**不在本任务**：它的记录此刻只在未合并的 PR #81 上，本分支没有它，而 Agent 被 deny 规则禁止执行 merge。按本任务刚立的规则，它的行由 #81 合并之后的下一个已授权任务补登记——新校验此刻不会因此报错（它还不是 MERGED），标 MERGED 时才会强制补齐。

### 第一轮 Review 的处置（第二候选）

结论 PASS、无必须修复项，4 条非阻断。逐条：

- **F1（可记录→不改，理由如下）** 「行状态必须等于记录 status」在「某任务已有索引行、却在后续并行窗口里成了非持有者」时会把分支逼进死角（改不了行，分支持续红）。不改的理由：行只由持有者写，**有行本身就意味着它是持有者或已被后续控制面提交接管**，构造出这个局面要先违反刚立的规则；而 Reviewer 给的收紧办法（只在任一侧为 MERGED 时才比对）会放过 ACCEPTED/IN_REVIEW 之间的真实漂移——那正是本次在 TASK-022 上抓到的那一类。记为非阻断遗留，附重评触发条件。
- **F2（可记录→已改）** 记录里「每个任务最终都会 MERGED，所以最终覆盖全部任务」的推理不成立（漏判窗口无界）。上面的取舍段落已改写成如实说法：这条不变量管的是「别只做一半」。
- **F3（可选→已改，真误报面）** 表头原先按写死的 `"| 任务 "` 文案跳过：索引改表头名或多出一张表时，那些行会被整片报成 `unparsable`，拦住一个跟索引毫无关系的 PR。改为**按「首列里没有任务号」认表头**——首列里有 `TASK-` 却取不出链接的行仍然照报，不会因此被放过。新增回归用例 `test_index_survives_a_renamed_header_and_a_second_table`，**判别性已验**（把认法改回写死文案即红）。
- **F4（可选→不改）** 首列里若出现转义管道 `\|`，`split(" | ")` 会把列错位、状态列报成 `invalid index status`（误报，但失败可定位、改回即好）。现有 74 行无此写法；要根治得换成懂转义的切列，复杂度不抵收益。记为非阻断遗留。
- Reviewer 的**剩余风险**（CHECKS PASS 跑在实现 SHA `0eed3c5`，而候选 `ddb50db` 的增量恰是新校验读的输入）已用机械证据消除：修正后在最终候选上重跑 `check_task.py --worktree` → CHECKS PASS，见下方命令记录。
- 修正后：治理套件 **29 tests OK**（+1 回归用例）。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-20 TASK-073/074 并行撞索引冲突 → 用户选定救火方案「撤回 074 的索引行」→ 用户「现在就开一个」授权把改进写成规则与门禁 → 登记 TASK-076。
<!-- EVIDENCE:END -->
