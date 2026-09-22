# TASK-090：把删除弹窗那份测试的等待方式统一过一遍，别再一条一条追着 CI 抖动打补丁

```toml
schema_version = 2
id = "TASK-090"
status = "IN_REVIEW"
risk = "L2"
risk_reason = "只改一份前端测试文件（`ResourceDeleteDialog.test.tsx`）的等待/断言写法，不碰任何产品代码、契约或数据。首次登记写成 L1，但 risk-policy.json 把 `tests` 标记归在 normal（L2）一档，`validate_governance`/`check_task` 均报「risk is lower than declared impact」——机器策略为准、不确定升一级：L2。执行链：1 Worker → 自动检查 → 1 独立只读 Reviewer；独立验收 N/A。"
risk_flags = ["tests", "local-fix"]
owner = "coordinator"
base = "56e1cf405bc1eecc531176b46ae1efecba0ac903"
allowed_paths = [
  "frontend/src/features/resources/ResourceDeleteDialog.test.tsx",
  "docs/tasks/TASK-090-delete-dialog-test-waits.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-22 用户：「**先开这个 L1 任务做，我起床后逐个合并**」→「**继续 做完直接推pr**」。

### 依赖（写在最前面）

**本分支叠在 TASK-089 的分支上**（base = 089 最终提交 `56e1cf4`，PR #97 尚未合并）：要改的文件正是 #97 也改过的，
从 main 切必然冲突。PR 指向 #97 的分支，#97 合并后再转指向 main（GitHub 在源分支被删时会自动转）。
**若 #97 被退回，本任务随之重做。** 这是 AGENTS.md §5「未合并的依赖不得被当作已批准」下的明示例外：
不是把 089 当已批准，而是明确登记「本任务依赖它先合并」。

### 现状

`ResourceDeleteDialog.test.tsx` 在 CI 的 `pull_request` 运行里连续两次抖动、同提交的 `push` 运行都是绿的：

1. PR #96：`offers a per-item delete…`——负向 `waitFor` 之后同步 `getByRole`，落在「旧表已清空、新表未渲染」的
   窗口里（TASK-089 顺手修了它与同写法的另一处）。
2. PR #97：**同一文件另一条** `cannot be closed while a deletion is in flight, including the re-preview window
   after a 409`——耗时 1111ms、其余用例约 100ms；本机 6/6 绿、重跑后绿。

两次都是「测试对时序的假设在慢机器上不成立」，逐条打补丁治标不治本。

### 目标

1. **查明第二条抖动的机理**并写进记录（不是猜）。
2. 通读整份文件，把所有「紧跟异步状态变化的同步取/断言」改成会等的写法（`findBy*` / `waitFor`），
   **断言的内容一条不减、不弱化**：预览先于删除、取消不发 DELETE、DELETE 带令牌、令牌不进 DOM、
   409 重预览再确认、三种令牌错误的受控恢复、模态与焦点、批量删除的部分失败与重试。
3. 本机连跑多次全绿；仍在 CI 上抖的话下次再看，但机理已知。

### 非目标 / 禁止范围

- **不改产品代码**（`ResourceDeleteDialog.tsx` 等），哪怕查出来是组件的时序问题——那要另开任务并评估风险。
- 不改别的测试文件。
- 不为「稳」而删断言或加 `sleep`。

## 完成条件

- 记录里写明第二条抖动的机理，并指出改动如何堵住它。
- `ResourceDeleteDialog.test.tsx` 本机连跑 ≥ 10 次全绿；`frontend` 检查 PASS。
- `check_task.py` 必要检查 PASS。L1：Review/验收 N/A，主 Agent 自检。

## 上下文包

- 文件：`frontend/src/features/resources/ResourceDeleteDialog.test.tsx`（440 行，19 条用例）；
  组件 `ResourceDeleteDialog.tsx`（只读，用于查机理）。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-090-delete-dialog-test-waits.md --worktree`。

## 实现与测试

- 实现 SHA：见候选（本任务只有一次提交，登记、实现与证据同一提交，避免提交引用自身）。
- **命令与结果**：
  - `check_task.py --task docs/tasks/TASK-090-delete-dialog-test-waits.md --worktree` → **见下面「一次假的 PASS」**；
    纠正后的真实结果：`**CHECKS PASS**，`files=3`，`product_fingerprint=921cffff08a4f76add4ab5b5e04bd124b4d37a48e8b0d1a34c68c667f6296cf4`，`profiles=frontend``。
  - `ResourceDeleteDialog.test.tsx` 本机**连跑 12 次，12/12 全绿**（19 条）；`eslint`、`prettier` 过。
  - 不改产品代码，前端全量 825 条不变。

### 一次假的 PASS——本任务首个提交 `a728c1f` 的记录说了假话，在此纠正

首个提交里的记录写着「`check_task.py` → CHECKS PASS，`product_fingerprint=`（空）」。**实际是 FAIL**：
`risk_flags` 里的 `tests` 在 risk-policy.json 属 normal 档，与声明的 L1 矛盾，`check_task` 与
`validate_governance` 都报 `risk is lower than declared impact`。而我的命令链把检查输出捕进变量、
又用 `| head -1` 吞掉了退出码，**检查失败的情况下照样提交并推送了**——正是我自己备忘里记过的
「grep 会吞掉检查失败」那类错。指纹为空就是证据（FAIL 时根本没有指纹）。
处置：不改写已推送的历史（规则禁止强推），用本提交纠正——风险升 L2、补独立 Review、检查重跑且
退出码不再被吞。

### 抖动的机理（查出来的，不是猜的）

那条用例的结尾是：

```
releasePreview!()
expect(await within(box).findByText('内容有变化，请再确认一次。')).toBeInTheDocument()
fireEvent.keyDown(document, { key: 'Escape' })
await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())   // ← 1 秒后超时
```

`ResourceDeleteDialog.tsx` 里 Esc 的处理是 `document` 上的 keydown 监听，**在 `useEffect([deleting, onClose])`
里注册**：`deleting` 从 true 变 false 时，要先卸掉旧监听器、再挂上一个闭包里 `deleting=false` 的新监听器。
这是 **passive effect**，React 把它排在调度器的下一个宏任务里跑。
而 `findByText` 在 DOM 一变（MutationObserver，微任务）就返回；Testing Library 的 `asyncWrapper` 之后
只多等**一个 `setTimeout(0)`**。快机器上调度器的任务先于这个 timer 到，effect 已跑完；慢机器上 timer
先到——测试就在**旧监听器（`deleting=true`）还挂着**的那一瞬按了 Esc，被当成「删除中」忽略，弹窗不关，
最后那个 `waitFor` 1 秒超时。CI 里这条用例耗时 **1111ms**，正是 1000ms 超时 + 零头；同提交的 `push` 运行
（机器不同、负载不同）绿，本机 6/6 绿——和「时序」这个解释完全吻合。

**改法**：把那次 Esc 放进 `waitFor` 里重试——effect 一跑完，下一次按键就生效。前面「锁定时 Esc 无效」
的几条断言**不动**：它们守的是同步行为（旧监听器本来就该忽略），等待只会弱化它们。

**为什么不改组件**：把监听器换成读 ref 的写法确实能消掉这个窗口，但那是产品代码（本任务非目标），
且真实用户不可能在 effect 落地前的几毫秒里按下 Esc——这是测试的时序假设不成立，不是产品缺陷。

### 通读全文件后另收紧的两处

- 「部分失败」：甲的「已删除 1 份」与丙的「未删除」来自先后两次 `setRows`，只在同一批渲染里才同时出现——
  在异步函数里那是调度上的巧合而不是保证。第二条改成 `findByText`。
- 「409 重预览」：「内容有变化」与「3 条心得」同理，第二条改成 `findByText`。

其余用例逐条看过：紧跟 `fireEvent`（离散事件，React 同步 flush）之后的同步取是安全的；`await dialog()` /
`await waitFor(按钮可用)` 之后取同一批渲染出来的元素也安全；「锁定时仍在」「取消后不发请求」这类同步
负向断言不能改成等待。**没有为了稳删掉或弱化任何断言，没有加 `sleep`。**

### 已知限制

- 这只是让测试不再对「effect 何时落地」做假设；若将来 CI 再在这个文件上抖，先看是不是又一处
  「异步状态变化后同步取」，再考虑是否值得把组件的监听器改成读 ref。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：本任务单提交，登记/实现/证据同一提交；提交号见 PR。
- Review：待填（L2，升级后补）
- Acceptance：N/A（L2）
- 最终状态/风险/用户操作：**IN_REVIEW**（L2：升级后补独立只读 Review；此前一度错标 ACCEPTED）。
  风险：零产品代码改动；最坏情况是测试仍抖，那时机理已知。
  用户已说「做完直接推pr」：PR 指向 TASK-089 的分支，**须在 PR #97 之后合并**。
- 非阻断遗留项：组件的 Esc 监听换成读 ref 的写法可以彻底消掉这个时序窗口（产品代码，另议）。
- 日期与决定日志：2026-09-22 PR #97 CI 第二次在同一测试文件抖动 → 用户「先开这个 L1 任务做」→ 登记 TASK-090，
  叠在 TASK-089 分支上。
<!-- EVIDENCE:END -->
