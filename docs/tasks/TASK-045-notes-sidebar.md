# TASK-045：阅读器心得侧栏 —— 挤压式侧栏（默认收起）+ 窄屏浮层 + 心得入口带数量

```toml
schema_version = 2
id = "TASK-045"
status = "IN_ACCEPTANCE"
risk = "L3"
risk_reason = "本任务改的是**阅读器页的写作交互**，触及 `features/resources` 与 `features/notes` 两个模块边界，并改动一条已确立的无障碍契约。实质风险：① **心得入口从锚点链接变成有状态的开合控件**——TASK-044 起「工具条图标按钮可见文本为空、名字由 aria-label 提供」这条测试抓不到退化；本任务再把入口升级为 `aria-expanded` 的开合 + 聚焦写作框，若聚焦/归还语义出错，键盘与读屏用户会在笔记浮层里失去落点（屏幕上看不出来）。② **窄屏浮层是新的模态式交互**：Esc/收起后焦点必须还给触发按钮，展开态正文不可被 Tab 溜进（inert）。③ **写作区从常驻正文下方变为默认收起的挂载态侧栏**——收起必须不丢未保存草稿（组件保持挂载），这决定结构是「CSS 显隐」而非「条件卸载」，与 TASK-044 左栏折叠的同类决策一致。④ 响应式两态（宽屏挤压正文 / 窄屏盖正文浮层）需要真实浏览器数值断言。不改后端、`/api/v1`、openapi、本机访问门禁、`extension/`；不动 `ContentSnapshot.tsx`、`snapshotMarkdown.ts`、`ResourceDeletion.tsx`；不改任何写入语义。"
risk_flags = ["business"]
owner = "coordinator"
base = "5ea03981882234470d4c2d98308fce52eedd52a6"
allowed_paths = [
  "frontend/src/features/notes/NotesPanel.tsx",
  "frontend/src/features/notes/NotesPanel.test.tsx",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ResourceToolbar.tsx",
  "frontend/src/features/resources/ResourceToolbar.test.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/**",
  "docs/tasks/TASK-044-compact-chrome.md",
  "docs/tasks/TASK-045-notes-sidebar.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

### 用户授权

TASK-043/044 期间用户已选定（三处顺延到本任务的内容）：

1. **写心得走挤压式侧栏**（用户 2026-09-07 在三个选项中选「挤压式侧栏」），心得**专用**侧栏（不做多页签抽屉）；
2. **窄屏侧栏退化成盖在正文上的浮层**（用户 2026-09-07 选定）；
3. **心得入口带数量**（TASK-043 因取数要改 `features/notes/**` 或重复请求而推迟，约定「侧栏本来就拥有心得数据，那时是顺带可得」）。

2026-09-08 用户合并 PR #49（TASK-044，merge `5ea0398`）后指示「进行 task045」，并就本任务登记前的主 Agent 提问作答两条：

- **宽屏挤压式侧栏默认收起、点「心得」才展开**（正文平时满宽，延续 TASK-044 的成果；写作时才挤压）。
- **心得按钮＝开合 + 聚焦一体**：收起态点它＝展开并聚焦写作框；展开态点它＝聚焦写作框；窄屏＝浮层开合，开时焦点进写作框。

### 登记前对现状的核对（不是估算）

TASK-044 合并后，阅读器页结构为：`.resource-sheet.reader` 内 **工具条（两层）→ `ContentSnapshot`（正文，整行）→ `section.detail-block#resource-notes`（心得，正文下方整行）**。工具条里的心得入口是 `<a href="#resource-notes" aria-label="心得">` 锚点（点它跳到正文下方并聚焦目标块）；`ResourceToolbar.test.tsx:73` 有「正文先于心得块」的顺序断言、`:329` 把 href 与目标块 aria-label 绑成一条。**心得块的内容是 `NotesPanel`，它同时服务顶层「我的心得」页（standalone）**——本任务对它只加可选 props 与窄栏样式，不改其独立用法。

### 目标

1. **阅读器页心得从「正文下方整行」移进右侧心得区**，宽屏默认收起（正文满宽不变），点工具条「心得」展开为**挤压式两栏**（正文列 + 心得列）；展开态正文变窄、窄量≈心得列宽。
2. **窄屏下展开态为盖在正文上的浮层**（不挤压），有明确收起控件；`Esc`/收起把焦点还给触发按钮；展开态正文不可被 Tab 焦点进入。
3. **心得按钮＝开合 + 聚焦一体**（见授权），可见文本为空、可访问名称与 `title` 保留（TASK-044 图标化约束延续）。
4. **心得入口带数量**：显示该资料已绑定心得总数；页面一打开即有（不要求先开侧栏）；在侧栏里新增/删除后实时更新。
5. **收起不丢未保存草稿**：写作框有未保存内容时收起再展开，草稿仍在。
6. 保留 TASK-044 建立的正文空间收益与焦点契约：阅读器页唯一 `h1`＝资料标题不变；默认态正文起点不劣化；返回路径、读取中/失败态的 `h1` 与出口全部不变。

### 非目标（明示不做）

- **不改写入语义**：心得新增/修改/删除/解除绑定/后贴，版本与恢复流程一字不改（`NotesPanel` 逻辑本体不动，只加可选 props）。
- **不做正文批注/选中记心得**：那是后续能力（TASK-043 已记为「后续批注能力」，不在本任务）。
- **不做心得数量角标之外的新入口形态**：不加独立「展开侧栏」的第二个按钮；开合只由既有「心得」按钮承担（另在心得区自身放一个「收起」）。
- **不改「我的心得」页（standalone）**：`NotesPage` 与 `NotesPanel` 的独立用法保持原样。
- 不改后端、`/api/v1`、openapi、门禁、`extension/`、`docs/contracts/**`、`scripts/governance/**`、`AGENTS.md`、`docs/governance/**`；不新增依赖。
- 不动 `ContentSnapshot.tsx`、`snapshotMarkdown.ts`、`ResourceDeletion.tsx`。

### 禁止范围

所有未列入 `allowed_paths` 的路径；额外禁止：`backend/**`、`extension/**`、`docs/contracts/**`、`frontend/src/api/**`、`frontend/src/features/resources/ContentSnapshot.tsx`、`frontend/src/features/resources/snapshotMarkdown.ts`、`frontend/src/features/resources/ResourceDeletion.tsx`、`frontend/src/features/notes/NotesPage.tsx`、`scripts/governance/**`、`AGENTS.md`、`docs/governance/**`。

### 依赖/前置条件

基线 `5ea03981882234470d4c2d98308fce52eedd52a6`（main，TASK-044 已合并 = 用户合并 PR #49）。无未合并依赖。

### 并行

否。唯一写入者 `coordinator`。

### 顺带完成的状态登记

TASK-044 记录与 `任务索引.md` 的该行：按根 `AGENTS.md` §5 登记用户 2026-09-08 合并 PR #49（merge commit `5ea0398`）这一事实，状态 ACCEPTED → **MERGED**。只允许改动 TASK-044 的 `status` 与 EVIDENCE 标记区内「最终状态/风险/用户操作」那一行及其索引行，不改目标/风险/路径/检查/实现与测试记录。

## 关键设计决定

### ① 结构：侧栏是「CSS 显隐的挂载态」，不是条件卸载

默认收起时 `NotesPanel` **仍然挂载**，只是容器 CSS 隐藏（`display:none`）。理由：**收起不丢草稿**只能靠不卸载实现——写作框的 `draft` 是组件内部 state，卸载即丢。挂载态还有三个顺带收益：角标数量能由侧栏自己的 `total_items` 实时回传（无需第二份请求、不会漂移）；重开瞬间不重新拉列表（数据已在）；TASK-043 那句「角标顺带可得」在本设计下为真。

代价：每次打开一份资料都会有一次心得列表请求，即使从不点开侧栏（与旧版正文下方常驻块相同——旧版本来就每次挂载即请求，**不是新增成本**）。显示层用 `display:none`：display:none 的节点不进入 Tab 序与无障碍树，jsdom 不应用样式，所以「收起时不可聚焦/不可见」这类断言必须用真实浏览器（Playwright `toBeHidden`）或在用例里断言容器属性。

### ② 开合与聚焦的状态机放在 `ResourceDetail`

心得按钮在工具条里、心得区在本页，两者共同父级是 `ResourceDetail`，因此 `open` 状态、开合时对写作框的聚焦请求、Esc 归还焦点的目标（心得按钮 ref）都在 `ResourceDetail` 协调，经 props 传给 `ResourceToolbar`（按钮侧）与心得区容器（面板侧）。**不新增路由、不新增全局 context**；沿用 TASK-044「焦点权威仍然只有一个」的原则——页面 `h1` 与返回路径的聚焦不受影响。

「聚焦写作框」通过向 `NotesPanel` 传入一个每次请求递增的 token 实现（可选 prop），面板内 effect 在 token 变化且可用时 `input.current?.focus()`。不依赖 DOM 捞节点。

### ③ 心得入口从锚点升级为有状态按钮

`<a href="#resource-notes">` → `<button aria-expanded={open} aria-label="心得" title="心得">` + **数量角标**。点击行为见授权（开合 + 聚焦一体）。原锚点语义（滚动 + 聚焦目标块）被「展开并聚焦写作框」取代；`#resource-notes` id 与正文下方区块一起移除。

### ④ 挤压与浮层两个呈现态共用同一 DOM，CSS 切换

心得区在 DOM 里始终是正文后的兄弟节点。宽屏（正文列宽度可读的断点以上）：容器与正文包进两列 grid，收起时 grid 只有正文列、心得列 `display:none`，展开时两列。窄屏（断点以下）：grid 恒单列，展开时心得区变为盖在正文上的浮层（覆盖正文、不挤压），配独立滚动与收起控件。

**断点值实现时用真实浏览器实测选取并记录**：原则是挤压态下正文列宽度仍可读（目标 ≥ 约 560px，记录实际值），不足则改走浮层。**这一档形态与 ≤760px 的左栏顶栏档无关**，是两个独立断点；记录中须写明两者并存不冲突。

### ⑤ 窄屏浮层是「非模态浮层」还是模态式？—— 与既有 ToolbarPanel 一致的非模态 + 正文 inert

心得浮层与工具条里已存在的面板（`ToolbarPanel`，如学习状态、编辑资料）同属一类：非模态浮层。但 TASK-043/044 的既有面板**展开时正文通常被推到屏外或面板占主区**，而心得浮层是**盖在仍可读的正文上**——若不处理，Tab 会溜进被盖住的正文。因此展开态给正文容器加 `inert`（React 19 原生支持），使其不可聚焦也不进辅助树；`Esc` 与「收起」都让焦点回心得按钮。不引入 focus trap 库，不新增依赖。

## 完成条件

1. **宽屏默认正文满宽、心得区收起**：资料详情页默认态正文起点与 TASK-044 实测一致、不因本任务被挤压；正文区宽度与 TASK-044 折叠基线可比。真实浏览器两态数值断言。
2. **展开才是挤压**：点「心得」后变两栏，正文列宽度下降、下降量≈心得列宽；正文列不横向溢出。
3. **心得按钮＝开合 + 聚焦一体**：收起态点击 → 展开且焦点进写作框；展开态点击 → 焦点回写作框。须有用例分别断言两个方向。按钮可见文本为空、可访问名称 = `aria-label`、`title` 都在（图标化约束不弱化）。
4. **窄屏浮层**：断点以下展开态是盖正文的浮层（正文区宽度不因展开而收窄）；有可访问名称取到的「收起」控件；`Esc` 与「收起」都把焦点还给「心得」按钮；展开态正文 `inert`（Tab 无法进入）。320/390 两档不横向溢出，展开与收起两态都测。
5. **角标＝该资料已绑定心得总数**：页面加载后（未开侧栏）心得按钮即显示数量；数量来自侧栏挂载后的 `total_items`。新增与删除一条心得后数量随之增减。须有用例（真实后端或 mock 均可，写明数据来源）。
6. **收起不丢草稿**：在写作框输入未保存内容 → 收起 → 再展开，草稿与状态仍在。须有用例（同一挂载实例上验证）。
7. **正文优先不回归**：1440 与 390 两档、默认收起态，正文首个标题 `boundingBox().y < 视口高度`（真实浏览器 e2e，显式设视口）。
8. **焦点契约不退化**：阅读器页仍恰有一个 `h1`＝资料标题；`App.test.tsx` 三条返回路径用例保持通过且不弱化；打开/收起侧栏不改变页面 `h1` 焦点。
9. **standalone 心得不回归**：`NotesPage`/`NotesPanel` 独立用法（顶层「我的心得」）行为与用例保持通过；对 `NotesPanel` 的改动只加可选 props。
10. **既有断言只增不减**：三组测试计数只增不减，`extension` 组与基线完全一致；因本任务语义变化而必须更新的既有断言（心得入口 link→button、正文先于心得块顺序、`#resource-notes` 锚点）逐条说明改了什么、为什么，并证明新断言不弱于旧断言。
11. **不新增依赖**，`package.json` 与锁文件不变。
12. **不动被排除的文件**：`base..candidate` 文件清单里不得出现 `ContentSnapshot.tsx`、`snapshotMarkdown.ts`、`ResourceDeletion.tsx`、`backend/**`、`extension/**`、`NotesPage.tsx`。以文件清单为证。

## 上下文包

- 规则：`AGENTS.md`、`frontend/AGENTS.md`、`docs/governance/风险分级与检查规则.md`。
- 必读源文件：`frontend/src/features/resources/ResourceDetail.tsx`（容器与现状）、`ResourceToolbar.tsx` + `.test.tsx`（心得入口、图标化与既有断言）、`frontend/src/features/notes/NotesPanel.tsx` + `.test.tsx`（写作区本体与 standalone 契约）、`frontend/src/App.tsx`（外壳/左栏折叠先例与 `inert` 无关、焦点权威）、`frontend/src/styles.css`（`.resource-sheet.reader`、`.detail-block`、`.notes-panel`、`.reader-*`、断点）、`frontend/e2e/reader-layout.spec.ts` 与 `notes-pages.spec.ts`（现网对正文下方心得块的断言）。
- 契约：无需改动。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-045-notes-sidebar.md --worktree`（预期只选中 `frontend`）。

## 已知取舍（登记时即知）

1. **默认收起意味着心得不在第一眼视野**：用户「主要在读、偶尔记」，开合由心得按钮承担——这是用户 2026-09-08 的选择。
2. **展开时正文确实被挤压**：这是「挤压式」的代价，用户接受，且只有写作/看心得的会话里发生。
3. **每次打开一份资料会有一次心得列表请求**（侧栏挂载即拉），即使从不点开——与旧版正文下方常驻块成本相同，非新增；换得角标零额外请求、重开不重拉、草稿不丢。
4. **断点值的取舍记录**：挤压断点抬高（保证正文可读）会扩大浮层适用面；压低调大正文收益但窄。以实测正文列宽定，记录理由。
5. **窄屏浮层为非模态 + 正文 inert**：不引入 focus trap 依赖；Tab 在浮层内到头后离开浮层会进其后元素，靠 `Esc`/收起归还（与既有面板一致）。
6. TASK-043 遗留 L14（`learning-pages.spec.ts:12` 状态标签手写字面量）**不在本任务**：改它形成新候选而收益不抵成本；若顺路且零风险可提，但不得扩大范围强做。

## 实现与测试

实现候选 SHA：`5e44075`（基线 `5ea0398` main，TASK-044 已合并；初版候选 `f1e96e1`，独立复审 CHANGES_REQUIRED 后修订，见下）。`base..candidate` 13 个文件全在 allowed_paths 内：**10 前端**（ResourceDetail / ResourceToolbar / ResourceToolbar.test / NotesPanel / NotesPanel.test / styles.css + e2e 4 件含新增 reader-notes-sidebar.spec.ts）+ **3 docs/tasks**（本记录、TASK-044 合并态登记行、任务索引行）。生产构建经 check_task 内置 `npm run build` 通过。

**变更摘要**

- `ResourceDetail.tsx` 作开合状态机：`useSqueezeLayout`（matchMedia `(min-width:1280px)`，jsdom 无 matchMedia 回退挤压态）；`notesOpen/focusRequest/notesCount` 状态 + `notesButton` ref；`onNotesClick`＝开合+聚焦一体（收起点击展开并聚焦写作框、展开点击聚焦写作框）；Esc 与「收起」经 `closeNotes` 把焦点还给「心得」按钮；`.reader-body` 内 `.reader-main`（窄屏浮层展开时 `inert`，React 19 布尔）+ `.reader-notes`（`<section aria-label="记录与理解">`，非 `<aside>`——section 祖先内 aside 映射 generic 会让 region 查询落空）。心得区**保持挂载、CSS 显隐**。
- `ResourceToolbar.tsx`：心得入口 `a`→`button`，`aria-expanded/ref`、`aria-label`/`title`=「心得」保留、可见文本为空；`notesCount>0` 才渲染 `.notes-badge`（aria-hidden），TASK-044 图标守卫对 0 心得默认仍成立。
- `NotesPanel.tsx`：只加可选 `focusRequest`（token 变化且有写作框时聚焦）与 `onCount`（读到 `total_items` 回传）；standalone 等独立用法不传，行为不变（单测 64 项顶层/资源路径保持通过）。
- `styles.css`：`.reader-body/.reader-main/.reader-notes` 网格 + 断点：≥1280px 展开为 `minmax(0,1fr) 340px gap24px` 挤压两栏（正文 ≥300px 让位）；<1280px 展开为 `.reader-body` 内 `position:absolute` 浮层（max-height:min(78vh,640px)，正文不挤压）；删除死规则 `.detail-block*`。
- 用例与 e2e：ResourceToolbar 新增「开合+聚焦 / Esc 归还焦点 / 角标」单测；新增 `reader-notes-sidebar.spec.ts` 宽屏挤压数值断言、角标实时 2→3、草稿跨收起存活、窄屏 320/390 浮层不挤压 + `inert` 真验证（focus() 偷不走正文首可聚焦节点）；既有 notes/resource-edit/reader-layout e2e 统一先「点心得展开」再操作，锚点→按钮与顺序断言逐条说明改因。

**复审修订（`f1e96e1` → `5e44075`；独立 Reviewer R1/R2 均 CHANGES_REQUIRED，逐条修）：**

- **R2 F1 焦点回归 → `NotesPanel.tsx`**：focusRequest 改为**单调 token、同一 token 只消费一次**（`lastFocusRequest` ref）。父级资源刷新让 `available` 短暂翻 false 再回 true，旧 effect 把那次翻转也当新请求，焦点被强拉回写作框、打断用户正在别的面板上的操作。新增 NotesPanel 单测：请求聚焦一次后 `available` 先翻 false 再回 true，写作框**不再**被重新聚焦（已把实现还原成旧逻辑验证该测试变红，确是真守卫）。注：NotesPanel 顶层子节点无 key，`!available` 插入提示段落在 jsdom 与真浏览器里都会按类型逐位调和重建下方子树——测试只断言「写作框不被抢回」，不锚定会被重建的按钮，避免验到调和假象。
- **R1 finding 2 Esc 双关 → `ResourceDetail.tsx`**：心得侧栏开着时再开 ⋯ 菜单、焦点在菜单项上，旧全局 Esc 监听把菜单**和**侧栏一起关掉、焦点还被心得按钮抢走。Esc 只属于当前正被操作的表面：焦点在工具条内且既非心得按钮也非心得区时，交给菜单自己的 Esc（收菜单、焦点回 ⋯ 触发钮）。新增 ResourceToolbar 单测：侧栏开 + 菜单开 + 焦点在菜单项，Esc 后菜单关、`aria-expanded` 仍为 true、焦点回 ⋯（去掉守卫该测试变红，确是真守卫）。
- **F2 角标回落覆盖 → `reader-notes-sidebar.spec.ts`（宽屏）**：增删一条真实心得走完整删除确认（勾选「我确认永久删除上方这条心得」→ 确认删除），断言角标实时 3→2、后端 `total_items` 2；末尾后端断言由 3 改 2（删掉的那条已不在库）。
- 记录把 `checks` 的**描述句误写进了机器字段**：该字段只放 profile 名集合（空即按改动路径推断 frontend 组），已还原为 `[]`；这些结果句本就该待在本节正文。

**检查真实结果**（工作区=最终候选 `5e44075`）

- `npm run format:check` → All matched files use Prettier code style!（退出 0）
- `npm run lint` → 干净退出 0；`npm run typecheck`（`tsc -b`）→ 退出 0
- `npx vitest run` → 23 文件 **539** 用例通过（较 f1e96e1 的 537 净增 2 条回归守卫）
- `npx playwright test`（全量 e2e，真实后端）→ **49 通过**；reader-notes-sidebar 2/2（宽屏含删除回落步骤）
- `backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-045-notes-sidebar.md --worktree` → CHECKS PASS

**实现中发现并修复的回归（已作证据核对）**：全量单测起初间歇 2–3 红于 `ContentSnapshot.test.tsx`（该文件未动、且在 allowed_paths 之外）。用基线 worktree（`/tmp/sp-baseline`，HEAD `20b68e7`）二分定位：只有我改的 `ResourceDetail.tsx`+`NotesPanel.tsx` 同时存在才复现；进一步停用 onCount 调用即 9/9 绿 → 根因是 NotesPanel 把 `total_items` 回传后父级 `setNotesCount` 重渲染，恰撞上快照取回落库的提交时序，把刚提交的正文节点撕裂（`findByRole` 找到但已 detached）。修复=在 `ResourceDetail.tsx` 用**模块级 `memo(ReaderContent)`** 把正文子树隔离在工具条状态更新之外（props 不变就不进子树）。复验：修复后 `ContentSnapshot.test.tsx` 与全量单测连跑 4 次全绿，另有干净基线对照。附带收益：角标/开合这类工具条状态不再无谓重渲染整个快照子树。

**e2e 写作修正**：种子 `source_url` 直接拼中文+空格后缀会 422（不合法 URL），改 `encodeURIComponent(suffix)`（201）；窄屏 inert 探针由 `.snapshot-rendered`（种子无快照时不出现）改为正文内首个可聚焦节点（`button:not([disabled]),[href],[tabindex]` 首个，先断言存在避免空过）。

**已知限制/遗留**：完成条件逐条对应通过（正文优先 e2e、h1 焦点契约、standalone 用例、既有断言计数只增不减、`package.json` 未变、`base..candidate` 文件清单无被排除文件）。遗留项登记：无阻塞；窄屏浮层 Tab 越过浮层尾部后的去向与既有 ToolbarPanel 一致，不做 focus trap（记录内已知取舍 5）。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- **最终候选**：`5e44075`（基线 `5ea0398`；修订自首轮 `f1e96e1`）。
- **独立 Review×2（最终候选）**：均 **PASS**。两位 Reviewer 首轮审 `base..f1e96e1` 全量（均 CHANGES_REQUIRED），本轮增量审 `f1e96e1..5e44075` 并继承首轮范围，结论覆盖最终候选 `5e44075`；机器检查全绿（vitest 539 / e2e 49 / check_task CHECKS PASS）。
- **风险/状态决定**：L3 保留，进入 L3 独立 Integration/Acceptance（本区下方将追加其结果与验收结论）。两条非阻断记录项（见本区末）不涉安全底线、必要检查或已确认需求/契约缺失，不阻断；按独立复审结论 PASS 附已明确处置的非阻断问题处置。

### 复审报告 R1（续审 `f1e96e1` → `5e44075`；结论 PASS，附两个非阻断记录项）

结论基于只读静态核验：运行器只授 Read/Grep/Glob，无写工具，未修改任何文件；工作树即最终候选 `5e44075`（干净）。已读 `/tmp/sp-t045-revision-delta.diff`、`/tmp/sp-t045-final-5e44075.diff` 及仓库当前文件，覆盖最终候选 `5e44075`；第一轮曾审 `f1e96e1` 全量 diff，本轮复核 `f1e96e1..5e44075` 增量（仅五个文件）并继承对 `styles.css`/`ResourceToolbar.tsx`/其余 e2e 与 docs 的首轮结论。

1. **Esc 双关（R1 finding 2）— 已修。** 守卫在 ResourceDetail.tsx:107-112：焦点在 `.reader-notes`（inNotes）或心得按钮本体（onNotesToggle）或工具条外（正文/页面别处）才 `closeNotes()`；菜单项等工具条内其它位置让给菜单。菜单 DOM（`.reader-menu`）确在 `.reader-toolbar` 内（ResourceToolbar.tsx:110,198），所以 menuitem 聚焦时命中 defer。新单测 ResourceToolbar.test.tsx:156-172 经 `mount()` 渲染整个 `<App>`，ResourceDetail 的真实 document 监听在树，能区分旧逻辑：旧逻辑下 notes 监听会把 `aria-expanded` 关成 false，断言 `toggle` 仍 true 会红。合理焦点位均已覆盖。残余（非阻断）：守卫对所有「工具条内非心得控件」一律 defer，即便该表面并未打开——例如菜单被 Esc 收回、焦点停在 ⋯ 触发钮后再按一次 Esc，侧栏不再被关（第一下之后 Esc 变「死键」）。影响有限、不抢焦点，建议收窄为「仅当焦点在正打开的表面（菜单/面板）内才 defer」，可记录后继续。
2. **删除回落 e2e（F2）— 已修。** reader-notes-sidebar.spec.ts:107-119 走真实后端完整删除：保存一条→列表卡片「删除」→确认勾选→「确认删除心得」→status→角标 3→2、后端 `total_items` 2；末尾 :135 后端断言同步改 2。删除语义自洽：choose→getNote 取最新版→DELETE 带 If-Match（api.ts:153-165）。断言用 Playwright 自动重试且后端计数精确，无假阳性（删除失败/版本冲突会停在 3 而变红）。
3. **焦点回归（F1）— 已修，含一处新盲点。** NotesPanel.tsx:73-80 单调 token + `lastFocusRequest` ref，同一 token 只消费一次。新单测 NotesPanel.test.tsx:258 确能区分旧逻辑：`available` 翻 false→true 时旧 effect 会重跑并重新聚焦新重建的 textarea（断言 not.toHaveFocus 变红）。注释所述「顶层无 key、!available 插入核对提示段导致子树重建」属实（提示段在 NotesPanel.tsx:283，位于 `<form>` 之前会致 textarea 重建），断言锚在 textarea 而非会重建的按钮，非空过。新盲点（非阻断、窄窗口）：token 在 `available/deleting/pending` 守卫**之前**就被标记消费（:75-76），若点击正好落在资源刷新 `available=false` 窗口，token 被烧掉而聚焦未发生，available 回来后不再补焦，直到下次点击。属瞬态边缘，可记录。
4. **范围与记录 — 已修。** base..candidate 全 diff 恰 13 文件（10 前端 + 3 docs/tasks），全部在 allowed_paths，无 `ContentSnapshot.tsx`/`snapshotMarkdown.ts`/`ResourceDeletion.tsx`/`NotesPage.tsx`/`backend`/`extension`。记录 :142 已写 13 文件与 SHA `5e44075`；:25 `checks = []` 正确；:157 对误写已作说明。

**增量新缺陷**：无阻断级；上述两个窄边缘为可记录后继续的可选项。**剩余风险**：Esc 归还契约在最常见的「焦点在心得区/正文/按钮」路径上均保持；复合表面链的第二下 Esc 与刷新窗口点击是仅有的偏离。**结论：PASS**（附两个非阻断记录项）。

### 复审报告 R2（续审 `f1e96e1` → `5e44075`；结论 PASS，附两个非阻断记录项）

增量复审完成。三份 diff 与工作树（即最终候选 `5e44075`）均已静态核验，只读能力为 Read/Grep/Glob（无写工具、无 Bash），未改动任何文件。候选 `5e44075`、基线 `5ea0398`、本轮范围 `f1e96e1..5e44075`；工作树文件与最终 diff 一致；`base..candidate` 13 个文件全部落在 allowed_paths，未出现被排除文件。

- **F1 焦点回归 — 已修。** NotesPanel.tsx:73-80：`lastFocusRequest` ref 单调消费，顺序正确——相等即 return（:75），随后在 `if (!focusRequest) return`（:77）**之前**无条件把 ref 更新为当前 token（:76）。故 available/deleting/pending 翻转只会让 effect 重跑但命中等同 return，不再聚焦；原 bug 形态确被切断。新单测（NotesPanel.test.tsx:258-276）对旧逻辑必红：无 key 顶层子节点下，`!available` 插入提示段会使 form/textarea 子树按位重建、输入框失焦，新逻辑 effect 早退不再抢回，旧逻辑则 `input.current?.focus()` 抢回——判别有效，非空过，也非调和假象误报。
- **R1 finding 2 Esc 双关 — 已修。** ResourceDetail.tsx:107-112 守卫在 focus 位于 `.reader-toolbar` 内且非心得区、非心得按钮时 return。已核实 `.reader-menu`/`.reader-panel` 均在 ResourceToolbar.tsx:110 的 `.reader-toolbar` 根内，故菜单项命中 return、交给菜单自己的 Esc；新单测（ResourceToolbar.test.tsx:156-172）经 `mount()` 渲染完整 `App`，Notes 侧 document 监听先注册先执行，去掉守卫会因 `closeNotes` 抢焦点/关侧栏而红，是真守卫。
- **F2 角标回落 — 已修。** 宽屏 e2e 走真实删除确认，断言角标 3→2、后端 `total_items` 2（reader-notes-sidebar.spec.ts）。
- **范围与记录 — 已修。** TASK-045 记录 `checks=[]` 已还原、SHA/13 文件数与 diff 一致。
- **新问题/剩余风险（非阻断）**：① F1 设计为「token 一旦到达即消费，无论是否真正聚焦」：若点击恰落在 `available=false` 的刷新窗口，该次聚焦请求会被永久丢弃（侧栏开但焦点停按钮）。触发面窄、降级轻微，属一次性的有意取舍。② Esc 守卫使「焦点停在工具条普通控件（无打开的面板）时按 Esc」不再收起侧栏（修复前会关）。语义自洽且主要关闭路径（心得区/心得按钮/正文）不受影响。

**结论：PASS**。继承第一轮 `base..f1e96e1` 全量审查范围，本轮对四个修订项及受影响上下文做了增量核验，结论覆盖最终候选 `5e44075`。无新增阻断缺陷。

### 非阻断记录项（两 Reviewer 一致，已明确处置，不阻断）

1. Esc「死键」：菜单收回、焦点停工具条普通控件后再按 Esc 不再关侧栏（守卫让给表面自身）；两方建议可后续收窄为「仅当焦点在正打开的表面（菜单/面板）内才 defer」。影响有限、不抢焦点。
2. F1 token 提前消费：token 在 available/deleting/pending 守卫**前**即标记消费，点击若恰落在刷新 `available=false` 窗口则本次聚焦被烧掉、available 回来后不补焦直到下次点击。瞬态窄窗口。

（本区 Integration/Acceptance 结果将追加于下。）

<!-- EVIDENCE:END -->
