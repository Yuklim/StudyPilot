# TASK-044：给阅读器腾出空间 —— 压缩页面外壳与按钮图标化

```toml
schema_version = 2
id = "TASK-044"
status = "IN_REVIEW"
risk = "L3"
risk_reason = "本任务改的是**应用外壳**，影响每一条路由，不是某一页的局部调整。三处实质风险：① `h1` 是路由切换后的**焦点落点**（`App.tsx` 用 ref + tabIndex={-1} 聚焦它，`App.test.tsx` 的返回路径用例逐条断言「点返回链接后目标页 h1 获得焦点」）。本任务让阅读器页的 h1 变成资料标题，等于按路由改变这条全局无障碍契约，改错会让键盘与读屏用户在导航后失去落点，而这类失效在视觉上完全看不出来。② **按钮去掉可见文字**是一次可访问性与可学习性的实质变化；更关键的是**本仓所有测试都按可访问名称查控件，因此图标化之后测试照样全绿——它们结构性地抓不到「按钮上没有可见文字了」**，这一点已当面告知用户。③ 左栏折叠引入一份新的浏览器本地状态，且折叠态下五个导航入口全靠图标辨认。另有跨模块面：同时改 `App.tsx`、`shell/`、`features/resources/`。不改后端一行、不改 `/api/v1` 与 openapi、不改本机访问门禁、不改 `extension/`、不改任何写入语义。"
risk_flags = ["architecture", "business"]
owner = "coordinator"
base = "652f9389988301976c0bccde903b0b3932dff9a7"
allowed_paths = [
  "frontend/src/App.tsx",
  "frontend/src/App.test.tsx",
  "frontend/src/shell/pages.ts",
  "frontend/src/shell/Icon.tsx",
  "frontend/src/shell/heading.tsx",
  "frontend/src/shell/Screen.tsx",
  "frontend/src/shell/ShellPages.test.tsx",
  "frontend/src/features/resources/ResourceToolbar.tsx",
  "frontend/src/features/resources/ResourceToolbar.test.tsx",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/features/resources/ResourceDeletion.test.tsx",
  "frontend/src/features/resources/ResourceEditor.test.tsx",
  "frontend/src/features/resources/FilePages.test.tsx",
  "frontend/src/features/taxonomy/ClassificationPages.test.tsx",
  "frontend/src/features/learning/LearningPages.test.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/**",
  "docs/tasks/TASK-043-reader-toolbar.md",
  "docs/tasks/TASK-044-compact-chrome.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

### 用户授权

2026-09-07 用户合并 PR #48（TASK-043，merge `652f938`）后指出：「阅读器还是太小，页面上部分：资料详情、『原始资料与自己的理解，各有一个位置』、『网页、文件与粘贴资料已开放…』，这些内容占用空间太大。同时心得、原网页、编辑功能等按钮可以改为组件，不显示文字，这样的话比较省空间，看着也好看。左边栏目也可以考虑只保存图标。」随后就三个选项作答：**阅读器页把 h1 换成资料标题**、开发阶段横幅**只在概览页显示**、**工具条图标化 + 左栏可折叠**。

### 登记前的实测（不是估算）

用 Playwright 在真实浏览器里量了改版后的详情页，正文第一个字的位置：

| | 1440×900 | 390×844 |
| --- | --- | --- |
| 「本机学习空间」徽章行 | 30px | 26px |
| 页头块（eyebrow + 标题 + 说明句） | 99px | 93px |
| 开发阶段横幅 | 45px | 87px |
| 工具条 | 100px | 148px |
| **正文起点** | **582px** | **867px** |

**390px 下正文起点 867px > 视口 844px：正文一个字都不在第一屏。** 宽屏 582px 里有 174px 是每页重复、与这份资料无关的外壳。

**顺带记一条 TASK-043 的断言缺口**：那个任务的 e2e 断言「正文标题落在视口高度以内」，但它跑在默认 1280×720 视口上，390px 下并不成立——**断言比它宣称守住的东西窄**。本任务须在窄屏也钉住这条。

### 目标

1. **阅读器页去掉页头块**：资料标题由工具条里的 `h2` 升为 `h1`，并成为该路由的焦点落点；其余页面的页头保持现状。
2. **开发阶段横幅只在概览页显示**。
3. **工具条按钮图标化**：心得、原网页/原件/粘贴原文、`⋯` 只留图标，保留可访问名称与悬停提示；学习状态徽章保留文字（它显示的是状态与百分比，不是一个可图标化的动作）。
4. **左栏可折叠**：宽窄两态由用户自选，选择记在浏览器本地；折叠态只显示图标。
5. **窄屏正文进第一屏**：390px 下正文起点必须小于视口高度。

### 非目标（明示不做）

- **不做挤压式心得侧栏、不做窄屏浮层、不做心得数量角标**——那是原定 TASK-044 的内容，本任务插队后**顺延为 TASK-045**。
- **不改任何写入语义**：删除三步确认、学习状态的版本化写、心得与标签的写入路径一字不改。
- **不动 `ContentSnapshot.tsx` 与 `snapshotMarkdown.ts`**——快照的渲染安全形态不在本任务范围内。
- 不改后端、`/api/v1`、openapi、本机访问门禁、`extension/`；不新增依赖。
- 不改左栏的导航结构（哪些入口、分几组），只改它的呈现与可折叠性。

### 禁止范围

所有未列入 `allowed_paths` 的路径；额外禁止：`backend/**`、`extension/**`、`docs/contracts/**`、`frontend/src/api/**`、`frontend/src/features/notes/**`、`frontend/src/features/resources/ContentSnapshot.tsx`、`frontend/src/features/resources/snapshotMarkdown.ts`、`frontend/src/features/resources/ResourceDeletion.tsx`、`scripts/governance/**`、`AGENTS.md`、`docs/governance/**`。

### 授权范围的一次修订（实现开始后，2026-09-07）

**新增 `frontend/src/shell/heading.tsx`，登记时没有预见到。** 目标 1 要求「阅读器页自己渲染 `h1`」，而 `h1` 是外壳统一管理的焦点落点——两者之间需要一条把元素交回外壳的通道。登记时我以为改 `App.tsx` 与 `ResourceDetail.tsx` 就够，实际需要一个双方都能引用的小模块，否则要么把焦点逻辑复制到每个自带标题的页面里（那正是这条无障碍契约最容易破的地方），要么在 `App.tsx` 里去 DOM 里捞 `h1`（异步内容下不可靠）。

**这是一个新的实现文件，不是测试文件**，比 TASK-043 那两次修订更实质，因此单独记在这里。它只有 15 行：一个 React context 加一个 hook，不含任何业务逻辑。**是 `check_task.py` 拦下来的**——`FAIL: out of scope: frontend/src/shell/heading.tsx`，不是我自己发现的。

### 依赖/前置条件

基线 `652f9389988301976c0bccde903b0b3932dff9a7`（main，TASK-043 已合并）。无未合并依赖。

### 并行

否。唯一写入者 `coordinator`。

### 顺带完成的状态登记

`docs/tasks/TASK-043-reader-toolbar.md` 在 `allowed_paths` 内，用于登记用户 2026-09-07 合并 PR #48（merge commit `652f938`）这一事实，依据根 `AGENTS.md` §5。**预期改动两行**（`status` 与 EVIDENCE 标记区内「最终状态/风险/用户操作」那一行）；实际改了几行以最终 diff 为准，不以本句为准。

## 关键设计决定

### ① 阅读器页的 h1 是资料标题，其余页不变

这一页的标题本来就该是这份资料的名字，而不是「资料详情」四个字。省掉整个页头块的同时语义更对。

**但它动了一条全局契约**：`App.tsx` 把 `h1` 作为路由切换后的焦点落点，`App.test.tsx` 有三条参数化用例断言「点返回链接 → 目标页 h1 获得焦点」。因此完成条件要求：阅读器页仍**恰好有一个 h1**、它是资料标题、且切到这一页后焦点落在它上面；资料读取中/读取失败时也必须有 h1（否则那一屏没有焦点落点）。

### ② 图标化必须自带「测试抓不到」的补偿

本仓所有测试按可访问名称取控件，图标化后它们照样绿。**因此不能只靠单测**：完成条件要求每个图标按钮同时具备 `aria-label`（可访问名称，与原文字一致）与 `title`（鼠标悬停提示），并有用例直接断言按钮的**可见文本为空**——这一条正是在钉「文字确实拿掉了」，与「可访问名称还在」互为两面。

学习状态徽章不图标化：它显示的是「学习中 · 35%」这样的**值**，不是动作。

### ③ 左栏折叠是用户自选，不是自动

折叠态下五个入口全靠图标辨认，认不认得出因人而异。所以给一个显式的折叠按钮、选择记在 `localStorage`，默认展开——不替用户决定。窄屏下左栏本就是另一套布局，本任务不改它。

## 完成条件

1. **阅读器页正文进第一屏**：390×844 与 1440×900 两档下，渲染后的正文首个标题的 `boundingBox().y` 均小于视口高度。须有真实浏览器 e2e 断言，**且必须显式设置窄屏视口**——TASK-043 那条断言跑在默认视口上，窄屏并不成立。
2. **阅读器页恰好一个 h1，且是资料标题**：`getAllByRole('heading', { level: 1 })` 长度为 1，内容为资料标题。须有用例。
3. **焦点落点不退化**：从资料库点进详情页、以及从详情页点返回再进入，焦点落在该页 h1 上；`App.test.tsx` 既有的三条返回路径用例保持通过且不弱化。须有用例。
4. **读取中与读取失败时仍有 h1**：这两屏也必须有唯一 h1 与返回入口。须有用例。
5. **其余页面的页头未变**：概览、资料库、分类、心得、学习历史各自的 h1 与说明句保持原样。须有用例。
6. **开发阶段横幅只在概览页**：概览页有，资料库/详情/分类/心得/学习历史都没有。须有用例逐页断言。
7. **工具条图标按钮**：心得、原文/原件、`⋯` 三处只有图标，**可见文本为空**，但可访问名称与悬停提示（`title`）与原文字一致。须有用例同时断言这两面。
8. **学习状态徽章仍显示文字**（状态 + 百分比）。须有用例。
9. **左栏可折叠**：有一个可按可访问名称取到的折叠/展开按钮；折叠态下导航项的可见文本为空而可访问名称仍在；选择在重新加载后保持。须有用例。
10. **折叠态的宽度确有收益**：1440px 下折叠后左栏宽度显著小于展开态。须有真实浏览器断言（数值而非截图）。
11. **窄屏不崩**：320/390/1440 三档不横向溢出，折叠与展开两态都测。
12. **既有断言只增不减**：三组测试计数只增不减，`extension` 组与基线完全一致；因外壳变化而必须更新的既有断言逐条说明改了什么、为什么，并证明新断言不弱于旧断言。
13. **不新增依赖**，`package.json` 与锁文件不变；新图标加在既有 `Icon.tsx` 里。
14. **不动被排除的文件**：`base..candidate` 的文件清单里不得出现 `ContentSnapshot.tsx`、`snapshotMarkdown.ts`、`ResourceDeletion.tsx`。**这是「快照安全形态与删除流程未变」的结构性论据**，须以文件清单为证。

## 上下文包

- 规则：`AGENTS.md`、`frontend/AGENTS.md`、`docs/governance/风险分级与检查规则.md`。
- 必读源文件：`src/App.tsx`（117 行，外壳与焦点落点）、`src/App.test.tsx`（116 行，返回路径与横幅断言）、`src/shell/pages.ts`（127 行，各页标题与说明）、`src/shell/Icon.tsx`（32 行，8 个图标，需新增几个）、`src/shell/Screen.tsx`、`features/resources/ResourceToolbar.tsx`（372 行）。
- 契约：无需改动。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-044-compact-chrome.md --worktree`（预期只选中 `frontend`）。

## 已知取舍（登记时即知）

1. **图标化去掉了可见文字**，认不认得出因人而异；**本仓的测试结构性地抓不到这一点**（全部按可访问名称查），只能靠人看。
2. **折叠态的左栏全靠图标辨认**，因此默认展开、由用户自选。
3. **开发阶段横幅从其余页面消失**，「复习、统计尚未开放」这个预期只在概览页交代一次。
4. **阅读器页不再显示「资料详情」这个页面名**，用户靠标题与返回链接判断自己在哪。
5. 心得侧栏、窄屏浮层、心得数量角标顺延至 TASK-045。

## 实现与测试

- **变更摘要**：
  - **`shell/pages.ts`** 新增 `ownHeading`：置为 true 的页面自己渲染 `h1`。阅读器页用它去掉整个页头块。`title` 仍在用——它是浏览器标签页的名字。
  - **`shell/heading.tsx`（新）**：一条把页面自己的 `h1` 交回外壳的通道。**焦点的权威仍然只有一个**（`App.tsx`），页面只负责登记——「谁聚焦」没有变成每页各写一遍的事，那正是这条无障碍契约最容易破的地方。
  - **`App.tsx`**：页头块按 `ownHeading` 跳过；开发阶段横幅只在 `/`；左栏加折叠按钮（`localStorage`，读写各自 try/catch，读不出来默认展开）；折叠时导航项**不渲染文字节点**，名字由 `aria-label` 提供。
  - **`shell/Icon.tsx`** 新增 7 个图标（note / external / file / paste / more / collapse / expand）。图标一律 `aria-hidden`，名字由按钮自己的 `aria-label` 出。
  - **`ResourceToolbar.tsx`**：资料标题由 `h2` 升为 `h1` 并登记为焦点落点；心得、原网页/原件/粘贴原文、`⋯` 改为**不含任何文字节点**的图标按钮（`aria-label` + `title`）。学习状态徽章保留文字——它显示的是「学习中 · 35%」这样的**值**，不是动作。
  - **`ResourceDetail.tsx`**：读取中与读取失败时各渲染一个 `h1`（「正在打开资料」/「这份资料打不开」）并保留返回入口。
- **一处真实失效，被既有用例先抓到**：阅读器先渲染「正在打开资料」这个 `h1` 并拿到焦点，数据到了再换成真正的标题——**旧节点一移除，焦点就掉到 `body`**，导航过来的键盘用户在数据到达的一瞬间失去落点，而屏幕上完全看不出来。`ResourcePages.test.tsx` 里「保存后跳到详情页」那条当场变红。已在 `App.tsx` 补上焦点交接：本次路由已经聚焦过、且此刻焦点无处可去时，由新登记的 `h1` 接管（不抢用户点到别处的焦点）。
- **一条我自己写错、随后删掉的用例**：我原本在 `ResourceToolbar.test.tsx` 里手动 `focus()` 占位标题来测这个交接，但真实路径是**路由切换**，手动聚焦不会设置那两个状态位，于是断言必然失败。删掉它，改为在 `ResourcePages.test.tsx` 那条真正走路由切换的用例上写明它守的是什么——**那条在 `App.tsx` 修好之前确实是红的**。
- **实测收益（真实浏览器，与登记时同一种量法）**：

  | | 改前 | 改后 |
  | --- | --- | --- |
  | 正文起点 · 1440×900 | 582px | **391px**（−191） |
  | 正文起点 · 390×844 | 867px（视口 844，**不在第一屏**） | **709px**（进第一屏） |
  | 左栏宽 · 1440px | 228px | **68px**（折叠态） |

- **命令与真实退出结果**（全部由实现者本人在本机运行，无第三方复核）：
  - `check_task.py --worktree` → **CHECKS PASS**，`risk=L3`，`profiles=frontend`，`files=20`，`product_fingerprint=2e26fbabb4dd3dcbba7bb19196435284ed9016c101e25e20781b8d12f55f64de`（此前候选依次为 `a69224db…`、`c884b2a6…`）。
  - **frontend 536 passed**（23 文件），基线 **512**（22 文件），净增 **24**（处置验收后再补 2：完成条件 5 的说明句由 3 页补到 5 页）（首轮 15，处置 Review 后再补 7：`ShellPages.test.tsx` +4（说明句 3 条 + 「只有阅读器页丢掉页头块」1 条）、`ResourceToolbar.test.tsx` +3（非 WEB 分支两个图标按钮的参数化 2 条 + 直接打开 URL 不抢焦点 1 条））。**「左栏按钮恰好一个」是加在既有 `it.each` 里的断言，不计入用例数**——初稿的拆分把它当成新用例、又漏掉了那条反向用例，两处恰好抵消所以总数没错，但清单会误导后来核对的人，R2 指出后更正：新建 `shell/ShellPages.test.tsx` 10 条（横幅分页断言 5 条 + 折叠 5 条），`ResourceToolbar.test.tsx` +5（唯一 h1、读取中/读取失败各一条、图标按钮的双向断言、状态徽章仍是文字）。
  - **e2e 47 passed**，基线 **44**，净增 3（窄屏第一屏、标题即页面标题且到达时获焦、左栏折叠确有宽度收益）。**这一次明确把「跑了多少」与 `npx playwright test --list` 的「收集多少」对上了：47 = 47**——上一轮我正是没做这一步才把 7 条失败当成通过。
  - `npm run typecheck` / `lint` / `prettier --check` 全绿。
  - **backend 与 extension 未运行**：本任务在这两棵树下零改动、不在 `allowed_paths` 内，检查脚本据变更自动选组因而只选中 `frontend`。**这是结构性论据，不是观察到它们仍为绿。**
  - **实现者本人用 git 逐条复核（两位 Reviewer 都没有 Bash，四轮报告里都明说这类论据核不了）**：`git diff --name-only 652f938..2528466` 得 **20 个文件**，与 `files=20` 一致，全部在 `allowed_paths` 内。完成条件 14 的三个文件逐个查证均为 0 个改动：`ContentSnapshot.tsx`、`snapshotMarkdown.ts`、`ResourceDeletion.tsx`；`package.json` 与 `package-lock.json` 也是 0（完成条件 13）；`backend/**`、`extension/**`、`docs/contracts/**` 合计 0。**这是实现者单方的机械证据，但它是 git 级的，不是替代论据。**
  - **20 个文件清单**：`docs/tasks/{TASK-043,TASK-044,任务索引}`；`frontend/e2e/{reader-layout,resource-pages,scaffold,taxonomy}.spec.ts`；`frontend/src/{App.tsx,App.test.tsx}`；`frontend/src/features/resources/{ResourceDeletion.test.tsx,ResourceDetail.tsx,ResourcePages.test.tsx,ResourceToolbar.test.tsx,ResourceToolbar.tsx}`；`frontend/src/features/taxonomy/ClassificationPages.test.tsx`；`frontend/src/shell/{Icon.tsx,ShellPages.test.tsx,heading.tsx,pages.ts}`；`frontend/src/styles.css`。
  - 环境：macOS Darwin 25.5.0；Node 24；Chromium（Playwright）。
- **一次我自己读错测试结果的记录**：处置到一半时我用 `npm run test:e2e 2>&1 | tail -8` 看结果，只看到「40 passed」就当过了。**实际是 7 条失败**——失败清单 7 行加上「7 failed」正好 9 行，`tail -8` 把「7 failed」那一行切掉了。更关键的是我**没有把 40 和应有的 47 对上**：`npx playwright test --list` 显示收集 47 条，40 ≠ 47 本身就是信号。已改为把完整输出落盘再读。
- **既有断言的改动（逐条说明）**：
  0. **先更正一句我自己写错的总括**：初稿写「无删除、无弱化」，**R2 用两处收窄证伪**。把「没有假控件」的范围从整个文档收到 `#main-content` 之后，旧写法隐含保证的「左栏一个按钮都没有」凭空消失了，而我没有补替代断言。已在 `App.test.tsx` 与 `scaffold.spec.ts` 各补一条：左栏的按钮**恰好是折叠导航栏这一个**，并断言它的可访问名称。补上之后这两处才真的是收紧。
  1. `App.test.tsx`：横幅断言由「每页都有」改为「只有概览页有、其余页没有」（**更强**，它现在同时钉住了正反两面）；「没有假控件」那条的范围由整个文档收到 `#main-content`（左栏的折叠按钮是真控件，不该被它误伤）。
  2. `scaffold.spec.ts`：同上两处；`/resources/synthetic-id` 的 h1 由「资料详情」改为错误态的「这份资料打不开」，**并保留** `toHaveTitle('资料详情 · StudyPilot')`（标签页名字没变）。
  6. **一处我加了又被要求撤回的弱化**：窄屏循环里我把 `getByRole('heading', { level: 1 })` 改成了 `.first()`。R2 指出这**悄悄放宽了原来由 strict mode 隐含保证的「每页恰好一个 h1」**，而且是未登记的弱化；我用 `git diff` 确认那个 `.first()` 确实是本次加的。已改回显式的 `toHaveCount(1)` + `toBeVisible()`，比原来更明确。
  3. `ResourcePages.test.tsx` / `ResourceDeletion.test.tsx` / `ResourceToolbar.test.tsx` / `taxonomy.spec.ts` / `resource-pages.spec.ts`：资料标题的 heading level 由 2 改为 1。
  4. `ResourcePages.test.tsx` 的焦点断言由「『资料详情』h1 获焦」改为「资料标题 h1 获焦」并加断言「不再存在『资料详情』这个 heading」——**更强**：同时钉住了标题是什么与焦点落在哪。
  5. `ClassificationPages.test.tsx`：认详情页的标志由「资料详情」h1 改为资料标题 h1。
- **Review 后的处置（形成新候选）**：
  - **R2（必须记录）**：见上文「既有断言的改动」第 0 条与第 6 条——我那句「无删除、无弱化」被两处收窄证伪，`.first()` 是未登记的弱化。两处都补了替代断言，不是改措辞了事。
  - **R2（完成条件 5 的覆盖缺口）**：「其余页面的**说明句**保持原样」此前一条用例都没有。已补，并且**从 `pageAt()` 真值表取标题与说明句**——我第一版凭印象写了两句 caption，两句都不对，**这是本任务同一形态的第三次**（前两次：`ShellPages.test.tsx` 里把「学习记录」写成「学习历史」的死参数、以及 TASK-043 那次状态标签正则）。
  - **R1（焦点窗口偏宽）**：交接成功后把 `focusedForRoute` 置回 false，把「焦点在 body 就接管」的窗口收敛到一次，而不是开到离开这条路由为止。
  - **R1（图标守卫有缺口）**：反向断言原本只覆盖 WEB 分支的三个按钮，漏了 `OriginalEntry` 另一段 JSX 里的「原件」「粘贴原文」；且只断言 `title` 存在、不校验值。两处都补上。
  - **R1（缺守卫）**：「直接打开 URL 不该抢焦点」此前只有实现没有用例——而那正是 `focusedForRoute` 这个状态位存在的唯一理由。已补。
  - **R1（小修）**：`localStorage.setItem` 从 `setState` 的更新函数移到事件处理器（更新函数应当是纯的）；折叠态下 `.sidebar-footer` 一并收起；`ShellPages.test.tsx` 的死参数「学习历史」改为「学习记录」。
- **验收判 BLOCKED 的那个缺陷，以及它为什么没被我的断言抓到**：
  - **用户在真机上先发现**：左栏收起后正文区没有变宽，左栏与正文之间空出一大条。独立验收随后**独立复现同一结论**并判为阻断项。
  - **根因**：`.app-shell` 是 `grid-template-columns: 228px minmax(0,1fr)`，我只给 `.sidebar` 元素设了 `width:68px`，**没有收窄网格轨道**。于是折叠只换来一条 68px 图标栏加 160px 空白带。
  - **我的断言恰好抓不到**：完成条件 10 我写的是「折叠后左栏宽度显著小于展开态」，e2e 量的也是 `.sidebar` 自己的 boundingBox（228→68，通过）。**目标是「把空间还给正文」，而我断言的是「左栏变窄」**——断言比目标窄，这正是本任务立项时用来批评 TASK-043 的同一形态，我自己又犯了一次，而且犯在本任务的主功能上。
  - **处置**：加一条 `.app-shell.nav-collapsed { grid-template-columns: 68px minmax(0,1fr) }`；≤760px 那一档用媒体查询把宽度约束撤掉（那里是 `display:block`，没有轨道可收）。**断言改绑到正文区**：起点左移、宽度增加，且增量与左栏减量相当。真实浏览器实测：正文区 **1212 → 1372px**（+160，正好是左栏省下的 160）。
  - 验收另指出的三条一并处置：说明句的覆盖由 3 页补到 5 页（完成条件 5 点名的 `/classifications`、`/notes` 此前没有）；折叠那条 e2e 显式设 1440×900 视口（此前跑在 Playwright 默认 1280×720，而条件写的是「1440px 下」——又是「断言没钉住条件字面」）；`资料库` 链接的定位限定到左栏并用 `exact`。
- **已知限制/未完成项**：
  1. **正文里的 `# 标题` 本身渲染成 `h1`**，因此整页不止一个一级标题。这在本任务之前就存在（那时是「资料详情」+ 正文标题），本任务只是让页面那一个变成了资料名。要把正文标题降级得改 `snapshotMarkdown.ts`，而那是本任务明确排除的文件——留给后续任务。用例用 `pageHeadings()` 把正文区排除在外，这一点写在那个辅助函数的注释里。
  2. **图标认不认得出，测试帮不上忙**：本仓所有测试按可访问名称查控件，图标化之后照样全绿。唯一的机器守卫是那条反向断言（可见文本为空 + 名称与 `title` 都在），「好不好认」只能靠人看。
  3. **左栏折叠态下五个入口全靠图标辨认**，因此默认展开、由用户自选。
  4. **开发阶段横幅从其余页面消失**，「复习、统计尚未开放」这个预期只在概览页交代一次。
  5. **窄屏（≤760px）下左栏是另一套布局**（`display:block`，没有网格轨道可收），折叠按钮在那里的表现未专门设计，只保证不横向溢出——已加一条媒体查询把折叠的宽度约束在这一档撤掉，否则会把顶栏压成一条 68px 窄带。**初稿把断点写成 640px，实际是 760px**，验收指出后更正。
  6. **后端返回的 id 与请求不一致时，成功后工具条会再次卸载而焦点留在 `body`**（`shown.id !== resourceId` 那一支）。属病态返回、已有守卫路径，R1 在收敛焦点窗口后核出的残留，不再加代码。
  7. **`EmptyPage` 兜底分支只有 `h2`**：`pages.ts` 给 `/resources/:resourceId` 置了 `ownHeading`，若哪天路由匹配与 `pageAt` 不一致而走到兜底，那一屏会是零 `h1`（当前不可达，两者用同一 pattern）。R1 指出的潜在耦合。
  8. 心得侧栏、窄屏浮层、心得数量角标顺延至 TASK-045。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：L3，两位独立只读 Reviewer，待填
- Acceptance：L3，独立只读，待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项（仅有真实问题时）：待填
- 日期与决定日志：2026-09-07 用户合并 PR #48 后指出页面上部占用空间过大、按钮可图标化、左栏可只留图标。主 Agent **先用 Playwright 在真实浏览器实测**了各块的高度与正文起点（390px 下正文起点 867px > 视口 844px，正文不在第一屏），再据此给出三个选项。用户答：阅读器页把 h1 换成资料标题、开发阶段横幅只在概览页显示、工具条图标化 + 左栏可折叠。主 Agent 定 L3，理由是 h1 是全局的路由焦点落点契约、图标化的退化本仓测试结构性抓不到、以及左栏折叠引入新的本地状态。原定的心得侧栏顺延为 TASK-045。
<!-- EVIDENCE:END -->
