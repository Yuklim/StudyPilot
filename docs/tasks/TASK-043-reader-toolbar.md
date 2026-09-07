# TASK-043：阅读器改版第一步 —— 正文占主体与两层顶部工具条

```toml
schema_version = 2
id = "TASK-043"
status = "IN_ACCEPTANCE"
risk = "L3"
risk_reason = "本任务改的是「打开一份资料之后看到什么」这个应用主界面的信息架构，影响面不是一个组件而是四个 feature 目录（resources / notes / learning / taxonomy）在同一页上的摆位与入口方式。三处实质风险：① 这一页承载全仓**唯一**的 `dangerouslySetInnerHTML`（TASK-042 的正文渲染），重排布局必然改动它周围的容器、样式与滚动关系，任何一处把它挪进新的 innerHTML 上下文都可能悄悄改变安全形态；② 「删除资料」的入口从常驻区搬进 `⋯` 菜单——销毁性动作的可发现性与误触面发生变化，而它的三步确认流程（预览影响 → 一次性令牌 → 确认）必须一字不改；③ 学习状态徽章进工具条意味着一个**版本化写请求**从折叠区搬到常驻区，误触后果是写库。另有跨模块面：同时改 resources、notes、learning、taxonomy 四处的调用与断言。不改后端一行、不改 `/api/v1` 与 openapi、不改本机访问门禁、不改 `extension/`、不改任何数据含义。"
risk_flags = ["architecture", "security", "business"]
owner = "coordinator"
base = "1e3584353014f4a0bc3f25faa04d6eacb1f226d5"
allowed_paths = [
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ContentSnapshot.tsx",
  "frontend/src/features/resources/ResourceToolbar.tsx",
  "frontend/src/features/resources/ResourceToolbar.test.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/features/resources/ResourceDeletion.test.tsx",
  "frontend/src/features/resources/ResourceEditor.test.tsx",
  "frontend/src/features/resources/FilePages.test.tsx",
  "frontend/src/features/taxonomy/ClassificationPages.test.tsx",
  "frontend/src/App.test.tsx",
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

**`snapshotMarkdown.ts` 被明确排除**：渲染管线、`html: false`、`validateLink`、图片三条去向全部在那个文件里，本任务不进它一个字符 —— 这是让「快照的安全形态未变」成为结构性论据而不是自述的办法。

**`ContentSnapshot.tsx` 原本也在排除之列，实现中改判**（见下方「授权范围的两次修订」第 2 条）：它的三条提示文案写着「见**下方**的原网页/粘贴原文/原件」，而本任务把那些入口搬到了**上方**工具条，文案当场变假。二者不可兼得时，宁可放弃对这一个文件的零改动，也不发一句指错方向的文案 —— TASK-036 栽的就是「只断言句子在屏幕上，不断言它为真」这一跤。该文件的改动**限于方位文案与其配套断言**，渲染、图片、blob 回收、`dangerouslySetInnerHTML` 一行不动。

### 授权范围的两次修订（实现开始后，2026-09-07）

**第 1 条：登记时把测试文件的 `allowed_paths` 划窄了。** 我只登记了 `ResourcePages.test.tsx` 与 `LearningPages.test.tsx` 两个测试文件，实际上旧布局被**七个**测试文件断言着：改完布局后 `App.test.tsx`（1 条）、`ResourceDeletion.test.tsx`（9 条）、`ResourceEditor.test.tsx`（1 条）、`FilePages.test.tsx`（2 条）、`ClassificationPages.test.tsx`（3 条）同时变红——它们都通过详情页进入各自的被测组件，而那些组件的入口位置正是本任务要改的东西。

因此把这五个文件加入 `allowed_paths`。**这不新增任何产品范围**：加进来的全是断言旧布局的测试文件，没有一个是新的实现文件。修订如实记在这里而不是悄悄改 TOML，并已当面告知用户。

**第 2 条：`ContentSnapshot.tsx` 由「明确排除」改为「限定改动」。** 登记时我把它和 `snapshotMarkdown.ts` 一起排除，想让「快照安全形态未变」成为文件清单可证的结构性论据。实现中发现两条约束不可兼得：该文件的三条提示文案说「见**下方**的原网页 / 粘贴原文 / 原件」，而本任务把这些入口搬到了**上方**工具条。`ResourcePages.test.tsx` 里的 `assertBelow` 守卫（写它的原因正是 TASK-036 的「只断言句子在屏幕上，不断言它为真」）因此变红——**守卫起作用了**。

取舍：宁可放弃对这一个文件的零改动，也不发一句指错方向的文案。**改动限定为三条 ready 文案 + 两条 empty 文案的方位词，以及测试里配套的方位守卫**；渲染、图片映射、blob 回收、`dangerouslySetInnerHTML` 一行不动，diff 可逐行核对。`snapshotMarkdown.ts` 仍然零改动，完成条件 8 相应改为对该文件成立。

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
2. **两层工具条存在且都常驻**：操作层含返回、标题、学习状态、心得入口、原文/原件入口、`⋯`；上下文层含标签与保存原因。须有用例逐项断言其可见（不是「存在于 DOM 但被隐藏」）。**登记时写的「心得入口（带数量）」实现中去掉了数量**：取数量要么改 `features/notes/**`（在禁止范围内），要么在本任务里重复请求一次心得列表并与 `NotesPanel` 各自维护一份可能漂移的计数。数量推迟到 TASK-044——侧栏本来就拥有心得数据，那时是顺带可得。
3. **`⋯` 菜单**：含编辑资料、编辑标签、资料信息；键盘可打开可关闭，`Esc` 关闭，焦点回到触发按钮。须有用例。**登记时这一条写的是「含替换/删除正文、看 Markdown 源码、下载原件」，实现中更正**：前两者是 `ContentSnapshot` 内部的控件，把它们提到菜单里需要重写那个组件的状态；它们本就是正文的上下文，留在正文区更合理。下载原件改为工具条上的独立按钮（`原件`／`粘贴原文`／`原网页`），比埋进菜单更顺手。
4. **删除资料在菜单底部、与其余项分隔、带危险样式**：须有用例断言它与上一个普通动作之间存在分隔元素，且它不是菜单里第一项。
5. **删除的三步流程一字未改**：`ResourceDeletion` 的预览 → 令牌 → 确认路径与其既有断言**全部保留且未弱化**；只允许改它的挂载位置与外层样式。须在记录中给出该文件的 diff 说明。
6. **学习状态改动仍需明确选择**：不得因为搬到工具条就变成 hover/单击直接写。须有用例断言「点开徽章 → 选一个状态 → 提交」这三步仍在，且冲突时的既有处理未变。
7. **标签与保存原因在阅读时可见**，不需要任何点击。须有用例。
8. **`snapshotMarkdown.ts` 零改动**：`base..candidate` 的文件清单里不得出现该文件。**这是「快照的安全形态未变」的结构性论据**，须在记录中以文件清单为证。`ContentSnapshot.tsx` 的改动**限于方位文案**（见「授权范围的两次修订」第 2 条），须在记录中给出该文件的完整 diff 说明，并证明渲染、图片、blob 回收与 `dangerouslySetInnerHTML` 未被触碰。
9. **既有断言只增不减**：三组测试计数只增不减，`extension` 组与基线**完全一致**（本任务不碰它）；因布局变化而必须更新的既有断言，逐条说明改了什么、为什么，并证明新断言不弱于旧断言。
10. **e2e 覆盖新布局**：现有 `e2e/resource-pages.spec.ts`、`file-pages.spec.ts`、`taxonomy-pages.spec.ts`、`scaffold.spec.ts` 中依赖旧布局的断言全部更新为新布局，且至少新增一条走真实后端的 e2e：打开一份带正文与标签的资料 → 断言正文在第一屏、标签与保存原因可见、`⋯` 里能进到编辑资料。
11. **无障碍不退化**：工具条按钮有可读名称，菜单有正确的 `role`/`aria-expanded`，学习状态徽章可由键盘操作。须有用例断言按可访问名称取到这些控件（而不是靠 class 选择器）。
12. **不新增依赖**：`package.json` 与锁文件不变。须以文件清单为证。
13. **窄屏不崩**：320px 宽度下工具条不横向溢出、按钮不重叠、正文可读。须有用例或 e2e 断言。**侧栏的窄屏形态不在本任务**。
14. **无快照、无标签、无保存原因、PASTE/FILE 三种来源类型**各自表现正常且不崩。

## 上下文包

- 规则：`AGENTS.md`、`frontend/AGENTS.md`、`docs/governance/风险分级与检查规则.md`。
- 必读源文件：`frontend/src/features/resources/ResourceDetail.tsx`（当前的长滚动结构，143 行）、`ResourceDeletion.tsx`（166 行，三步确认）、`ResourceEditor.tsx`（449 行）、`features/learning/LearningPanel.tsx`（336 行）、`features/taxonomy/ResourceTagEditor.tsx`（96 行）、`features/resources/FileOriginal.tsx`（91 行）、`src/styles.css`（2154 行）。
- **只读不改**：`snapshotMarkdown.ts`。`ContentSnapshot.tsx` 登记时也在此列，实现中改判为「限定改动」（只改五条方位文案，见「授权范围的两次修订」第 2 条）。
- 契约：无需改动。§4.13/§4.14 只作为「不得改变快照与资产语义」的边界参考。
- 依据文档：`docs/research/阅读器与标注能力调研.md`（TASK-041 入库）。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-043-reader-toolbar.md --worktree`（预期只选中 `frontend`）。

## 已知取舍（登记时即知）

1. **正文起始位置下移约 40px**（两层工具条的代价），窄屏更明显。用户在两层与一层之间选了两层。
2. **删除资料的可发现性下降**：从常驻区进入折叠菜单，想删一份资料要多点一下。用户明确选择了这个位置。
3. **心得在本任务里仍是正文下方的长滚动**，不是最终形态；用户已知这是两步中的第一步。
4. **窄屏只保证「不崩、可读」，不保证好用**：侧栏的窄屏浮层属 TASK-044。
5. **`snapshotMarkdown.ts` 零改动、`ContentSnapshot.tsx` 只改五条方位文案**，因此 TASK-042 登记的全部已知限制原样继承，本任务既不加剧也不缓解。

## 实现与测试

- **变更摘要**：
  - **新组件 `ResourceToolbar.tsx`**：两层工具条。上层 = 返回 / 来源徽章 / 标题 / 学习状态徽章 / 心得锚点 / 原文·原件入口 / `⋯`；下层 = 常驻的标签导航与保存原因。面板一次只开一个（两个同时展开会把正文推出第一屏）。`⋯` 菜单：`Esc` 关闭并把焦点还给触发按钮，指针点到外面也关。删除资料在菜单底部、`<hr role="separator">` 之后、单独一区。
  - **`ResourceDetail.tsx` 重写**：返回链接 → 工具条 → **正文** → 心得。此前是「心得 + 编辑框 → 元数据 → 正文 → 保存原因 → 原件 → 删除 → 学习状态」。
  - **`LearningPanel` 新增 `initialView` 属性**（默认 `collapsed`）：工具条的状态徽章用 `manage` 直接展开状态表单，否则要再点两层。**只改初始展开状态**，表单本身的每一步（选状态 → 保存学习记录、归档确认、冲突确认）一字未动。
  - **常驻标签行是 `<nav aria-label="资料标签">`**（`ResourceToolbar.tsx` 里的新代码）。旧的标签行在被重写的 `ResourceDetail.tsx` 里，是裸 `div`，在辅助技术里没有角色可依附。**`ResourceTagEditor.tsx` 本身未改**——此处初稿把这处改动记到了那个文件头上，被 R2 指出，已更正。
  - **`ContentSnapshot.tsx` 的五条方位文案**由「下方」改为「上方工具条」（见「授权范围的两次修订」第 2 条）。该文件其余部分未动。
  - **样式**：`.reader-*` 一组，全部 flex-wrap，640px 以下菜单退化为块级、按钮独占一行。两处箭头是 `aria-hidden` 的真实元素，不进可访问名称（**不能用伪元素**，理由见下）。
- **两处改版引入的退化，均由既有用例先抓到、已修**：
  1. **加载期间没有返回入口**。旧版返回链接无条件渲染；初稿把它并进工具条，而工具条只在资料读到之后才有，于是「正在打开这份资料…」那一屏一个链接都没有。`App.test.tsx` 的返回路径用例先红。
  2. **刷新会把用户正开着的面板掀掉**。`retry()` 先清空 result 再重读，那一瞬间工具条整个卸载。而**改标签本身就会触发这次刷新**，于是「改一个标签，面板就没了」。现在留住上一次读到的资料，只在换资料时丢弃。`ClassificationPages.test.tsx` 的标签用例先红。
    - 顺带发现：旧用例里「改完标签后标签管理折叠回按钮」断言的其实是**这次卸载重挂的副作用**，不是有意行为。已改为断言「常驻标签行跟着变了」（真的写进去了）+「面板仍然开着」。
- **第三处行为变化，如实记下（不是退化，但用户会察觉）**：**进度条不再常驻**。`<progress>` 在 `LearningPanel` 里，而那个面板现在收在工具条的状态徽章后面；常驻的是徽章上的文字（`在读 · 35%`）。信息没丢，形式变了——`learning-pages.spec.ts` 因此改为「刷新后先断言徽章（不点任何东西就看得到的那份状态），展开面板后再断言进度条」。
- **Review 后的处置（形成新候选）**：
  - **R1 F1（阻断，真缺陷）**：从工具条改完学习状态并保存成功后，**同一屏上方的常驻徽章仍显示旧状态**——徽章读父级手里的 `resource`，而 `LearningPanel` 只更新自己的 `snapshot`。改版把 `<progress>` 收进面板、让徽章成为唯一常驻的状态显示，这个缺口因此直接落在主路径上；次生风险是用户以为没存上再提交一次，写出第二条学习记录。已给 `LearningPanel` 加一个 `changed?` 回调，工具条传 `refreshed`。**我那条 e2e 在保存与徽章断言之间插了 `page.reload()`，所以这条退化结构上不可能被现有用例抓到**——新增一条不刷新即断言徽章的用例。
  - **R1 F2 + F3 + R2 #3 + #4，一处改动同时解掉**：删除资料原本是塞在 `role="menu"` 里的普通按钮（辅助技术按菜单模型只看得到三项，唯独看不到那个销毁性动作），而且确认对话框嵌在浮层里——点一下菜单外面就会把已取到的一次性令牌连同**在途的删除请求**一起卸载（后端已删、界面停在原地不跳转）。现在它是第四个真正的 `menuitem`，只负责**打开一个面板**；删除流程渲染在菜单之外。另加：打开菜单时把焦点送到第一个菜单项。
  - **R2 #1（必须）**：`任务索引.md` 那一行仍写着「不进 `ContentSnapshot.tsx` 与 `snapshotMarkdown.ts` 一个字符」——授权修订 2 之后这句对前者已为假，且状态列仍是 `READY`。两处都已更正。索引是跨任务的权威状态，留一句被自己推翻的范围声明，正是本任务反复引以为戒的形态。
  - **R2 #2（必须）**：`LearningPanel.tsx` 的「新的理解或疑问直接写在**上方**心得中」在改版后变假（心得在正文下方）。与 `ContentSnapshot` 那五条同形态，却发生在我自己改过的文件里，而 `assertAbove` 守卫只覆盖快照区、拦不到它。已改为不带方位词的说法。
  - **R1 F4**：`ResourceDetail.tsx` 里那行 `if (shown && shown.id !== resourceId) setShown(undefined)` 与上一行在同一次渲染里可互相抵消，理论上能触发 "Too many re-renders"；`toolbarItem` 的 id 守卫已经够用，该行删除。
  - **R1 F6 / F7**：心得锚点目标补 `tabIndex={-1}`（与本仓 `#main-content` 一致，否则点「心得」只滚动、焦点仍在工具条）；两处箭头移出可访问名称。
  - **第二轮复审又抓到三条，一并处置**：
    1. **F7 的第一版是错的**：我用 `::before`/`::after` 放箭头并声称「不进可访问名称」——而 Chromium 与 Firefox 计算可访问名称时**是计入生成内容的**，只有 jsdom 不算。也就是说那句话只在测试环境里成立，真实读屏照样念。已改为 `<span aria-hidden="true">` 的真实元素，并补一条断言把这个结构钉住。**这是本任务同一形态的第三次**（前两次：状态标签正则四个分支三个是错的、`ResourceDetail.tsx` 的安全论断在授权修订后变假）。
    2. **F1 此前只有 e2e 守卫**，我一度在汇报里说得像单测也有。已在 `LearningPages.test.tsx` 补两条：保存成功后调用 `changed` 一次；**写失败时不调用**（否则调用方会以为进度变了）。
    3. **「打开即入焦」带出的新分支**：靠点击别处关闭菜单时，焦点停在被卸载的菜单项上而掉到 `body`。第一版在外点这一支补了 `menuTrigger.focus()` 并加了断言——**而 R2 指出它可能只在 jsdom 里成立**：浏览器在 `pointerdown` 之后才跑 `mousedown` 的默认聚焦动作，点空白处会把焦点清到 `body`，覆盖掉这次归还。
       **这次没有靠推理定论，而是用 Playwright 在真实 Chromium 里实测**：`Esc` 那条焦点确实回到 ⋯ 按钮；外点那条 `document.activeElement` 是 `BODY`，归还无效。于是**删掉那句无效的 `focus()`**——用户点了别处，焦点本就该跟着去别处，这也正是 WAI-ARIA 菜单按钮模式的规定；断言改为「不抢焦点」。同时把实测成立的 `Esc` 那条钉进 `e2e/reader-layout.spec.ts`，在真实浏览器里守。
       **这是同一类 jsdom/浏览器分歧在本任务里的第三次**（前两次：伪元素的生成内容会进可访问名称；这一次）。共同点是：单测绿不等于产品对，而我三次都先写下了「已经保证」的话。
    4. **R2 A（安全形态的结构性论断变假）**：`ResourceDetail.tsx` 的注释仍写「`ContentSnapshot` 与 `snapshotMarkdown` 一个字符都不进，所以安全形态是文件清单能证明的」。已改为只对 `snapshotMarkdown.ts` 作此论断，并指明 `ContentSnapshot.tsx` 改了什么。**R2 B 列出的记录内三处同类残留**（上下文包、已知取舍 5、完成条件 3 里的 `原网页 ↗`）一并扫净。
  - **面板名去歧义**：删除面板原叫「删除资料」，与 `ResourceDeletion` 自己的 section 同名——两个同名嵌套 region 在辅助技术里是真实歧义，改为「放下这一页」。
- **命令与真实退出结果**（全部由实现者本人在本机运行，无第三方复核）：
  - `check_task.py --worktree` → **CHECKS PASS**，`risk=L3`，`profiles=frontend`，`files=22`，`product_fingerprint=430c4e9df606fab5bbefa53907be0fd6d0a48459a269f6f54255bfc0a6a29f17`（前四个候选依次为 `eb48e52c…`、`91b25238…`、`5ea1fd3e…`、`8e0d0652…`；第三轮多出的一个文件是 `LearningPages.test.tsx`，补 F1 的单测守卫）。22 个文件全部在 `allowed_paths` 内（含两次授权修订加入的六个文件）。**处置 Review 时它一度失败**：`git diff --check` 抓到我新加的注释里有一行行尾空白——那一步不是形式主义，它是这次唯一发现该问题的地方。
  - **frontend 512 passed**（22 文件），基线 **494**（21 文件），净增 **18**：`ResourceToolbar.test.tsx` 16 条（首轮 12；第二轮 +2：删除流程渲染在菜单之外、打开菜单后焦点进入菜单；第三轮 +2：外点关闭也归还焦点、两处箭头不进可访问名称），`LearningPages.test.tsx` +2（保存成功通知调用方、写失败不通知）。第四轮无净增：外点那条断言由「抢回焦点」改为「不抢焦点」（实测证明前者只在 jsdom 里成立）。既有用例无删除、无弱化，改动逐条见下。
  - **e2e 44 passed**，基线 **43**，净增 1（`e2e/reader-layout.spec.ts`；第四轮在这条里加了「`Esc` 归还焦点」的真实浏览器守卫，用例数不变。，走真实后端：建资料 + 标签 + 保存原因 + 正文 → 断言正文在心得之前、正文标题落在第一屏内、标签与保存原因不点即可见、`⋯` 能真的走到编辑资料表单、320/390/1440 三档不横向溢出）。
  - **基线的取法是结构性的，不是假设**：`git diff --name-only 50910fa 1e35843` 只有两个 docs 文件，`frontend/` 树与 TASK-042 最终候选**逐字节相同**，因此那次实测的 494 / 43 就是本任务基线，未在 main 上重跑。
  - `npm run typecheck`（`tsc -b`）/ `lint` / `prettier --check` 全绿。
  - **backend 与 extension 未运行**：本任务在这两棵树下零改动、不在 `allowed_paths` 内，检查脚本据变更自动选组因而只选中 `frontend`。**这是结构性论据，不是观察到它们仍为绿。**
  - `snapshotMarkdown.ts` **不在 21 个文件里**——完成条件 8 的结构性论据成立。
  - 环境：macOS Darwin 25.5.0；Node 24；Chromium（Playwright）。
- **既有断言的改动（无删除、无弱化，逐条说明）**：
  1. `App.test.tsx` **未改**——返回入口的退化是改实现修的，不是改断言。
  2. `ResourceDeletion.test.tsx`：9 条各加一步「先开 `⋯` 菜单」；影响摘要的四条断言由全页查改为 `within(dialog)` 查（「原件」「心得」这些词现在工具条上也有）。**收紧，不是放宽**。
  3. `ResourceEditor.test.tsx`：草稿保全那条改为走「开菜单 → 菜单项 → 面板按钮」三步，草稿要活过这一整套。
  4. `FilePages.test.tsx`：两条先点开「原件」面板；一条认详情页的标志由「原始网页」区块改为工具条上的「原网页」链接。
  5. `ClassificationPages.test.tsx`：三条经 `⋯` 进入；其中「改完标签后标签管理折叠回按钮」改为断言「常驻标签行跟着变了 + 面板仍然开着」——旧断言钉的是刷新时整块卸载重挂的副作用，不是有意行为。
  6. `ResourcePages.test.tsx`：方位守卫由 `assertBelow`（下方的区块）改为 `assertAbove`（工具条上的那个控件），**强度不变**：仍把文案里的方位词与 DOM 实际顺序绑成一条；粘贴原文那条新增「默认不渲染、点开才有」的前置断言；伪协议那条新增「拒掉后要有可见说明」。
  7. `learning-pages.spec.ts`：三处「查看旧学习历史 → 更多：状态与归档管理」两层点击换成工具条徽章一步；`getByRole('status')` 因页面上同时有历史加载提示而改为 `.filter({ hasText })`（从「页面上唯一那条」收窄到「这一条」，保存后不出提示或提示不再是 status 仍会红）。
  8. `taxonomy-pages.spec.ts` / `notes-pages.spec.ts`：经 `⋯` 进入编辑标签；主题名改在「资料信息」面板里查，标签改在常驻标签行里查。
  9. `resource-edit-pages.spec.ts`（**初稿漏列，R2 指出**）：七处「编辑资料」改走 `openEditor()` 三步；详情页的标志由「编辑资料按钮可见」改为「更多操作按钮可见」并保留「编辑资料表单尚未出现」这条前置；PASTE 分支先点开粘贴原文面板；原网页链接名由 `/打开原网页/` 改为 `/原网页/`。
- **第四处自查出的问题，记下来**：`ResourceToolbar.test.tsx` 初稿用 `/未开始|在读|读完|归档/` 取状态徽章，而真实标签是「未开始 / 学习中 / 已完成 / 待复习 / 已归档」——四个分支里三个是错的，靠「未开始」恰好匹配上而全绿。已改为从 `statusLabels` 真值表取名。**这是本轮同一形态的又一次**（断言绑在臆想的字面量上而不是真正的数据），与 TASK-042 记录里那三次同类。
- **已知限制/未完成项**：
  1. **心得仍是正文下方的长滚动**，不是最终形态；挤压式侧栏与窄屏浮层属 TASK-044（用户选的两步走）。
  2. **心得入口不带数量**：取数量要动 `features/notes/**`（禁止范围）或重复请求一次心得列表。推迟到 TASK-044。
  3. **「替换正文 / 删除正文 / 看 Markdown 源码」仍在正文区**，不在 `⋯` 里：它们是 `ContentSnapshot` 内部状态的控件，提到菜单需要重写那个组件。
  4. **进度条不再常驻**（见上）。
  5. **窄屏只保证不横向溢出与正文可读**，不保证好用；面板在 640px 以下退化为块级，会把正文推得更远。
  6. **`⋯` 菜单没有做方向键在菜单项之间移动**（`role="menu"` 的完整键盘模型）。目前只做了打开即入焦、`Esc` 与外点关闭时归还焦点，Tab 仍按文档顺序走。
  7. **删除比改版前多一次点击**：`⋯` → 删除资料… → 删除这份资料 → 确认删除。三步确认流程本身一字未改，多的是进入面板那一下。
  8. **DELETE 在途时若切到别的面板或收起面板，`ResourceDeletion` 仍会被卸载**：后端已删而界面停在原地、不跳转也不提示。比 Review 首轮指出的「任意外点即触发」窄得多（外点已不再关闭面板），但没有消失，也无用例覆盖。
  9. **删除面板的标题「放下这一页」与确认对话框里的同名标签重复出现**；`.resource-deletion` 自带的上边虚线与面板标题的虚线相邻，视觉上是两条。均为观感问题。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：L3，两位独立只读 Reviewer，待填
- Acceptance：L3，独立只读，待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项（仅有真实问题时）：待填
- 日期与决定日志：2026-09-07 用户合并 PR #47 后指示「开启阅读器改版任务」。此前的设计讨论中，用户已就阅读器形态逐条作答：正文优先、写心得走挤压式侧栏、选中正文记心得属后续批注能力、元数据类收进顶部工具条（并注明「这个还没讨论完」）。本次登记前主 Agent 给出具体工具条方案并提出三个问题，用户答：工具条**分两层**（操作层 + 常驻上下文层）、侧栏**心得专用**不做多页签抽屉、学习状态**常驻工具条点开即改**。登记时主 Agent 又提出三个会实质改变工作量或安全形态的问题，用户答：改版**拆两步**（本任务做布局骨架，侧栏留给 TASK-044）、窄屏侧栏**退化成盖在正文上的浮层**（属 TASK-044）、删除资料放 **`⋯` 菜单底部并与其他项分隔开**。主 Agent 据此把风险定为 L3，理由是本页承载全仓唯一的 `dangerouslySetInnerHTML`、销毁性动作入口迁移、以及一个版本化写请求从折叠区进入常驻区。
<!-- EVIDENCE:END -->
