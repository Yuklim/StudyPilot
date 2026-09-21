# TASK-081：PDF 阅读器并成一条顶栏，把竖直空间还给正文

```toml
schema_version = 2
id = "TASK-081"
status = "READY"
risk = "L2"
risk_reason = "只改前端的阅读器版式：把已有控件搬进同一条工具条、去掉 PDF 页的大标题块。不动任何公共契约、不动数据含义、不动后端与迁移，也不新增接口调用。不命中 risk-policy.json 的 high_risk_paths。唯一超出「局部修复」的地方是它改的 `ResourceToolbar.tsx` 为所有资料类型共用——因此不定 L1：需要一位独立 Reviewer 确认非 PDF 资料页没被顺带改坏。执行链：1 Worker → 自动检查 → 1 独立只读 Reviewer。"
risk_flags = ["business"]
owner = "coordinator"
base = "9bd2b41398fb01946d6a3e46411c0a0440aa6fcd"
allowed_paths = [
  "frontend/src/features/resources/PdfReader.tsx",
  "frontend/src/features/resources/PdfReader.test.tsx",
  "frontend/src/features/resources/ResourceToolbar.tsx",
  "frontend/src/features/resources/ResourceToolbar.test.tsx",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/pdf-reader.spec.ts",
  "docs/tasks/TASK-081-pdf-reader-toolbar.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-21 用户：「现在的 pdf 阅读器和草图中的不一样，按照草图中的来。」

主 Agent 摆出差异并问「草图没画的学习状态与 `⋯` 怎么处理」，用户定案：
「**都放在顶部工具条吧，主要是 pdf 阅读器要留出足够的空间，现在的页面阅读空间有点小，上面的工具栏太大了。**」

因此本任务的**目的是腾出竖直空间**，草图是实现该目的的形状依据；两者冲突时以「腾空间」为准并记录。

### 登记前已核实的事实

- **草图**（Pencil `阅读器｜PDF（TASK-073 草图）`，用户 2026-09-20 确认过）的工具条自左向右是：
  `← 返回资料库` ｜ `Attention Is All You Need.pdf` ｜ 来源标签`本地文件` ｜ ——弹簧—— ｜
  `第 3 / 18 页` ｜ `− 100% ＋` ｜ `适合宽度` ｜ `下载原件` ｜ `心得`。**一条**，高 51px。
- **TASK-073 的完成条件第 1 条本就是这么写的**（该记录第 46 行）：「顶栏 返回/文件名/「本地文件」标签
  ‖ 页码（可输入跳页）、缩放、「适合宽度」、「下载原件」、「心得」」。**即本任务不是新需求，
  是 073 没做到它自己登记并经用户确认的那一条**，且三轮审查未发现。这一点如实记在这里，
  不含糊成「优化」。
- **实机实测**（真实 Edge，1440×720，2026-09-21，资料 `18b37e2b-…`）：
  工具条 57px（0–57）、标题块约 64px（标签 79–102、H1 108–143）、PDF 控件条 44px（157–201），
  PDF 滚动区从 **213px** 开始、可视高仅 **500px**——**720px 的视口里 29.6% 被顶部吃掉**。
- 现工具条右侧是四个控件：`未开始·0%`（学习状态）、心得（图标）、原件（图标）、`⋯ 更多操作`
  （元数据/标签/编辑资料/删除都在里面）。草图没画前两类之外的东西。
- `frontend/e2e/pdf-reader.spec.ts` 以 `.reader-toolbar` 内可访问名 `心得` 取按钮，
  并断言 `getByLabel('页码')` 与 `/ 2 页`——这些名称本任务保持不变。

### 目标

1. **PDF 资料页只有一条工具条**：`返回` + 文件名 + 来源标签`本地文件` ‖ 学习状态、页码、缩放、
   `适合宽度`、`下载原件`、`心得`、`⋯`。去掉 PDF 页的大标题块（`文件` 标签 + H1）。
2. **阅读区显著变高**：同一视口下 PDF 滚动区的起点从 213px 降到**一条工具条的高度**，
   可视高从 500px 提到 **≥ 640px**（实测复核，写回具体数字）。
3. **草图没画但已存在的控件一律保留**（用户「都放在顶部工具条吧」）：学习状态与 `⋯`。
   不因为草图没画就删掉功能入口。
4. **非 PDF 资料页一字不变**：WEB/PASTE/非 PDF 的 FILE 资料仍是「工具条 + 大标题块」的现状。
   这是本任务最容易误伤的地方，须有用例钉住。
5. 放不下时**换行而不是挤扁或溢出**（窄屏、长文件名）。

### 非目标 / 禁止范围

- **不改非 PDF 资料页的版式**，不动 TASK-066/067 定下的大标题块与图标按钮口径。
- 不改 PDF 的渲染、连续滚动、位置记忆、失败分因（TASK-073 的那部分行为原样保留）。
- 不做 PDF 高亮、不做边注、不动契约与后端。
- **不写 `docs/tasks/任务索引.md`**：TASK-080 仍未合并且持有索引，按 AGENTS.md §3
  「并行任务中只有一个可以把索引列进 allowed_paths」。本任务的索引行并入下一个已授权任务的
  控制面提交（用户既定指令：登记类小活不单独开 PR）。

### 主 Agent 登记的实现决定（非用户决定，Review 可挑战）

- **文件名显示原件名（含 `.pdf`）还是资料标题**：草图画的是 `Attention Is All You Need.pdf`。
  实机资料标题是 `Attention Is All You Need`，原件名才带扩展名。**取资料标题**并在其后不补扩展名——
  标题是用户能改的那个、也是资料库里显示的那个；来源标签已经说明了「本地文件」，再缀一个
  `.pdf` 是冗余信息。此处与草图有出入，明示登记。
- **`下载原件`/`心得` 在 PDF 页显示为文字按钮**（草图如此），非 PDF 页保持图标按钮不变。
- 页码/缩放/`适合宽度` 的**可访问名与交互一字不改**，只换位置——避免 e2e 与单测跟着漂。

## 完成条件

- PDF 资料页只有一条工具条，草图九项 + 学习状态 + `⋯` 都在其中；大标题块不再出现。有用例。
- 实测同一视口下 PDF 可视高 ≥ 640px（对比改前 500px），数字写回记录。
- 非 PDF 资料页（WEB 一例、非 PDF 的 FILE 一例）版式与改前完全一致。有用例。
- 页码输入跳页、缩放、`适合宽度`、位置记忆、失败分因的行为不变。既有用例保持绿。
- 窄屏下工具条换行、不溢出、不挤压 PDF 视图。
- `check_task.py` 必要检查 PASS（frontend）。
- L2：1 位独立只读 Reviewer 审最终 diff。

## 上下文包

- 草图：Pencil `阅读器｜PDF（TASK-073 草图）`、`PDF｜三个状态（TASK-073 草图）`。
- 既有实现：`PdfReader.tsx`（自带 `.pdf-reader-tools` 控件条）、`ResourceToolbar.tsx`（共用工具条）、
  `ResourceDetail.tsx`（装配顺序与 `--reader-toolbar-h` 的测量）、`styles.css`。
- TASK-073 记录第 46 行（本任务要补上的那一条完成条件）。
- 检查：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-081-pdf-reader-toolbar.md --worktree`。

## 实现与测试

- 实现 SHA：待填。
- 命令与结果：待填。
- 已知限制/未完成项：待填。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-21 用户指出 PDF 阅读器与草图不符、要求按草图来 → 主 Agent 摆出三处差异
  并就「草图没画的学习状态与 `⋯`」提问 → 用户定案「都放在顶部工具条，主要是要给 PDF 留出阅读空间」
  → 实测量出顶部吃掉 213px / 视口 29.6% → 登记 TASK-081。
<!-- EVIDENCE:END -->
