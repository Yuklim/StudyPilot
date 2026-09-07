# TASK-041：阅读器调研文档入库

```toml
schema_version = 2
id = "TASK-041"
status = "MERGED"
risk = "L1"
risk_reason = "把一份 2026-09-05 就写好、此后一直未跟踪的调研文档提交入库，并加一节状态说明。它是明示的「调研，不是提案，更不是已生效的架构决定」，不改任何代码、接口、数据、契约或治理规则，没有公共行为影响，验证方式是可复现的检查脚本。不判 L2 的理由：它不落在 risk-policy 的任何高风险路径下（`docs/research/**` 不在 high_risk_paths 内），也不承载任何决定 —— 文中被用户确认过的那条方向早已由 TASK-036 走完整 L3 链交付。唯一的实质风险是「后来者把这份写于 9 月 5 日的文档当成当前状态」，本任务用 1.4 节正面处理该风险。"
risk_flags = ["documentation"]
owner = "coordinator"
base = "5abf0eb944dcbe383ae6c3169a3f744df034bdee"
allowed_paths = [
  "docs/research/阅读器与标注能力调研.md",
  "docs/tasks/TASK-039-snapshot-assets.md",
  "docs/tasks/TASK-041-reading-research-doc.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

- **用户授权**：2026-09-06 用户就该文件的去留回答「入库吧」。主 Agent 此前报告：该文件自 2026-09-05 起一直未跟踪，会让每次 `check_task.py --worktree` 因「超范围」失败（此前几次检查是把它临时挪开再跑的，文件内容未动过）。
- **目标**：把 `docs/research/阅读器与标注能力调研.md` 提交入库，并补一节说明它写成之后实际发生了什么。
- **非目标**：
  - **不重写调研正文**。除第 1 节「对应任务」一行、新增的 1.4 节、以及第 7 节开头一句状态说明外，正文一字不改 —— 它是某一天的认知快照，改写它就毁掉了它作为记录的价值。
  - 不把文中任何建议转成待办，不新建后续任务，不改任何代码、接口、数据或契约。
- **禁止范围**：所有未列入 `allowed_paths` 的路径。
- **依赖**：无。**基线随 PR #44 合并而前移**：登记时为 `e937201`，用户 2026-09-07 合并 TASK-039 后改为 `5abf0eb`（当前 main）。改基线的唯一原因是本分支已把 origin/main 合入以处置索引冲突；若仍写旧基线，检查脚本会把 TASK-039 的 21 个文件当成本任务的超范围改动。本任务与 TASK-039 无路径交集这一点不变。
- **并行**：否。

### 顺带完成的状态登记与索引冲突处置（合并 PR #44 之后追加）

`docs/tasks/TASK-039-snapshot-assets.md` 在 `allowed_paths` 内，**仅用于把它的 `status` 由 `ACCEPTED` 登记为 `MERGED`**（2026-09-07 用户合并 PR #44，merge commit `5abf0eb`，已用 `gh pr view` 与 `git log origin/main` 双向核实），并同步其 EVIDENCE 区「最终状态」一行。依据是根 `AGENTS.md` §5「合并后……状态登记可并入下一个已授权任务的控制面提交」，不为收尾另造 PR。**除此之外不改该记录一个字。**

同时处置索引冲突：本分支从合并前的 main（`e937201`）拉出，PR #44 合并后 `docs/tasks/任务索引.md` 的表头区与 origin/main 冲突。处置方式为**把 origin/main 的整块原样保留、只把本任务的行置顶**，并按上述登记把 TASK-039 行改为 MERGED。核实：合并后索引共 41 行任务行 = origin/main 的 40 行 + TASK-041 一行，且 `git diff origin/main` 对该文件为 **2 增 1 删**（新增 TASK-041 行、替换 TASK-039 行），没有任何既有行被丢弃或改写。**用合并方式而非 rebase**：分支已推送且已开 PR，rebase 需强推，为 §2 明令禁止。



## 完成条件

1. `docs/research/阅读器与标注能力调研.md` 已被 Git 跟踪，`git status` 中不再出现未跟踪项。
2. `check_task.py --worktree` 不再因该文件「超范围」失败 —— 这是本任务的直接目的，须实跑验证。
3. 调研正文除以下三处外**一字未改**，且三处都只陈述事实、不改变文中任何结论：第 1 节「对应任务」一行（原写「未提交」，现已不成立）、新增 1.4 节、第 7 节开头一句指向 1.4 节。
4. 1.4 节如实对应：7.1 快照方向 → TASK-036 已交付；扩展抓取 → TASK-037/038 已交付；10.5 图片 → TASK-039 已交付（且如实指出实际排期与本文「可推迟」的判断相反，并说明为什么）；7.2 selector 字段 → 未做且记录主 Agent 当时提出的异议；阅读器本身 → 未做。
5. 明确写出 1.2 节那张「已确认/未确认」表说的是写作当日的状态。

## 上下文包

- 规则：`AGENTS.md` §4/§5/§7、`docs/governance/风险分级与检查规则.md`（L1 判入条件与执行链）。
- 文件：`docs/research/阅读器与标注能力调研.md` 本身；事实核对依据为 TASK-036 / 037 / 038 / 039 的任务记录与索引。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-041-reading-research-doc.md --worktree`。

## 实现与测试

- **实现 SHA/变更摘要**：见 EVIDENCE 区候选条目。改动为三个文件：调研文档（入库 + 三处状态说明）、本任务记录、任务索引一行。
- **命令、真实退出结果、product_fingerprint、环境**：见 EVIDENCE 区。
- **已知限制/未完成项**：
  1. 1.4 节的对应关系由主 Agent 逐条比对四份任务记录得出，**无第三方复核**（L1 不设独立 Review，这是等级本身的取舍，不是遗漏）。
  2. 调研正文中除上述三处外的**所有过时陈述一律保留**（例如 1.2 节的「已确认/未确认」表、第 7 节「成本：低」等评估）。这是刻意的：保住它作为 2026-09-05 认知快照的价值，代价是读者必须先读 1.4 节。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：首轮候选 `2190d90c3b7b15153f4bc1d2d8e77c4afd78d70a`；**合并 origin/main 并处置索引冲突后形成新候选，其精确 SHA 在下一次写回时补记**（提交无法引用自身）。首轮候选的记录如下：**`2190d90c3b7b15153f4bc1d2d8e77c4afd78d70a`**（base `e937201`，3 个文件，全部在 `allowed_paths` 内）。`check_task.py --worktree` → **CHECKS PASS**，`risk=L1`，`stages=('worker',)`，`files=3`，`product_fingerprint=85aee36ed86273b81d2390971c26a5ca9b5b86336f585fdd5d511ba330cf07d0`，`profiles=`（无代码改动，未选中任何检查组）。
  - **合并 origin/main、处置索引冲突并把基线前移到 `5abf0eb` 之后重跑**：`check_task.py --worktree` → **CHECKS PASS**，`files=4`（多出 `docs/tasks/TASK-039-snapshot-assets.md` 的状态登记），`product_fingerprint=4f8a923a43dc7fe6f4507a22cbae2d0d0b3f245d8b067282b69229c47282911a`，`profiles=` 仍为空。`git diff origin/main..HEAD` 为 **4 个文件、571 增 3 删**，与上述一致，没有把 TASK-039 的任何改动重新计入本 PR。环境：macOS Darwin 25.5.0、`backend/.venv`。本次检查**没有再因未跟踪文件超范围而失败**——这正是完成条件 2 要的直证。
- Review：**L1，N/A**（按 `AGENTS.md` §4，L1 执行链为「1 Worker → 自动检查 + 自检 → 主 Agent 汇总」，Review 与验收明确 N/A）。本任务未派任何独立审查实例。
- Acceptance：**L1，N/A**。
- 最终状态/风险/用户操作：status=**MERGED**（2026-09-07 用户合并 PR #45，merge commit `4066c02`；本行状态登记按根 `AGENTS.md` §5 并入下一个已授权任务 TASK-040 的控制面提交）。交付时为 **ACCEPTED**。L1 执行链完整：Worker → 自动检查（CHECKS PASS）→ 主 Agent 自检；Review 与 Acceptance 按等级 **N/A，未派任何独立实例**。完成条件 5 条全部满足：①②由 `git status` 与上面那次 CHECKS PASS 直证；③**无法用 git 证明，如实说明**：文件是首次入库，历史里没有前一版可比，`git diff base..candidate` 只会显示整份新增。可依据的只有过程性论据 —— 对该文件的全部写入只有一次脚本化替换，三处各带精确匹配断言（不匹配即中止），此外没有任何写入。**这是过程论据，不是 git 级证据**；若要真证，须有该文件入库前的独立副本可比，而它此前从未被跟踪，副本并不存在。④⑤为文本内容，主 Agent 逐条比对四份任务记录后写入，无第三方复核（见已知限制 1）。**需要用户操作**：审阅后决定是否合并。它与 TASK-039 分支无路径交集，两者可各自独立合并、顺序不限。
- 非阻断遗留项（仅有真实问题时）：**（A）1.4 节的对应关系无第三方复核**。影响：若某条对应写错，读者会对项目进展有错误印象；不触及代码、数据与安全。暂不修理由：L1 不设独立 Review，这是等级本身的取舍；四条对应均可由任务索引一眼核对。**责任角色：coordinator。重评触发条件：任一被引任务（TASK-036/037/038/039）的状态发生变化，或用户指出某条对应不实。**
- 日期与决定日志：2026-09-06 用户授权入库。主 Agent 选择原样入库而非重写，并用新增的 1.4 节处理「文档写于 9 月 5 日、正文停在那天认知」这一唯一实质风险；同时如实记下 10.5 图片的实际排期与本文「可推迟」的判断相反，以及本文把 7.2 selector 字段与快照并列为「事后无法补做」这一点在 TASK-036 登记阶段已被主 Agent 提出异议且用户未另作决定。
<!-- EVIDENCE:END -->
