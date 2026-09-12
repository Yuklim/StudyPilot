# TASK-046：沉浸式阅读页 —— 外壳隐藏、正文 740px/18px、快照元信息下线

```toml
schema_version = 2
id = "TASK-046"
status = "MERGED"
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

### 候选链条

- 登记时基线 `f609145`（TASK-045 合并点）；实现 `b592a1a` + 测试 `a244d6e`，工作区自检跑在 `a244d6e` 上。
- 同步 main：合并提交 `79a615c`（并入 TASK-047 `3099292`、TASK-048 `194d77b`），`base` 前移为 `194d77b`，理由见「依赖/前置条件」的基线变更记录。合并后重跑：CHECKS PASS（指纹 `908a0fd8…`）、vitest 548、e2e 54。
- 首轮冻结候选 **`83cc3e4`**。
- **最终候选 `a2b19b9`**（改动后重跑：CHECKS PASS，`files=15`，指纹 `45a1e2a4aea16c13c352ee6b2583c876dd4719acee1e109e65d0f95a97e0ed6d`；vitest 548；真实后端全量 e2e 54 passed）。`base..candidate` 15 文件全部落在 `allowed_paths` 内。
- 实现段 `:186` 以「冻结候选 `83cc3e4`」锚定 15 文件数：该句写于首轮修订时、当时成立；两轮候选的文件清单与范围逐项相同，**最终 SHA 以本区为准**。两位 Reviewer 均建议不要改实现段的这句话（属 §6 禁止的「借证据写回变更实现记录」），故原文保留、在此说明。

### 独立 Review（L3：两位，均独立于实现者，运行器层只读）

R1 与 R2 各两轮：首轮审 `194d77b..83cc3e4` 完整最终 diff，第二轮增量复核 `83cc3e4..a2b19b9` 并声明继承范围。**两轮结论均为 PASS，0 阻断。**

| finding | 提出者 | 处置 |
| --- | --- | --- |
| 记录写「16 文件 / 3 docs」在 base 前移后失真 | R1-1 | 已更正为 15 / 2 并写明 `TASK-045` 登记随 main 并入（`1fb95b3` 之后的记录提交） |
| 窄屏层叠断言在滚动位置 0 点击、与顶栏不重叠 → z 序错了也全绿 | R1-2 | 已改为「按浮层文档位置滚到真实重叠 + 前提断言 + `elementFromPoint`」；反向实验（z-index 6→1）新用例在 320px 档变红、其余 4 条仍绿 |
| 完成条件 7 声称 1440/390 两档，实际只有 1440 断言不内滚 | R1-3 | 三档循环补齐 `overflowY === 'visible'` 与 `scrollHeight - clientHeight ≤ 2` |
| 实测表「改前 1.9」不准（应为 1.75） | R1-4 | 已改为 1.75 并注明覆盖原因 |
| 删除确认的可访问名称表述比实现强 | R2-3 | 按实改写；未验证部分登记为遗留 G |
| 索引行仍写基线 `f609145`，与记录的 `base` 冲突 | R2-4 | 索引行补记基线前移 |
| 窄屏滚动后开浮层会把阅读位置拽回开头 | R2-1 | **未改实现**，登记遗留 H 并上报用户（浮层定位是 TASK-045 既定形态，属用户可见的形态决定） |
| 读取失败时「替换正文」令牌悬置、之后迟到重放 | R2-2 = R1-5 | 登记遗留 I |
| 候选侧未留 product 指纹（证据绑定缺口） | R2 缺口① | 补 `79a615c..a2b19b9` stat；新指纹由 `--worktree` 在干净候选上产生 |

#### R1 首轮（`194d77b..83cc3e4`）

> 只读证明：本轮 Review 运行器仅授予 `Read`/`Grep`/`Glob`，无 `Bash`、无 `Write`/`Edit`。我未创建、修改、提交或推送任何文件，也未尝试探测权限。
>
> **base 改动成立，未掩盖越界。** manifest 给出 `merge-base(base,candidate)=base=194d77b`，`base..candidate` 15 个文件逐一对照 `allowed_paths` 全部在范围内；被排除文件（`snapshotMarkdown.ts`/`ResourceDeletion.tsx`/`NotesPanel.tsx`/`NotesPage.tsx`/`backend/**`/`extension/**`/`frontend/src/api/**`）零出现。把 base 前移到并入后的 main 只剔除了 main 带来的 TASK-047/048 文档改动，属如实反映任务自身差异。
>
> **`extension` 组未重跑的取舍可接受。** 文件清单零 `extension/**`，`package.json`/锁文件零改动，无变化不重复执行符合 §6。
>
> findings（全部非阻断）：
> 1. `docs/tasks/TASK-046-immersive-reader.md:186`（另见 `:90`）— 记录写 16 个文件 / 3 docs，与候选的 15 文件 / 2 docs 不符；且新 base 不是 `a244d6e` 的祖先，「base..a244d6e」已非有效范围。仅叙述精度，不掩盖越界。**可记录后继续。**
> 2. `frontend/e2e/reader-immersive.spec.ts:159-188` 与记录 `:160`（完成条件 8「实测 z 序」）— 该用例在滚动位置 0 点「心得」，此时浮层与 sticky 顶栏并不重叠；把 `.reader-toolbar` 的 `z-index:6` 去掉这条仍会通过。CSS 本身经静态核验是对的（6 > 浮层的 5，两者之间无中间层叠上下文）。建议展开后先 `window.scrollBy` 再点，或用 `elementFromPoint` 断言按钮位于浮层之上。**可记录后继续（P3，低成本可补）。**
> 3. `frontend/e2e/reader-immersive.spec.ts:168-186` 与记录 `:159` — 只有 1440 档断言了 `.snapshot-rendered` 的 `overflowY`/`scrollHeight-clientHeight`；390 档只断言横向不溢出与字号 18px。**可记录后继续。**
> 4. `docs/tasks/TASK-046-immersive-reader.md:222` — 实测表「改前 12px / **1.9**」不准确：渲染视图当时同时带 `snapshot-body snapshot-rendered`，后者的 `line-height:1.75` 覆盖了 `.snapshot-body` 的 1.9。建议改为 1.75。
> 5. `ContentSnapshot.tsx:219-232` + `ResourceToolbar.tsx:258-266` — 快照读取失败（`unreadable`）时 `snapshotExists` 停在 `null`，`⋯` 菜单仍渲染「粘贴正文」，点击不消费令牌，要等一次成功的「重新读取正文」后才突然打开编辑表单。影响轻微且可绕过。建议记一行遗留，或读取失败时不显示该菜单项。
>
> 其余（无需处理）：`styles.css:2559` 的 `margin` 改动经核无跨页影响；`CapturePage.tsx:76` 注释里的行号引用因本次改动失效（该文件不在 `allowed_paths`）。
>
> 覆盖：`base..candidate` 完整 diff（2276 行）与工作区实际文件逐一交叉核对，两处一致，无 diff/工作区不符。焦点 1：出口在四态均成立；`h1` 焦点权威（`App.tsx:31-50,64-76`）一行未动，`reader-layout.spec.ts:129-136` 的真实浏览器「标题接住焦点」用例未改仍通过；跳过链接与 `main#main-content` 保留且目标真实存在。焦点 2：z-index 关系静态成立；740px 帽子确实不该戴在 `.reader-main` 上——`reader-notes-sidebar.spec.ts:63,77,84-86` 量的正是 `.reader-main` 宽度，钉成 740 会让 `closedWidth-openWidth` 变 0 使 `toBeGreaterThan(300)` 直接失败（记录 `:131,197` 的措辞「悄悄失效」不准确，机制上是变红，但结论方向正确）。焦点 3/4：数值断言逐条核过，除 finding 2/3 外都有反空过设计；记录的实测表与 e2e 断言逐项一致（除 finding 4），`548/54` 与 diff 的 +9 单测 / +5 e2e 算术自洽。
>
> 未覆盖：无 Bash，未重跑 vitest/playwright/check_task（复用绑定到 `product_fingerprint` 的机械证据）；未审 `docs/tasks/任务索引.md` 措辞、未审与本任务无关的既有 spec 全文。
>
> **结论：PASS**（4 项可记录后继续 + 1 项 P3 建议，均不影响安全底线、必要检查与已确认需求/契约）。

#### R2 首轮（`194d77b..83cc3e4`）

> 只读证明：本 Agent 运行器仅授予 `Read`/`Grep`/`Glob`，无 Bash、无 `Write`/`Edit`，未执行任何 git/写操作；工作区签出在 `83cc3e4`，我用「diff hunk ↔ 工作区文件内容」逐文件交叉核对，**未发现 diff 与工作区不一致**。manifest 的 SHA、merge-base、15 文件清单、工作区干净均自洽。
>
> 逐项核对（R2 五个焦点）：
> 1. **受控 props / 令牌编排：正确。** 令牌在渲染期消化且**确实在真正动手之后才记 `seenEdit`/`seenDelete`**（`ContentSnapshot.tsx:219-232`），渲染期 setState 有 `!== seenEdit` 守卫，收敛（不会无限渲染）；`receiveSnapshotState` 是稳定 `useCallback`，`ReaderContent` 为 memo；`onSnapshotState` effect 只在 `result && !unreadable` 时回传，父级布尔相同时 React bail-out，无重复请求。三组件间未见状态不同步或竞态。
> 2. **删除进菜单 + 确认：成立。** `snapshotExists &&` 同时守卫源码切换与 `删除正文…`（`ResourceToolbar.tsx:248,280`）；确认块在正文位置，`确认删除正文` 才发 DELETE。守卫力真实：`ResourcePages.test.tsx:602-606` 断言「确认前 DELETE 调用数为 0」且「取消后正文仍在」，e2e 走真实后端删掉后落回空状态；`runFromMenu` 的焦点归还有单测钉住（`ResourceToolbar.test.tsx:203-208`）。
> 3. **Esc 守卫：已覆盖全部面板。** 面板都由 `ToolbarPanel` 渲染为 `.reader-panel`（`ResourceToolbar.tsx:388`），守卫改认 `.reader-toolbar, .reader-panel`（`ResourceDetail.tsx:148`），全仓无其它按 `.reader-toolbar` 判断焦点的位置；新增用例先断言 `panel.closest('.reader-toolbar') === null` 再按 Esc，回退旧写法必红，非空过。
> 4. **测试守备力：新增断言不弱于旧断言。** 记录里那张表逐条与 diff 相符；元信息「不在」的断言均先断言正文真的渲染出来；「无正文菜单项」用例有正向对照不恒真；单测净增 9 例、e2e 净增 5 例与 diff 新增用例数逐一对上，无删除任何用例。
> 5. **范围与契约：遵守。** 15 文件全在 `allowed_paths` 内；排除文件零出现；`package.json`/锁文件不在清单中。`aria-label="正文快照"` 保留不会造成名称与内容不符。
>
> base 改动**成立、不掩盖越界**（若分支在合并时改动过 main 已有文件，那些改动必然出现在 `base..candidate`，而清单里没有任何 main 文件）；extension 未重跑可接受。
>
> findings（均非阻断，建议记录后继续）：
> 1. `styles.css:2489-2498` + `:2187-2193`：≤1279px 下滚过约 670px 再点「心得」，`.reader-notes` 仍是 `position:absolute; top:6px`，整块落在视口上方；`NotesPanel` 的 `input.focus()` 会把页面拽回文章开头。修法：窄屏档改 `position:fixed`（或按视口定位）；至少补一条「滚动后再开浮层」的 e2e。
> 2. `ContentSnapshot.tsx:219-232`：令牌只在 `result && !unreadable` 时消费，读取失败时菜单项点击无反馈、令牌悬置，之后成功重读会让编辑表单**自动弹出**。修法：失败态加提示或不渲染该项。
> 3. `ContentSnapshot.tsx:234-235` 与记录：焦点落在 `role="group"` + `aria-label` + `tabIndex=-1` 的容器上，读屏可靠播报的是**组名**，容器内段落不保证读出；防误删本身成立，只是这句陈述比实现强。低成本修正：`aria-describedby`。
> 4. `docs/tasks/任务索引.md:26`：TASK-046 行仍写「基线 `f609145`」，与记录的 `194d77b` 冲突。
>
> 未覆盖：机械证据无法独立复跑（无 Bash）；候选 SHA 的 product 指纹未在 manifest 中留证（建议补一行或说明其后的提交全部为 docs）；真实读屏软件下的删正确认播报；「从菜单选替换正文后焦点是否真的落在写作框」没有断言。
>
> **结论：PASS** —— 未发现必须修复的缺陷；上述 4 项为可记录后继续的非阻断项，2 条缺口属本轮不可验证范围。

#### R1 增量（`83cc3e4..a2b19b9`）

> **只读证明**：本 Agent 仅挂载 Read/Grep/Glob，无 Bash、无 Write/Edit，本轮只读取 delta diff、manifest 与工作区文件，未写任何文件。
>
> **继承的覆盖（上一轮已审、本轮未变）**：`83cc3e4` 的完整 `base..candidate` 最终 diff（`immersive` 机制、出口与 h1 焦点契约、styles.css 的 z-index/sticky/740px 帽子/断点、token 受控 props、既有断言的增删口径、base 前移的正当性、`extension` 组跳过的可接受性）。这些 hunk 在本轮 delta 中零改动，结论直接继承。增量只动 1 个 e2e 测试文件（断言只增不减）与 2 个 docs。
>
> 逐条核对结果：
> 1. **记录口径更正**：现写「13 前端 + 2 docs/tasks = 15 文件」，与 manifest 清单逐项一致；`TASK-045-notes-sidebar.md` 确不在差异内。**通过**。
> 2. **z 序判据**：按浮层**文档位置**滚动，先断言顶栏 `y ≤ 2`，再断言浮层与按钮 y 区间确有重叠（前提守卫），最后 `elementFromPoint` 要求最顶元素归属 `.reader-toolbar`。320px 反向实验（z-index 6→1）变红，证明判据非恒真；几何一旦不再重叠，前提断言先红而非静默退化——这是正确的守卫而非误红。**通过**。
> 3. **窄屏内滚**：三档循环补断言。**通过**（残余：判据是元素级，若日后在祖先包裹层加回内滚不会被它捕获，非阻断）。
> 4. **行高「改前」值**：改为 1.75 且有表下说明，已核对 diff 佐证（`snapshot-rendered` 的 1.75 覆盖 `.snapshot-body` 的 1.9）。**更正准确**。
> 5. **遗留 G/H/I**：H 确由本任务 sticky 顶栏新致触发，属用户可见的形态决定，登记并上报用户而未自行改，处置正确；I 即我的 finding 5，如实登记；G 为弱化未验证措辞。三者均可记录后继续。
>
> 非阻断备注：记录 `:186` 仍以「冻结候选 `83cc3e4`」锚定 15 文件数，而最终候选已是 `a2b19b9`（文件清单两轮相同、无事实错误），最终 SHA 应落在 EVIDENCE 区；清单 `判定候选与指纹树之间只差什么` 给出 +69/−6，与协调者口述的 +54/−4 不一致（清单自身自洽），属叙述数字噪声。
>
> 证据绑定：我无 Bash 无法重算指纹，采信 manifest 中「worktree HEAD = `a2b19b9`、0 未提交」与 `files=15` 把新指纹 `45a1e2a4…` 绑定到 `a2b19b9`。
>
> **结论：PASS**（覆盖新最终候选 `a2b19b9`）。剩余风险仅 H（用户待决定的形态回归）与 I/G 两项已登记遗留，均无数据损失、不阻断。

#### R2 增量（`83cc3e4..a2b19b9`）

> **只读证明**：运行器仍仅授予 `Read`/`Grep`/`Glob`，本轮未执行任何写操作。工作区已在新候选 `a2b19b9` 上（manifest 更新段：未提交改动 = 0）；「delta diff ↔ 工作区实际文件」交叉核对，**3 个文件全部一致**。
>
> 继承自上一轮（本轮未变，结论继续有效）：`base..candidate` 15 文件清单未变，五个焦点域的完整审查、base 前移的正当性、extension 未重跑的取舍、上一轮 4 条 findings 与 2 条缺口，原样继承，未重做。
>
> 本轮增量覆盖：
> - **finding 4（索引与记录互相打脸）→ 已闭合。** `任务索引.md:26` 改为「基线 `f609145`（登记时；独立 Review 前并入 main 后前移为 `194d77b`）」，不再冲突。
> - **finding 3（读屏措辞比实现强）→ 已按实闭合**，陈述不再宽于证据。
> - **finding 1（窄屏滚动后开浮层跳位）→ 未改实现，遗留 H。** 不接受改实现是**正确的范围处置**：浮层定位是 TASK-045 既定形态，`position:fixed`/整屏面板是用户可见的形态决定；记录如实写明触发条件由本任务造成、影响、修法并上报用户，而不是自行扩大授权。
> - **finding 2 → 遗留 I**，复现路径与两种修法具体，无数据损坏这一点表述准确。
> - **缺口①（候选侧无 product 指纹）→ 已闭合。** manifest 给出 `79a615c..a2b19b9` 的差异，说明指纹树与候选之间不再夹杂其它产品文件；新指纹由 `check_task --worktree` 在工作区（= 候选、干净）上产生，绑定成立。残留的只是「Reviewer 无执行能力」这一固有边界，不再是证据缺口。
> - **R1 的两条断言缺口我独立核过，是真守备不是补字**：窄屏补的 `overflowY`/`scrollHeight` 是完成条件 7 缺的那一档；`:195-224` 把层叠判据改成「先按浮层文档位置滚到真实重叠 → 前提断言 → `elementFromPoint`」，前提断言把「几何一变就退化成恒真」挡住，**这是本轮质量最高的一处修正**；`scrollTo` 为即时滚动（`scroll-behavior: auto` 只在 reduced-motion 档），无动画竞态。
>
> 本轮新增的三条非阻断项（均为记录/清单精度）：① 记录 `:186` 现写「冻结候选 `83cc3e4`」，而最终候选已是 `a2b19b9`——建议在 EVIDENCE 里写清候选链条，**不要去改实现段**（否则构成借证据写回改实现记录）；② manifest 表头残留旧候选（不影响判断，建议下一份清单重写表头）；③ 「替换正文」走 `runFromMenu(..., keepFocus=false)`，靠写作框 `autoFocus` 接住焦点，**没有任何用例断言焦点真的落在写作框上**（可选补强，非阻断）。
>
> 剩余风险：遗留 G 在只读审查里本质不可验证（已如实登记）；遗留 H 是一条真实体验退化，实现未改，属待用户决定的事项，合并前应向用户披露；遗留 I 轻微、无数据损坏。
>
> **结论：PASS** —— 新候选 `a2b19b9` 无阻断问题；安全底线、必要检查与已确认需求/契约均未被让渡。

### 独立 Integration/Acceptance（L3，独立于实现者与两位 Reviewer）

对最终候选 `a2b19b9` 判 **PASS**：**无必须修复项**；14 条完成条件中 **12 条满足、2 条部分满足、0 条不满足**，两条「部分」只落在证据粒度（焦点断言缺一档、`extension` 为结构性推断而非执行），核心行为、契约与安全底线均被证据支撑。

| # | 判定 | 缺的一点 |
| --- | --- | --- |
| 3 | 部分满足 | `h1` 唯一性三态齐备，正常态「接住焦点」有真实浏览器断言；**读取中/读取失败态的占位 `h1` 是否拿到焦点无直接断言**（只有存在性）。机制共用未改动的 `registerHeading` 权威，风险低 |
| 12 | 满足（结构性推断，非执行） | `extension` 未执行，理由为清单零 `extension/**` 且锁文件零改动 —— 符合 §6「被测内容无变化不重复执行」，足以支撑「计数不减少」；但「与基线一致」若读作数值等价，记录未给 extension 基线数，**不可数值核对**（文档完整性缺口，非缺陷） |

其余 12 条均判满足，判据逐条落到具体断言或源文件（详见报告原文）。

#### 验收报告原文

> **只读证明**：本 Agent 运行器仅挂载 `Read`/`Grep`/`Glob`，无 `Bash`、无 `Write`/`Edit`。本轮未创建、修改、提交或推送任何文件，未尝试探测权限，未运行 git/测试。**我无执行能力，无法自行核对 SHA/指纹，也无法重跑任何检查**；采信 manifest「更新」段与任务说明（工作区 `039a499` 仅改 `docs/tasks/**`，产品文件与候选逐字相同）。
>
> **跨模块与运行证据**：`base..candidate` = 15 文件（13 前端 + 2 `docs/tasks`）。**无 `backend/**`、无 `extension/**`、无 `frontend/src/api/**`、无 `docs/contracts/**`、无 `scripts/governance/**`、无 openapi、无 `package.json`/锁文件**；`/api/v1` 仅是代码内 URL 字面量，不涉及契约文件。全部落在 `allowed_paths` 内。边界：这是**按 manifest 采信**，我无法用 git 独立重算 diff/merge-base。
>
> **陈述与证据的对齐（漏网点）**：
> - **F1**｜`:159`（条件 7）：判据写作「`.snapshot-body` 不再有内部滚动」，实际 `styles.css:2079-2081` 明确保留该内滚框供源码视图；断言对象是 `.snapshot-rendered`。功能与设计③一致（源码是代码不是文章），但**条件文本与断言对象不是同一个类**；源码视图激活时该页实为两条滚动条，而条件写「整页只有一条」。属叙述口径，可记录后继续。
> - **F2**｜`:152`（条件 3）：见上「部分满足」的焦点缺项。
> - **F3**｜`:158`（条件 6）：「1440px 视口下取实测值记录」实际只给区间断言（700<w≤740）与居中差，未留单次实测宽度数值。属记录完整性，可选。
> - **F4**｜`:186`：实现段仍以 `83cc3e4` 锚定 15 文件数（最终候选 `a2b19b9`）。两名 Reviewer 均指出并建议不改（§6 禁借证据写回改实现记录），EVIDENCE 已声明最终 SHA 以标记区为准。叙述噪声，非事实错误。
> - **F5**｜`ContentSnapshot.tsx:161`：注释称 `ResourceDetail.tsx`「不在本任务的 `allowed_paths` 里」，而该文件本任务在 `allowed_paths` 内且被修改。经查该注释**不在本候选 diff 内**（早前任务残留），非本任务引入，属既存陈述失真，可选清理。
> - 已收敛项复核：R1-1/R1-4/R2-3/R2-4 的处置与 diff 一致，未发现「处置后又长回来」的漏网表述。
>
> **机械证据的可采信边界**：**能核**断言与实现是否逐条对应（含 e2e 反空过设计、既有 spec 无删例、新增 e2e 恰 5 条）、测试目标是否绑在用户可观察量上、diff 文件范围与排除项；**核不到** CHECKS PASS、`product_fingerprint`、vitest 548、e2e 54、`extension` 与基线一致、以及回归到具体 SHA 的绑定。**「数字自洽」不等于「已重跑」**——我复用的是绑定到由 `--worktree` 在干净候选上产生的指纹的记录证据，这是可采信边界内最合理的复用，但我不能为其真实性背书。
>
> **遗留与剩余风险**：A–I 九项登记**如实**，措辞与实现相符；G 已从「读屏播报细节」弱化为「未验证项」，H 明写「触发条件由本任务造成」并上报用户而非自行改形态，I 的复现路径与「无数据损坏」准确。影响未被低估。未登记但存在的次要项（本轮新增，均非阻断）：
> - **F6**｜跨资源切换的状态残留：`ResourceDetail.tsx:97-100` 的 `snapshotExists`/`showSource` 未随 `resourceId` 重置，同组件内切换资料时菜单文案/删除项可能短暂沿用上一份（通常经资料库进入会卸载重挂，路径窄）。可选。
> - **F7**｜窄屏菜单占位：`styles.css:2338-2341` 菜单 ≤640px 退化为 `position:static` 且位于 sticky 栏内，展开时顶栏可高至 `min(70vh,560px)` 覆盖大片视口；条件 11 的实测在菜单关闭态。非阻断。
>
> 安全底线（`dangerouslySetInnerHTML` 仍唯一且依赖 `html:false`，`snapshotMarkdown.ts` 一字未动）、必要检查、已确认需求与契约均未让渡。
>
> **结论：PASS**。无必须修复项。**合并前应向用户披露：H（窄屏滚动后开心得浮层跳回文章开头）、G（读屏播报未实测）、I（读取失败时替换令牌悬置后迟到重放）。**

### 状态决定

- 任务状态置 **ACCEPTED**：L3 链路（实现 → 独立 Review ×2 → 独立 Integration/Acceptance）已走完，结论均为 PASS、0 阻断；等待用户决定合并。
- **2026-09-12 用户本人合并 PR #55**，merge commit `1924717`（分支 tip `0f4dd19` 为其第二父，已核实是 `origin/main` 祖先）→ 状态置 **MERGED**。交付时为 ACCEPTED，合并仅由用户执行。
- 本候选之后仅剩证据写回提交（只改 `docs/tasks/**`），产品内容仍等于最终候选 `a2b19b9`。
- 验收新增的非阻断项 F1–F7 登记于本区（不写入实现段遗留列表，避免借证据写回改动标记区外的记录）。
- **合并前须向用户披露三项**：H（窄屏滚动到文章中部再开心得浮层会把阅读位置拽回开头，触发条件由本任务造成，修法涉及 TASK-045 的浮层形态即用户可见的形态决定）、G（删除确认的读屏播报未在真实读屏软件上验证）、I（正文读取失败时「替换正文」令牌悬置、之后迟到重放）。另有条件 3 的焦点断言缺一档（部分满足）与条件 12 的 `extension` 未执行（结构性推断），一并披露。

<!-- EVIDENCE:END -->
