# TASK-081：PDF 阅读器并成一条顶栏，把竖直空间还给正文

```toml
schema_version = 2
id = "TASK-081"
status = "ACCEPTED"
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

- 实现 SHA：`ce6ac1a`（版式）、`4f16165`（用例），外加按草图调整标题/徽章顺序的一次提交。
- 命令与结果：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-081-pdf-reader-toolbar.md --worktree`
  → **CHECKS PASS**（5 条，frontend 组）。前端单测 **319 项**全绿（新增 5 条）。
  `npx playwright test e2e/pdf-reader.spec.ts` → **3 passed**（含「非 PDF 原件保持既有行为」）。

### 落点

1. **控件投递而不是状态上抬**（`PdfReader.tsx`）：页码/缩放/「适合宽度」用 `createPortal`
   投到顶栏的挂载点上，当前页、缩放、文档尺寸、滚动容器这些状态一行没动——TASK-073 的
   连续滚动与位置记忆逻辑因此完全没碰。新增可选 `toolbarSlot`，三态：不传＝控件留在原位
   （单测独立渲染走这条，**TASK-073 的既有用例一字未改**）、`null`＝挂载点还没挂上（首帧
   什么都不渲染，避免先画在原位再跳走）、元素＝投递过去。
2. **顶栏收下标题与来源徽章**（`ResourceToolbar.tsx` 的 `pdfMode`）：顺序按草图「标题 → 徽章」，
   `h1` 就长在顶栏里，路由焦点（`headingSlot`）随之落在这里；正文列不再渲染 `ReaderHeader`，
   全页仍然**只有一个 `h1`**（有断言）。
3. **「心得」「原件」在 PDF 页显示为文字**，非 PDF 页仍是图标按钮。
4. **高度不再用 `calc(100vh - 常数)`**：原来写死 `- 220px`。改为整条链
   （`.reader-pdf` → `.reader-body` → `.reader-main` → `.pdf-reader.in-toolbar` → `.pdf-reader-pages`）
   逐层 `flex: 1; min-height: 0`，**按剩余空间填满**。理由是顶栏在窄屏会换行变高，
   任何常数都会在某一档偏掉——旧的 220px 正是这么来的。

### 实测（真实 Edge，同一份资料 `18b37e2b-…`）

| 视口 | | 改前 | 改后 |
| --- | --- | --- | --- |
| 1440×720 | 顶部占用 | 213px（顶栏 57 + 标题块 64 + 控件条 44 + 间距） | **65px** |
| | PDF 可视高 | 500px | **647px（+29.4%）** |
| | 外层滚动条 | 有 | **无**（65 + 647 + 8 = 720，正好铺满） |
| 390×780 | PDF 区起点 | 240px | **159px** |
| | PDF 可视高 | 560px | **613px（+9.5%）** |
| | 外层滚动条 | 有 | **无** |

窄屏下顶栏本身从 57px 变成 151px（控件换行成三行），但**整体占用反而更小**——原来那 57px
之外还压着标题块与控件条。这一条当初是 TASK-052 的顾虑（窄屏顶栏曾达 123px），实测确认
换行后仍然划算；标题在 ≤640px 视觉隐藏（`h1` 留在 DOM 里），不让长文件名有机会再撑一行。

### 用例与变异验证

新增 5 条：顶栏装配（标题/徽章/页码/适合宽度在同一条、全页只有一个 `h1`、无 `.reader-header`）、
「心得」「原件」是文字、草图没画的学习状态与 `⋯` 仍在、以及**非 PDF 页（网页 / 非 PDF 文件）
逐项不变**。四个方向都做了变异验证：
- `pdfMode` 强制为 `false` → 前两条变红；
- `pdfMode` 强制为 `true` → 「非 PDF 页不受影响」两条变红。

### 与草图的两处有意出入（Review 可挑战）

1. **标题显示资料标题，不带 `.pdf`**：草图画的是 `Attention Is All You Need.pdf`。标题是用户能改
   的那个、也是资料库里显示的那个；来源徽章已经说明了它是文件，再缀扩展名是冗余。
2. **按钮文字是「原件」而不是草图的「下载原件」**：这个按钮点开的是原件面板（文件名、大小、
   状态、下载），不是当场开始下载。按草图写会让标签承诺一件它不做的事。
3. 附带一提：徽章文字是「文件」而非草图的「本地文件」。`sourceLabels` 是全站共用的（资料库
   列表也用它），为一处改它会让同一个概念在不同页面有两个名字——**不在本任务改**。

### 已知限制 / 未完成项

- **窄屏（≤640px）顶栏 151px**：控件确实多，三行是现状。整体仍优于改前，但若用户常在手机上读
   PDF，值得单开一个任务收敛（例如缩放折进一个下拉）。本任务不做。
- **面板展开时 PDF 整块暂时不可见**：顶栏面板（学习状态/编辑资料/编辑标签）展开后 `.reader-body`
   被压到 0（`flex: 1; min-height: 0` 的必然结果）。改前面板同样会把 PDF 顶出屏幕，不算退步，
   如实记一笔（第二轮 Review 建议）。
- **若有人把 `pdfOriginal` 改回 `item`，没有任何用例会红**（第二轮 Review 明确点出的剩余风险）。
   `PdfReader.test.tsx` 那条守的是组件内部依赖，覆盖不到父级这根线。登记为遗留，不在本任务补。
- **没有 WEB 资料的实机对照**：本机库里当前没有 WEB 资料，`非 PDF 页不受影响` 由单测（网页 +
   非 PDF 文件两种）与 e2e 的「非 PDF 原件保持既有行为」覆盖，未在真实浏览器里再看一眼网页资料页。
- 过程中一度读到「缩放显示 50%/210%」并当成自己改出的回归。随后连跑三次都是 100%，加日志确认
   `scale` 状态始终为 1，**故当时的读数不可复现，成因未查清**（怀疑与 Vite 热重载撞上有关，但没有
   证据，不下结论）。后来独立 Review 的 F1 暴露出 `fitWidth` 确有量错的问题——两者是否同源同样
   没有查证。如实记下，免得后人照着一个未证实的解释去找。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- **最终候选 SHA**：见下方「Review 之后的修正」末尾。首轮候选 `caa0743`。
- **Review（L2 独立只读，一轮）**：**CHANGES_REQUIRED**，两条必须修复，**都由实机实测确认成立**。

### Review 报告原文

> ## 结论：CHANGES_REQUIRED（2 条必须修复）
>
> **F1 类名撞车，顶栏/阅读区在宽屏被收窄居中（必须修复）**
> `ResourceDetail.tsx:436` 给 `section` 加的页级修饰类叫 `pdf-page`，与 `PdfReader.tsx:383` 每一页 PDF 的 `.pdf-page` **同名**。于是 `styles.css:3182-3189` 的裸选择器 `.pdf-page{display:flex;align-items:center;justify-content:center;…}` 也命中整张 sheet。`styles.css:3205-3210` 只覆盖了 `height/display/flex-direction/overflow`，**没有覆盖 `align-items`**。结果：`.resource-sheet.reader.pdf-page` 是 `flex-direction:column; align-items:center`，其子项 `.reader-toolbar`、`.reader-panel`、`.reader-body` 都按 fit-content 收缩并居中，而不是铺满视口宽。
> 影响两条：① 1440px 下顶栏只有内容宽（约 950–1000px）、居中，「← 返回资料库」不在最左——与草图和 TASK-052 口径都不符。② `PdfReader.tsx:240-246` 的 `fitWidth()` 取 `.pdf-reader-pages` 的 `clientWidth`，而该列现在是被内容撑出来的，于是 **「适合宽度」不再适合窗口宽度，每点一次反而略缩**。该行为在单测与 e2e 里**都没有守卫**，记录里「行为不变」是断言而非证据。
>
> **F2 `overflow:hidden` 把工具条面板剪掉且无法滚动（必须修复）**
> `styles.css:3205-3210` 给 sheet 加了 `height:100vh; overflow:hidden`。而顶栏面板是顶栏的**兄弟节点**，`.reader-panel` 没有 `max-height`/`overflow`。于是在 PDF 页上点学习状态徽章、`⋯ → 编辑资料 / 编辑标签` 时，面板超出视口的部分被剪掉且**鼠标/触控板无法滚动**（`overflow:hidden` 只允许程序化滚动），**「保存」按钮鼠标点不到**。改前页面随文档滚动，这些面板一律够得着，属本次新引入。记录里「外层滚动条消失」因此要改口径：不是内容正好放得下，是超出被剪掉了。
>
> ## 非阻断（建议顺手处理）
> - `ResourceDetail.tsx:340` `pdfOriginal` 取自 `item`，而 `item` 在每次 `refreshed()`→`retry()` 时被置空。于是保存学习记录、编辑标签等动作会让 `pdfMode` 与 `.pdf-page` **短暂翻回非 PDF 形态**，`PdfReader` 被销毁、回来重下重解析。改 `item` → `toolbarItem` 一行可解。
> - 失败分支早于 `tools` 返回，顶栏留下一个空的 `.reader-toolbar-pdf`，白吃一个 8px gap。
> - `height:100vh` 未用 `100dvh`，移动端浏览器地址栏会吃掉底部一截。
>
> ## 已核对通过的部分
> **非 PDF 未被改坏**：`pdfMode` 由 `Boolean(pdfOriginal)` 驱动，WEB/PASTE 在构造上到不了；新用例钉了两类，另有既有的读取中/失败、菜单/面板/心得展开、图标化反向守卫全部跑在非 PDF 资料上，**覆盖充分**。**`createPortal`**：三态判定严密，挂载点卸载最坏只是一帧投进已脱离文档的节点随即自愈，用 state 存节点不破坏 `memo`、无闭环。**多列形态**：PDF 页上目录栏恒不出现；心得两列在 `stretch` 下正常。**TASK-073 行为**：状态与算法一行未动，受影响的只有依赖布局宽度的 `fitWidth`（见 F1）。**数字自洽**，唯一要改写的是「外层滚动条消失」的成因。**无障碍**：`headingSlot` 仍落在唯一的 `h1` 上，窄屏 `clip-path` 隐藏与本仓既有做法一致。
>
> ## 剩余风险
> F1 的具体表现我**未能在真实浏览器里确认**（无 Bash）；请实现方按上面给的两项测量复核后再决定是改代码还是驳回该 finding。

### Review 之后的修正（均先实测复核，再动手）

**F1 成立，实测确认**（真实 Edge，1440×900）：顶栏宽 **950px、左边距 245px**（不是通栏），
`getComputedStyle(sheet).alignItems === 'center'`；点「适合宽度」**100% → 97% → 95%**，越点越小。
修法：页级修饰类从 `pdf-page` 改名为 **`reader-pdf`**（根治撞名，而不是补一条 `align-items` 覆盖）。
修后实测：顶栏 **1440px / 左 0**，`alignItems: normal`，「适合宽度」**100% → 219%，再点保持 219%**。
补了一条守卫用例钉住类名，变异验证：改回 `pdf-page` → 变红。

**F2 成立，实测确认**（1440×720）：点学习状态徽章后面板伸到 **1595px**、超出视口 875px，
「保存」按钮在 **981px** 处，`overflow: hidden` 下滚不过去。
修法：sheet 的 `overflow` 改为 **`auto`**（正常阅读时内容恰好铺满、仍不出滚动条；只有面板这类
超高内容才可滚）。修后实测：sheet 可滚 917px，滚动后「保存」按钮完整在视口内（顶 20 / 底 64）。
**记录里「外层滚动条消失」的口径按 Reviewer 的要求改正**：它指的是**正常阅读时**内容恰好铺满，
不是把超出的内容剪掉。

**三条非阻断项一并处理**：`pdfOriginal` 改用 `toolbarItem`（不再在刷新时把 PDF 卸载重下）；
`.reader-toolbar-pdf:empty { display: none }`（失败分支下空挂载点不占位）；`100vh` → `100dvh`。

修正后：`check_task.py` **CHECKS PASS**，前端单测 **320 项**，`e2e/pdf-reader.spec.ts` **3 passed**，
1440 与 390 两档的实测数字与上表一致（647px / 613px，均无外层滚动条）。

**未加专门用例的一项**：`pdfOriginal` 改用 `toolbarItem` 没有单独用例。它不是新行为——工具条本身
早就为「跨刷新活着」改用了 `toolbarItem` 并有既有用例守着，这次只是让 PDF 模式接上同一套机制。
如实写明，供 Reviewer 判断是否足够。
### 第二轮 Review（`caa0743..76420ac` 增量）：**PASS**。报告原文：

> ## 第二轮结论（覆盖新候选 `76420ac`）：PASS
>
> ① **修法恰当。** F1 选改名而非补 `align-items` 是更根治的一支：`.pdf-page` 裸规则里还有 `justify-content:center`、`box-shadow`，覆盖式修法得逐条追，改名一次断干净。F2 的 `overflow:auto` 在四种形态下我都过了一遍，没发现新问题：sticky 顶栏改为在 sheet 这个滚动盒内吸顶，面板滚动时仍常驻；`.reader-notes` 窄屏是 `position:fixed`，而 `overflow` 不创建 fixed 的包含块（只有 transform/filter/contain 才会），浮层仍贴视口、不随 sheet 滚走；宽屏 sticky 心得列同理正常；窄屏三行顶栏反而多了一条逃生通道（顶栏因缩放高过 100dvh 时现在滚得动，`hidden` 时会把 `⋯` 剪掉）。`ToolbarPanel` 的 `window.scrollTo` 在 PDF 页对不上真正的滚动容器，但面板一关内容缩回、UA 会把 `scrollTop` 钳回 0，不会把人留在半空。
>
> ② **选择器无遗漏。** `styles.css:3209/3219/3228/3233/3237` 五处全部改成 `.reader-pdf`，仓内再无 `.resource-sheet…pdf-page`；`PdfReader.tsx:383` 的每页类与 `PdfReader.test.tsx:79` 那条计数断言不受影响。新守卫用例方向正确，变异说明可信。
>
> ③ **`toolbarItem` 不加用例可接受。** 它不是新行为，而是接上那套已被既有用例守着的「跨刷新活着」机制，且方向是减少卸载。剩余风险如实说：将来若有人改回 `item`，没有任何用例会红。可作为非阻断遗留登记。
>
> ④ **两处文档尾巴（非阻断）：** `styles.css:3208` 注释仍写「只在 `.pdf-page` 下生效」，正好点着那个被禁用的名字；任务记录第 121 行的 flex 链条首节点同样还写着 `.pdf-page`。另有一个可记录的行为：面板展开时 `.reader-body` 被压到 0、PDF 整块暂时不可见，改前面板也会把它顶出屏幕，不构成退步，但值得在记录里留一句。记录把「缩放 50%/210%」改写成成因未查清，是正确的收口。
>
> 剩余风险：F1/F2 的修复效果我仍未能亲自在浏览器里复验（无执行权限），依据是你给出的实测数字与我对层叠/布局的复算，两者一致。

第二轮的四点建议全部照做：两处仍指着废弃类名的注释已改、两条遗留已登记（见下）。

### 最终状态 / 风险 / 用户操作

- **状态：ACCEPTED**，等待用户合并（只有用户本人可以合并）。
- **执行链已走完**（L2）：1 Worker（主 Agent 亲自实施）→ 自动检查 CHECKS PASS
  → 独立只读 Reviewer 两轮（首轮 CHANGES_REQUIRED，抓到两条**真缺陷**：类名撞车致顶栏收窄
  且「适合宽度」失准、`overflow: hidden` 致顶栏面板被裁剪且滚不过去；二轮 PASS）。
- **剩余风险**：① 窄屏（≤640px）顶栏 151px、控件三行，整体仍优于改前但不理想；
  ② 若有人把 `pdfOriginal` 改回 `item`，没有用例会红；③ 非 PDF 页「不受影响」由单测与 e2e 覆盖，
  未在真实浏览器里再看一眼网页资料页（本机库里当前没有 WEB 资料）。
- **需要用户做的事**：合并后在自己的 PDF 资料上看一眼——顶栏是否通栏、「适合宽度」是否真的贴合
  窗口、以及点开「未开始·0%」或 `⋯ → 编辑资料` 后能否滚到面板底部的「保存」。这三处正是两轮
  Review 抓到并修掉的地方。

### 非阻断遗留项

1. **窄屏顶栏 151px（三行）**：控件确实多。若日后常在手机上读 PDF，值得单开任务收敛
   （例如把缩放折进一个下拉）。
2. **`pdfOriginal` 改回 `item` 不会有用例报警**（第二轮 Review 指出）。
3. **面板展开时 PDF 整块暂时不可见**（`flex: 1; min-height: 0` 的必然结果，改前同样会被顶出屏幕）。
4. **`ToolbarPanel` 的 `window.scrollTo` 在 PDF 页对不上真正的滚动容器**（第二轮 Review 指出）；
   面板一关内容缩回、UA 把 `scrollTop` 钳回 0，不会把人留在半空，故不修。
5. **徽章文字是「文件」而非草图的「本地文件」**：`sourceLabels` 全站共用，不为一处改它。
6. **索引行未写**：TASK-080 仍未合并且持有 `docs/tasks/任务索引.md`，本任务的索引行并入下一个
   已授权任务的控制面提交（AGENTS.md §3/§5 与用户既定指令）。
- 日期与决定日志：2026-09-21 用户指出 PDF 阅读器与草图不符、要求按草图来 → 主 Agent 摆出三处差异
  并就「草图没画的学习状态与 `⋯`」提问 → 用户定案「都放在顶部工具条，主要是要给 PDF 留出阅读空间」
  → 实测量出顶部吃掉 213px / 视口 29.6% → 登记 TASK-081。
<!-- EVIDENCE:END -->
