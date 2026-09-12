# TASK-049：窄屏心得浮层改为视口定位（修 TASK-046 遗留 H）

```toml
schema_version = 2
id = "TASK-049"
status = "IN_REVIEW"
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

实现 SHA `2a4c44f`（`fix(frontend):`）+ 测试 SHA `8298d6b`（`test(frontend):`）。改动 **3 个文件**：

| 文件 | 改动 | 做了什么 |
| --- | --- | --- |
| `frontend/src/styles.css` | +16/−6 | 窄屏档 `.reader-notes`：`position: absolute; top: 6px` → `position: fixed; top: var(--reader-toolbar-h, 74px)`；删掉窄屏里已无消费者的 `.reader-body { position: relative }`；写明全宽外壳这个前提 |
| `frontend/src/features/resources/ResourceDetail.tsx` | +28/−2 | 浮层加 `ref`；展开时 `useLayoutEffect` 实测 `.reader-toolbar` 高度写进 `--reader-toolbar-h`，`resize` 时重测；不 setState |
| `frontend/e2e/reader-immersive.spec.ts` | +69/−21 | 新增 1 条阅读位置守卫；改写既有窄屏层叠用例的断言 |

### 实测数值（真实浏览器，逐档打印在测试输出里）

| 视口 | 顶栏高度 | 浮层 top | 让开的空白 | 浮层底边 |
| --- | --- | --- | --- | --- |
| 320×844 | **123px** | 123px | 0px | 视口内 |
| 390×844 | **123px** | 123px | 0px | 视口内 |
| 768×1024 | **75px** | 75px | 0px | 视口内 |

**≤640px 与 641–1279px 两档的顶栏高度确实不同（123 vs 75，差 48px）**，所以完成条件 5 那条「跟随实测」是被真正行使到的：写死 `74px` 会在 ≤640px 那一档把浮层顶边落到顶栏内部 49px 处（不透明顶栏会盖住「记录与理解 / 收起」）。`74px` 只作为变量写入前的兜底值。

### 检查（在候选内容上、干净工作区）

- `check_task.py --task … --worktree` → **CHECKS PASS**；`STATIC PASS base=1924717994632118e1c7af21b540742335ad9393`；`files=5`；`product_fingerprint=f29732e64bfc400de37097568bc68622d553b5a9d00abf2a0744f2262e5369d0`；`profiles=frontend`；5 项（format:check / lint / typecheck / test --run / build）**全部 exit=0**。
- `npx vitest run` → 23 文件 **548 通过**（与 TASK-046 合并后的基线相同，未增未减——本任务未加单测，样式与几何断言归真实浏览器）。
- `npm run test:e2e`（真实后端 + 真实浏览器）→ **55 passed**（基线 54，净增 1）。

### 判别性实验（证明新断言真的抓得住 H）

把窄屏浮层临时改回 `absolute; top: 6px`（**不**恢复 `.reader-body { position: relative }`，即锚点只可能更靠文档顶部，不会让失败更容易），仅跑 `reader-immersive.spec.ts`：

- 新增的阅读位置守卫**红**：`320px 下展开心得没有把阅读位置拽走`，`Expected <= 2, Received 6979`——**旧实现下阅读位置被拽走 6979px**，正是遗留 H 的实际后果。
- 改写的窄屏层叠用例**红**：`320px 下浮层顶边不高于顶栏底边`，`Expected >= 122, Received 6`（该用例同时打印 `[320px] 顶栏高 123px，浮层 top 6px`）。
- 同文件其余 4 条**绿**——失败不是整页崩掉，而是精准落在这两条判据上。
- 实验后从备份还原，`md5` 与实验前一致（`6432b911547be2561e87cf68242b2f8e`），随后重跑全量 e2e 得 55 passed。

### 既有断言的改动（逐条说明）

只动了 `frontend/e2e/reader-immersive.spec.ts` 的窄屏用例；`frontend/e2e/reader-notes-sidebar.spec.ts` 一字未改（它的窄屏断言只看宽度、`inert`、焦点，与定位方式无关，实测仍全绿）。

| 原断言 | 现在 | 为什么 |
| --- | --- | --- |
| 先按浮层的**文档位置**滚到它上沿 +100px | 删 | 视口定位后浮层的文档位置不再是「它出现在哪里」的量纲；且这条滚动本身就是为了让浮层与顶栏重叠 |
| 前提断言「浮层与顶栏按钮确有重叠」 | 换成「浮层顶边 ≥ 顶栏底边 − 1 且 ≤ 底边 + 8」 | 旧前提描述的正是被修掉的缺陷几何（浮层与顶栏重叠）；新断言直接表达目标不变量，**判别性更强**：改回旧 CSS 即红（见上，6 vs 122） |
| — | 新增「浮层四边都在视口内」 | 「视口定位」的字面含义，旧断言没有覆盖 |
| 顶栏「心得」按钮 `elementFromPoint` 为 toolbar；按钮可点（`aria-expanded` 变 true） | 保留 | 这是「用户屏幕上还有收起入口」的守卫，与定位方式无关，方向不弱化 |
| 窄屏 `overflowY=visible`、`scrollHeight-clientHeight ≤ 2`、18px、不横向溢出 | 保留 | 与本任务无关，未动 |

### 未执行

- `backend` 与 `extension` 检查组未跑：`base..candidate` 清单零 `backend/**`、零 `extension/**`、零 `package.json`/锁文件改动，按 §6「被测内容无变化不重复执行」。
- 真实读屏软件未实测（与 TASK-046 遗留 G 同类边界）。本任务未改任何 ARIA 语义或焦点归属，故未新增该项。

## 遗留与非阻断

1. **浮层打开期间顶栏若因 ⋯ 菜单展开而变高，实测值不会跟着更新**（只在展开时与 window `resize` 时重测），菜单会盖住浮层头部。该菜单变高属 TASK-046 验收登记的 **F7**（≤640px 菜单 `position: static` 且顶栏可高至 `min(70vh,560px)`），**本任务未修，也不假装修了**。重评触发条件：F7 被立项修复时，一并把测量改为 `ResizeObserver` 观察顶栏。
2. **`fixed` 依赖「阅读页是全宽外壳」**：已在 `styles.css` 注释里写明。若日后给阅读页加外壳留白，`left/right: 0` 会相对视口而不是正文列，需要改回按容器定位。属前提记录，非缺陷。
3. **未在真实读屏软件下验证**（承接 TASK-046 遗留 G，本任务未改语义故未新增证据）。
4. **完成条件 4 缺测试直证**（独立 Review F2，可选建议）：computed `position: fixed` / `max-height` / `overflow-y` / 浮层宽度对 `.reader-body` 都没有断言；「没变」目前由「hunk 之外未改」这一 diff 事实承载，而不是由断言承载。后续补一条 computed-style 断言即可。
5. **极矮横屏（如 568×320）浮层底边会越出视口**，固定定位下越出部分含内滚末端够不到（独立 Review F3）。相对修复前的 H 不是退化，且用户明确要求不改 `max-height`，故不在本任务修；若与 F7 一并立项，可考虑 `max-height: calc(100dvh - var(--reader-toolbar-h) - 8px)`。

<!-- EVIDENCE:BEGIN -->

## 状态与最终证据

**当前状态**：`IN_REVIEW`（L2 执行链：1 Worker → 自动检查 → 1 名独立只读 Reviewer 检查最终 diff → 主 Agent汇总；独立 Acceptance N/A）

- **冻结候选 = 本记录所在的提交。** §6 要求候选必须是「包含需求、实现与测试证据的已提交 SHA」，因此候选的 SHA 不能写在候选自己的正文里（自引用）。主 Agent 在派发 Review 时以精确 SHA 指名该提交；本节在拿到 Review 原文后把该 SHA 补记于此。
- 需求/实现/测试证据见上一节：实现 SHA `2a4c44f`、测试 SHA `8298d6b`，含 `CHECKS PASS`、`product_fingerprint=f29732e6…`、vitest 548、e2e 55 passed、判别性实验及其口径说明。
- 候选之后只允许更新本标记区与 `status`（§6）；写回提交与冻结候选的树差异**仅本记录文件一处**，实现与测试文件逐字节相同。

**独立 Review（L2，1 名独立只读 Reviewer，独立于实现者）**

- 被审候选：`698218dde4fc29aca5e8d6f0e0b151524a611a5b`
- 审查者工具面：仅 Read/Grep/Glob（无 Bash、无写工具），运行器层只读——**无法**自行执行 git/测试，故所有 SHA、指纹与测试计数由主 Agent 以文件形式提供，审查者按报告采信并在结论里明确声明「未独立验证」。
- 结论：**PASS**

报告原文：

> ## 结论：PASS
>
> **读过**：`/tmp/task049-review/product.diff`（全 210 行）、`manifest.txt`、`docs/tasks/TASK-049-narrow-notes-overlay.md`；候选内容下的 `frontend/src/styles.css`（2180-2345、2410-2610）、`frontend/src/features/resources/ResourceDetail.tsx`（全文）、`frontend/e2e/reader-immersive.spec.ts`（100-280）、`reader-notes-sidebar.spec.ts`（未改，抽查）、`frontend/src/App.tsx`（外壳）。
>
> **核对结论**
>
> - 包含块前提成立：全仓 `transform` 只落在 `.skip-link`/`.add-link`/`.sidebar-note`/`.note-pin`/`.journal-decoration`/`.washi-tape`/`.text-link .icon`/`.resource-more summary::before`/`.resource-card::before`，无一在 `.reader-notes` 祖先链；无 `filter`/`perspective`/`contain`/`will-change`；tsx 无内联相关样式。`.reader-body`/`.resource-sheet.reader`/`.workspace`/`.app-shell` 均干净。
> - 实测逻辑自洽：`useLayoutEffect` 仅在 `opening` 为真时挂 `resize` 并清理；写元素自身 inline 变量（同元素 `top` 可用），`useLayoutEffect` 保证首帧前写入，74px 只是兜底。让开量=实测顶栏高，故 5<6 的 z-index 不产生遮挡，足够。
> - 删 `.reader-body{position:relative}` 安全：该作用域内无其他绝对定位后代依赖它（`.reader-menu` 在 toolbar 内，`.notes-badge` 锚 `.reader-notes-toggle`）。
> - e2e 改写方向正确且不弱：被删的「确有重叠」前提描述的正是被修掉的缺陷几何（旧 CSS 下新断言 6 vs 122 必红）；`elementFromPoint`+真点击守卫保留。
> - 无未声明行为变化：hunk 之外未改，故 `max-height`/`overflow-y`/圆角/阴影/`z-index`/ARIA/`inert`/三种关闭路径全部原样。
>
> **Findings**
>
> 1. 记录 +/− 数与 diff 不符（可记录后继续）：`styles.css` 记 +22/−8，实际 hunk `@@ -2481,14 +2481,24 @@` 为 **+16/−6**；`ResourceDetail.tsx` 记 +30/−1，实际四个 hunk 为 **+28/−2**；`reader-immersive.spec.ts` 的 +69/−21 与 diff 一致。仅记录口径错，候选内容与修复不受影响。注意这些数字在 EVIDENCE 标记区之外，按 §6 想改需再出候选。
> 2. 完成条件 4 无测试直证（可选建议）：computed `position: fixed` / `max-height` / `overflow-y` / 浮层宽度对 `.reader-body` 都没有断言；我以 diff 证明前者未变（hunk 外即未改）、fixed 与整宽由几何断言+全宽外壳隐含。可留待后续补一条 computed-style 断言。
> 3. 矮视口剩余风险（可记录后继续，非退化）：`top=123px` + `max-height:78vh` 在极矮横屏（如 568×320）会让浮层底边越出视口，固定定位下越出部分含内滚末端够不到；测试只覆盖 844/1024 高。相对修复前的 H 不是退化，且用户明确要求不改 `max-height`，故非必须修复；建议与 F7 的 `ResizeObserver` 一并在后续考虑 `max-height: calc(100dvh - var(--reader-toolbar-h) - 8px)`。
>
> **本环境无法核实**：四个 SHA、`product_fingerprint`、vitest 548、e2e 55、实测 123/75px、判别性实验与 md5——均无 Bash/无执行，按报告采信，未独立验证。
>
> **下一步**：候选可接受；建议主 Agent 在汇总时知悉 F1/F3 的登记口径，F2/F3 转下个任务。

**主 Agent 对 findings 的处置**

| # | 处置 | 依据 |
| --- | --- | --- |
| F1 | **已改，出新候选**（本提交）。实测复核确认审查者正确：`git diff --numstat base 候选 --` 得 `styles.css 16/6`、`ResourceDetail.tsx 28/2`、`reader-immersive.spec.ts 69/21`。§6 允许修正记录口径，但该表在 EVIDENCE 标记区之外，故必须出新候选；本提交之后的候选由同一 Reviewer 增量确认（`previous_candidate..new_candidate`）。 | §6「任何……任务授权修订形成新候选，使旧结论不能直接代表新 SHA」 |
| F2 | **转下个任务**（可选建议，不阻断）。记录为遗留项 4。 | §6 不为可选建议阻断 |
| F3 | **转下个任务**（非退化，不阻断）。记录为遗留项 5；与 F7 同一批考虑。 | 相对修复前状态是净改善，非本任务引入的退化 |

**候选链条（最终）**

| 环节 | SHA |
| --- | --- |
| base | `1924717994632118e1c7af21b540742335ad9393` |
| 实现 | `2a4c44f` |
| 测试 | `8298d6b` |
| 记录/证据 | `e4806ee` |
| 被审候选（Review PASS 对应） | `698218dde4fc29aca5e8d6f0e0b151524a611a5b` |
| 处置 F1 后的新候选 | 见下方「增量确认」（同一 Reviewer 复核后补记） |

<!-- EVIDENCE:END -->
