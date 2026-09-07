# TASK-043：阅读器改版第一步 —— 正文占主体与两层顶部工具条

```toml
schema_version = 2
id = "TASK-043"
status = "ACCEPTED"
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

**`ContentSnapshot.tsx` 原本也在排除之列，实现中改判**（见下方「授权范围的两次修订」第 2 条）：它的三条提示文案写着「见**下方**的原网页/粘贴原文/原件」，而本任务把那些入口搬到了**上方**工具条，文案当场变假。二者不可兼得时，宁可放弃对这一个文件的零改动，也不发一句指错方向的文案 —— TASK-036 栽的就是「只断言句子在屏幕上，不断言它为真」这一跤。该文件的改动是**五条方位文案 + 一段四行的中文注释**（说明方位词为何要改），渲染、图片映射、blob 回收、`dangerouslySetInnerHTML` 一行不动。**「其余部分未动」这句初稿被验收用实际 diff 证伪**——那四行注释也是改动，已更正。

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
  - **`ContentSnapshot.tsx`**：五条方位文案由「下方」改为「上方工具条」，外加一段四行注释说明为什么（见「授权范围的两次修订」第 2 条）。除这两处外未动。
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
  - **e2e 44 passed**，基线 **43**，净增 1（`e2e/reader-layout.spec.ts`；第四轮在这条里加了「`Esc` 归还焦点」的真实浏览器守卫，用例数不变。走真实后端：建资料 + 标签 + 保存原因 + 正文 → 断言正文在心得之前、正文标题落在第一屏内、标签与保存原因不点即可见、`⋯` 能真的走到编辑资料表单、320/390/1440 三档不横向溢出）。
  - **基线的取法是结构性的，不是假设**：`git diff --name-only 50910fa 1e35843` 只有两个 docs 文件，`frontend/` 树与 TASK-042 最终候选**逐字节相同**，因此那次实测的 494 / 43 就是本任务基线，未在 main 上重跑。
  - `npm run typecheck`（`tsc -b`）/ `lint` / `prettier --check` 全绿。
  - **backend 与 extension 未运行**：本任务在这两棵树下零改动、不在 `allowed_paths` 内，检查脚本据变更自动选组因而只选中 `frontend`。**这是结构性论据，不是观察到它们仍为绿。**
  - **实现者本人用 git 逐条复核（验收要求，且两位 Reviewer 与验收都没有 Bash）**：`git diff --name-only 1e35843..77fdf1a` 得 **22 个文件**，与 `files=22` 一致，全部在 `allowed_paths` 内。六处「零改动」声明逐个查证均为 0 个改动文件：`snapshotMarkdown.ts`（完成条件 8 的结构性论据）、`ResourceDeletion.tsx`、`ResourceTagEditor.tsx`、`FileOriginal.tsx`、`ResourceEditor.tsx`、`App.test.tsx`；另 `package.json` 与 `package-lock.json` 也是 0（完成条件 12）；`backend/**`、`extension/**`、`docs/contracts/**` 合计 0。`ContentSnapshot.tsx` 的完整 diff 只含上述五条文案与四行注释。基线取法亦已查证：`git diff --name-only 50910fa 1e35843` 只有两个 docs 文件，`frontend/` 树逐字节相同。**这些是实现者单方运行的机械证据**，但它们是 git 级的，不是替代论据。
  - **22 个文件清单**（完成条件 8/12 要求「以文件清单为证」）：`docs/tasks/{TASK-042,TASK-043,任务索引}`；`frontend/e2e/{file-pages,learning-pages,notes-pages,reader-layout,resource-edit-pages,resource-pages,taxonomy-pages}.spec.ts`；`frontend/src/features/learning/{LearningPages.test.tsx,LearningPanel.tsx}`；`frontend/src/features/resources/{ContentSnapshot.tsx,FilePages.test.tsx,ResourceDeletion.test.tsx,ResourceDetail.tsx,ResourceEditor.test.tsx,ResourcePages.test.tsx,ResourceToolbar.test.tsx,ResourceToolbar.tsx}`；`frontend/src/features/taxonomy/ClassificationPages.test.tsx`；`frontend/src/styles.css`。
  - **零改动但未在上文单独声明的三个文件**（验收发现 C）：`ResourceDeletion.tsx`（完成条件 5 要求给出它的 diff 说明——**diff 为空，三步确认一行未改**，只改了它的挂载位置）、`ResourceEditor.tsx`、`FileOriginal.tsx`。
  - **`scaffold.spec.ts` 未改的理由**（验收发现 E，完成条件 10 点名了它）：它只在 `/resources/synthetic-id` 这个**错误态**上取「返回资料库」，不依赖新布局；`ResourceDetail.tsx` 无条件渲染的那条返回链接正好接住它。
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

- **最终候选 SHA**：`77fdf1a6c8bf498bf8dfa22aa9c02dc735859564`（base `1e3584353014f4a0bc3f25faa04d6eacb1f226d5`）。候选依次为 `30d1a75` → `6fb4ea5` → `e9b6d0c` → `2ecf4ad` → `77fdf1a`，每次修订都重新冻结并交由**同两位** Reviewer 验证 `previous_candidate..new_candidate`。
- **检查（实现者本人在本机运行）**：`check_task.py --worktree` → **CHECKS PASS**，`risk=L3`，`profiles=frontend`，`files=22`，`product_fingerprint=430c4e9df606fab5bbefa53907be0fd6d0a48459a269f6f54255bfc0a6a29f17`；frontend **512 passed**（基线实测 494）；e2e **44 passed**（基线 43）；`typecheck` / `lint` / `prettier --check` 全绿。
- **Review**：L3，两位独立只读 Reviewer（R1 布局/交互/无障碍面、R2 安全/授权范围/既有行为面），均独立于实现者，运行器只授予 `Read`/`Grep`/`Glob`。**两位各四轮**，首轮均判 CHANGES_REQUIRED，对最终候选 `2ecf4ad` 起的各自最后一轮均 **PASS，无阻断项**。
- **Acceptance**：L3，独立只读，独立于实现者与两位 Reviewer，此前未参与本任务。**PASS，无阻断项**，14 条完成条件无一「不满足」（条件 5/8/9/13 为「实质满足、文档部分满足」，扣分点全部登记在下方遗留清单里）。
- **一处流程失误，记在这里**：主 Agent 把「跑 `git diff` 复核文件集与六处零改动」派给了 Acceptance，而本仓的 reviewer Agent **没有 Bash**——两位 Reviewer 四轮、Acceptance 一轮都在报告里明说这类论据核不了。Acceptance 用替代论据闭合了大部分并如实标注了「未复算」的部分。**其后由实现者本人补做了 git 级复核**（结果见「实现与测试」一节），但那是单方证据，不是独立核验。
- **最终状态/风险/用户操作**：status=**ACCEPTED**，等待用户决定是否合并。**须向用户当面说明的三点**：① 三处东西的位置变了、用起来会察觉——进度条不再常驻（常驻的是徽章文字）、「替换正文/看 Markdown 源码」仍在正文区、心得按钮暂不带数量；② 删除资料比改版前多一次点击，三步确认流程本身一字未改；③ **本任务出现三次同一形态的问题，全部由他人发现**：断言绑在臆想的字面量上、安全形态的结构性论断在授权修订后变假、jsdom 与真实浏览器的两处分歧。第三处最后是**用 Playwright 在真实浏览器实测**才定论的，不是靠推理。
- **非阻断遗留项**（1–9 为实现者登记，10–16 按 Acceptance 终局报告的清单原样登记）：
  1. 心得仍是正文下方的长滚动，不是最终形态；挤压式侧栏与窄屏浮层属 TASK-044。
  2. 心得入口不带数量；推迟到 TASK-044（侧栏本来就拥有心得数据）。
  3. 「替换正文 / 删除正文 / 看 Markdown 源码」仍在正文区，不在 `⋯` 里。
  4. 进度条不再常驻，常驻的是工具条徽章上的文字。
  5. 窄屏只保证不横向溢出与正文可读，不保证好用。
  6. `⋯` 菜单没有做方向键在菜单项之间移动。
  7. 删除比改版前多一次点击（`⋯` → 删除资料… → 删除这份资料 → 确认删除）。
  8. DELETE 在途时若切到别的面板或收起面板，`ResourceDeletion` 仍会被卸载：后端已删而界面停在原地，无用例覆盖。
  9. 删除面板标题与确认对话框里的同名标签重复；`.resource-deletion` 自带的虚线与面板标题的虚线相邻。
  10. 记录第 190 行的文件清单基数陈旧（写 21，实为 22）；条件 8/12 要求的「文件清单」以计数与指纹替代，未列名。**已在处置本报告时补上完整清单并更正基数。**
  11. `ContentSnapshot.tsx` 的改动描述窄于事实：除五条方位文案外另有四行新注释；`ResourceDetail.tsx` 的代码注释同一说法。同 TASK-042 验收发现 3 的形态。**记录侧已更正；`ResourceDetail.tsx` 的注释留待下次任何再冻结时顺手改。**
  12. `ResourceDeletion.tsx` / `ResourceEditor.tsx` / `FileOriginal.tsx` 的零改动未在记录正文声明，条件 5 的文档要求未落地。**已补。**
  13. `scaffold.spec.ts` 未改的理由未记录（经验收核对：它只走详情页错误态，不依赖新布局）。**已补。**
  14. `e2e/learning-pages.spec.ts:12` 仍以手写字面量匹配状态标签，是「断言绑在臆想字面量上」这一形态的最后一处残留。**未改**：改它会形成新候选而收益不抵成本，留待 TASK-044 顺手闭掉。
  15. 条件 2 的「可见」在单测里是 jsdom 语义（未加载样式表）；真实浏览器只覆盖上下文层与状态徽章，操作层其余按钮的真实可见性无守卫。
  16. Acceptance 的机械论据是替代性的，不是 git 级证明（其运行器无 Bash）。**其后由实现者补做了 git 级复核**：`files=22` 且全在 `allowed_paths`、六处零改动均为 0、`package.json`/锁文件为 0、`backend`/`extension`/`docs/contracts` 合计 0、`ContentSnapshot.tsx` 的完整 diff 只含五条文案与四行注释、基线取法（`50910fa..1e35843` 只有两个 docs 文件）成立。frontend 512 / e2e 44 的**基线数字**仍来自 TASK-042 的实测，未在本任务重跑。
- 日期与决定日志：2026-09-07 用户合并 PR #47 后指示「开启阅读器改版任务」。形态由用户逐条选定：正文优先、写心得走挤压式侧栏、选中正文记心得属后续批注能力、元数据类收进顶部工具条；登记前又答：工具条**分两层**、侧栏**心得专用**、学习状态**常驻工具条点开即改**；登记时再答：改版**拆两步**（本任务做布局骨架）、窄屏侧栏**退化成浮层**（属 TASK-044）、删除资料放 **`⋯` 菜单底部并与其他项分隔开**。主 Agent 据此定 L3，理由是本页承载全仓唯一的 `dangerouslySetInnerHTML`、销毁性动作入口迁移、以及一个版本化写请求从折叠区进入常驻区。实现中两次修订授权范围（加入五个断言旧布局的测试文件；`ContentSnapshot.tsx` 由排除改为限定改动），均如实记入正文并当面告知用户。

## 审查报告原文

以下十份**逐字照录**，未删改、未择要。按时间顺序排列。

### Reviewer R1 · 首轮（候选 `30d1a75`）

## 结论

**CHANGES_REQUIRED**（1 项必须修复；其余可记录后继续/可选）

## 只读证明与范围

- 本 runner 仅授予 `Read`/`Grep`/`Glob`，**无 Write/Edit/Bash**，未创建或修改任何文件。
- **限制（须由 Integration 补）**：没有 Bash，我无法执行 `git diff 1e35843..30d1a75`。以下审查基于工作区候选态文件全文 + 任务记录的 diff 陈述。因此**完成条件 9（既有断言只增不减）、8/12（21 文件清单、锁文件不变）我无法机械核验**，只能核验最终态语义。
- 覆盖面：`ResourceToolbar.tsx` / `.test.tsx`、`ResourceDetail.tsx`、`LearningPanel.tsx`、`ResourceTagEditor.tsx`、`styles.css` `.reader-*`、`ResourceDeletion/ResourceEditor/FilePages/ResourcePages/ClassificationPages/App` 测试改动、`e2e/reader-layout|learning-pages|taxonomy-pages|notes-pages|resource-edit-pages`。快照渲染安全形态属 R2。

## Findings

### 必须修复

**F1. 常驻状态徽章在保存学习记录后不更新，与同屏面板自相矛盾，且用例结构性地看不见。**
`ResourceToolbar.tsx:100` 的徽章读 `resource.progress`，`resource` 来自 `ResourceDetail` 的 `shown`，只在 `retry()` 后更新；而 `LearningPanel.tsx:331-336` 的 `saved` 只 `setSnapshot(...)` 更新自己，**不通知父级**（`ResourceToolbar.tsx:188-192` 也没给它传 `refreshed`）。

后果：用户按设计决定③ 的主路径「点徽章 → 选状态 → 保存学习记录」写成功后，面板里 `ResourceProgress` 显示 35%，**同一屏上方的常驻徽章仍写「未开始 · 0%」**，直到刷新或重新进页。而本任务恰恰把 `<progress>` 收进面板、把徽章定为唯一常驻状态（记录第 167 行「常驻的是徽章上的文字（在读 · 35%）」——该陈述目前只有 reload 之后才为真）。次生风险：用户以为没保存而再提交一次，此时 `snapshot.version` 已更新，第二条学习记录会被后端接受，产生重复写入。

发生可能：每次从工具条改状态都发生。修复成本小且在 `allowed_paths` 内（给 `LearningPanel` 加一个 `saved` 回调或复用 `refreshed`）。

测试面：`e2e/learning-pages.spec.ts:59-68` 在保存与徽章断言之间插了 `page.reload()`，徽章只在刷新后被断言，因此这条退化**结构上不可能被现有用例抓到**；修复时应补一条「保存后不刷新即断言徽章」。

### 可记录后继续

**F2. `role="menu"` 的组成不合法：删除项不是 `menuitem`，且删除对话框会渲染进菜单内部。** `ResourceToolbar.tsx:173-176` 里 `hr` 之后是 `div > section[aria-label=删除资料] > button`；辅助技术按菜单模型只会看到 3 个 `menuitem`（用例 `ResourceToolbar.test.tsx:116-117` 断言的正是这 3 个），销毁性动作落在菜单模型之外。预览一开，`ResourceDeletion.tsx:119` 的 `role="dialog"` 就嵌在 `role="menu"` 里（非模态、无焦点管理、宽 340px、外层 `overflow-y:auto`）。安全语义未变（三步确认一字未改，外点关闭是丢令牌的 fail-safe 方向），但记录的「已知限制 6」只写了缺方向键，应补上这条组成问题；或干脆退回普通 disclosure（去掉 menu/menuitem 角色即完全合法，Tab 也自然可用）。

**F3. 菜单打开后不把焦点移入，且菜单 DOM 排在上下文层之后。** `ResourceToolbar.tsx:126-178`：`.reader-toolbar-context` 的标签 chips 是链接，因此键盘用户按 ⋯ 后第一次 Tab 落在标签行（视觉上在别处），标签越多绕得越远。完成条件 3 的字面要求（键盘可开关、Esc 关闭、焦点归还）已满足，`Esc`/外点监听注册与清理正确、依赖 `[menuOpen]` 无泄漏、点触发按钮不会 pointerdown+click 双切换——这几处实现是对的。建议按 menu button 模式在打开时聚焦首个 `menuitem`。

**F4. `ResourceDetail.tsx:32-35` 的渲染期 `setState` 组合存在自相抵消与死循环隐患。** `if (item && item !== shown) setShown(item)` 与 `if (shown && shown.id !== resourceId) setShown(undefined)` 在同一次渲染里可互相抵消；只要出现 `item.id !== resourceId`（`api.ts` 的 `resource()` 不校验返回 id 与请求 id 一致），两条会无限交替触发 React 的 "Too many re-renders"。实际路径上 `Screen.tsx:110` 用 `key={resourceId}` 强制重挂、`useResourceQuery` 又按 key 闸门，所以现网触发概率很低，第二条也因此基本是死代码——但 `toolbarItem` 已经做了 id 守卫，删掉第二条即可同时消除隐患。**已核验的正向结论**：不会显示上一份资料的内容（`toolbarItem` 的 id 守卫 + 路由 key 双保险），切资料真的丢弃，正常路径每次加载只多一次渲染；面板跨刷新存活的修法有效，`ClassificationPages.test.tsx:310-316` 的新断言（常驻标签行变了 + 面板仍开着）确实比旧断言强。

**F5. 完成条件 13 只覆盖了一半。** `e2e/reader-layout.spec.ts:76-80` 断言 320/390/1440 无横向溢出（且是在编辑面板展开状态下测，更严），但「按钮不重叠」「正文可读」只有截图、无断言；`scrollWidth <= innerWidth` 比 `clientWidth` 宽松约一个滚动条宽度。CSS 侧我复核过 `.reader-*` 全为 flex-wrap、`.reader-title` `flex:1 1 12ch; min-width:0; overflow-wrap:anywhere`（长标题让位、按钮不让）、`.reader-menu` 在 ≤640px 退为 `static; width:100%`（`min(340px, 100vw-32px)` 的 calc 分支在媒体查询之上不可达，故 `100vw` 含滚动条的坑不成立），重叠风险确实低。

### 可选建议

**F6.** 心得锚点目标 `ResourceDetail.tsx:68` 无 `tabIndex={-1}`，与本仓已有的跳转目标约定（`App.tsx:82` `#main-content`）不一致：点「心得」会滚动但焦点仍留在工具条。一行可改。
**F7.** `原网页 ↗` 的箭头进了可访问名称（`ResourceToolbar.tsx:276`），与 `.reader-back::before` 特意把箭头排除在名称之外的做法不一致。

## 覆盖与缺口（我负责的条目）

- 条件 1：**断的是 DOM 顺序**（`ResourceToolbar.test.tsx:59-62` 与 e2e 51-56 用 `compareDocumentPosition`，反序会红），e2e 另有首屏 y 坐标断言。合格。
- 条件 2/7：逐项 `toBeVisible`，含空标签/空保存原因分支。合格。
- 条件 3：菜单项、`aria-haspopup/expanded`、`Esc` + 焦点归还、外点关闭均有断言；「键盘打开」靠原生 `<button>` 结构保证，可接受。
- 条件 4：**断的是顺序与分隔**（最后一个 `menuitem` → `separator` → 删除按钮 → `danger` 类），不是「删除在菜单里」。合格。
- 条件 6：钉住了「选状态 → 保存学习记录」两个控件同时在；`initialView` 只影响 `open/manage` 两个初始值，`RecordForm` 每一步（归档确认、冲突确认、版本号）未动，`LearningPages.test.tsx:15-18` 仍走默认折叠两层路径，把默认值也钉住了。合格。
- 条件 11：全部按可访问名称/角色取控件（`getByRole` + `statusLabels` 真值表），**未见 class 选择器**。合格。
- 条件 14：无快照、无标签、无保存原因、PASTE/FILE/伪协议各有用例。合格。
- 新增 12 条与被改既有用例：**未发现永真断言或断错对象**。`assertAbove` 方向正确（`PRECEDING`），`ResourcePages.test.tsx:626` 还加了 `not.toHaveTextContent('下方')`；`ResourceDeletion.test.tsx:78-84` 改 `within(dialog)` 确为收紧；e2e 徽章正则 `/^(未开始|学习中|已完成|待复习|已归档) · \d+%$/` 五个分支全部与 `statusLabels` 一致——记录里自查的那类「臆想字面量」我未再发现同形态实例。

## 剩余风险

F1 修复后需重新冻结候选；F1 属实现改动，我可按 `previous_candidate..new_candidate` 增量复审。条件 8/9/12 的文件清单与断言计数需要有 Bash 的角色核验。

### Reviewer R2 · 首轮（候选 `30d1a75`）

## R2 独立只读审查报告 — TASK-043

**候选/基线/只读证明**
- 工具白名单仅 `Read`/`Grep`/`Glob`，无 `Write`/`Edit`/`Bash` — 运行器层面真实只读。
- `.git/HEAD` → `refs/heads/agent/coordinator/TASK-043-reader-layout`；`.git/logs/HEAD:433-437` 显示分支自 `1e35843` 切出，三个提交 `1d7c2a0`(登记) → `e52f6d6`(实现) → `30d1a75`(转审)。**分支名是 `-reader-layout`，任务单给的是 `-reader-toolbar`**，SHA 一致，仅记录。
- **方法限制（须声明）**：无 Bash，我无法执行 `git diff 1e35843..30d1a75`。变更集由 reflog + 工作区 mtime 排序（分支与 main 同点切出，1788784020 之后无 checkout 噪声）+ 全文阅读重建，得到 **18 前端 + 3 docs = 21**，与 `files=21` 吻合。「逐字节零改动」类声明因此是**强证据支持但非 diff 证明**。

**必须修复**
1. `docs/tasks/任务索引.md:24` 仍写「**不进 `ContentSnapshot.tsx` 与 `snapshotMarkdown.ts` 一个字符**」——授权修订 2 之后该句对 `ContentSnapshot.tsx` **已为假**；同行状态列仍是 `READY`，而记录 TOML 已 `IN_REVIEW`。索引是跨任务权威状态，留一句已被自己推翻的范围声明，正是本任务反复引以为戒的「陈述宽于证据」。一行可改，在 `allowed_paths` 内。
2. `frontend/src/features/learning/LearningPanel.tsx:317`：「新的理解或疑问直接写在**上方**心得中」——改版后心得在正文**下方**，这句当场变假。与 `ContentSnapshot` 那五条同一形态，却发生在本任务自己改过的文件里，`assertAbove` 守卫只覆盖快照区，没拦住。一词可改。

**可记录后继续**
3. **销毁性流程的行为确实随挂载点变了**，不止「搬了位置」：`ResourceDeletion` 现在挂在 `{menuOpen && …}` 内，菜单外任一 `pointerdown` 或 `Esc` 都会卸载它。(a) 已取到的预览与一次性令牌被静默丢弃（fail-safe，但要重发一次预览）；(b) 若卸载发生在 DELETE **在途**时，`alive.current=false` → `deleted()` 不执行 → 后端已删，用户却停在陈旧详情页、既无提示也不跳转。基线常驻挂载不可能出现这一支，无用例覆盖。不造成数据损失或越权删除、本机后端窗口极短，故不阻断；建议在 `preview` 或 `pending` 期间不自动关菜单，否则须列为遗留项并向用户说明。
4. **`role="menu"` 内含非 `menuitem` 内容**：`.reader-menu-danger` → `<section aria-label="删除资料">` → 按钮，展开后还有 `role="dialog"` 嵌在菜单里。`ResourceToolbar.test.tsx:116-118` 自己就证明了这点（`getAllByRole('menuitem')` 只有 3 项，删除按普通 button 取）。AT 的菜单导航模式下销毁性动作可能取不到。与已知限制 6 相关但不同，应并入。
5. **记录把改动记到了没改的文件上**：变更摘要称「`ResourceTagEditor` 的标签行改为 `<nav aria-label="资料标签">`」，但 `ResourceTagEditor.tsx` 无 `nav`（其 section 名为「资料标签管理」）且按 mtime 未改；`<nav>` 是新文件 `ResourceToolbar.tsx:127` 的新代码，旧标签行在被重写的 `ResourceDetail.tsx` 里。
6. 「既有断言的改动」自称逐条，**漏了 `frontend/e2e/resource-edit-pages.spec.ts`**（`openEditor` 三步、新增 `更多操作` 可见 + `编辑资料表单 toHaveCount(0)` 前置、PASTE 分支先点开面板）。改动本身是收紧，但清单不完整。

**可选建议**：`.reader-menu-danger .resource-deletion { margin:0 }` 未覆盖 `.resource-deletion` 的 `padding-top/border-top`，`<hr>` 之外多一条虚线；确认对话框位于 `340px / max-height 70vh / overflow-y:auto` 浮层内，7 项影响摘要挤在 3 列网格、桌面端需内滚（因确认按钮在最下，用户必然滚过警告，不构成安全问题）；`ContentSnapshot.tsx:143-144` 的「`ResourceDetail.tsx` 不在 allowed_paths」注释已过期，但按修订 2 的约束不动它是对的。

**已核实无问题（覆盖）**
- **授权范围**：21 个文件全部落在 `allowed_paths`；两次修订理由成立且写在记录正文而非只动 TOML。`ContentSnapshot.tsx` 改动确实止于 3 条 ready + 2 条 empty 方位文案与一段注释；`loadFrozenImages`、blob `release`、图片映射、`renderSnapshot` memo、`dangerouslySetInnerHTML`(:240) 及其安全注释与 TASK-042 一致。`snapshotMarkdown.ts` 不在变更集内。旁证：不在 `allowed_paths` 的 `ContentSnapshot.test.tsx` 不引用这五条文案，故无需改它 —— 与 506 全绿自洽。
- **三步删除**：预览 → `confirmation_token` → 确认逻辑完好；既有断言全在且更紧（`within(dialog)` 查影响摘要、令牌不外泄、三类令牌错误的受控恢复、DELETE 只发一次）。
- **版本化写**：`initialView` 只设 `open/manage` 初值；`RecordForm` 的 `expected_progress_version`、归档勾选、`needsConfirm/confirmed`、提交禁用逻辑一字未动；`LearningPages.test.tsx` 仍按默认 collapsed 直挂 `LearningPanel`，旧覆盖完整继承。
- **八条断言改动无一放宽**：`assertAbove` 与 `assertBelow` 同强度（仍把方位词绑 DOM 顺序）并新增 `not.toHaveTextContent('下方')`；`getByRole('status').filter({hasText})` 仍断言 role=status，只从「页面唯一」收窄到「这一条」；ClassificationPages 那条由「折叠回按钮」换成「常驻标签行真的变了 + 面板仍开着 + 心得草稿仍在」，明确更强。
- **自述与证据**：`ResourceToolbar.test.tsx` 恰 12 条 `it`；前端测试文件 22 个（基线 21）→ 506/494 净增 12 自洽；e2e 新增 `reader-layout.spec.ts` 1 条 → 44/43 自洽；`package.json`/`package-lock.json` 均早于本轮改动集（完成条件 12 成立）；`extension/src/**` 全部早于本轮改动集、backend 不在变更集内（「结构性论据」成立）；reflog 显示 `50910fa` 之后仅 `34d5ece` 一个 docs 提交再 FF 到 `1e35843`，与「基线取法是结构性的」自洽。

**剩余风险**：506/44 与六处「零改动」声明由实现者单方运行/我仅作自洽核对，建议 Integration 用 `git diff --name-only --stat 1e35843..30d1a75` 复核 `snapshotMarkdown.ts`、`ResourceDeletion.tsx`、`ResourceTagEditor.tsx`、`FileOriginal.tsx`、`ResourceEditor.tsx`、`App.test.tsx`。菜单方向键模型未做（已知限制 6）。

**结论：CHANGES_REQUIRED**（两项均为一行/一词改动，改完可直接转 PASS；其余按非阻断遗留项登记）。

### Reviewer R1 · 增量复审（`30d1a75..6fb4ea5`）

## 增量复审结论（覆盖新候选 `6fb4ea5`）

**PASS**，附 4 项非阻断项。F1 阻断已真实解除；F2/F3/F4/F6 处置成立；F7 只在测试环境成立（见下）。

**只读与范围**：本 runner 仍只有 `Read`/`Grep`/`Glob`，未写入任何文件。**仍无 Bash**，无法机械 diff `30d1a75..6fb4ea5`，也无法复核 508/44/`files=21`；以下按受影响文件的最终态逐处核对：`ResourceToolbar.tsx`、`ResourceToolbar.test.tsx`、`ResourceDetail.tsx`、`LearningPanel.tsx`、`ResourceDeletion.test.tsx`、`ResourcePages.test.tsx`、`styles.css`、`e2e/learning-pages.spec.ts`，并复查了所有引用 `原网页`/`删除…`/`role=menu` 选择器的调用点。首轮已通过、本次未触及的部分（条件 1/2/3/7/11/14 的断言、`assertAbove` 守卫、Classification/FilePages/Editor 三处入口改动）沿用首轮结论。

### 处置核验

**F1 成立。** `LearningPanel.tsx:341-348` 在 `saved` 里调 `changed?.()`，`ResourceToolbar.tsx:205` 传 `refreshed`（= `retry`），徽章读的 `resource` 会被重新拉取。副作用面已核：`LearningPanel` key 仍是 `'learning-'+resource.id`、`RecordForm` key 仍是 `'form-'+savedCount`，刷新不会重挂面板、不会丢草稿，下一次写用的 `expected_progress_version` 仍取自面板自己的 `snapshot`——写路径语义未变。

**新断言确有咬合力。** `e2e/learning-pages.spec.ts:87`（归档后**不刷新**即断言 `已归档 · 35%`）与 `:99`（恢复后即断言 `学习中 · 35%`）在修复前徽章会分别停在 `学习中 · 35%` / `已归档 · 35%`，Playwright 子串匹配取不到 → 超时变红。两条都真的会先红。

**F2/F3 成立。** 删除现在是第四个真 `menuitem`（`ResourceToolbar.tsx:182-189`），`role="dialog"` 不再嵌进 `role="menu"`，菜单组成合法；`:148-150` 的用例断言点面板外面不收面板（这正是令牌不再被浮层卸载的证据），`:152-158` 断言打开时焦点落在首个 `menuitem`。`:119-134` 把四项顺序、分隔线位置与 `danger` 一起钉住，比上一版更强。`ResourceDeletion.test.tsx:57-62` 的入口已同步为三步，三步确认流程本体未动。

**F4/F6 成立。** 自相抵消的那行已删，只留 `toolbarItem` 的 id 守卫（`ResourceDetail.tsx:33-37`），死循环路径消失且仍不会显示上一份资料；`:75` 补了 `tabIndex={-1}`。

### 非阻断项

1. **（须更正 EVIDENCE）F1 没有单元测试。** 我在 `LearningPages.test.tsx` / `ResourceToolbar.test.tsx` 全文搜不到任何一处走 `changed` 或「保存后断言徽章」的单测；`ResourceToolbar.test.tsx` 新增的正是 F2/F3 那两条，506→508 的净增 2 与之吻合。F1 目前**只有 e2e 守卫**（可接受，但写回时不应记成「单测也加了一条」）。另 `:100` 那条 `region 含 学习中 · 35%` 由 `RecordForm` 的「当前快照：…」提示自然满足，单独没有咬合力——有咬合力的是 `:87` 与 `:99`。
2. **移焦点带来的新小尾巴**：菜单是靠外点关闭时（`ResourceToolbar.tsx:72-76`），焦点停在被卸载的 `menuitem` 上 → 掉到 `body`，下次 Tab 从文档开头开始。上一版不移焦点时没有这个分支。建议 `onPointerDown` 关闭时也 `menuTrigger.current?.focus()`。
3. **F7 在真实浏览器里是空操作**：Chromium/Firefox 的可访问名称计算**包含 `::before`/`::after` 生成内容**，`.reader-external::after{content:' ↗'}` 仍会被读屏念出来（同理 `.reader-back::before` 的 `'← '`，那是基线行为）。所有断言都用子串/正则，故没有测试因此变假；若这条目标当真，应改 `<span aria-hidden="true">↗</span>`。**建议按现状记录、不必再改**，但记录里「箭头不进可访问名称」这句只对 jsdom 成立。
4. **删除路径的残留与摩擦**：DELETE 在途时若点 ⋯/另一个面板/收起，`ResourceDeletion` 仍会被卸载，出现「后端已删、界面停在原地」——比 R2 原本指出的「任意外点即触发」窄得多，属可记录。另外删除比上一候选多一次点击（⋯ → 删除资料… → 删除这份资料 → 确认删除），且预览出现后「放下这一页」会在面板标题与对话框里各显示一次；建议在「已知取舍」补一行。

### 剩余风险

无阻断。仍需有 Bash 的角色核验：`30d1a75..6fb4ea5` 的实际文件集仍为 21、frontend 508 / e2e 44、以及完成条件 8/9/12 的清单与计数类论据。

### Reviewer R2 · 增量复审（`30d1a75..6fb4ea5`）

## R2 增量复审 — `30d1a75..6fb4ea5`（覆盖新最终候选）

**只读与范围**：工具仍只有 `Read`/`Grep`/`Glob`。`.git/logs/HEAD:437` 确认 `30d1a75 → 6fb4ea5`（`fix(frontend): 处置两位 Reviewer 的三项必须修复`）。仍无 Bash，本轮同样以「全文重读 + mtime 定位 + 交叉引用」代替 `git diff`。本轮实际改动（逐个读过）：`ResourceToolbar.tsx`、`ResourceDetail.tsx`、`LearningPanel.tsx`、`styles.css`、`ResourceToolbar.test.tsx`、`ResourceDeletion.test.tsx`、`ResourcePages.test.tsx`、`e2e/learning-pages.spec.ts`、`TASK-043-reader-toolbar.md`、`任务索引.md` —— 全部在 `allowed_paths` 内，文件总集仍为 21。**30d1a75 中本轮未触及的部分（ContentSnapshot 五条文案、`ResourceDeletion.tsx` 零改动、ClassificationPages/FilePages/ResourceEditor 及其余 e2e、授权范围核对）继承上一轮结论。**

**处置核实 — 全部成立**
- **#1**：`任务索引.md:24` 状态列已是 `IN_REVIEW`，范围句已改为「`snapshotMarkdown.ts` 零改动、`ContentSnapshot.tsx` 只改五条方位文案（实现中修订授权范围，见记录）」，与实际相符。
- **#2**：`LearningPanel.tsx:327` 已无方位词。
- **#3/#4**：删除是第 4 个真正的 `menuitem`（`ResourceToolbar.tsx:182-189`），只 `openPanel('delete')`；`ResourceDeletion` 渲染在 `ToolbarPanel` 里（:220），已在 `role="menu"` 之外 —— 「点菜单外 → 令牌/在途 DELETE 被卸载」这一支确实消失，`role="dialog"` 也不再嵌在 `role="menu"` 内。新用例 `ResourceToolbar.test.tsx:137-150` 断言 `pointerDown(document.body)` 后面板仍在；:119-124 断言四个 menuitem 的顺序与 `danger` 样式。**`ResourceDeletion.tsx` 本身仍一字未改**，`ResourceDeletion.test.tsx` 只在入口多一步 `menuitem 删除资料…`，九条断言（`within(dialog)` 影响摘要、预览前不发 DELETE、令牌不外泄、三类令牌错误的受控恢复、取消不再发请求）原样。
- **#5 / #6**：记录 160 行已改归 `ResourceToolbar.tsx`、明说 `ResourceTagEditor.tsx` 未改；既有断言清单第 9 条补上 `resource-edit-pages.spec.ts`，并连带交代了链接名的改动。
- **R1 F1**：`changed?` 只在 `saved` 里调用，无回环；`LearningPages.test.tsx` 走默认 `collapsed` 且不传 `changed`，旧覆盖不受影响。**回归守卫真实存在且绑在被测行为上**：`e2e/learning-pages.spec.ts:86-87` 与 `:95-100` 在**不 reload** 的前提下断言徽章（归档一次、恢复一次），并断言徽章与面板文案一致 —— 记录 169 行的自述与证据相符（我先按 mtime 误判此文件未改，直接读文件后更正）。

**本轮新引入、我另行核过的行为**
打开菜单即把焦点送入首个 menuitem（新用例 :152-158），`Esc` 仍归还焦点；`原网页 ↗` 的箭头移入 `.reader-external::after`，可访问名变为「原网页」，`ResourcePages.test.tsx:579` 同步为精确名，其余处为 `/原网页/` 正则，`target/rel/referrerpolicy` 三件套与伪协议拒绝（:303-311）未动 —— 等强度；`ResourceDetail.tsx` 删掉渲染期的 `setShown(undefined)`（消除与上一行互相抵消导致 "Too many re-renders" 的路径），id 守卫仍在读取处、不会显示上一份资料；心得锚点补 `tabIndex={-1}`；删除面板改名「放下这一页」消除与 `ResourceDeletion` 内 `aria-label="删除资料"` 的同名嵌套 region 歧义。计数自洽：`ResourceToolbar.test.tsx` 现 14 条（12+2），494+14=**508** ✓；本轮无新 e2e test，**44** 不变 ✓。

**非阻断项（可记录后继续 / 可选）**
- **A（建议修复，一行）**：`ResourceDetail.tsx:65-66` 注释仍写「`ContentSnapshot` 与 `snapshotMarkdown` 本任务一个字符都不进……快照的安全形态因此是文件清单能证明的」——对 `ContentSnapshot.tsx` 已为假，且这是一句**安全形态的结构性论断**，就在本轮改过的文件里。
- **B（记录）**：记录内同类残留三处：上下文包 141 行「只读不改：`ContentSnapshot.tsx`」、已知取舍 152 行「本任务不动 `ContentSnapshot`/`snapshotMarkdown`」、完成条件 124 行仍写按钮是 `原网页 ↗`。「授权范围的两次修订」一节已说明真相，故不致误导，但同一形态第三次出现，建议一次扫净。
- **C（可选）**：`.resource-deletion` 仍带 `margin-top:28px; padding-top:22px; border-top:1px dashed`，如今它是删除面板的唯一子元素，紧挨面板标题那条虚线，视觉上两条虚线；面板名「放下这一页」与对话框内 `note-tab` 同文案重复出现。
- **D（已在已知限制 6）**：`role="menu"` 的方向键模型仍未做，本轮只加了「打开即入焦」。

**剩余风险**：508/44/CHECKS PASS 仍由实现者单方运行，我无 Bash 只做了自洽核对；建议 Integration 以 `git diff --name-only 1e35843..6fb4ea5` 复核 `snapshotMarkdown.ts`、`ResourceDeletion.tsx`、`ResourceTagEditor.tsx`、`FileOriginal.tsx`、`ResourceEditor.tsx`、`App.test.tsx` 六项「零改动」声明。

**结论：PASS**（覆盖最终候选 `6fb4ea5`；两项必须修复与两条可记录项均已实质处置，无一是「登记了事」；附 A–D 四条非阻断项，A 建议在写回前顺手改掉）。

### Reviewer R1 · 增量复审（`6fb4ea5..e9b6d0c`）

## 增量复审结论（覆盖新候选 `e9b6d0c`）

**PASS**。三条新断言都有咬合力，`aria-hidden` 的改法确实解决了我指出的问题；未发现新缺陷。1 项须更正的记录文案 + 2 项可选建议。

**只读与范围**：仍只有 `Read`/`Grep`/`Glob`，未写入任何文件。**仍无 Bash**，`512/44/files=22/指纹` 与 `6fb4ea5..e9b6d0c` 的机械 diff 无法核验（留给 Integration）。本轮逐处核对：`ResourceToolbar.tsx`（箭头、外点归还焦点）、`ResourceToolbar.test.tsx`（16 条）、`LearningPages.test.tsx`（新增 2 条）、`ResourceDetail.tsx` 注释、`styles.css`，并回扫了所有按名取「返回资料库」「原网页」的调用点。前两轮已通过、本轮未触及的部分沿用既有结论。

### 咬合力核验

**箭头那条成立，而且两个方向都钉住了。** `ResourceToolbar.test.tsx:169-174`：`getByRole('link', { name: '返回资料库' })` 在 RTL 里是**整名精确匹配**，若 `aria-hidden` 被摘掉，名称变成「← 返回资料库」→ 查不到即抛错；`querySelector('[aria-hidden="true"]')?.textContent).toBe('← ')` 在装饰元素消失时得到 `undefined` → 红（不是那种 `?.` 恰好为空也通过的写法）。改法本身也对：`aria-hidden` 子树在 Chromium/Firefox 的可访问名称计算中**确实被排除**，与生成内容相反，所以这次「箭头不进名称」在真实读屏里才成立。`.reader-back::before`、`.reader-external::after` 与 `reader-external` 类一并删净，无死 CSS、无孤儿类名；全仓按名取这两个链接的地方（`App.test.tsx`、`FilePages`、`ResourcePages:579`、三处 e2e）都用子串/正则或精确名，均不受影响。

**「写失败不通知」那条成立。** `LearningPages.test.tsx:189-201`：POST 直接 reject 422，断言在 `await findByRole('alert')` **之后**执行——拒绝已被处理、错误态已渲染，不是「异步还没跑到」的假绿。若 `changed?.()` 被放进 `finally` 或提到 await 之前，这条立刻红。配套的 `:171-188`（成功调用一次）同样有咬合力，并顺带成为 `initialView="manage"` 的第一条单元覆盖。

**外点归还焦点那条成立**（`ResourceToolbar.test.tsx:152-160`，独立一条）：不加 `menuTrigger.current?.focus()` 时焦点掉到 `body`，`toHaveFocus()` 红。真实浏览器里点到输入框的情形也没被破坏——`pointerdown` 监听先跑，随后 `mousedown` 的默认行为把焦点给被点元素，净效果仍是落在输入框。

### Findings

1. **（须更正，记录文案）`docs/tasks/TASK-043-reader-toolbar.md:162`** 变更摘要仍写「返回链接的箭头走 `::before`，不进可访问名称」——本候选已把它删掉，且同一份文件 `:176` 正好在说这句话是错的。这是本任务反复引以为戒的「留一句被自己推翻的陈述」，写回前顺手改掉即可，不影响代码结论。
2. **（可选）`ResourceToolbar.tsx:78` 的 `focus()` 会滚动。** 菜单开着时用户往下滚、再点正文空白处，焦点归还触发按钮会把视口拽回顶部。建议只在指针这一支用 `focus({ preventScroll: true })`（Esc 那支保留默认滚动，键盘用户需要看见焦点）。发生条件窄，影响是一次跳动。
3. **（可选，非缺陷）`changed` 的契约边界**：冲突后「保留草稿，读取最新进度」走的是 `reloaded`，不通知调用方，此时面板显示的是服务端最新进度而徽章仍是父级旧值。用户随后提交成功即同步；只有中途放弃才留着旧徽章。新增两条单测把契约定义为「**写成功才通知**」，我认为这个契约是对的，此处仅登记边界。

### 剩余风险

无阻断。仍需 Integration 用 Bash 核验：`6fb4ea5..e9b6d0c` 的文件集为 22 且全在 `allowed_paths`、frontend 512 / e2e 44、以及完成条件 8/9/12 的清单与计数论据。

### Reviewer R2 · 增量复审（`6fb4ea5..e9b6d0c`）

## R2 增量复审 — `6fb4ea5..e9b6d0c`（覆盖新最终候选）

**只读与范围**：工具仍只有 `Read`/`Grep`/`Glob`。`.git/logs/HEAD:438` 确认 `6fb4ea5 → e9b6d0c`。本轮实际改动（逐个读过）：`ResourceToolbar.tsx`、`ResourceToolbar.test.tsx`、`ResourceDetail.tsx`、`styles.css`、`LearningPages.test.tsx`、`TASK-043-reader-toolbar.md`。`LearningPages.test.tsx` 自登记起就在 `allowed_paths`（TOML:27），因此 `files` 由 21 变 22 **不需要第三次授权修订**，记录也没有声称有。e2e 未改，44 不变 ✓。**6fb4ea5 中本轮未触及的部分继承上一轮结论**（删除流程、`ContentSnapshot` 五条文案、`ResourceDeletion.tsx` 零改动、授权范围核对均未再变动，结论仍然成立）。

**处置核实 — 全部成立，且比声明更保守**
- **A**：`ResourceDetail.tsx:64-68` 已改为「安全形态全部落在 `snapshotMarkdown.ts` 里，本任务不进那个文件一个字符……`ContentSnapshot.tsx` 只改了五条方位文案」，并指向记录的修订小节。论断范围与事实一致。
- **B**：上下文包 141 行、已知取舍 152 行、完成条件 124 行三处全部更正，措辞与实际相符，未见新的过宽表述。
- **R1 箭头**：`.reader-back::before` 与 `.reader-external::after` 两条 CSS 已删（`.reader-external` 类整体消失，无死样式），改为 `<span aria-hidden="true">← </span>` / `<span aria-hidden="true"> ↗</span>`。新用例 :162-175 双向钉住（可访问名不含箭头 + 装饰元素带 `aria-hidden` 且可见文本含箭头）。`ResourcePages.test.tsx:579` 的精确名 `原网页` 与之一致；e2e 用 `/原网页/`、`'返回资料库'`（Playwright 子串匹配）两侧都不受影响。
- **R1 F1 单测**：`LearningPages.test.tsx:171-201` 两条真正绑在行为上——成功后 `changed` 恰调用一次、写失败时不调用。记录 177 行还主动更正了自己此前「说得像单测也有」的过宽汇报，这一条是自查而非被抓。
- **外点归还焦点**：`ResourceToolbar.tsx:76-78` + 用例 :152。
- **计数复核自洽**：`ResourceToolbar.test.tsx` 现 16 条（12+2+2）、`LearningPages.test.tsx` +2，494+18=**512** ✓；`files=22` ✓；已知限制 6/7/8/9 与实现一一对得上，其中第 8 条（DELETE 在途时切面板/收起面板仍会卸载 `ResourceDeletion`，无用例覆盖）是我 #3 的真实残余，收窄后如实登记，未被说成已解决。

**唯一新增可选项（不阻断）**
`onPointerDown` 里的 `menuTrigger.current?.focus()`：浏览器在 `pointerdown` 之后才执行 `mousedown` 的默认聚焦动作——点到可聚焦元素时焦点最终归那个元素（无妨），但点到**空白/非可聚焦区域**时默认动作会把焦点清到 body，于是这次归还很可能被覆盖。用例用 `fireEvent.pointerDown(document.body)`，jsdom 不跑该默认动作，因此这条断言可能只在测试环境成立——与本轮刚修掉的 `::before` 是同一类 jsdom/浏览器分歧。影响很小：键盘用户走的是 `Esc` 那条路（`menuTrigger.focus()` 无竞争，正确），受影响的只有「键盘开菜单、鼠标点空白关」这种混合操作。建议改为记录一句或在 e2e 里实测一次，不必为此再冻结一轮。

**结论：PASS**（覆盖最终候选 `e9b6d0c`）。删除流程的三步确认与 `ResourceDeletion.tsx` 零改动、授权范围（22 个文件全在 `allowed_paths`、两次修订如实记载）两项结论仍然成立；本轮未发现新的「陈述宽于证据」，仅上述一条可选项。剩余风险同前：512/44/CHECKS 由实现者单方运行，建议 Integration 用 `git diff --name-only 1e35843..e9b6d0c` 复核六处「零改动」声明。

### Reviewer R1 · 最终确认（`e9b6d0c..2ecf4ad`）

## 最终确认（覆盖候选 `2ecf4ad`）

**PASS**。改后的断言仍有咬合力；删掉那句 `focus()` **没有**让 F3 重新成立。1 处一行的注释残留，非阻断。

**只读**：仍只有 `Read`/`Grep`/`Glob`，未写入。仍无 Bash，`512/44/files=22/指纹` 与 `e9b6d0c..2ecf4ad` 的机械 diff 留给 Integration。本轮核对 `ResourceToolbar.tsx:60-89`、`ResourceToolbar.test.tsx:152-163`、`e2e/reader-layout.spec.ts:75-84`、记录 `:162`。

**先认领我自己的错。** 上一轮我判「外点归还焦点那条成立」，只验了点到输入框那一支就推及全部——而 R2 追问的空白处那一支恰恰是断言宣称的战果所在。Chromium 在 `pointerdown` 监听之后才执行 `mousedown` 的默认聚焦动作（聚焦被点元素最近的可聚焦祖先，没有则把焦点清到 `body`），手动归还必被覆盖。R2 的怀疑对，你的实测是正确的裁决方式；我漏了这一步。

**新断言有咬合力。** `ResourceToolbar.test.tsx:162`：打开时焦点被送进首个 `menuitem`，外点关闭后该节点被卸载 → `activeElement` 落到 `body` → `more()` 不持焦；一旦有人把 `menuTrigger.focus()` 加回来，这条立刻红。它钉住的正是那次「只在 jsdom 成立」的写法，不是空断言。（可选：`expect(document.body).toHaveFocus()` 比否定式更精确，不必为此再动。）

**F3 未重新成立，而且比之前更有据。** 送焦点进菜单那一步（`ResourceToolbar.tsx:66`）原样保留，并且现在由 `e2e/reader-layout.spec.ts:78-84` 在真实 Chromium 里走通了完整键盘链：聚焦 ⋯ → Enter 开 → 断言焦点在首个 `menuitem`（:81）→ Esc 关 → 断言焦点回到 ⋯（:84）。任一环失效都会红。至于外点这一支，WAI-ARIA 菜单按钮模式只要求 `Esc` 与激活菜单项时归还焦点；用户用鼠标点空白处时 Chromium 无论组件怎么写都会把焦点清到 `body`，所以相比上一候选没有任何行为退化——变的只是断言不再宣称一件假事。

**Finding（可选，一行）**：`ResourceToolbar.tsx:60-61` 的引导注释仍写「点到菜单外面也关。**焦点必须还回去**——否则用键盘的人……」，与紧随其后 `:76-81` 的说明直接冲突。同一形态（留一句被自己推翻的陈述），顺手改成「归还只属于 `Esc` 那一支」即可。

**剩余风险**：无阻断。Integration 仍需核验 `base..2ecf4ad` 的 22 个文件全在 `allowed_paths`、frontend 512 / e2e 44，以及完成条件 8/9/12 的清单类论据。

### Reviewer R2 · 最终确认（`e9b6d0c..2ecf4ad`）

## R2 最终确认 — `e9b6d0c..2ecf4ad`

`.git/logs/HEAD:439` 确认候选 `2ecf4ad`。本轮改动三处 + 记录，全部读过：

- `ResourceToolbar.tsx:72-82`：外点分支的 `menuTrigger.focus()` 已删除，只余注释说明实测结论与 WAI-ARIA 依据；`Esc` 分支（:67-71）的归还保留不变。
- `ResourceToolbar.test.tsx:152-163`：断言由「抢回焦点」改为 `expect(more()).not.toHaveFocus()` —— 现在钉的是产品实际应有的行为，不再是 jsdom 独有的假象。用例数仍 16 条，512 不变 ✓。
- `e2e/reader-layout.spec.ts:78-84`：在真实 Chromium 里钉住实测成立的那一支（焦点进首个 `menuitem` → `Esc` → 焦点回 ⋯），未新增 test，44 不变 ✓。放在编辑面板之后不冲突（开菜单会 `setPanel(null)`）。
- 记录：变更摘要 162 行的 `::before` 说法已更正；176/178-180 行把两次 jsdom/浏览器分歧、以及「这次是实测不是推理」如实写下，与实际 diff 相符。无新的过宽表述。

**唯一遗留一句话的瑕疵（不阻断）**：`ResourceToolbar.tsx:60-61` 的段首注释仍写「点到菜单外面也关。**焦点必须还回去**——否则……掉到文档开头」，与 16 行之后的正文注释相反。正文与用例都不含糊，属措辞残留，下次顺手删半句即可。

**结论：PASS**，覆盖最终候选 `2ecf4ad`。删除流程三步确认与 `ResourceDeletion.tsx` 零改动、授权范围（22 个文件全在 `allowed_paths`）两项结论继续成立。剩余风险同前：全部测试与检查仍由实现者单方运行，建议 Integration 用 `git diff --name-only 1e35843..2ecf4ad` 复核六处「零改动」声明。

### Acceptance · 终局（候选 `77fdf1a`）

## 首先：一个必须说明的能力偏差

**我没有 Bash。** 本 Agent 的工具白名单只有 `Read` / `Grep` / `Glob`（这也是我的只读权限证明——无 `Write`/`Edit`/`Bash`）。派单里交给我的五件"核心职责"（`git diff --name-only`、逐个核对文件集、`git diff` 看 `ContentSnapshot.tsx`、复算测试计数、验基线取法）**有三件无法用 git 直接执行**。我没有假装执行，改用可核验的替代论据，并逐项标注哪些是"已闭合"、哪些是"未复算"。

已确认 `HEAD = 77fdf1a6c8bf498bf8dfa22aa9c02dc735859564`（`/Users/yuklimching/Desktop/StudyPilot/.git/refs/heads/agent/coordinator/TASK-043-reader-layout`），与冻结候选一致。

## 结论：**PASS，无阻断项**

14 条完成条件无一"不满足"；三处"同一形态问题"均已实质关闭；发现 8 项非阻断问题，其中 2 项是同形态残留（下详）。

## 一、五件机械核对的实际执行结果

### 1. 文件集枚举 —— **闭合（用替代论据，非 git diff）**

无法跑 `git diff --name-only`。改用一条**结构性论据**：字符串 `TASK-043` 在基线 `1e35843` 时不可能存在于任何文件里（该任务此后才登记）。全仓 grep `TASK-043` 命中 **20 个文件**，因此这 20 个**必定**在 `base..candidate` 内：

```
docs/tasks/任务索引.md, TASK-043-reader-toolbar.md, TASK-042-snapshot-rendering.md
styles.css, ResourceDetail.tsx, ContentSnapshot.tsx, LearningPanel.tsx
ResourcePages.test.tsx, ResourceDeletion.test.tsx, ResourceEditor.test.tsx,
FilePages.test.tsx, ClassificationPages.test.tsx, LearningPages.test.tsx
e2e/{reader-layout, learning-pages, resource-edit-pages, taxonomy-pages,
     notes-pages, resource-pages, file-pages}.spec.ts
```

加上两个新文件 `ResourceToolbar.tsx` / `ResourceToolbar.test.tsx`（新文件不需要写 TASK-043 字样，但必在 diff 内）= **恰好 22**，与记录中 `check_task.py` 报的 `files=22` 严丝合缝。**22 个全部落在 `allowed_paths` 内。**

授权范围两次修订：**如实记录、理由成立**。第 1 条（加五个测试文件）不新增任何产品范围，加进来的全是断言旧布局的测试；第 2 条（`ContentSnapshot.tsx` 由排除改为限定改动）的取舍我认同——`assertBelow` 守卫变红说明守卫起作用了，宁可放弃一个文件的零改动也不留一句指错方向的文案。两条都写在正文而非偷改 TOML，并已告知用户。

### 2. 六处"零改动" —— **五处闭合，一处需修正措辞**

| 文件 | 判定 | 依据 |
|---|---|---|
| `snapshotMarkdown.ts` | **零改动成立** | 不在 22 个文件内；内容核验 `RENDERER_OPTIONS = { html: false, linkify: false, breaks: false }`（:17）、`validateLink` 依据（:28）、`referrerpolicy=no-referrer`（:54）全部保持 TASK-042 形态 |
| `ResourceDeletion.tsx` | **零改动成立** | 不在 22 个文件内；`aria-label="删除资料"`、一次性令牌、`role="dialog"` 三步链路原样在位（:107/:75/:119/:143） |
| `ResourceTagEditor.tsx` | 零改动成立 | 同上；记录已更正初稿把 `<nav aria-label="资料标签">` 记到它头上的错误 |
| `FileOriginal.tsx` | 零改动成立 | 同上 |
| `ResourceEditor.tsx` | 零改动成立 | 同上 |
| `App.test.tsx` | 零改动成立 | 同上；`:97-105` 的 `it.each` 仍以 `/resources/synthetic-id` → `返回资料库` 守着加载态返回路径，正是抓到退化 1 的那条 |

**注意这一整块的论据链条依赖于"实现者报告的 `files=22` 属实"**——我无法独立重跑 `check_task.py`。但由于 20 个文件已被独立证明必在 diff 内，`files=22` 只剩两个名额，而那两个名额恰好被两个新文件占满，**没有任何空位留给第七个文件**。这比纯自述强得多，但不等于 git 级证明。

### 3. `ContentSnapshot.tsx` 的改动边界 —— **实质闭合，但记录的措辞比事实窄**

用内容核对（非 diff）确认**渲染、图片映射、blob 回收、`dangerouslySetInnerHTML` 均未被触碰**：
- `dangerouslySetInnerHTML` 仍在 `:240`，仍在 `.snapshot-body.snapshot-rendered` 上，依据注释与 `snapshotMarkdown.test.ts` 的绑定未变；全仓仅此一处。
- `loadFrozenImages` / `release()` / `useEffect` 清理里的 `URL.revokeObjectURL`（`:43`、`:128-131`）原样。
- `listFailed` 与 `failed` 两条知情提示（`:220-232`）原样。
- 五条方位文案确已改为"上方工具条"（`:57-59`、`:64-65`）。

**但改动不止五条文案**：`:52-55` 新增了一段四行中文注释（含 `TASK-043` 字样，故必为本次新增）。记录写的是"**该文件其余部分未动**"、"改动限定为三条 ready 文案 + 两条 empty 文案的方位词"，`ResourceDetail.tsx:67` 的注释同样写"只改了五条方位文案"。**这两句都比事实窄。** 见下方发现 B。

### 4. 计数复算 —— **e2e 逐条对上；frontend 未复算**

- **e2e 44：核对通过（我逐个数过）。** 源码里 `test(` 声明共 **41** 个，另有两处循环生成：`scaffold.spec.ts:90` `for (const width of [390, 320])` → 2 个，`resource-edit-pages.spec.ts:52` `for (const source of ['WEB','PASTE','FILE'])` → 3 个。**41 + 1 + 2 = 44**，与记录一致。`reader-layout.spec.ts` 是唯一新增的 1 条，净增 +1 成立。（`playwright.config.ts:20` 只有一个 chromium project，不存在倍数。）
- **frontend 512 / 494：未复算。** 无法跑 vitest，且 `it.each` 表格展开无法静态精确计数（22 个测试文件共 226 条顶层声明）。**可核验的一致性**：`ResourceToolbar.test.tsx` 恰有 **16** 条顶层 `it(`、`LearningPages.test.tsx` 恰有 **9** 条（含 `:171` "保存成功通知调用方" 与 `:189` "写失败不通知"），16 + 2 = **18**，与 512 − 494 = 18 完全吻合；且两个文件都无 `it.each`，所以这个吻合不是巧合。
- **基线取法（`50910fa` 与 `1e35843` 之间只有两个 docs 文件、`frontend/` 树逐字节相同）：未复算**，需要 git。这是 494/43 两个基线数字的唯一支撑，我无法独立确认。

### 5. `backend/**` 与 `extension/**` 零改动 —— **闭合（同 §1 的论据链）**

22 个文件全部在 `frontend/` 与 `docs/tasks/` 下，没有空位。`package.json` / 锁文件同理未变；另核：`ResourceToolbar.tsx` 只 import `react` 与 `react-router-dom`，未引入任何新依赖。

## 二、14 条完成条件逐条判定

| # | 判定 | 依据 |
|---|---|---|
| 1 正文是主体 | **满足** | `ResourceToolbar.test.tsx:55` 断言 `compareDocumentPosition` 而非"两者都在页面上"；`e2e/reader-layout.spec.ts:50-56` 同一形态 + `:59-61` 标题 `boundingBox().y < viewport.height` |
| 2 两层工具条常驻 | **满足**（修订合理） | `ResourceToolbar.test.tsx:64-79` 逐项断言六个控件 + 标签 nav + 保存原因。**去掉"心得数量"的修订成立**：取数要么进 `features/notes/**`（禁止范围），要么重复请求并维护第二份可能漂移的计数——推迟到本来就拥有心得数据的 TASK-044 是正确取舍，已如实记入条件正文与已知限制 2。轻微弱点见发现 H |
| 3 `⋯` 菜单 + 键盘 | **满足**（修订合理） | `ResourceToolbar.tsx:157-199`；`test:88-99`（Esc 关闭 + 焦点回触发按钮 + `aria-expanded` 翻转）、`test:180`（打开即入焦）、`e2e:78-84`（真实 Chromium 里 Enter 打开 / Escape 归还）。**修订成立**：替换/删除正文与看源码是 `ContentSnapshot` 的内部状态控件，提进菜单要重写该组件——而该文件正是本任务竭力不碰的那个；下载原件改成独立按钮（`原件`/`粘贴原文`/`原网页`）比埋进菜单更顺手，且已登记为已知限制 3 |
| 4 删除置底、分隔、危险样式 | **满足** | `test:109-135` 断言四个 `menuitem` 的精确顺序、`separator` 夹在第三项与删除之间、`toHaveClass('danger')`；`styles.css:2257/2263` |
| 5 三步流程一字未改 | **实质满足**，文档部分满足 | `ResourceDeletion.tsx` 零改动（§一.2）；`ResourceDeletion.test.tsx:57-62` 的 `openDeletion()` 只是**多一步入口**，`:80-94` 影响摘要由全页查收紧为 `within(dialog)` 查——是收紧不是放宽。**但记录全文没有一句对 `ResourceDeletion.tsx` 的 diff 说明**（零改动的事实只写在 `ResourceToolbar.tsx:228` 的代码注释里），条件 5 的文档要求未落到记录上。见发现 C |
| 6 改状态仍需明确选择 | **满足** | `test:188-197` 断言"学习后状态"下拉 + "保存学习记录"按钮都在（不是 hover/单击即写）；`LearningPanel.tsx:305-306` 只改初始展开状态；冲突处理由 `e2e/learning-pages.spec.ts:110` 那条既有用例守着，未改语义 |
| 7 标签与保存原因免点击可见 | **满足** | `test:64-79`、`test:81-86`（无标签/无原因的兜底文案）；`e2e:64-67` 在真实浏览器里 `toBeVisible()` |
| 8 `snapshotMarkdown.ts` 零改动 | **实质满足**，文档部分满足 | 结构性论据成立（§一.2）；`ContentSnapshot.tsx` 的四条"未被触碰"逐条核过（§一.3）。**扣分在文档**：记录第 190 行写"不在 **21** 个文件里"——21 是第三候选的陈旧数字，最终候选是 22（见发现 A）；且"改动限定于五条方位文案"窄于事实（发现 B）；条件要求的"文件清单"记录只给了数量与指纹，没给清单（发现 D） |
| 9 断言只增不减 | **满足**（基线数字未复算） | 候选侧一致性已验（净增 18 = 16 + 2）；`extension` 组零改动由文件集论据支撑；九条既有断言改动均为收紧或等强度（`ResourcePages.test.tsx:595-598` 的 `assertAbove` 与旧 `assertBelow` 强度相同：都把方位词与 DOM 顺序绑成一条）。基线 494/43 本身**未复算** |
| 10 e2e 覆盖新布局 | **满足** | 七个 e2e 文件已更新；新增 `reader-layout.spec.ts` 走真实后端建资料+标签+保存原因+正文，断言全部要求项。**`scaffold.spec.ts` 未改**——我核对过：它只在 `/resources/synthetic-id`（错误态，工具条不渲染）上取"返回资料库"（`:73-77`、`:98`），确实不依赖新布局，`ResourceDetail.tsx:44-48` 的无条件返回链接正好接住。合理，但记录没解释，见发现 E |
| 11 无障碍不退化 | **满足** | 全部按 `getByRole` + 可访问名称取控件，无 class 选择器；`role="menu"` / `aria-haspopup` / `aria-expanded` 齐备；`test:165-178` 把两处箭头钉成 `aria-hidden` 的真实元素。"徽章可由键盘操作"无显式键盘断言（它是原生 `<button>`），见发现 H |
| 12 不新增依赖 | **满足** | `package.json` / 锁文件不在 22 个文件内；新组件无新 import |
| 13 窄屏不崩 | **部分满足** | `e2e:87-91` 在 320/390/1440 断言 `scrollWidth <= innerWidth`；`styles.css:2160` 起全 `flex-wrap`，`:2290+` 640px 以下菜单退化块级。**"按钮不重叠""正文可读"只有截图，无机械断言**，见发现 G |
| 14 三种来源 + 各种空态 | **满足** | 无标签/无原因 `test:81`；PASTE `test:210`；FILE `test:219`；无快照 `ResourcePages.test.tsx:631-643` 的 `it.each` 覆盖三种来源；不安全原址 `test:227` |

## 三、三次"同一形态问题"是否实质关闭 + 残留

| 形态 | 关闭情况 |
|---|---|
| ① 断言绑在臆想字面量上（状态标签正则四选三错） | **已关闭**。`ResourceToolbar.test.tsx:48` 改为 `statusLabels.UNREAD` 取真值表，并把教训写在断言旁边。**有一处残留**：`e2e/learning-pages.spec.ts:12` 的 `/^(未开始|学习中|已完成|待复习|已归档) · \d+%$/` 仍是手写字面量（这次五个全对，但做法与单测已改的原则不一致）——最后一个手写点 |
| ② 安全形态的结构性论断在授权修订后变假 | **代码与索引侧已关闭**：`ResourceDetail.tsx:65-68` 已只对 `snapshotMarkdown.ts` 作论断；`任务索引.md:24` 状态改 `IN_ACCEPTANCE` 且范围声明已更正；上下文包（:141）、已知取舍 5（:152）、条件 3 均已扫净。**记录侧有同形态残留**：记录仍称 `ContentSnapshot.tsx`"其余部分未动"，而它另有四行新注释——"陈述比证据宽"，与 TASK-042 验收发现的第 3 条（TASK-040 记录改动多于自述）**完全同形态，隔一个任务原样复发**。见发现 B |
| ③ jsdom 与真实浏览器分歧 | **已关闭且处置得好**：伪元素改真实 `aria-hidden` 元素（`ResourceToolbar.tsx:97-100`）；外点归还焦点这条**没有靠推理定论，而是实测后删掉**（`:77-83` 记着 `activeElement` 是 `BODY`），断言改为"不抢焦点"（`test:152-163`），并把实测成立的 `Esc` 那支钉进真实浏览器（`e2e:75-84`）。**轻微残留**：条件 2 要求"可见（不是存在于 DOM 但被隐藏）"，而 jsdom 不加载 `styles.css`，`toBeVisible()` 只排除内联隐藏；真实浏览器里只覆盖了上下文层（`e2e:64-67`）与状态徽章（`file-pages.spec.ts:63` 顺带），操作层其余按钮的真实可见性无守卫 |

## 四、发现（无"必须修复"）

**可记录后继续（8 项）**

- **A.** 记录第 190 行"`snapshotMarkdown.ts` **不在 21 个文件里**"——21 是第三候选的基数，最终候选是 22（第 184 行自己写了 `files=22` 且说明第三轮多出 `LearningPages.test.tsx`）。条件 8 的结论成立，引用的清单基数陈旧。
- **B.** 记录称 `ContentSnapshot.tsx`"改动限定为三条 ready + 两条 empty 文案的方位词""该文件其余部分未动"，实际另有 `:52-55` 四行新注释；`ResourceDetail.tsx:67` 的代码注释同样这么说。与本任务反复引以为戒的形态相同。
- **C.** 条件 5 要求"在记录中给出 `ResourceDeletion.tsx` 的 diff 说明"，记录正文没有该文件的任何改动说明。`ResourceEditor.tsx`、`FileOriginal.tsx` 同样未在记录中声明零改动（`ResourceTagEditor.tsx`、`App.test.tsx` 有）。
- **D.** 条件 8/12 要求"以文件清单为证"，记录只给了 `files=22` 与指纹，未列出 22 个文件名。
- **E.** 条件 10 点名 `scaffold.spec.ts`，实际未改（核对后确认无需改），但记录未说明，读者会误以为漏项。
- **F.** 记录第 186 行断句错误：`用例数不变。，走真实后端`。
- **G.** 条件 13 的"按钮不重叠、正文可读"只有截图与 `scrollWidth` 守卫，无机械断言。
- **H.** 条件 11 的"学习状态徽章可由键盘操作"无显式键盘断言（它是原生 `<button>`，按可访问名称取到，实际成立）。

**可选建议（2 项）**

- `e2e/learning-pages.spec.ts:12` 的状态正则改为从 `statusLabels` 派生，闭掉形态 ① 的最后一个手写点。
- 在 `reader-layout.spec.ts` 里补一句对操作层按钮的真实浏览器可见性断言，把条件 2 的"可见"从 jsdom 语义抬到真实布局语义。

## 五、建议原样登记进 EVIDENCE 的非阻断遗留项

实现者已登记的 9 条（心得仍是长滚动 / 心得入口不带数量 / 替换正文等仍在正文区 / 进度条不再常驻 / 窄屏只保不崩 / `⋯` 无方向键模型 / 删除多一次点击 / DELETE 在途切面板仍会卸载且无用例 / 删除面板双虚线与标题重复）**建议原样保留**，另加本次验收新增：

10. **记录第 190 行的文件清单基数陈旧**（写 21，实为 22）；条件 8/12 要求的"文件清单"以计数与指纹替代，未列名。
11. **`ContentSnapshot.tsx` 的改动描述窄于事实**：除五条方位文案外另有四行新注释；`ResourceDetail.tsx:67` 同一说法。同 TASK-042 验收发现 3 的形态。
12. **`ResourceDeletion.tsx` / `ResourceEditor.tsx` / `FileOriginal.tsx` 的零改动未在记录正文声明**，条件 5 的文档要求未落地。
13. **`scaffold.spec.ts` 未改的理由未记录**（经验收核对：它只走详情页错误态，不依赖新布局）。
14. **`e2e/learning-pages.spec.ts:12` 仍以手写字面量匹配状态标签**，是形态 ① 的最后一处残留。
15. **条件 2 的"可见"在单测里是 jsdom 语义**（未加载样式表）；真实浏览器只覆盖上下文层与状态徽章，操作层其余按钮的真实可见性无守卫。
16. **验收侧的机械论据是替代性的，不是 git 级证明**：本次 Acceptance 运行器只有 `Read`/`Grep`/`Glob`，无 Bash。文件集、六处零改动、backend/extension 零改动均以"20 个文件含 `TASK-043` 字样必在 diff 内 + `files=22` 无空位"闭合，**依赖实现者报告的 `files=22` 属实**；**基线 494/43 及其"结构性取法"（`50910fa..1e35843` 只有两个 docs 文件）未复算**；frontend 512 未复算（e2e 44 已逐条对上）。若需 git 级确认，应由一个具备 Bash 的实例补跑 `git diff --name-only 1e35843..77fdf1a` 与 `check_task.py`。
<!-- EVIDENCE:END -->
