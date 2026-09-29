# TASK-097：资料库里直接分配主题与标签——逐条改，也能多选后批量设

```toml
schema_version = 2
id = "TASK-097"
status = "IN_PROGRESS"
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
- 已知限制/未完成项：
  - 批量是逐份请求，几十份时要等几秒（进度可见）；没有批量接口也不打算为此加。
  - 批量不做「移除标签」；卡片视图的「分类」按钮在窄屏与删除按钮并排，未单独适配。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：
- Review：（L2，待独立只读 Reviewer）
- Acceptance：L2 N/A。
- 最终状态/风险/用户操作：
- 非阻断遗留项：
- 日期与决定日志：2026-09-29 用户「资料库页也加上分配标签/主题」→ 选定逐条 + 批量 → 登记本任务。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
