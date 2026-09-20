# TASK-076：并行任务的索引登记规则与机器校验

```toml
schema_version = 2
id = "TASK-076"
status = "READY"
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

- 实现 SHA：待填。
- 命令与结果：待填。
- 已知限制/未完成项：待填。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-20 TASK-073/074 并行撞索引冲突 → 用户选定救火方案「撤回 074 的索引行」→ 用户「现在就开一个」授权把改进写成规则与门禁 → 登记 TASK-076。
<!-- EVIDENCE:END -->
