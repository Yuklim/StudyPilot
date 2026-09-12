# TASK-049：窄屏心得浮层改为视口定位（修 TASK-046 遗留 H）

```toml
schema_version = 2
id = "TASK-049"
status = "IN_PROGRESS"
risk = "L2"
risk_reason = "改的是阅读页窄屏档**一处定位方式**，目的是修掉一个已登记的用户可见缺陷（TASK-046 遗留 H：滚到文章中部再展开心得，阅读位置被拽回文章开头）。影响面按实际判断：① 不改任何公共契约、接口调用、写入语义、数据含义与门禁；② 无障碍机器契约（三态唯一 `h1` 与路由焦点落点、`Esc` 归还焦点、窄屏展开时正文 `inert`、收起后焦点还给心得按钮）**全部不动**，且由既有的、本轮不改的 e2e 断言继续守着；③ 涉及真实浏览器的版式数值（`position`/`top`/`max-height`、滚动位置），jsdom 量不到，必须走 Playwright。④ 唯一的结构性新增是「实测顶栏高度写进 CSS 变量」，因为它决定浮层是否被不透明的 sticky 顶栏压住（顶栏 z-index 6 > 浮层 5），是本任务的功能前提而不是装饰。按规定 L2：1 Worker → 自动检查 → 1 名独立只读 Reviewer 检查最终 diff；独立 Acceptance N/A。不升 L3 的理由：无契约/接口/迁移/认证/关键数据模型改动，不跨模块（改动落在 `frontend/src/features/resources/ResourceDetail.tsx`、`frontend/src/styles.css` 与 e2e），也不是治理或门禁权限变更。"
risk_flags = ["business"]
owner = "coordinator"
base = "1924717994632118e1c7af21b540742335ad9393"
allowed_paths = [
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/reader-immersive.spec.ts",
  "frontend/e2e/reader-notes-sidebar.spec.ts",
  "docs/tasks/TASK-046-immersive-reader.md",
  "docs/tasks/TASK-049-narrow-notes-overlay.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

TASK-046 的独立 Integration/Acceptance 把 H 列为「合并前须向用户披露」，并在报告里写明修法与边界：

> **H — 窄屏滚动到文章中部再开心得浮层，阅读位置会被拽回文章开头。** 浮层是 TASK-045 的 `position:absolute; top:6px`，滚过约 670px 后再点「心得」，浮层整块落在视口上方，写作框 `focus()` 把页面滚了回去。**触发条件由本任务造成**（顶栏 sticky 化后「心得」在任意滚动位置都可点，此前够不到）……修法：窄屏档按视口定位并让开顶栏高度，另补一条「滚动后再开浮层」的 e2e。

主 Agent就「改成什么形态」提问并给出两项（A 视口定位、B 整屏面板），用户 2026-09-12 选定 **A（视口定位，保持现状）**，原话选项：

> A 视口定位（保持现状，推荐）：只修位置不修外观——`absolute` → `fixed`，让开顶栏高度。面板仍是正文整宽、最高 78vh、内滚。滚到文章中部再点「心得」，它就在眼前出现，阅读位置不丢。

**本任务只修「它出现在哪里」，不改「它长什么样」**：宽度、高度上限、内滚、圆角、阴影、`z-index`、关闭方式（顶栏「心得」按钮 / 面板内「收起」/ `Esc`）全部保持 TASK-045/046 的现状。

### 登记前对现状的核对（不是估算）

- `frontend/src/styles.css:2485-2499`：窄屏（`max-width: 1279px`）展开态是 `.resource-notes { position: absolute; top: 6px; left: 0; right: 0; z-index: 5; max-height: min(78vh, 640px); overflow-y: auto }`，包含块是同一媒体查询里的 `.reader-body { position: relative }`。
- 定位在**文档**里，而顶栏是 `position: sticky; top: 0; z-index: 6`（`:2187-2194`）：滚过浮层顶边之后展开，浮层整块落在视口上方，`NotesPanel` 的写作框 `focus()` 把页面滚回它那里——阅读位置丢失。**这是本任务要修的唯一缺陷。**
- 顶栏高度**不是一个常数**：`.reader-toolbar` 有 `padding: 9px …`，内容 `.reader-toolbar-buttons { min-height: 38px }`；`@media (max-width: 640px)` 里 `.reader-toolbar-buttons { margin-left: 0; width: 100% }`、`.reader-title { white-space: normal }`——**≤640px 顶栏会换行变高**。所以「让开顶栏」不能写死一个像宽屏档 `top: 74px` 那样的常量。
- 宽屏档（`min-width: 1280px`）的 `top: 74px`（`:2579-2584`）**本任务不碰**：那一档永远不会与 ≤640px 同时成立，常量在那里是对的。

### 目标

1. 窄屏展开心得浮层时，**阅读位置不丢**：页面不发生因 `focus()` 引起的滚动跳位（允许 ≤2px 的取整误差）。
2. 浮层出现在**视口内、顶栏下方**，且不与顶栏重叠（顶栏按钮始终可点、可被 `elementFromPoint` 判为最顶元素）。
3. 让开的距离**跟随实测顶栏高度**，在 ≤640px（顶栏换行变高）与 641–1279px 两档都成立。
4. 外观与现状一致：宽度仍是阅读区整宽、`max-height` 仍是 `min(78vh, 640px)`、仍有内部滚动、仍是圆角卡片 + 投影。
5. 既有行为零退化：TASK-045/046 的全部既有断言（窄屏不挤压正文 / `inert` / `Esc` 归还焦点 / 角标 / 草稿跨收起存活 / 四档不横向溢出 / 顶栏 sticky）保持通过，且**只增不减**。

### 非目标（明示不做）

- 不做整屏/模态面板（用户明确选了 A 而不是 B）。
- 不修 F7（≤640px ⋯ 菜单展开会把顶栏撑高，`position: static` 的菜单占位）。浮层打开期间若展开该菜单，菜单会盖住浮层头部——**这是 F7 的一部分，已在 TASK-046 的验收报告里登记为非阻断项**，本任务不顺手改（会扩大改动面并需要重新定菜单形态）。
- 不修 G（读屏播报未实测）、I（读取失败时替换令牌迟到重放）。
- 不改宽屏挤压态的任何行为与数值。
- 不引入新依赖、不改 `package.json` 与锁文件。

### 禁止范围

不改后端、`/api/v1`、openapi、契约文件、本机访问门禁、`extension/`；不动 `NotesPanel.tsx`（写作框的 `focus()` 行为保持原样——抖动来自浮层位置，不是聚焦本身）、`NotesPage.tsx`、`snapshotMarkdown.ts`、`ResourceDeletion.tsx`、`ContentSnapshot.tsx`、`ResourceToolbar.tsx`。

### 依赖/前置条件

- 基线 `1924717`（`origin/main`，含 TASK-046 merge `1924717` 与 TASK-048 的状态登记提交链）。**TASK-046 必须先合入**——H 是它引入的触发条件（顶栏 sticky 化）。已满足。
- 本地无需先跑迁移或改配置；e2e 自带真实后端与真实浏览器（前端 15173 / 后端 18000）。

### 并行

无。单写入者，串行。

## 关键设计决定

### ① 用 `position: fixed`，不用 sticky、不改整屏

- **sticky 不可行**：窄屏下 `.reader-notes` 在 DOM 里排在 `.reader-main` 之后，若改用 `position: sticky; top: <顶栏高度>`，它的常规位置在一篇几万字的正文**之后**，页面滚到浮层常规位置之前它根本不会被钉住——等于要求用户先滚到文末。
- **整屏是形态变更**：用户在两项里选了「保持现状的视口定位」，整屏面板（自带 ✕、撑满顶栏以下）会改变窄屏写作的观感，超出本次授权。
- `fixed` 的包含块是视口——除非祖先带 `transform`/`filter`/`perspective`/`contain`/`will-change`。登记前已核对：全文件无 `filter`/`perspective`/`contain`/`will-change`，`transform` 仅出现在 `.skip-link`、`.add-link`、`.text-link .icon`、`.resource-more summary::before`，**没有一个在 `.reader-notes` 的祖先链上**。

### ② 顶栏高度实测，不写死

`.reader-notes` 是 `.resource-sheet.reader` 的后代，顶栏也是；两者是**兄弟**，CSS 里拿不到对方的高度。因此在阅读页容器（`ResourceDetail`）里：展开时量一次 `.reader-toolbar` 的高度，写进浮层自己的 `--reader-toolbar-h`，CSS 用 `top: var(--reader-toolbar-h, 74px)`。

- **必须重测**：旋转/改窗口大小都会改变顶栏高度，所以在浮层展开期间挂 `resize` 监听重测；收起即卸载监听。
- **不写死 74px 的理由**：≤640px 顶栏换行后比 74px 高，写死会让浮层头部（「记录与理解 / 收起」）被不透明的顶栏压住——那正是本任务要避免的可见缺陷。`74px` 只作为变量尚未写入前的兜底值。
- **兜底方向要安全**：宁可让开多一点，也不要让浮层被顶栏盖住。

### ③ 只写 CSS 变量，不进 React state

布局度量写进元素样式（`style.setProperty`）而不是 `useState`：它不参与任何渲染结果，进 state 只会让每次 resize 触发整页重渲染，而正文子树是 memo 过的、重渲染成本高。

### ④ 连带移除 `.reader-body { position: relative }`

窄屏媒体查询里这一条当初只为给绝对定位的浮层当包含块。浮层改 `fixed` 后它没有别的消费者（`.reader-body` 内没有其它绝对定位子元素），留着会误导后来者以为还有东西挂在上面。删除并注明原因。

## 完成条件

1. **阅读位置不丢（H 的判别性守卫）**：真实浏览器，320×844 与 390×844 两档，先把页面滚到文章中部（`scrollY > 800`），再点「心得」展开；断言展开前后的 `scrollY` 差 ≤ 2px，**且**写作框确实拿到焦点（两者都要——只断言焦点会漏掉"焦点拿到了但页面被滚走了"）。断言必须在**展开前**先记录 `scrollY`，否则恒真。
2. **浮层在视口内且不压顶栏**：展开后 `.reader-notes` 的 `boundingBox()` 满足 `top >= 顶栏底边 - 1`、`bottom <= 视口高度 + 1`、`left >= -1`、`right <= 视口宽度 + 1`。
3. **顶栏按钮仍是最顶元素**：在浮层展开且页面停在文章中部时，对顶栏「心得」按钮的中心做 `elementFromPoint`，命中的元素属于 `.reader-toolbar` 而不是 `.reader-notes`（不允许被浮层盖住）。
4. **样式与现状一致**：`position` 计算值为 `fixed`；`max-height` 计算值 = `min(78vh, 640px)`；`overflow-y` 为 `auto`；浮层宽度与 `.reader-body` 宽度差 ≤ 2px（仍是阅读区整宽）。
5. **让开的高度跟随实测**：640px 以下（顶栏换行档）与 641–1279px 档各取一档实测，`浮层顶边 - 顶栏底边` ∈ [0, 8]px；两档的顶栏高度**确实不同**（若相同则该断言验不到"不写死"，要在记录里说明）。
6. **既有断言不退化**：TASK-045/046 的既有 e2e 与单测**全部保持通过**；因本任务改动而必须调整的断言逐条说明改了什么、为什么、新断言为何不弱于旧断言。特别地：窄屏「不挤压正文」「正文 `inert`」「`Esc` 归还焦点给心得按钮」「收起后草稿仍在」「320/390/768/1440 不横向溢出」「宽屏挤压 300–420px」六类断言必须原样通过且不被弱化。
7. **断言只增不减**：frontend 单测计数 ≥ 548、e2e 计数 ≥ 54（TASK-046 合并后的基线）。**不新增任何 e2e 用例来"替换"既有用例**——只允许新增（本任务预期新增 1–2 条：滚动位置守卫、窄屏浮层几何）。
8. **不新增依赖**，`package.json` 与锁文件不变。
9. **不动被排除的文件**：`base..candidate` 文件清单里不得出现 `NotesPanel.tsx`、`NotesPage.tsx`、`snapshotMarkdown.ts`、`ResourceDeletion.tsx`、`ContentSnapshot.tsx`、`ResourceToolbar.tsx`、`backend/**`、`extension/**`、`frontend/src/api/**`。以文件清单为证。
10. **记录如实**：说「修好」必须以断言与实测为据；测不到的部分（如真实读屏软件）如实标为未验证，不得用近似表述充数。

## 上下文包

- 规则：`AGENTS.md`、`frontend/AGENTS.md`、`docs/governance/风险分级与检查规则.md`。
- 必读源文件：`frontend/src/features/resources/ResourceDetail.tsx`（开合状态机、`opening`、`closeNotes`）、`frontend/src/styles.css`（`:2187-2194` 顶栏、`:2485-2499` 窄屏浮层、`:2579-2584` 宽屏常量、`:2327-2344` ≤640px 顶栏换行）、`frontend/e2e/reader-immersive.spec.ts`（用例 E 的窄屏层叠断言）、`frontend/e2e/reader-notes-sidebar.spec.ts`（窄屏不挤压 / `inert` / `Esc`）。
- 上游记录：`docs/tasks/TASK-046-immersive-reader.md` 的遗留 **H** 与验收报告原文；`docs/tasks/TASK-045-notes-sidebar.md` 的浮层形态来源。

## 已知取舍（登记时即知）

1. **浮层打开期间顶栏若因 ⋯ 菜单展开而变高，实测值不会跟着更新**（只在展开时与 window `resize` 时重测），菜单会盖住浮层头部。该菜单变高属 F7，已在 TASK-046 验收报告登记为非阻断项；本任务不修，也不假装修了。
2. **`fixed` 之后浮层的 `left/right: 0` 是相对视口**。当前阅读页是全宽外壳（`immersive` 下无左栏、`.workspace` 无内边距），与原先相对 `.reader-body` 的整宽在数值上一致；若日后阅读页加上外壳留白，这里需要改成按容器定位——在代码注释里写明这个前提。

## 实现与测试

（待写：实现 SHA、测试 SHA、改动清单、实测数值、未执行项与原因。）

## 遗留与非阻断

（待写：本任务产生的非阻断项与剩余风险。）

<!-- EVIDENCE:BEGIN -->

（待写：候选链条、检查证据、独立 Review 原文、状态决定。）

<!-- EVIDENCE:END -->
