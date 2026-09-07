# TASK-043：阅读器改版第一步 —— 正文占主体与两层顶部工具条

```toml
schema_version = 2
id = "TASK-043"
status = "READY"
risk = "L3"
risk_reason = "本任务改的是「打开一份资料之后看到什么」这个应用主界面的信息架构，影响面不是一个组件而是四个 feature 目录（resources / notes / learning / taxonomy）在同一页上的摆位与入口方式。三处实质风险：① 这一页承载全仓**唯一**的 `dangerouslySetInnerHTML`（TASK-042 的正文渲染），重排布局必然改动它周围的容器、样式与滚动关系，任何一处把它挪进新的 innerHTML 上下文都可能悄悄改变安全形态；② 「删除资料」的入口从常驻区搬进 `⋯` 菜单——销毁性动作的可发现性与误触面发生变化，而它的三步确认流程（预览影响 → 一次性令牌 → 确认）必须一字不改；③ 学习状态徽章进工具条意味着一个**版本化写请求**从折叠区搬到常驻区，误触后果是写库。另有跨模块面：同时改 resources、notes、learning、taxonomy 四处的调用与断言。不改后端一行、不改 `/api/v1` 与 openapi、不改本机访问门禁、不改 `extension/`、不改任何数据含义。"
risk_flags = ["architecture", "security", "business"]
owner = "coordinator"
base = "1e3584353014f4a0bc3f25faa04d6eacb1f226d5"
allowed_paths = [
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ResourceToolbar.tsx",
  "frontend/src/features/resources/ResourceToolbar.test.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/features/resources/ResourceEditor.tsx",
  "frontend/src/features/resources/ResourceDeletion.tsx",
  "frontend/src/features/resources/FileOriginal.tsx",
  "frontend/src/features/learning/LearningPanel.tsx",
  "frontend/src/features/learning/LearningPages.test.tsx",
  "frontend/src/features/taxonomy/ResourceTagEditor.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/**",
  "docs/tasks/TASK-042-snapshot-rendering.md",
  "docs/tasks/TASK-043-reader-toolbar.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

### 用户授权

2026-09-07 用户合并 PR #47（TASK-042，merge `1e35843`）后指示「开启阅读器改版任务」。改版方向由用户在此前的设计讨论中逐条作答：

1. **正文优先**：「从资料库点开资料之后应该直接显示的是阅读器窗口」。
2. **写心得走挤压式侧栏**（用户在三个选项中选「挤压式侧栏」）——**属 TASK-044，不在本任务**。
3. **选中正文某段就地记心得** → 用户答「这个应该属于后续的批注功能吧」，**明确不在本任务**。
4. **元数据、标签、编辑资料、原件收进顶部工具条的按钮里**，用户补充「这个还没讨论完」，随后在本次登记前定下三条：**工具条分两层**（操作层 + 常驻的上下文层）、**侧栏心得专用**（不做多页签抽屉，属 TASK-044）、**学习状态常驻工具条、点开即改**。
5. **「删除资料」放 `⋯` 菜单底部、与其他项分隔开**（用户 2026-09-07 选定）。
6. **窄屏侧栏退化成盖在正文上的浮层**（用户 2026-09-07 选定）——**属 TASK-044**，本任务只需保证工具条本身在窄屏可用。
7. **改版拆两步**（用户 2026-09-07 选定）：本任务做布局骨架与工具条，心得侧栏留给 TASK-044。

### 目标

1. 打开一份资料后，**正文是页面主体**，不再是「心得 + 编辑框 → 元数据 → 正文 → 保存原因 → 原件 → 删除 → 学习状态」这条长滚动。
2. **两层顶部工具条**：
   - 操作层（常驻）：返回资料库、标题、学习状态徽章（点开即改）、心得入口（带数量）、打开原文/原件、`⋯` 更多。
   - 上下文层（常驻）：标签 chips 与保存原因摘要。**这两项不进按钮**——「我当初为什么收下这一页」是阅读时要看见的上下文，不是低频动作。
3. **低频动作收进 `⋯`**：编辑资料、替换/删除正文、看 Markdown 源码、下载原件；**删除资料单独一区、置于菜单底部、视觉上标为危险**。
4. 心得在本任务里**维持现有形态**（正文下方的 `NotesPanel`），只是位置从正文上方移到下方；侧栏留给 TASK-044。

### 非目标（明示不做）

- **不做挤压式侧栏、不做窄屏浮层**（TASK-044）。
- **不做批注 / 选中正文记心得 / 目录 / 阅读进度 / 复习安排**。
- **不改后端一行**、不改 `/api/v1` 与 `docs/contracts/openapi-v1.json`、不改本机访问门禁、**不改 `extension/`**。
- **不改任何写操作的语义**：删除资料的三步确认、学习状态的版本化写、心得与标签的写入路径**一字不改**，只改它们的入口位置。
- 不改快照渲染的安全形态：`html: false`、无消毒器、图片三条去向、`dangerouslySetInnerHTML` 的位置与依据**不动**。
- 不新增任何依赖。

### 禁止范围

所有未列入 `allowed_paths` 的路径；额外禁止：`backend/**`、`extension/**`、`docs/contracts/**`、`frontend/src/api/**`、`frontend/src/features/resources/api.ts`、`frontend/src/features/notes/**`、`frontend/src/features/resources/ContentSnapshot.tsx`、`frontend/src/features/resources/snapshotMarkdown.ts`、`scripts/governance/**`、`AGENTS.md`、`docs/governance/**`。

**`ContentSnapshot.tsx` 与 `snapshotMarkdown.ts` 被明确排除**：本任务只改它们外面的容器与样式，不进这两个文件一个字符 —— 这是让「安全形态未变」成为结构性论据而不是自述的唯一办法。

### 依赖/前置条件

基线 `1e3584353014f4a0bc3f25faa04d6eacb1f226d5`（main，TASK-042 已合并）。无未合并依赖。

### 并行

否。唯一写入者 `coordinator`。

### 顺带完成的状态登记

`docs/tasks/TASK-042-snapshot-rendering.md` 在 `allowed_paths` 内，用于登记用户 2026-09-07 合并 PR #47（merge commit `1e35843`）这一事实，依据根 `AGENTS.md` §5。**预期改动两行**：TOML 的 `status` 由 `ACCEPTED` 改为 `MERGED`；以及该记录 EVIDENCE 标记区内「最终状态/风险/用户操作」那一行补上 merge commit 并保留「交付时为 ACCEPTED」。除这两行外不改该记录一个字 —— 实际改了几行以最终 diff 为准，不以本句为准。

## 关键设计决定

### ① 工具条分两层，标签与保存原因常驻而不进按钮

用户原话是「元数据、标签、编辑资料、原件这些收到顶部工具条的按钮里」。**执行时作了一处区分并已向用户说明、用户认可**：标签与保存原因不是「操作」而是阅读时的上下文，塞进按钮意味着每次想起「我为什么收下这篇」都要点一下，而这恰是本产品的核心信息之一。因此第二层常驻显示它们，`⋯` 只收低频**动作**。

代价如实登记：正文起始位置因此下移约 40px，窄屏更明显。

### ② 删除资料进 `⋯` 但单独一区

用户在三个选项中选「`⋯` 菜单底部，与其他项分隔开」。**三步确认流程（预览影响 → 一次性令牌 → 确认）一字不改**，本任务只搬入口。风险如实记下：销毁性动作从常驻区进入折叠菜单，可发现性下降（想删时要多点一下），而误触面取决于菜单项间距——因此完成条件要求它与上方动作之间有分隔且带危险样式，并有用例断言它不与普通动作相邻。

### ③ 学习状态常驻工具条

用户选「常驻工具条，点开即改」，理由是读完顺手就改，藏起来的状态没人会改。**这意味着一个版本化写请求从折叠区搬到了常驻区**：误触的后果是写库，不是显示错乱。因此完成条件要求改状态仍需一次明确选择（不是 hover 或单击即改），且冲突处理沿用 `LearningPanel` 现有逻辑。

### ④ 心得本任务不动形态

拆两步是用户的决定。本任务把 `NotesPanel` 从正文上方移到正文下方，**不改它内部一个字**（`features/notes/**` 在禁止范围内）。这样 TASK-044 做侧栏时，改的是容器而不是同时改容器与内容。

## 完成条件

1. **正文是主体**：打开资料详情页后，正文快照区出现在第一屏，且在 DOM 顺序上先于心得与元数据区。须有用例断言渲染后的正文标题在心得区之前出现。
2. **两层工具条存在且都常驻**：操作层含返回、标题、学习状态、心得入口、原文/原件入口、`⋯`；上下文层含标签与保存原因。须有用例逐项断言其可见（不是「存在于 DOM 但被隐藏」）。
3. **`⋯` 菜单**：含编辑资料、替换/删除正文、看 Markdown 源码、下载原件（按 `source_type` 显示相应项）；键盘可打开可关闭，`Esc` 关闭，焦点回到触发按钮。须有用例。
4. **删除资料在菜单底部、与其余项分隔、带危险样式**：须有用例断言它与上一个普通动作之间存在分隔元素，且它不是菜单里第一项。
5. **删除的三步流程一字未改**：`ResourceDeletion` 的预览 → 令牌 → 确认路径与其既有断言**全部保留且未弱化**；只允许改它的挂载位置与外层样式。须在记录中给出该文件的 diff 说明。
6. **学习状态改动仍需明确选择**：不得因为搬到工具条就变成 hover/单击直接写。须有用例断言「点开徽章 → 选一个状态 → 提交」这三步仍在，且冲突时的既有处理未变。
7. **标签与保存原因在阅读时可见**，不需要任何点击。须有用例。
8. **`ContentSnapshot.tsx` 与 `snapshotMarkdown.ts` 零改动**：`base..candidate` 的文件清单里不得出现这两个文件。**这是「快照的安全形态未变」的结构性论据**，须在记录中以文件清单为证。
9. **既有断言只增不减**：三组测试计数只增不减，`extension` 组与基线**完全一致**（本任务不碰它）；因布局变化而必须更新的既有断言，逐条说明改了什么、为什么，并证明新断言不弱于旧断言。
10. **e2e 覆盖新布局**：现有 `e2e/resource-pages.spec.ts`、`file-pages.spec.ts`、`taxonomy-pages.spec.ts`、`scaffold.spec.ts` 中依赖旧布局的断言全部更新为新布局，且至少新增一条走真实后端的 e2e：打开一份带正文与标签的资料 → 断言正文在第一屏、标签与保存原因可见、`⋯` 里能进到编辑资料。
11. **无障碍不退化**：工具条按钮有可读名称，菜单有正确的 `role`/`aria-expanded`，学习状态徽章可由键盘操作。须有用例断言按可访问名称取到这些控件（而不是靠 class 选择器）。
12. **不新增依赖**：`package.json` 与锁文件不变。须以文件清单为证。
13. **窄屏不崩**：320px 宽度下工具条不横向溢出、按钮不重叠、正文可读。须有用例或 e2e 断言。**侧栏的窄屏形态不在本任务**。
14. **无快照、无标签、无保存原因、PASTE/FILE 三种来源类型**各自表现正常且不崩。

## 上下文包

- 规则：`AGENTS.md`、`frontend/AGENTS.md`、`docs/governance/风险分级与检查规则.md`。
- 必读源文件：`frontend/src/features/resources/ResourceDetail.tsx`（当前的长滚动结构，143 行）、`ResourceDeletion.tsx`（166 行，三步确认）、`ResourceEditor.tsx`（449 行）、`features/learning/LearningPanel.tsx`（336 行）、`features/taxonomy/ResourceTagEditor.tsx`（96 行）、`features/resources/FileOriginal.tsx`（91 行）、`src/styles.css`（2154 行）。
- **只读不改**：`ContentSnapshot.tsx`、`snapshotMarkdown.ts`（了解它们对外的挂载形态即可）。
- 契约：无需改动。§4.13/§4.14 只作为「不得改变快照与资产语义」的边界参考。
- 依据文档：`docs/research/阅读器与标注能力调研.md`（TASK-041 入库）。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-043-reader-toolbar.md --worktree`（预期只选中 `frontend`）。

## 已知取舍（登记时即知）

1. **正文起始位置下移约 40px**（两层工具条的代价），窄屏更明显。用户在两层与一层之间选了两层。
2. **删除资料的可发现性下降**：从常驻区进入折叠菜单，想删一份资料要多点一下。用户明确选择了这个位置。
3. **心得在本任务里仍是正文下方的长滚动**，不是最终形态；用户已知这是两步中的第一步。
4. **窄屏只保证「不崩、可读」，不保证好用**：侧栏的窄屏浮层属 TASK-044。
5. **本任务不动 `ContentSnapshot`/`snapshotMarkdown`**，因此 TASK-042 登记的全部已知限制原样继承，本任务既不加剧也不缓解。

## 实现与测试

- 实现 SHA/变更摘要：待填
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：待填
- 已知限制/未完成项：待填

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：L3，两位独立只读 Reviewer，待填
- Acceptance：L3，独立只读，待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项（仅有真实问题时）：待填
- 日期与决定日志：2026-09-07 用户合并 PR #47 后指示「开启阅读器改版任务」。此前的设计讨论中，用户已就阅读器形态逐条作答：正文优先、写心得走挤压式侧栏、选中正文记心得属后续批注能力、元数据类收进顶部工具条（并注明「这个还没讨论完」）。本次登记前主 Agent 给出具体工具条方案并提出三个问题，用户答：工具条**分两层**（操作层 + 常驻上下文层）、侧栏**心得专用**不做多页签抽屉、学习状态**常驻工具条点开即改**。登记时主 Agent 又提出三个会实质改变工作量或安全形态的问题，用户答：改版**拆两步**（本任务做布局骨架，侧栏留给 TASK-044）、窄屏侧栏**退化成盖在正文上的浮层**（属 TASK-044）、删除资料放 **`⋯` 菜单底部并与其他项分隔开**。主 Agent 据此把风险定为 L3，理由是本页承载全仓唯一的 `dangerouslySetInnerHTML`、销毁性动作入口迁移、以及一个版本化写请求从折叠区进入常驻区。
<!-- EVIDENCE:END -->
