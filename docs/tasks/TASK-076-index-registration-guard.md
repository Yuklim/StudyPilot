# TASK-076：并行任务的索引登记规则与机器校验

```toml
schema_version = 2
id = "TASK-076"
status = "MERGED"
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

- **F1（可记录→不改，理由如下）** 「行状态必须等于记录 status」在「某任务已有索引行、却在后续并行窗口里成了非持有者」时会把分支逼进死角（改不了行，分支持续红）。不改的理由：行只由持有者写，**有行本身就意味着它是持有者或已被后续控制面提交接管**，构造出这个局面要先违反刚立的规则；而 Reviewer 给的收紧办法（只在任一侧为 MERGED 时才比对）会放过 **ACCEPTED ↔ IN_REVIEW 之间**的漂移。（原先这里拿 TASK-022 当例子不准确：它是「行 MERGED / 记录 ACCEPTED」，收紧版同样抓得到——第二轮 Review 指出，已改。）记为非阻断遗留，附重评触发条件。
- **F2（可记录→已改）** 记录里「每个任务最终都会 MERGED，所以最终覆盖全部任务」的推理不成立（漏判窗口无界）。上面的取舍段落已改写成如实说法：这条不变量管的是「别只做一半」。
- **F3（可选→已改，真误报面）** 表头原先按写死的 `"| 任务 "` 文案跳过：索引改表头名或多出一张表时，那些行会被整片报成 `unparsable`，拦住一个跟索引毫无关系的 PR。改为**按「首列里没有任务号」认表头**——首列里有 `TASK-` 却取不出链接的行仍然照报，不会因此被放过。新增回归用例 `test_index_survives_a_renamed_header_and_a_second_table`，**判别性已验**（把认法改回写死文案即红）。
- **F4（可选→不改）** 首列里若出现转义管道 `\|`，`split(" | ")` 会把列错位、状态列报成 `invalid index status`（误报，但失败可定位、改回即好）。现有 74 行无此写法；要根治得换成懂转义的切列，复杂度不抵收益。记为非阻断遗留。
- Reviewer 的**剩余风险**（CHECKS PASS 跑在实现 SHA `0eed3c5`，而候选 `ddb50db` 的增量恰是新校验读的输入）已用机械证据消除：修正后在最终候选上重跑 `check_task.py --worktree` → CHECKS PASS，见下方命令记录。
- 修正后：治理套件 **29 tests OK**（+1 回归用例）。

### 第二轮 Review 的处置（第三候选）

结论 PASS、覆盖最终候选、无必须修复项；4 条均为「陈述比证据宽」，全部照改：

- **F1（可记录→已改）** `index_errors` 的 docstring 里还留着被 F2 推翻的说法（「每个任务最终都会 MERGED，所以最终覆盖全部任务」），而记录里已写「已改」——代码注释才是后来者改这条校验时读的东西，口径必须一致。已改成与记录相同的如实说法。intake 段落里登记的原始实现决定保留原文，不回改。
- **F2（可选→已改）** `index_rows` 的 docstring 说「不是静默跳过」，与新增的表头跳过分支口径不一致。改成分述：首列连任务号都没有的按表头/说明行跳过；首列有任务号却取不出链接的照报。
- **F3（可选→已改）** 本记录里拒绝 F1 的理由拿 TASK-022 当例子**不准确**：它是「行 MERGED / 记录 ACCEPTED」，收紧版同样抓得到；真正会被放过的是 ACCEPTED ↔ IN_REVIEW 之间的漂移。已改正，拒绝结论不受影响。
- **F4（可选→已改）** 用例名写了 `a_second_table`，夹具却只造了改名表头——名字比夹具宽。夹具补上第二张表（表头与数据行首列都没有任务号），名副其实。
- Reviewer 核过的新表头认法漏判面：相对旧版只有「首列连 `TASK-` 都没有的畸形行」从报错变成跳过，这类行本来一条校验也过不了，且若其记录标成 MERGED 仍由 `never registered` 兜住——有界且自愈，无实质新漏判。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：第一候选 `ddb50db`；第二候选 `59b2899`；**最终候选 `fbaa1a4`**。
- 最终候选上的机械检查（工作区干净、HEAD=`fbaa1a4`）：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-076-index-registration-guard.md --worktree` → **CHECKS PASS**，`STATIC PASS base=eeb4399… input=WORKTREE`、`files=7`、`product_fingerprint=d97933ee307d4b286abed7595540299275b5dd8505f2d69dd2588c968bfd473b`、`Ran 29 tests OK`。（验收 F1：先前记录里的 CHECKS PASS 标的是第二候选，而最终候选动过可执行的用例夹具，口径不足——已在最终候选上重跑并以指纹留证。）
- Review：独立只读 Reviewer（`.claude/agents/reviewer.md`，仅 Read/Grep/Glob，无写工具、无 Bash），**三轮**：
  - 第一轮（`eeb4399..ddb50db`）**PASS**，4 条非阻断，逐条处置见正文「第一轮 Review 的处置」。
  - 第二轮（增量 `ddb50db..59b2899`）**PASS**，4 条「陈述比证据宽」，逐条处置见正文「第二轮 Review 的处置」。
  - 第三轮（增量 `59b2899..fbaa1a4`，结论覆盖 `eeb4399..fbaa1a4`）**PASS，无 findings**。报告原文：

    > **结论：PASS（覆盖最终候选 `eeb4399..fbaa1a4`）。本轮无 findings，不再要求新候选。**
    >
    > **增量属实，已逐字核对**（reflog 748 行确认 `59b2899..fbaa1a4` 只有一个提交，HEAD=`fbaa1a4`）：`validate_governance.py` 改的只有两段 docstring（245–246、278–280）。判定逻辑 248–269 与 282–304 与第二候选**逐字相同**——跳过条件、`" | "` 切列、两条正则、`ok` 计算、六条错误文案与顺序、`validate()` 里的接线、`STATES`/`INDEX_PATH` 全未动。`test_validate_governance.py` 只改 167–169（`row` 补换行 + 新增 `second`），其余用例逐字未变。记录：112 行改正 + 新增 119–127 段；冻结区（toml、目标/非目标、实现决定、完成条件、上下文包）与前两轮读到的完全一致。
    >
    > **第二张表不会掩盖原用例要守的东西**（这是本轮最该问的一条，我核过）：断言是 `assertEqual([], errors)`——追加内容只可能**增加**错误，不可能隐藏错误。夹具里的两行分别由「无 `TASK-`」「`| ---`」两条分支跳过；同时 `TASK-101` 的记录是 MERGED，万一那一行被误跳过就会触发 `never registered` → 红，所以「好行必须仍被看见」也由同一断言守着。变异回退（表头改回写死文案）现在会一次产生 3 条 unparsable，判别性比第二候选更强。
    >
    > **新 docstring 与实现相符**：分述精确对应两个跳过分支与 `ok` 的计算；被第一轮推翻的断言已无残留。
    >
    > **剩余非阻断遗留（同意记录、不必再开候选）**：F1（已有行的任务若在后续窗口成为非持有者会无法自救；触发需先违反一持有者规则）、F4（首列转义管道 `\|` 错位误报）。
    >
    > **剩余风险**：第三候选上的 CHECKS PASS / 29 tests 是主 Agent 跑的机械证据，我无法重跑；但本轮增量不含可执行逻辑，且我已独立核对真实索引 74 行仍全部可解析、70 份 schema2 记录与行状态一一相符。

- Acceptance：独立只读 Integration/Acceptance（**全新实例，无前序上下文，独立于实现者与 Reviewer**；自述权限证据：仅 Read/Grep/Glob，无 Write/Edit/NotebookEdit、无 Bash，运行器层面真实只读）。首轮结论 **CHANGES_REQUIRED**，三条全为证据口径、无代码缺陷；完成条件七项逐条对账均给出行号证据并判为满足。报告要点原文：

    > 1. 规则落地：`AGENTS.md:24`、`AGENTS.md:47` → 满足；16 KiB 上限检查在 `validate_governance.py:377-378`。
    > 2. 六条校验 `validate_governance.py:284-303`，反例 `test_validate_governance.py:178-186`、:193-194、:200-201，接线哨兵 :146-154 → 满足。
    > 3. 嵌套方括号回归：真实行 `任务索引.md:38`，用例 :156-162 断言取到 `TASK-064-image-placeholders.md`；朴素正则会取成 `image:N` → 满足。
    > 4. 状态修正：TASK-022 依据其 :52 原文与 `51b427f`、TASK-073 依据 :204 的 PR #82/`eeb4399`，两者都只改 toml `status` 与 EVIDENCE 区内的事实，**属合并后状态登记，不是越权改冻结正文** → 满足。
    > 6. 路径：全仓 grep `TASK-076` 只命中三处，均在 allowed_paths 内；指南未改且全文无「索引」字样，与记录说法一致 → 满足。
    > 7. 数字自洽：索引 74 行；`test_validate_governance.py` 20 个 + `test_check_task.py` 9 个 = **29**，与「29 tests OK」对得上。
    >
    > **F1（必须）最终候选没有机械检查证据**：记录里的 CHECKS PASS 明写「工作区在第二候选」，而 `fbaa1a4` 改了可执行的测试夹具。须在 `fbaa1a4` 上重跑并写入 EVIDENCE。我已手算该夹具 → 预期仍返回 `[]`，**未发现实质缺陷**，但 PASS 不能由我替它声明。
    > **F2（必须）覆盖最终候选的 Review 结论不在记录里**：两段处置分别标「第二候选」「第三候选」，EVIDENCE 区全为「待填」。置 ACCEPTED 前须把覆盖 `fbaa1a4` 的报告原文与候选 SHA 写回。
    > **F3（记录后继续）记录里有一句已过时**：正文称「TASK-074 的记录此刻只在未合并的 PR #81 上」，但 origin/main 早已 ff 到 `48f232e`，**早于**第二、第三候选。正文在 EVIDENCE 区外不可改，应在 EVIDENCE 里如实登记：074 的登记义务**现在已到期**，不是「将来」。
    > 其余「陈述 vs 证据」独立复看均如实，无新增夸大。
    >
    > **对 074 登记安排的判断**：拦得住「只做一半」——`validate_governance.py:301-303` 在 074 被标 MERGED 而无行时必报 `never registered`，哨兵证明这条真的接进了 `validate()`。**拦不住「既没人标 MERGED、也没人补行」**——074 此刻正处在这个无界窗口。记录已如实承认，不算隐瞒，但确实存在被永远遗忘的可能；唯一低成本兜底是把「下一个任务补 074 行并标 MERGED」写进 EVIDENCE 的下一步。
    > **剩余风险**：本分支没有 TASK-074 的记录，我无法验证它在 main 上的 `status`。若它在 main 上已是 `MERGED`，076 一合并，main 的治理检查会立刻 FAIL。合并前请确认 main 上该记录为 ACCEPTED。

  **验收复核后最终结论：PASS，无 findings**（原文要点）：

    > F1 已补：最终候选 `fbaa1a4` 上的 CHECKS PASS 带 base/input/files/指纹/29 tests，并如实写明「先前的 PASS 标的是第二候选、口径不足」；29 与我独立点数的 20+9 相符。机械证据我无法重跑，但口径已绑定到被测 SHA，**不再是旧 SHA 充数**。
    > F2 已补：三个候选 SHA 齐全，第三轮为报告原文，且原文自报了「不能重跑机械证据」这一限制——**没有把 NOT_RUN 说成 PASS**。
    > F3 已如实登记，并把 074 补行 + 标 MERGED 指派给下一个已授权任务；无界窗口另列为遗留 4。
    > **写回越界检查**：正文 1–128 行与上轮读到的逐字一致，目标/非目标/风险/allowed_paths/checks/完成条件/上下文包/实现与测试全部未动；改动只有 toml `status` 与 EVIDENCE 区——符合第 6 节。索引行已同步 ACCEPTED，新门禁对本仓库自身仍自洽。
    > **剩余风险（已从阻断降为知情项）**：① main 上 074 为 ACCEPTED、索引无其行是主 Agent 用 `git show` 核的，我无 Bash 无法复核——若核错，后果是合并后 CI 即刻 FAIL 且错误可定位（`never registered`），可回退可修。② **074 的登记仍靠人**：门禁只在有人把它标 MERGED 时才咬，「下一步」是唯一兜底，合并后请优先执行。③ 转义管道误报与非持有者无法自救均有触发条件、未发生。
    > **可以按 ACCEPTED 交用户合并。**

  主 Agent 对验收三条的处置：**F1 已补**（最终候选上重跑，指纹见上）；**F2 已补**（本次写回）；**F3 已如实登记**（见下方非阻断遗留 3）。验收提的剩余风险已核实并消除：`git show origin/main:docs/tasks/TASK-074-citation-metadata.md` 为 `status = "ACCEPTED"`，且 main 的索引里没有 `^| [TASK-074` 行——并行窗口合法，076 合并后 main 的治理检查不会因此 FAIL。
- 最终状态/风险/用户操作：**MERGED**——2026-09-20 用户已合并 PR #83，merge `9204025`（状态登记并入 TASK-077 控制面提交）。此前为 ACCEPTED：L3 执行链走完：1 Worker → 自动检查 → 独立只读 Reviewer（三轮 PASS）→ 独立只读 Integration/Acceptance（一轮 CHANGES_REQUIRED，三条证据口径已全部补齐）。风险：改的是会 FAIL 的 CI 门禁，误报会拦住无辜 PR——已用「现仓库 0 误报」「逐条反例对上原因」「8 个变异全部被抓」三重证据约束。**需要用户操作：合并 PR。** 合并后这条门禁对之后每个 PR 生效；**下一个任务必须先补 TASK-074 的索引行并把它标为 MERGED**（见下）。
- 非阻断遗留项：
  1. **（第一轮 Review F1，记录）** 「行状态必须等于记录 status」在「某任务已有索引行、却在后续并行窗口里成了非持有者」时无合规解法。**重评触发**：真的出现暂停后重启、且已有行的任务成为非持有者——届时要么把索引给它，要么把该条收紧为「任一侧为 MERGED 时才比对」（代价是放过 ACCEPTED ↔ IN_REVIEW 的漂移）。
  2. **（第一轮 Review F4，记录）** 首列里若出现转义管道 `\|`，`split(" | ")` 会让列错位、状态列误报 `invalid index status`。现有 74 行无此写法，失败可定位、改回即好。**重评触发**：有人在任务标题里用了转义管道。
  3. **（验收 F3，如实登记）** 正文第 51、106 行写的「TASK-074 的记录此刻只在**未合并**的 PR #81 上」**已过时**：用户已于本任务实施期间合并 PR #81（merge `48f232e`），该合并早于第二、第三候选。正文在 EVIDENCE 区外不可改，故在此更正。**含义：074 的登记义务不是「将来」，是现在已到期。**
  4. **（验收指出的无界窗口）** 本任务的门禁拦得住「登记只做了一半」，拦不住「合并后既没人标 MERGED、也没人补行」。要管那一类得用 main 上的合并事实做判据（读 git 历史），属另一条不变量。**重评触发**：再出现一次「合并很久没人登记」。
- **下一步（不是遗留，是到期的动作）**：本任务合并后，**下一个已授权任务的控制面提交必须做两件事**——给 `TASK-074` 补索引行、把它的记录与索引行都标成 `MERGED`（合并事实：用户 2026-09-20 合并 PR #81，merge `48f232e`）。本任务做不到是因为 074 的记录只在 main 上、而本分支基于合并前的 `eeb4399`，且 Agent 被 `.claude/settings.json` 的 deny 规则禁止执行 merge。新门禁会在「074 被标 MERGED 却没有行」时报 `never registered`，但不会催人开始做这件事——所以写在这里。
- 日期与决定日志：2026-09-20 TASK-073/074 并行撞索引冲突 → 用户选定救火方案「撤回 074 的索引行」→ 用户「现在就开一个」授权把改进写成规则与门禁 → 登记 TASK-076。
<!-- EVIDENCE:END -->
