# TASK-046：沉浸式阅读页 —— 外壳隐藏、正文 740px/18px、快照元信息下线

```toml
schema_version = 2
id = "TASK-046"
status = "IN_PROGRESS"
risk = "L3"
risk_reason = "本任务改的是**应用外壳自身的渲染条件**，不只是阅读器页内部版式。实质风险：① **外壳按页隐藏是一条新的全局机制**——`App.tsx` 在 `immersive` 页面上不渲染左侧导航、面包屑与页脚，导航（除返回链接外）在这一页整个消失；若返回链接或 `h1` 焦点落点在任一状态下缺失，键盘/读屏用户会被困在没有出口的页面上（屏幕上看不出来）。TASK-044 建立的「每种状态恰有一个 `h1` 且它是路由焦点落点」契约必须原样保持。② **工具条改为 sticky**：`.reader-menu`（绝对定位）与 `.reader-panel`（在流内）此前同在 `.reader-toolbar` 盒子里，sticky 化必须把面板移出 sticky 容器，否则学习状态/编辑资料/删除面板会跟着钉在顶部；层叠上下文还要与 TASK-045 的窄屏心得浮层（z-index 5）协调，否则浮层被顶栏盖住或反之。③ **销毁性动作换位置**：`删除正文` 从正文下方的直接按钮移进 ⋯ 菜单，进菜单后必须补一步确认——菜单项误触即不可逆删除是新引入的风险，原位置至少有正文作视觉隔离。④ **`ContentSnapshot` 的三个动作被上提为受控 props**（`showSource` 由父级持有、替换/删除走请求令牌），跨 `ResourceDetail`/`ResourceToolbar`/`ContentSnapshot` 三个组件的状态编排；`ContentSnapshot` 是全仓唯一使用 `dangerouslySetInnerHTML` 的文件。⑤ 正文列宽/字号改动会同时影响 TASK-045 的挤压式侧栏数值断言与 TASK-043/044 的「正文落在第一屏」断言，需真实浏览器复测。不改后端、`/api/v1`、openapi、本机访问门禁、`extension/`；**不动 `snapshotMarkdown.ts`（渲染与安全形态一字不改）**、`ResourceDeletion.tsx`、`NotesPanel.tsx`、`NotesPage.tsx`；不改任何写入语义与接口调用。"
risk_flags = ["business", "architecture"]
owner = "coordinator"
base = "194d77b8543ae67d05b3bcf396763d561dcb92ff"
allowed_paths = [
  "frontend/src/App.tsx",
  "frontend/src/App.test.tsx",
  "frontend/src/shell/pages.ts",
  "frontend/src/shell/ShellPages.test.tsx",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ResourceToolbar.tsx",
  "frontend/src/features/resources/ResourceToolbar.test.tsx",
  "frontend/src/features/resources/ContentSnapshot.tsx",
  "frontend/src/features/resources/ContentSnapshot.test.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/**",
  "docs/tasks/TASK-045-notes-sidebar.md",
  "docs/tasks/TASK-046-immersive-reader.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

### 用户授权

用户 2026-09-08（TASK-045 合并 PR #50 之后）提出三件事，原话：

> 我之前说的"阅读器上方的『正文快照 / 保存于 2026-09-07 · 共 48338 字 · 来源标识 manual · 第 1 版 / 这是保存当时的副本，不随原文更新；需要最新内容请用上方工具条的「原网页」。』"没有用，可以删掉"这个功能还没有做。我想要点开这个资料之后，显示的就是一个完整的阅读器页面，就像正常在网页中读文章一样。而不是阅读器镶嵌在页面中，这样很影响阅读。而且现在正文的字号有点小。

主 Agent 就四个分歧点提问，用户逐条选定（全部选中推荐项）：

1. **外壳全隐藏**：打开资料 = 独占整个窗口。左侧导航栏、顶部「我的学习空间 /」面包屑、底部页脚都不渲染，只保留一条极简顶栏（返回资料库 · 标题 · 心得 · 原网页 · ⋯）。
2. **正文居中固定阅读宽度 ≈740px**：窗口再宽也不拉长行（中文每行约 34–38 字）。
3. **正文字号 18px / 行高 1.8**（现为 12px）。
4. **「保存于…第 N 版」那段删掉**；正文底下现有的三个功能按钮（看 Markdown 源码 / 替换正文 / 删除正文）**收进顶部 ⋯ 菜单**，功能一个不少。

### 登记前对现状的核对（不是估算）

用户描述的"镶嵌感"在代码里有四层，全部核对过：

1. `App.tsx` 的外壳对每一页一视同仁：`.app-shell` 是 `228px + 1fr` 两列网格（`styles.css:69`），左侧 `.sidebar` 常驻，`main.workspace` 内先出 `.workspace-topbar`（面包屑，`margin-bottom:39px`）、末尾出 `.workspace-footer`。阅读器页只是被塞进这个 `workspace` 里的一个区块。
2. `.resource-sheet`（`styles.css:811`）是一张卡片：`padding:28px` + 1px 边框 + `border-radius:22px` + 纸色底。阅读器 `<section className="resource-sheet reader">` 用的就是它。
3. **正文自己还在第三层框里**：`.snapshot-body`（`styles.css:2077`）是 `max-height:420px; overflow:auto` 的独立滚动框，带边框与底色。整篇 48338 字被塞进 420px 高的小窗，页面滚动与正文滚动是两套。
4. `.snapshot-body { font-size: 12px }`——全站最小号。而 `.snapshot-rendered :is(h1)` 是 `1.15rem`（≈18.4px，rem 是根字号相对值），**正文里的小标题比正文本身大 50%**，层级关系是坏的。

元信息块在 `ContentSnapshot.tsx:186-204`：`<h3>正文快照</h3>` + 「保存于 … · 共 N 字 · 来源标识 … · 第 N 版」+ `snapshotHints[sourceType]`。TASK-043 只把句子里的方位词从「下方」改成「上方工具条」，**没有删**；用户这次是第二次提出。

工具条现状（`ResourceToolbar.tsx:110-195`）：`.reader-toolbar` 一个盒子里装了两层（动作层 + 上下文层）、`.reader-menu`（`position:absolute`，相对它定位）与 `ToolbarPanel`（`.reader-panel`，**在流内**）。`.reader-panel` 在流内这一点决定了「整个工具条 sticky」是错的做法。

心得侧栏（TASK-045）现状：`.reader-body` 是网格，`.reader-main` 为正文列、`.reader-notes` 为心得列；≥1280px 展开为 `minmax(0,1fr) 340px`，<1280px 展开为盖正文的绝对定位浮层（`z-index:5`），窄屏展开时 `.reader-main` 带 `inert`。既有 e2e `reader-notes-sidebar.spec.ts` 量的是 **`.reader-main` 的宽度**（让位 300–420px）。

### 目标

1. **`/resources/:resourceId` 变成沉浸式整页**：左侧导航栏、顶部面包屑、底部页脚在这一页不渲染；页面唯一的常驻出口是顶栏里的「返回资料库」。机制做成外壳的一个页面标志（`ShellPage.immersive`），与 `ownHeading` 同类，不为这一页写特例分支。
2. **顶栏 sticky**：动作层（返回 · 来源徽章 · 标题 · 学习状态 · 心得 · 原网页 · ⋯）钉在窗口顶部，长文滚到任何位置都够得着「心得」与「返回」。上下文层（标签 + 收下它是因为）与面板不 sticky，随正文滚走。
3. **正文是页面自己的滚动主体**：`.snapshot-body` 的 `max-height`/`overflow` 与框线底色去掉（渲染视图），整页只有一条滚动条。Markdown 源码视图（`<pre>`）保留自己的框，它是代码不是文章。
4. **正文列宽 ≈740px 居中**，字号 **18px / 行高 1.8**，`.snapshot-rendered` 内的 h1/h2/h3 改用 `em` 相对正文取值，恢复「小标题大于正文、但不喧宾夺主」的层级。
5. **删除快照元信息**：`<h3>正文快照</h3>`、「保存于…第 N 版」、`snapshotHints`（三条来源相关提示句）全部不再渲染。`emptyHints`（还没有保存正文时的空状态引导）**保留**——它是引导而不是元信息。
6. **三个正文动作移进 ⋯ 菜单**，功能不减：「看 Markdown 源码 / 看渲染后的正文」（切换，菜单项文案随状态变）、「替换正文 / 粘贴正文」（按是否已有快照变文案）、「删除正文…」（放进菜单底部的销毁区，**新增一步确认**）。
7. 保持 TASK-043/044/045 已建立的契约：每种状态（读取中 / 读取失败 / 正常）恰有一个 `h1` 且它是路由焦点落点；三条返回路径可用；图标按钮可见文本为空、名字由 `aria-label` 提供；心得侧栏的开合、聚焦、Esc 归还、角标、草稿存活全部不退化。

### 非目标（明示不做）

- **不改任何写入语义与接口调用**：快照替换/删除、心得、标签、学习状态、资料删除的请求、版本与恢复流程一字不改。
- **不动 `snapshotMarkdown.ts`**：`html: false`、无消毒器、图片三条去向（已冻结 / 未冻结按原址 / 被拒）全部保持，本任务不进那个文件一个字符。
- **不做字号调节控件**（用户选定固定 18px）、**不做宽/窄切换**（用户选定固定 740px 居中）、**不做滚动时自动隐藏顶栏**。
- **不做正文批注/选中记心得**（TASK-043 起记为后续能力）。
- **不把沉浸态扩展到别的页面**：`/capture`、资料库、心得页等外壳照旧。
- **不改左栏折叠能力本身**：它在其余页面继续可用（`reader-layout.spec.ts` 那条折叠用例本来就跑在 `/resources`，不受影响）。
- 不改后端、`/api/v1`、openapi、门禁、`extension/`、`docs/contracts/**`；不新增依赖。

### 禁止范围

所有未列入 `allowed_paths` 的路径；额外禁止：`backend/**`、`extension/**`、`docs/contracts/**`、`frontend/src/features/resources/snapshotMarkdown.ts`、`frontend/src/features/resources/ResourceDeletion.tsx`、`frontend/src/features/notes/NotesPanel.tsx`、`frontend/src/features/notes/NotesPage.tsx`、`frontend/src/api/**`、`scripts/governance/**`、`AGENTS.md`、`docs/governance/**`。

### 依赖/前置条件

基线 `194d77b8543ae67d05b3bcf396763d561dcb92ff`（main，TASK-048 已合并 = 用户合并 PR #53）。

**基线变更记录**：登记时基线为 `f60914545ceb04f8c2f4257a047ecd07419f3fb4`（TASK-045 合并点）。该分支在实现与自检完成后、独立 Review 开始前落后 main 两个任务，于 `79a615c` 把 main（含 TASK-047 仓库公开门面、TASK-048 文档脱敏）并入本分支，base 随之更新为并入后的 main。更新 base 是**为了如实反映任务自身差异**：合并后 main 是 HEAD 的祖先，`base..HEAD` 正好等于本任务的 15 个文件；沿用旧基线会让 TASK-047/048 的文档改动混进本任务范围（`check_task.py` 会据此判 out of scope，见下方检查记录）。`allowed_paths` 未改。无未合并依赖。

### 并行

否。唯一写入者 `coordinator`。

### 顺带完成的状态登记

TASK-045 记录与 `任务索引.md` 的该行：按根 `AGENTS.md` §5 登记用户 2026-09-08 合并 PR #50（merge commit `f609145`）这一事实，状态 ACCEPTED → **MERGED**。只允许改动 TASK-045 的 `status` 与 EVIDENCE 标记区内「状态决定」那一行及其索引行，不改目标/风险/路径/检查/实现与测试记录。（该登记已作为本分支第一个提交 `10cb689` 落地。）

## 关键设计决定

### ① 外壳隐藏做成页面标志，不做路由特例

`ShellPage` 增加可选 `immersive?: boolean`，`/resources/:resourceId` 置为 true。`App.tsx` 据此**不渲染** `.sidebar`、`.workspace-topbar`、`.workspace-footer`，并给 `.app-shell` 加 `immersive` 类（单列网格、`max-width` 放开）。

为什么不把这条路由挪到 `App` 之外单独渲染：`App` 同时持有路由切换后的**焦点权威**（`registerHeading`／`wantFocus`／`focusedForRoute`）、`ErrorBoundary` 之下的 `Screen` 分发、`document.title` 维护与 `#main-content` 跳转目标。挪出去等于把这四样各复制一份，而 TASK-044 的教训正是「焦点权威只能有一个」。**保留 `main#main-content` 与跳过导航链接**：链接在沉浸页没有导航可跳过，但它是全局的、不针对这一页，删掉会动到其余页面的无障碍行为——留着，且它仍指向真实存在的 `main`。

**出口只剩一个**，所以「返回资料库」在**每一种状态**下都必须在：读取中、读取失败由 `ResourceDetail` 自己渲染（现状已如此），正常态在工具条里（现状已如此）。这条写进完成条件并由用例守。

### ② sticky 只钉动作层：`.reader-toolbar` 拆成两个兄弟

现状 `.reader-toolbar` 一个盒子装了动作层 + 上下文层 + 菜单 + 面板。若整盒 sticky，`.reader-panel`（在流内的学习状态/编辑资料/删除面板）会跟着钉在顶部、把半个窗口占掉。

因此 `ResourceToolbar` 改为返回**片段**：

- `<div className="reader-toolbar">`：只含动作层与 `.reader-menu`（菜单仍相对它绝对定位）。`position: sticky; top: 0; z-index: 6`——**必须高于心得浮层的 5**，否则窄屏展开心得时浮层会盖住顶栏，而顶栏上那个「心得」按钮正是 Esc 之外的收起入口。
- `<div className="reader-context">`（上下文层）与 `.reader-panel` 移到 sticky 盒之外，随正文滚走。

**上下文层进正文列**：标签与「收下它是因为」是这篇文章的元信息（等同署名行），放进 `.reader-main` 内、正文之上，才能与 740px 正文列左右对齐；留在外面会在心得侧栏展开时与正文错位。它由 `ResourceToolbar` 导出的 `ReaderContext` 组件渲染，`ResourceDetail` 放进 `.reader-main`。DOM 顺序变化但内容与可访问名称不变（`navigation[name=资料标签]`、「收下它是因为」文本照旧）。

### ③ 740px 的帽子戴在正文块上，不戴在 `.reader-main` 上

`.reader-main` 仍是网格列、仍占满可用宽度；`max-width: 740px; margin-inline: auto` 加在其内部的正文块上。两个理由：

1. TASK-045 的挤压断言量的就是 `.reader-main` 的宽度（让位 300–420px）。帽子戴在 `.reader-main` 上会让它恒为 740px，那条断言变成恒 0，**既有守卫会被这次改动悄悄废掉**。
2. 1440px 下开心得侧栏后左列仍有约 1000px > 740px，**正文一个字都不用重排**——读到一半点开心得，文字不跳，这比"挤压"本身更值钱。只有窗口窄到左列 < 740px 时正文才真正变窄（`minmax(0,1fr)` 自然处理）。

### ④ 三个动作上提为受控 props，请求用单调令牌（沿用 TASK-045 的形态）

`ContentSnapshot` 继续持有快照数据、版本、请求与编辑表单本体；被上提的只是**触发与状态显示**：

- `showSource: boolean`（受控 prop，父级持有）——菜单项文案要随它变，状态必须在能看见菜单的那一层。组件内原 `useState` 与那个 `.text-link` 切换按钮一并移除。
- `editRequest?: number` / `deleteRequest?: number`——单调递增令牌，同一令牌只消费一次（`lastEditRequest`/`lastDeleteRequest` ref）。这是 TASK-045 `focusRequest` 踩过坑之后的定型写法：不用布尔，否则父级任何一次重渲染都可能重放动作。
- `onSnapshotState?: (state: { exists: boolean }) => void`——回传"这份资料有没有快照"，菜单据此在「替换正文/粘贴正文」之间取文案、并决定是否渲染「删除正文…」。

**新增 props 全部可选**，`ContentSnapshot` 的其它用法（若有）不受影响。

### ⑤ 「删除正文」进菜单必须补确认

现状是正文下方一个直接按钮，点了就删（`run(() => deleteResourceSnapshot(...))`），没有确认。移进 ⋯ 菜单后它与「编辑资料/编辑标签/资料信息」只隔一条分隔线，**误触成本变高而视觉隔离变少**，所以补一步确认：菜单项文案带省略号（「删除正文…」，与既有「删除资料…」一致），点击后由 `ContentSnapshot` 在正文位置渲染一个确认块（说明不可撤销 + 「确认删除正文」/「取消」）。

确认块渲染在 `ContentSnapshot` 内而不是菜单浮层里，是 TASK-043 已经付过学费的形态：确认 UI 嵌在浮层里时，点浮层外面一下就会把进行中的请求连同状态一起卸载掉。

### ⑥ 字号层级用 `em` 而不是 `rem`

`.snapshot-body` 18px 之后，`.snapshot-rendered :is(h1/h2/h3)` 改用 `em`（相对正文），使小标题恒定为正文的固定倍数。现状用 `rem` 导致 12px 正文配 18.4px 小标题——正文一变大，层级就得重算一次，这是 bug 而不是取舍。

## 完成条件

1. **沉浸态成立**：`/resources/:id` 上左侧导航（`complementary[name=学习空间导航]`）、面包屑「我的学习空间」、页脚「为每一次认真学习，留一页空白。」**都不在文档里**（`toHaveCount(0)`），而在 `/resources`、`/`、`/notes` 上照旧存在。单测 + 真实浏览器各一。
2. **出口在每一种状态下都在**：读取中、读取失败、正常三态都能按可访问名称取到「返回资料库」并真的回到资料库。三态各一条断言。
3. **焦点契约不退化**：三态各恰有一个页面级 `h1`（工具条里的资料标题 / 占位标题），路由切换后它拿到焦点；`App.test.tsx` 三条返回路径用例保持通过且不弱化。
4. **元信息已下线**：页面上不再出现「正文快照」标题、「保存于」「来源标识」「第 1 版」、以及三条 `snapshotHints`（"这是保存当时的副本…"等）。断言按文本 `toHaveCount(0)`，且**同时断言正文本身仍在**（避免在"正文根本没渲染"的状态上空过）。空状态引导 `emptyHints` 仍在（无快照时）。
5. **三个动作在 ⋯ 菜单里可用且真的生效**：
   - 「看 Markdown 源码」→ 出现源码视图（`<pre>` 里是原始 Markdown），菜单项文案变为「看渲染后的正文」，再点回到渲染视图；
   - 「替换正文/粘贴正文」→ 打开正文编辑表单（`form[name=正文快照编辑]`），文案随有无快照变化；
   - 「删除正文…」→ 先出确认块，点「确认删除正文」才真的删（走真实后端的 e2e 验证快照确实没了），点「取消」不删。无快照时菜单里没有这一项。
6. **正文字号与行宽**：真实浏览器实测 `.snapshot-rendered` 的 `font-size` = 18px、`line-height` ≈ 32.4px（1.8）；正文块渲染宽度 ≤ 740px（1440px 视口下取实测值记录）；正文块在可用列内水平居中（左右余量差 ≤ 2px）。
7. **整页只有一条滚动条**：`.snapshot-body` 不再有内部滚动（实测 `scrollHeight <= clientHeight + 2`，或 `overflow` 计算值为 `visible`），长正文由页面滚动承担。1440 与 390 两档实测。
8. **顶栏 sticky 且不被心得浮层盖住**：长正文滚动 600px 后，「心得」与「返回资料库」仍在视口内（`boundingBox().y` 在视口内且 < 顶栏高度）；窄屏（390px）展开心得浮层时，顶栏的心得按钮仍可见可点（实测 z 序）。
9. **心得侧栏不退化**：TASK-045 的既有 e2e（宽屏挤压数值、角标 2→3→2、草稿跨收起存活、窄屏浮层不挤压 + `inert` + Esc 归还焦点）**全部保持通过**；因本任务改动而必须调整的断言逐条说明改了什么、为什么、新断言为何不弱于旧断言。
10. **正文优先不回归**：1440×900 与 390×844 两档、默认收起态，正文首个标题 `boundingBox().y < 视口高度`（真实浏览器，显式设视口）。
11. **不横向溢出**：320 / 390 / 768 / 1440 四档，`documentElement.scrollWidth <= innerWidth`；心得展开与收起两态都测。
12. **既有断言只增不减**：三组测试（frontend 单测 / e2e / extension）计数只增不减，`extension` 组与基线完全一致（基线：frontend 539、e2e 49）。
13. **不新增依赖**，`package.json` 与锁文件不变。
14. **不动被排除的文件**：`base..candidate` 文件清单里不得出现 `snapshotMarkdown.ts`、`ResourceDeletion.tsx`、`NotesPanel.tsx`、`NotesPage.tsx`、`backend/**`、`extension/**`、`frontend/src/api/**`。以文件清单为证。

## 上下文包

- 规则：`AGENTS.md`、`frontend/AGENTS.md`、`docs/governance/风险分级与检查规则.md`。
- 必读源文件：`frontend/src/App.tsx`（外壳与焦点权威）、`frontend/src/shell/pages.ts`（`ownHeading` 先例）、`frontend/src/features/resources/ResourceDetail.tsx`（容器、心得开合状态机）、`ResourceToolbar.tsx` + `.test.tsx`（两层结构、菜单、面板、图标化约束）、`ContentSnapshot.tsx` + `.test.tsx`（元信息、三个动作、快照数据与版本）、`frontend/src/styles.css`（`.app-shell`/`.workspace`/`.resource-sheet`/`.snapshot-body`/`.reader-*`/断点）、`frontend/e2e/reader-layout.spec.ts`、`reader-notes-sidebar.spec.ts`、`snapshot-rendering.spec.ts`。
- 契约：无需改动。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-046-immersive-reader.md --worktree`（预期只选中 `frontend` 组）。

## 已知取舍（登记时即知）

1. **沉浸页没有全局导航**：去别的页面必须先「返回资料库」（或用浏览器后退）。这是用户明确选定的形态；顶栏 sticky 使这个出口始终可达，是接受该取舍的前提。
2. **顶栏常驻占用约 56px 竖直空间**：换来长文里「心得/返回」随时可点。不做"滚动时自动隐藏"（需要滚动方向状态机与动画，收益不抵本任务的复杂度）。
3. **740px 固定不可调**：超宽屏两侧留白较多；用户选定固定宽度而非宽窄切换。
4. **上下文层（标签/收下它是因为）现在会随正文滚走**：它不再常驻。TASK-043 曾把"不用点任何东西就看得见"作为要求——本任务下它在页面顶部初始可见，滚动后隐去；这是"读文章"形态的直接后果，登记为已知变化。
5. **`删除正文` 多了一步确认**：比现状多一次点击。这是它从正文下方进入菜单后的必要补偿。
6. **正文里 Markdown 自带的 `# 一级标题` 仍会渲染成 `h1`**（现状即如此，`reader-layout.spec.ts` 正是按它取元素），因此文档里可能同时存在页面 `h1` 与正文 `h1`。本任务不改这一现状（属 `snapshotMarkdown.ts` 的降级策略，在禁止范围内），完成条件 3 只约束**页面级** `h1`。登记为遗留。

## 实现与测试

实现 SHA：`b592a1a`（实现）+ `a244d6e`（测试）。冻结候选 `83cc3e4` 的 `base..candidate` 共 **15 个文件**，全部落在 `allowed_paths` 内：**13 前端**（App.tsx / App.test.tsx / shell/pages.ts / ResourceDetail.tsx / ResourceToolbar.tsx + .test.tsx / ContentSnapshot.tsx + .test.tsx / ResourcePages.test.tsx / styles.css + e2e 3 件，含新增 `reader-immersive.spec.ts`）+ **2 docs/tasks**（本记录、任务索引行）。

**更正（Reviewer R1 finding 1）**：此处初版写的是「`base..a244d6e` 共 16 个文件…+ 3 docs/tasks」，包含 `docs/tasks/TASK-045-notes-sidebar.md`。该文件是本分支在实现期登记 TASK-045 合并态（PR #50 / `f609145`）时改的；main 上已由 `task-status-t045-merging`（`a4a244f`）独立登记同一事实，分支并入 main 后两边逐字一致，**它因此不再出现在本任务的差异里**，文件数由 16 变 15、docs 由 3 件变 2 件。base 前移后「`base..a244d6e`」也不再是有效范围，原句已按实测改正。被排除的 `snapshotMarkdown.ts`、`ResourceDeletion.tsx`、`NotesPanel.tsx`、`NotesPage.tsx`、`backend/**`、`extension/**`、`frontend/src/api/**` 一个都没出现。生产构建经 check_task 内置 `npm run build` 通过。

**变更摘要**

- `shell/pages.ts`：`ShellPage` 增可选 `immersive`，`/resources/:resourceId` 置 true；注释把代价写进契约（置 true 的页面必须每种状态都有真实可用的返回链接）。
- `App.tsx`：`immersive` 页不渲染 `.sidebar`、`.workspace-topbar`、`.workspace-footer`，`.app-shell` 加 `immersive` 类。**跳过导航链接与 `main#main-content` 保留**——它是全局的，为一页删掉会动到其余页面。焦点权威（`registerHeading`/`wantFocus`/`focusedForRoute`）一行未动。
- `ResourceToolbar.tsx`：改返回片段。`.reader-toolbar` 只留动作层与 `.reader-menu`（sticky），`ToolbarPanel` 移到它之外；上下文层拆成导出的 `ReaderContext`。菜单新增三项：源码切换（受控文案）、替换/粘贴正文（文案随 `snapshotExists`）、销毁区里的「删除正文…」（无正文时与源码切换一并不渲染）。`runFromMenu` 负责关菜单并把焦点还给 `⋯`（「替换正文」除外——写作框 `autoFocus` 会接住）。
- `ResourceDetail.tsx`：新增 `showSource`/`editRequest`/`deleteRequest`/`snapshotExists` 四个状态与四个 `useCallback`（回调必须稳定，否则 memo 过的正文子树每次工具条状态变化都重渲染）；`ReaderContext` 放进 `.reader-main` 正文之上；**Esc 守卫改认 `.reader-toolbar, .reader-panel`**（面板搬家后旧守卫会漏）。
- `ContentSnapshot.tsx`：删除 `<h3>正文快照</h3>`、元信息行与三句 `snapshotHints`；`showSource` 改为受控 prop，内部 state 与那个 `.text-link` 切换按钮移除；正文底部的两个动作按钮移除，**空状态保留一个「粘贴正文」就地入口**；新增删除确认块（容器 `tabIndex=-1` 并在打开时聚焦，使焦点不停在删除按钮上；读屏在此播报的是容器的 `aria-label`「删除正文确认」，容器内那段说明文字是否随之读出**未经验证**——见遗留 G）；编辑表单改为**顶掉正文**而非排在其后；错误提示上移到区块顶部。两个请求令牌在**渲染期**消化（`react-hooks/set-state-in-effect` 禁止在 effect 里 setState，且这是 React 官方「props 变了顺手调整 state」的写法，`ResourceDetail` 里已有同形态先例），**令牌在真正动手之后才记为已消费**，正文还在读取途中点「替换正文」不会把请求烧掉。
- `styles.css`：`.app-shell.immersive` 单列 + 纸色底 + `.workspace` padding 归零（特异度高于各档媒体查询里的 `.workspace`，各档一并让位）；`.resource-sheet.reader` 去掉卡片外框并定义 `--reader-measure: 740px` / `--reader-pad`（760/360 两档收窄）；`.reader-toolbar` sticky（`z-index: 6` > 心得浮层的 5）；`.reader-title` 单行省略（≤640px 放开，那一档按钮本来就换行）；`.reader-context` 与 `.resource-snapshot`、`.reader-panel` 戴 740px 帽子并居中；`.snapshot-rendered` 脱框、18px/1.8、段落与列表间距、标题层级改 `em`；`.snapshot-body` 明确只服务源码 `<pre>`；新增 `.snapshot-confirm`；宽屏心得列 sticky `top` 让开顶栏。

**为什么 740px 的帽子不戴在 `.reader-main` 上**：`.reader-main` 是心得两列网格的第一列，TASK-045 的挤压断言量的正是它的宽度；钉成 740px 会让那条既有守卫变成恒等式而**悄悄失效**。戴在里层还换来一个实在好处——1440px 下展开心得后左列仍有约 1000px > 740px，**正文一个字都不用重排**。

**检查真实结果**（工作区 = `a244d6e`）

- `npm run format:check` → All matched files use Prettier code style!（退出 0）
- `npm run lint` → 退出 0；`npm run typecheck`（`tsc -b`）→ 退出 0；`npm run build` → 退出 0
- `npx vitest run` → 23 文件 **548** 用例通过（基线 539，净增 9）
- `npx playwright test`（全量 e2e，真实后端）→ **54 通过**（基线 49，净增 5）
- `backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-046-immersive-reader.md --worktree` → **CHECKS PASS**

**基线同步后的复核**（工作区 = `79a615c` 提交后的树，base 已更新为 `194d77b`）

上表数值跑在工作区 `a244d6e`（旧基线）上。合并 main 后候选 SHA 改变，按 §6「检查以被测内容为准」在合并后的树上重跑：

- `backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-046-immersive-reader.md --worktree` → **CHECKS PASS**；`STATIC PASS base=194d77b… input=WORKTREE`，`files=15`，`product_fingerprint=908a0fd8e080d42a805ade54633e0de9a8eb9d36b085eceb626b82aff3fd9426`；选中 5 项检查 `format:check` / `lint` / `typecheck` / `test -- --run` / `build` **全部 exit=0**
- `npx vitest run` → 23 文件 **548** 用例通过（与 `a244d6e` 一致）
- `npm run test:e2e`（全量 e2e，真实后端与真实浏览器）→ **54 passed**
- **未重跑 `extension` 组**，原因是 `base..HEAD` 的 15 个文件里零个 `extension/**`（`check_task.py` 据此也只选中 frontend 组），无变化证据不重复执行。完成条件 12 的「extension 组与基线一致」由该文件清单成立，不由一次执行成立。

main 自 `f609145` 以来只改了 `README.md`、`LICENSE`、`.github/workflows/ci.yml`、`docs/**` 与 6 张截图，**无前端源码、无 `package.json`/锁文件、无后端代码**，这也是重跑结果与 `a244d6e` 逐项一致的原因。

**实测数值**（Chromium，真实后端；见 `reader-immersive.spec.ts` 与留档截图 `reader-1440.png` / `reader-390.png`）

| 项 | 改前 | 改后 |
| --- | --- | --- |
| 正文字号 / 行高 | 12px / 1.75 | **18px / 32.4px（1.8）** |
| 正文行宽（1440px 视口） | 随卡片宽度（约 1300px） | **≤740px，居中，左右余量差 ≤2px** |
| 正文滚动 | 内嵌 420px 滚动框（页面 + 正文两条） | **`overflow: visible`，`scrollHeight - clientHeight ≤ 2`，整页一条** |
| 左栏 / 面包屑 / 页脚 | 各 1 | **各 0（资料库页仍各 1，对照组同用例内断言）** |
| 顶栏（滚动 1500px 后） | 随正文滚走 | **`y ≤ 2`，心得按钮 `click()` 成功而非超时** |

「改前」列的行高按 Reviewer R1 finding 4 更正为 1.75（初版写 1.9）：改前渲染视图同时带 `snapshot-body snapshot-rendered` 两个类，后者的 `line-height: 1.75` 覆盖了 `.snapshot-body` 的 1.9，实测值取的是覆盖后的那个。

**实现中发现并修复的问题**

1. **`react-hooks/set-state-in-effect` 拦下了初版的两个令牌 effect。** 初版把「替换正文/删除正文」的令牌放在 `useEffect` 里 setState，lint 直接判错。改为渲染期消化（同 `ResourceDetail` 里 `if (item && item !== shown) setShown(item)` 那一形态），顺带少一轮渲染。
2. **`e2e/resource-pages.spec.ts` 在阅读页上点侧栏的「添加资料」——那个入口现在不存在了。** 这不是测试写错，是本次改动的**真实后果**：阅读页没有全局导航。用例改为先按阅读页唯一的出口回资料库再点，并在注释里写明这正是那条出口在真实使用里的样子。
3. **无正文时菜单里仍有「看 Markdown 源码」。** 新写的「没有正文就没有删除入口」用例把它一起抓了出来（切换一个不存在之物的两种视图没有意义），已一并按 `snapshotExists` 隐藏。
4. **Esc 守卫会随面板搬家而失效。** 面板从 `.reader-toolbar` 盒子里移出后，旧守卫只认 `.reader-toolbar`，焦点在「资料信息」面板里按 Esc 会连心得侧栏一起关、焦点被心得按钮抢走——正是 TASK-045 复审 R1 finding 2 修掉的形态换个位置长回来。守卫改认两者，并补了一条用例；**已把守卫改回旧写法实测该用例变红**，确是真守卫而非空过。

**既有断言的改动（逐条）**

| 改了什么 | 为什么 | 新断言为何不弱于旧的 |
| --- | --- | --- |
| `await screen.findByText(/共 12 字/)` ×4 → `findByRole('heading', {name:'冻结的标题', level:1})` | 「共 N 字」正是本次删掉的元信息 | 新信号是**渲染后的正文本身**，比元信息更接近「用户真的看到了正文」 |
| `点击 替换正文/删除正文 按钮` → 经 `⋯` 菜单 | 三个动作按用户选定收进菜单 | 多走一层菜单，且删除**多断言一步确认**（确认前 DELETE 调用数为 0） |
| `点击 看 Markdown 源码 按钮` ×3（含 2 处 e2e） → 经 `⋯` 菜单 | 同上 | 额外断言了菜单项文案随视图切换（旧断言只验按钮在） |
| `points a %s resource at the original it actually has`（三句 `snapshotHints` + `assertAbove`） → `gives a %s resource its text with no metadata wrapped around it` | 被守的句子整段删掉了 —— 守卫跟着走，而不是留一条空转的断言 | 新用例**先断言正文真的渲染出来**，再逐句断言七处元信息文本不在；空状态那条用例的方位词守卫（`assertAbove`）原样保留 |
| 菜单项清单 3 项 → 7 项、分隔线位置索引 | 菜单新增三项 | 顺序断言保留，并**新增**「删除正文…也在分隔线之下」 |
| `e2e/resource-pages.spec.ts` 增一次「返回资料库」 | 阅读页没有侧栏入口了 | 顺带把那条出口的真实可用性也钉住了 |

**已知限制/遗留**

- **A｜窄屏 sticky 顶栏两排约 120px**（390×844 实测）：按钮在 ≤640px 换行到第二排，顶栏因此比宽屏高一倍。正文仍有约 720px 可读区，不阻断；若要压缩需把「返回资料库」或学习状态徽章图标化，属新的形态决定，未做。
- **B｜正文里 Markdown 自带的 `# 一级标题` 仍渲染为 `h1`**：文档中因此可能同时存在页面 `h1` 与正文 `h1`（现状即如此，降级策略属 `snapshotMarkdown.ts`，在禁止范围内）。完成条件 3 只约束**页面级** `h1`，用例相应按名称取。
- **C｜`.snapshot-rendered` 去掉了 `tabIndex={0}`**：它此前是可聚焦的，因为那是个可键盘滚动的框；现在正文由页面自己滚，一个可聚焦的非交互 div 只会在 Tab 序里多占一站。窄屏 `inert` 探针取的是「正文内首个可聚焦节点」，种子资料的空状态按钮仍在，用例照旧成立。
- **D｜区块的可访问名称仍是「正文快照」**：`<h3>` 不再上屏，但 `aria-label` 留着——region 需要一个名字，而这个名字对读屏用户是有用的信息，不是屏幕上的杂物。四处既有 `getByRole('region', {name:'正文快照'})` 因此不必改。
- **E｜上下文层（标签 / 收下它是因为）现在随正文滚走**：TASK-043 曾把「不用点任何东西就看得见」作为要求，现在它只在页面顶部初始可见。这是「读文章」形态的直接后果，登记为已知变化。
- **F｜TASK-045 遗留两项未处理**（Esc「死键」、心得聚焦令牌在刷新窗口被提前消费）：不在本任务范围，改它们形成新候选而收益不抵成本。
- **G｜删除确认的读屏播报未在真实读屏软件上验证**（Reviewer R2 finding 3）：焦点落在 `role="group"` + `aria-label="删除正文确认"` + `tabIndex=-1` 的容器上，读屏可靠播报的是**组名**；容器内「不能撤销…」那段是否随焦点一并读出，本轮无浏览器/读屏可实测，是未验证项而非已知成立。防误删本身成立（第二步显式确认），只是原措辞比实现强，已按实改写。低成本改法：给该 `<p>` 加 id、在容器上 `aria-describedby` 串联，仍需真实读屏复核。
- **H｜窄屏滚动到文章中部再开浮层，会把阅读位置拽回开头**（Reviewer R2 finding 1）：浮层是相对 `.reader-body` 的 `position:absolute; top:6px`，滚过约 670px 后再开，它整块落在视口上方；`NotesPanel` 的写作框 `focus()` 会把页面滚回那里，阅读位置丢失。触发条件**由本任务造成**：顶栏 sticky 化后「心得」在任意滚动位置都可点，此前够不到。影响：可复现的跳位，无数据损失。不属本任务授权范围（浮层定位是 TASK-045 的既定形态，改成 `position:fixed` 或整屏面板是**用户可见的形态决定**），登记为遗留并上报用户，未自行改。修法：窄屏档按视口定位（`fixed` + 让开顶栏高度），并补一条「滚动后再开浮层」的 e2e。
- **I｜正文读取失败时「替换正文/粘贴正文」菜单项点了没反应，且令牌会迟到重放**（Reviewer R2 finding 2 = R1 finding 5）：`snapshotExists` 此时停在 `null`，菜单项照渲染；而令牌只在 `result && !unreadable` 时消费，于是点击无声、请求悬置，等一次成功的「重新读取正文」之后编辑表单会突然自动打开。影响：轻微、无数据损坏（删除项此时不渲染）。修法：读取失败时不渲染该项或给出反馈，或在失败态消费令牌。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

（独立 Review 与 Integration/Acceptance 报告原文、最终候选与状态决定写在这里。）

<!-- EVIDENCE:END -->
