# TASK-097：资料库里直接分配主题与标签——逐条改，也能多选后批量设

```toml
schema_version = 2
id = "TASK-097"
status = "ACCEPTED"
risk = "L2"
risk_reason = "纯前端新功能：资料库页每行加「分类」按钮弹出主题/标签选择，多选后可批量设主题、批量追加标签；走已批准的 updateResource PATCH（topic_id / 整组 tag_ids + expected_version），不改后端与契约。写入用户数据（分类归属）且是新交互，须独立只读 Reviewer 检查最终 diff；独立验收 N/A。执行链：1 Worker → 自动检查 → 1 独立只读 Reviewer。"
risk_flags = ["business"]
owner = "coordinator"
base = "a8d5bbce56e63b47ec96632cca70636037387502"
allowed_paths = [
  "frontend/src/features/resources/LibraryClassifyDialog.tsx",
  "frontend/src/features/resources/LibraryClassifyDialog.test.tsx",
  "frontend/src/features/resources/ResourceLibrary.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/shell/Icon.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/resource-pages.spec.ts",
  "docs/tasks/TASK-097-library-classify.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-29 用户：「现在在资料库中不能为资料分配标签或主题，导致只能点开具体资料才能编辑标签或主题。在资料库页也加上这些功能」
→ 追问范围选定「**逐条 + 批量**」。

### 依赖

叠在 TASK-096 分支上（base = 096 证据写回提交 `a8d5bbc`，PR 未推）——只为任务索引锚点，产品改动互不相关。

### 目标

1. **逐条**：列表与卡片两种视图里每份资料旁加「分类」按钮（图标按钮，可访问名「分类 <标题>」），弹出模态弹窗：
   主题单选（含「不分配」）、标签多选（可当场新建，上限 20），预填当前值；「保存」只发一次 PATCH，只带真改了的字段
   （`topic_id` / `tag_ids`），什么都没改就直接关闭。版本冲突（409）提示重读。
2. **批量**：勾选多份后工具条出现「设置分类」：主题三选一（不改 / 不分配 / 设为某主题）、标签为**追加**（并入每份资料已有标签，
   超过 20 的那份跳过标签并列出）；逐份 PATCH（各用自己的 `expected_version`），进度可见，失败的列出标题与原因，成功的照常生效；
   没有可改动的资料直接跳过。
3. 保存成功后刷新列表（选中态按既有规则随查询键作废）。
4. 弹窗与删除弹窗同一套模态机制（portal、其余子树 inert、Esc、焦点进出）。

### 非目标 / 禁止范围

- 不加批量接口、不改后端与契约；不做拖拽；不改筛选行；不改详情页的标签编辑。
- 不做「批量移除标签」（用户没要；详情页可逐个解除）。

## 完成条件

- 单测（`LibraryClassifyDialog.test.tsx`）：单条预填与只发变更字段、无变更不发请求；批量：主题 + 追加标签合并、一份 409 失败
  列出而其余成功、超 20 跳过；Esc/取消不发请求。
- e2e（`resource-pages.spec.ts`）：真后端逐条设主题加标签 → 行上显示；多选批量设主题 + 追加标签 → 两份都变。
- `check_task.py` PASS；独立只读 Reviewer 结论；用户本机看过。

## 上下文包

- 接口：`updateResource(original, changes, expectedVersion)`（`features/resources/api.ts`，`ResourceChanges.tag_ids` 整组替换）。
- 组件：`ClassificationBrowser`（主题/标签列表）、`TagCreateField`（新建标签）、`ResourceDeleteDialog`（模态机制范本）。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-097-library-classify.md --worktree`；
  `cd frontend && npx playwright test e2e/resource-pages.spec.ts`。

## 实现与测试

- 实现 SHA/变更摘要：实现与登记同一个提交（SHA 在 EVIDENCE 区作候选记录；之后的证据写回是另外的提交）。变更：
  - 新文件 `LibraryClassifyDialog.tsx`（+测试 6 条）：模态弹窗，一份预填/只发变更字段、多份「不改 / 不分配 / 设为」+ 追加标签、
    逐份 `updateResource` PATCH（各自 `expected_version`）、进度与失败列表、超 20 标签跳过并列出；模态机制照抄删除弹窗
    （portal、其余子树 inert、Esc、Tab 首尾相接、焦点归还）；portal 挂点用 state 而非 ref（react-hooks/refs 规则）。
  - `ResourceLibrary.tsx`：列表与卡片视图每行加「分类 <标题>」图标按钮；多选工具条加「设置分类」；弹窗 `onSaved={retry}`。
  - `Icon.tsx` 加 `tags` 图标；`styles.css` 加 `.classify-dialog`（820px 宽、白底、两栏、标题墨色）。
  - e2e `resource-pages.spec.ts` 新增 1 条真后端用例：逐条设主题 + 勾标签 → 行上可见；多选批量设主题 + 追加标签 → 两行都变；
    接口读回三份都对。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：
  - `check_task.py --task docs/tasks/TASK-097-library-classify.md --worktree` → 退出码 0，**CHECKS PASS**，`files=8`，
    `product_fingerprint=e3f22a3c62fff8253384f70a601f774dfdc9442bc451bebf1ac5e9bf3166e5b6`，`profiles=frontend`（lint/format/`tsc -b`/build；vitest 39 文件 **852** 条全过）。
  - `npx playwright test e2e/resource-pages.spec.ts` → **9/9**（含新增；隔离沙盒）。
  - 真机截图（一次性 spec，已移出工作区）：单份弹窗（预填主题与标签）与批量弹窗（默认「不改」、标签为追加）。
- **第二次实现提交（按第一轮 Review F1）**：第 6 条单测原本只断言「没发请求」、撤掉实现也不会红——改成「多份 + 不改主题 +
  无标签 = 没事可做 → 关闭、不发请求、不调 onSaved」的真断言。重跑：该文件 6/6；`check_task.py --worktree` → 退出码 0，
  **CHECKS PASS**，`product_fingerprint=6c33b755d66e115c0b1b2e98c309d8918bb25c6a82067c655ba11dcfafe92060`（vitest 852）。
- 已知限制/未完成项：
  - Tab 环的首元素是第一个 radio：当选中的是别的主题时，Shift-Tab 会先出到浏览器界面再回来（Review F2，可选）。
  - 「保存中禁止关闭」没有单测，代码与删除弹窗同构、e2e 走真路径（Review F3）。
  - 批量是逐份请求，几十份时要等几秒（进度可见）；没有批量接口也不打算为此加。
  - 批量不做「移除标签」；卡片视图的「分类」按钮在窄屏与删除按钮并排，未单独适配。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：`6db4ec1`（= `4910de9` 实现 + 登记，再加按 Review F1 的 `6db4ec1`）。本条证据写回是之后的另一个提交。
- Review：独立只读 Reviewer（`.claude/agents/reviewer.md`，工具仅 Read/Grep/Glob，运行器层无写工具）。
  **第一轮**（`a8d5bbc..4910de9`）报告原文：
  > 权限证据：仅 Read/Grep/Glob（无 Write/Edit/Bash，运行器层面只读）。
  > **结论：PASS**（附 3 项非阻断记录）。
  > **审查范围**：候选 `4910de9`，基线 `a8d5bbc`，`base..candidate` 产品 diff（6 个 frontend 文件）+ 调用链：`updateResource`/`failureText`、`ResourceDeleteDialog.tsx` 模态范本、`ClassificationBrowser`/`TagCreateField`、`useResourceQuery.retry`、契约第 784 行、后端 `taxonomy_store.py:55`（重名 409）。
  > 1. 契约：`changesFor` 只在真变更时放字段，空对象返回 null 不发请求（且 `updateResource` 二道拦截）；`topic_id: null` 只在 `topic_id !== null` 时发；`tag_ids` 永不为 null，单份 ≥20 时禁勾/禁建，多份合并 >20 跳过；重复 id 不可能；单份按集合比较，仅换序不发。符合。
  > 2. 数据安全：每份 `item.version`；409 走 `failureText` 列出，不重试；`onSaved` 仅 `succeeded > 0`；循环每轮先检 `alive`；`running` 由 state 派生，`close()`/Esc/取消/外点四条路都受挡。与删除弹窗 F1 修法一致。
  > 3. 模态：与删除弹窗同一套；分类弹窗开着时其余子树 inert，删除按钮不可达；按钮无文字节点，`aria-label="分类 <标题>"`。
  > 4. 测试：T1–T5 各绑定预填/集合比较/显式 null/合并+逐份版本+失败列出/超 20 跳过，撤实现会红；e2e 末尾按 id 逐份 GET 读回后端状态。`ResourcePages.test.tsx` 未改且无按钮计数断言，不脆弱。
  > 5. 记录：`files=8` 与 diff 一致；`ResourcePages.test.tsx` 列在 allowed_paths 未改动可接受。
  > **Findings（均可记录后继续）**：F1 第 6 条用例只断言 `patches` 长度 0、不检 `onClose`，撤掉任何实现都不会红，是空测试；建议改成断言 `onClose` 被调或删掉。F2 Tab 环 `head` 是第一个 radio，选中别的主题时 Shift-Tab 会先出到浏览器 chrome 再回来，可选建议。F3 无单测覆盖「保存中禁止关闭」；代码与删除弹窗同构，e2e 已走真路径。
  > **剩余风险**：批量逐份请求耗时（记录已写明）；e2e 依赖沙盒里目标标签在列表第一页（当前 spec 只造 1 个标签，成立）。
  主 Agent 处置：F1 改成真断言（`6db4ec1`），F2/F3 记入已知限制，请同一 Reviewer 增量复核。**增量复核**（`4910de9..6db4ec1`）报告原文：
  > 权限证据：仅 Read/Grep/Glob。
  > **结论：PASS，覆盖最终候选 `6db4ec1`**（继承上一轮范围；增量仅改 `LibraryClassifyDialog.test.tsx` 第 6 条，与记录「第二次实现提交」段一致，F2/F3 已入已知限制）。
  > 一条说明（非缺陷）：单独撤掉 `save()` 里 `plan.length === 0 → onClose()` 那段，该用例不会红——空 plan 走到底也会 `onClose()`，可观测结果相同（早返回只是省掉「正在保存 0/0」闪现）。但撤掉 `changesFor` 的「无变更返回 null」或 `plan` 过滤，会发空 PATCH → `INVALID_REQUEST` 列为失败、`onClose` 不调 → 红。测试已真实绑定「没事可做 → 关闭、不发请求、不调 onSaved」，F1 处置成立。
- Acceptance：L2 N/A。
- 最终状态/风险/用户操作：**ACCEPTED**（L2：自动检查 PASS → 独立只读 Review PASS + 增量复核 PASS）。用户 2026-09-29 本机看过后
  「没问题，推pr」。风险：写用户数据的批量循环，逐份版本化、失败可见、不重试；最坏情况是部分成功，列表刷新后能看出哪份没改。
  PR 指向 096 分支，**须在 PR #105 之后合并**。
- 非阻断遗留项：见「已知限制」（Tab 环首元素、保存中禁关无单测、批量逐份耗时、不做批量移除标签）。
- 日期与决定日志：2026-09-29 用户「资料库页也加上分配标签/主题」→ 选定逐条 + 批量 → 登记本任务。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
