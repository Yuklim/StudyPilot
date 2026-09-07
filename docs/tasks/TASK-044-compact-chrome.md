# TASK-044：给阅读器腾出空间 —— 压缩页面外壳与按钮图标化

```toml
schema_version = 2
id = "TASK-044"
status = "ACCEPTED"
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
  - `check_task.py --worktree` → **CHECKS PASS**，`risk=L3`，`profiles=frontend`，`files=20`，`product_fingerprint=a6227853bca28022865c03ba9f3b4b9fcff25d425dd47003d8cd72217f646e04`（此前候选依次为 `a69224db…`、`c884b2a6…`、`2e26fbab…`、`bf179927…`）。
  - **frontend 536 passed**（23 文件），基线 **512**（22 文件），净增 **24**（处置验收后再补 2：完成条件 5 的说明句由 3 页补到 5 页）（首轮 15，处置 Review 后再补 7：`ShellPages.test.tsx` +4（说明句 3 条 + 「只有阅读器页丢掉页头块」1 条）、`ResourceToolbar.test.tsx` +3（非 WEB 分支两个图标按钮的参数化 2 条 + 直接打开 URL 不抢焦点 1 条））。**「左栏按钮恰好一个」是加在既有 `it.each` 里的断言，不计入用例数**——初稿的拆分把它当成新用例、又漏掉了那条反向用例，两处恰好抵消所以总数没错，但清单会误导后来核对的人，R2 指出后更正：新建 `shell/ShellPages.test.tsx` 10 条（横幅分页断言 5 条 + 折叠 5 条），`ResourceToolbar.test.tsx` +5（唯一 h1、读取中/读取失败各一条、图标按钮的双向断言、状态徽章仍是文字）。
  - **e2e 47 passed**，基线 **44**，净增 3（折叠那条是改写非新增；窄屏窄带那条是加断言非加用例）（窄屏第一屏、标题即页面标题且到达时获焦、左栏折叠确有宽度收益）。**这一次明确把「跑了多少」与 `npx playwright test --list` 的「收集多少」对上了：47 = 47**——上一轮我正是没做这一步才把 7 条失败当成通过。
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
  - **处置**：加一条 `.app-shell.nav-collapsed { grid-template-columns: 68px minmax(0,1fr) }`。**断言改绑到正文区**：起点左移、宽度增加，且增量与左栏减量相当。真实浏览器实测：正文区 **1212 → 1372px**（+160，正好是左栏省下的 160）。
  - **修复本身又犯了同一个形态，验收在复验时抓到——第六次，而且就出在为修正这个形态而做的修复里。** 我第一版给 ≤760px 那一档写了一条 `max-width:760px` 的撤销规则，并在记录里写「已撤掉，否则会把顶栏压成一条 68px 窄带」。**那条规则根本没生效**：它与 `width:68px` 同名、同特异度，而后者写在它之后，后者胜——媒体查询不增加权重，这是层叠而不是覆盖。实测坐实：390px 折叠态下侧栏仍是 **68px**，比修复前更差（顶栏窄带 + 内部两列被那条多余的 `grid-template-columns:none` 拍平），**而当时唯一的守卫是「不横向溢出」，两种情况都绿，没有任何断言能发现这次撤销失败**。
  - 改法按验收给的最小修法：把整块折叠规则收进 `@media (min-width: 761px)`，删掉多余的 `grid-template-columns:none`。实测：390px 折叠态下侧栏回到 **390px 满宽**。并补一条 e2e 把它钉住（`narrow.width > 200`）。
  - 验收另指出的三条一并处置：说明句的覆盖由 3 页补到 5 页（完成条件 5 点名的 `/classifications`、`/notes` 此前没有）；折叠那条 e2e 显式设 1440×900 视口（此前跑在 Playwright 默认 1280×720，而条件写的是「1440px 下」——又是「断言没钉住条件字面」）；`资料库` 链接的定位限定到左栏并用 `exact`。
- **已知限制/未完成项**：
  1. **正文里的 `# 标题` 本身渲染成 `h1`**，因此整页不止一个一级标题。这在本任务之前就存在（那时是「资料详情」+ 正文标题），本任务只是让页面那一个变成了资料名。要把正文标题降级得改 `snapshotMarkdown.ts`，而那是本任务明确排除的文件——留给后续任务。用例用 `pageHeadings()` 把正文区排除在外，这一点写在那个辅助函数的注释里。
  2. **图标认不认得出，测试帮不上忙**：本仓所有测试按可访问名称查控件，图标化之后照样全绿。唯一的机器守卫是那条反向断言（可见文本为空 + 名称与 `title` 都在），「好不好认」只能靠人看。
  3. **左栏折叠态下五个入口全靠图标辨认**，因此默认展开、由用户自选。
  4. **开发阶段横幅从其余页面消失**，「复习、统计尚未开放」这个预期只在概览页交代一次。
  5. **窄屏（≤760px）下左栏是另一套布局**（`display:block`，没有网格轨道可收）：折叠规则整块限定在 `min-width:761px`，因此那一档**不会再被压成窄带**（但仍受折叠影响：品牌文字与导航文字节点照样不渲染，所以是「满宽顶栏 + 只显示图标」）。**初稿写「不受折叠状态影响」略宽于事实，验收指出后更正——第七次同形态，无实质影响但照记。**除「不横向溢出」与新补的「侧栏不被压成窄带」两条外，该档的折叠形态未专门设计。**初稿把断点写成 640px、又误以为一条 `max-width` 规则能撤掉宽度约束，两处都由验收指出后更正。**
  6. **后端返回的 id 与请求不一致时，成功后工具条会再次卸载而焦点留在 `body`**（`shown.id !== resourceId` 那一支）。属病态返回、已有守卫路径，R1 在收敛焦点窗口后核出的残留，不再加代码。
  7. **`EmptyPage` 兜底分支只有 `h2`**：`pages.ts` 给 `/resources/:resourceId` 置了 `ownHeading`，若哪天路由匹配与 `pageAt` 不一致而走到兜底，那一屏会是零 `h1`（当前不可达，两者用同一 pattern）。R1 指出的潜在耦合。
  8. 心得侧栏、窄屏浮层、心得数量角标顺延至 TASK-045。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- **最终候选 SHA**：`f95304d`（base `652f9389988301976c0bccde903b0b3932dff9a7`）。候选依次为 `c203bd5` → `2528466` → `db54437`（仅 docs）→ `71bc35e` → `6dac48c` → `f95304d`。每次修订都重新冻结，并交由**同一批**审查实例验证 `previous_candidate..new_candidate`。
- **检查（实现者本人在本机运行）**：`check_task.py --worktree` → **CHECKS PASS**，`risk=L3`，`profiles=frontend`，`files=20`，`product_fingerprint=a6227853bca28022865c03ba9f3b4b9fcff25d425dd47003d8cd72217f646e04`；frontend **536 passed**（基线实测 512）；e2e **47 passed**（基线 44），且与 `npx playwright test --list` 的收集数 **47 = 47** 对上；`typecheck` / `lint` / `prettier --check` 全绿。
- **Review**：L3，两位独立只读 Reviewer（R1 无障碍与焦点契约面、R2 授权范围与既有断言面），均独立于实现者，运行器只授予 `Read`/`Grep`/`Glob`。各两轮，对 `2528466` 均 **PASS，无阻断项**。
- **Acceptance**：L3，独立只读，独立于实现者与两位 Reviewer。**四轮**：首轮判 **BLOCKED**（折叠左栏没有把空间还给正文），其后三轮复验，终轮 **PASS，覆盖 `f95304d`**。完成条件 1–11 逐条核对满足；条件 12/13/14 属 git 级与运行级证据，验收无 Bash、**未复算**。
- **最终状态/风险/用户操作**：status=**ACCEPTED**，等待用户决定是否合并。**须向用户当面说明的四点**：
  1. **本任务最重的缺陷是用户在真机上先发现的**：左栏收起后正文区一个像素都没变宽，省下的 160px 变成空白带。根因是只给 `.sidebar` 设了宽度、没收窄网格轨道；而**我的断言量的是「左栏变窄」，完成条件写的却是「把空间还给正文」——断言比目标窄，所以 e2e 全绿而功能没达成**。独立验收随后独立复现并判为阻断项。现已修复，实测正文区 1212 → 1372px。
  2. **修复本身又犯了同一形态**：我给窄屏写的那条「撤销折叠宽度」的媒体查询因层叠次序**从未生效**（同名同特异度、后者胜），而记录里我写的是「已撤掉」；实测 390px 折叠态下侧栏仍是 68px，比修复前更差。验收在复验时抓到。
  3. **图标好不好认，测试帮不上忙**：本仓所有测试按可访问名称查控件，图标化后照样全绿。唯一的机器守卫是那条反向断言。**验收明确建议请用户实际点一遍工具条与折叠态左栏**——这是本任务唯一无法由测试代偿的风险。
  4. **三处位置变化用起来会察觉**：开发阶段横幅从其余页面消失、页头块在阅读器页整个不见、左栏折叠态全靠图标辨认。
- **非阻断遗留项**（按 Acceptance 终轮报告的清单原样登记）：
  1. **完成条件 12/13/14 未经第三方复算。** 计数（536/512、e2e 47=47）、`files=20`、指纹 `a6227853…`、以及全部真实浏览器实测值（正文起点 582→391 / 867→709、正文区 1212→1372、390px 折叠态侧栏 68→满宽）均由实现者本人运行；两位 Reviewer 各两轮、独立验收四轮**全程无 Bash**。实现者的 git 级复核是**单方证据，不得记为「已核实」**。
  2. **本任务共出现七次「陈述比证据宽」**，其中第六次出在为修正该形态而做的修复里（`max-width:760px` 撤销规则因层叠次序从未生效，而记录写的是「已撤掉」），第七次为记录措辞。七次均已关闭，逐条在案。
  3. **≤760px 折叠形态未专门设计**，守卫只有「不横向溢出」与「侧栏不被压成窄带」两条；该档是满宽顶栏 + 只显示图标。
  4. **备记（按验收判断不处理）**：`max-width:760px` 与 `min-width:761px` 在 760.5px 这类小数视口宽下均不匹配，该区间内折叠不产生收窄；无视觉破坏。
  5. **图标化的可学习性没有机器守卫。** 本仓测试全部按可访问名称查控件，图标化后照样全绿；唯一守卫是那条反向断言（可见文本为空 + `aria-label`/`title` 都在）。「图标好不好认」只能靠人看。
- 日期与决定日志：2026-09-07 用户合并 PR #48 后指出页面上部占空间过大、按钮可图标化、左栏可只留图标。主 Agent **先用 Playwright 在真实浏览器实测**各块高度与正文起点（390px 下正文起点 867px > 视口 844px，正文不在第一屏），再据此给出三个选项；用户答：阅读器页把 h1 换成资料标题、开发阶段横幅只在概览页显示、工具条图标化 + 左栏可折叠。实现中一次修订授权范围（新增 `shell/heading.tsx`，被 `check_task.py` 报 `FAIL: out of scope` 拦下）。**用户随后在真机上发现折叠不给正文腾空间**，验收独立复现并判 BLOCKED，经两轮修复后转 PASS。原定的心得侧栏顺延为 TASK-045。

## 审查报告原文

以下八份**逐字照录**，未删改、未择要。按时间顺序排列。

### Reviewer R1 · 首轮（候选 `c203bd5`）

## Reviewer R1 报告（TASK-044，方面：焦点契约 / h1 唯一性 / 图标化守卫 / 左栏折叠）

**候选与只读证明**：候选 `c203bd5`、基线 `652f938` 由任务单声明；本 Agent 仅有 Read/Grep/Glob，无 Bash/Write/Edit，**无法复算 git**。以下结论基于工作区文件的源码级阅读，凡涉及提交清单/历史的均标注「未复算」。

### findings

**必须修复：无。**

**可记录后继续**

1. `App.tsx:44` — `focusedForRoute` 在交接完成后不复位，「本次路由已聚焦 + 焦点在 body 就接管」这个窗口持续整条路由的生命周期，而不只是首次数据到达。触发需要同时满足：用户点了页面空白处（`activeElement` 变 body）且此后 `h1` 再次重挂载。实际路径上 `ResourceDetail` 的 `shown` 跨 `retry()` 保留，`toolbarItem` 不会回落，唯一的重挂载机会是 读取中→成功、以及 失败→重试→成功（后者焦点本就在被卸载的重试按钮上）。影响小、不阻断；建议交接成功后把 `focusedForRoute` 置回 false 以把窗口收敛到一次。
2. `App.test.tsx:49` — 「没有假控件」的范围由整文档收到 `#main-content`。理由成立（`nav-toggle` 是真控件），但左栏从此不再被这条断言覆盖；`container.querySelector('input, textarea, select, form')` 仍是全文档，损失有限。
3. 正文 `# 标题` 仍渲染为 `h1`（已登记）。`pageHeadings()` 的排除范围我核过：`.snapshot-rendered` 仅用于 `ContentSnapshot.tsx:234` 那个 `dangerouslySetInnerHTML` 容器，页面级 `h1`（`App.tsx:171`、`ResourceDetail.tsx:54`、`ResourceToolbar.tsx:112`）全在容器之外，**排除合理且不会掩盖「页面 h1 丢失」**——丢失时过滤结果为空，`toHaveLength(1)` 必红；一个 `h1` 都没有时 `getAllByRole` 直接抛错。

**可选建议**

4. `ResourceToolbar.test.tsx:225` 的反向断言只覆盖 `心得 / 原网页 / 更多操作`，**漏了 `OriginalEntry` 非 WEB 分支的两个图标按钮**（`ResourceToolbar.tsx:330-341` 的「原件」「粘贴原文」，是另一段 JSX）。现有 277/285 行已按名称取到它们，补一行 `textContent === ''` 成本极低。
5. 同一条只断言 `toHaveAttribute('title')` 不校验值，`title` 写错也绿。建议 `expect(title).toContain(name)`。我逐个核过一致性：`心得/原件/粘贴原文/更多操作/展开·收起导航栏/导航项/添加资料` 的 `aria-label` 与 `title` 完全一致；仅「原网页」的 `title` 是名称的超集（`原网页（在新标签页打开）`），名称为其前缀，语音控制与 2.5.3 无实质冲突。
6. **首次直接打开 URL 不聚焦**这条只有实现、没有用例。读码确认行为正确：`previousPath` 初值即当前 path，effect 不动作，`wantFocus/focusedForRoute` 均为 false，因此直接打开 `/resources/:id` 时数据到达换标题**不会**抢焦点。建议加一行 `expect(heading).not.toHaveFocus()` 钉住它——这正是 `focusedForRoute` 这个状态位存在的理由，目前无守卫。
7. `pages.ts` 给 `/resources/:resourceId` 置 `ownHeading:true`，而 `Screen.tsx:112` 的 `EmptyPage` 兜底分支只有 `h2`；若走到那里将是**零 h1**。当前不可达（`pageAt` 与 `useMatch` 用同一 pattern），仅记为潜在耦合。
8. `App.tsx:50` 把 `localStorage.setItem` 写在 `setState` 更新函数里（StrictMode 下会重复执行，幂等无害）；建议移到事件处理器。
9. 折叠态下 `.sidebar-footer`「本机个人空间」未随 `.brand-copy/.nav-label/.sidebar-note` 隐藏，会在 68px 内折行（纯观感）。`ShellPages.test.tsx:35` 的 `'学习历史'` 与页面标题 `学习记录` 不符，该元素未被用例使用，属死参数。

### 覆盖与缺口

- **焦点状态机**：`wantFocus/focusedForRoute` 两条路径读通，未发现抢焦点路径。关键排序（删除时 ref detach 在 mutation 阶段、新 ref attach 在 layout 阶段）保证 `heading.current` 不会先被置新再被置 null，因此 effect 里 `if (heading.current)` 不会误判；离开阅读器页的方向由 `App.test.tsx:106` 三条返回路径用例实证。
- **「交接」由哪条守着**：`ResourcePages.test.tsx:137-138` 的说法**可信**。该用例走真实路由切换（保存后 navigate 到详情），详情页必然先渲染「正在打开资料」`h1` 并被 effect 聚焦，数据到达时该节点被移除、焦点掉到 body；**没有 `App.tsx:44` 那一支，`expect(heading).toHaveFocus()` 在结构上不可能通过**。这是我的替代论据（未复算它当时确为红）。更强的是 `e2e/reader-layout.spec.ts:127-134` 在真实 Chromium 里从资料库点进详情并断言标题获焦——不依赖 jsdom 对「移除焦点节点」的模拟。
- **三态各一个 h1**：加载 `ResourceToolbar.test.tsx:104`、失败 `:114`、成功 `:94`，均用 `pageHeadings()`，且成功态断言了标题文本。失败态 h1 与加载态是同一位置的文本切换（不重挂载），焦点不丢也不重复宣读——后者读屏可能不播报新文案，属轻微、非阻断。
- **左栏折叠**：读 try/catch 默认展开（`App.tsx:11-19`，用例 `ShellPages.test.tsx:80`）、写 try/catch 不影响本次折叠（`:91`）、折叠时文字节点**条件不渲染**而非 CSS 隐藏（`App.tsx:100/116/135`，用例断言 `textContent === ''`，我核对了折叠态子节点只剩 `aria-hidden` 的 svg 与空 `nav-dot`，断言为真绿）。
- **未复算**：`base..candidate` 文件清单（完成条件 14）、测试计数 512→527 / 44→47、各命令退出码。替代论据仅为：被排除的三个文件不在 `allowed_paths` 内，`check_task.py` 的范围检查曾真实拦下 `heading.tsx`，故越界改动会被同一机制拦住——**这不能替代文件清单，请由实现者另行做 git 级复核**。

### 剩余风险

图标可辨识性无机器守卫（已登记，只能人看）；焦点交接窗口偏宽（见 1）；直接打开 URL 的「不聚焦」无用例（见 6）。

**结论：PASS**（含上述 2 项记录后继续、6 项可选建议；不含阻断项）。

### Reviewer R2 · 首轮（候选 `c203bd5`）

## 独立只读 Reviewer R2 报告（TASK-044）

**只读证明**：本 Agent 工具白名单仅 `Read`/`Grep`/`Glob`，无 `Write`/`Edit`/`Bash`，运行器层面无法写入或提交。
**未复算声明**：无 Bash ⇒ 无法执行 `git diff/log/show`，**不能确认工作区等于候选 `c203bd5`**，也不能出具 `base..candidate` 文件清单、`product_fingerprint`、`files=20`、frontend 527/512 的复算。以下均为对**当前工作区内容**的静态核对 + mtime 排序旁证。

### 1) 授权范围
- 修订**如实记在正文**（`TASK-044-compact-chrome.md:80-84`，EVIDENCE 标记区之外），写明是新增实现文件、被 `check_task.py` 拦下而非自查发现。理由成立：`App.tsx` 必须是唯一焦点权威，`heading.tsx` 只是把页面 `h1` 交回外壳的 context+hook，无业务逻辑，未扩大产品范围。
- **零改动声明有旁证**：按 mtime 排序，`ContentSnapshot.tsx`、`snapshotMarkdown.ts`、`ResourceDeletion.tsx`、`Screen.tsx`、`package.json`、`package-lock.json`、`playwright.config.ts` **全部早于**本次 13 个 src 文件 / 4 个 e2e 文件的改动簇；三个被排除文件内无 TASK-044 痕迹。改动簇 = 13 src + 4 e2e + 3 docs = **恰好 20**，与 `files=20` 自洽。
- **未复算**：mtime 不是权威证据，条件 14 仍需主 Agent 用 `git diff --name-only` 出具清单。

### 2) 既有断言只增不减（逐条）
1. 横幅（`App.test.tsx:44-46`）：**属实更强**（`/` 正向 + 3 条反向），另有 `ShellPages.test.tsx` 4 条、`scaffold.spec.ts:113` 8 路由 ×2 视口的计数断言。
2. 焦点断言（`ResourcePages.test.tsx:137-139`）：**属实更强**，`queryByRole('heading',{name:'资料详情'})` 未限 level，覆盖面更广。
3. level 2→1（`ResourceDeletion.test.tsx`/`taxonomy.spec.ts:107`/`resource-pages.spec.ts:50,55,122`/`ClassificationPages.test.tsx:227`）：等强，删除三步流程、令牌不外泄、四种错误恢复断言逐条完整保留。
4. **两处收窄到 `#main-content`（`App.test.tsx:49`、`scaffold.spec.ts:12`）是收缩，不是收紧**：旧的全文档 `queryByRole('button')` 隐含保证了「左栏一个按钮都没有」，新写法把这条丢掉且**无替代断言**。记录把这两处如实写出，但总括句「**无删除、无弱化**」对这一项不成立。

### 3) 自述与证据
- **可核并成立**：e2e 47（静态点数 47）；基线 44 = 47−`reader-layout` 新增 3 条 ✓。`ShellPages.test.tsx` 恰 10 条 ✓。`ResourceToolbar.test.tsx` 新增 5 条齐全 ✓。单测文件 23 个（基线 22）✓。7 个新图标、`aria-hidden` ✓。TASK-043 记录确为 `status=MERGED` + EVIDENCE 一行 ✓。
- **核不了**：527/512 总数、`product_fingerprint`、typecheck/lint/prettier、空间收益表三组数值。仅有一致性旁证：`reader-layout.spec.ts:120` 钉住 390px 下 `y<844`、`:144` 钉住折叠宽 `<展开×0.6`，与自述数值不矛盾。

### 4) `tail -8` 那处失误的自述
- **与实际相符，且不是掩饰**。Playwright list reporter 的收尾正是「`7 failed` → 7 行清单 → `40 passed`」共 9 行，`tail -8` 恰好切掉首行，记录的机理描述准确；`40+7=47` 与 `--list` 及我的静态点数一致。
- **那 7 条应已修好**：`frontend/test-results/.last-run.json` = `{"status":"passed","failedTests":[]}`，且其 mtime **晚于全部本次改动文件**。
- **修法是「断言仍守着原来的东西」**，不是迁就实现：`scaffold.spec.ts:79` 用错误态 h1 顶替「资料详情」h1（同样钉住焦点落点存在）并**保留** `toHaveTitle('资料详情 · StudyPilot')`；`reader-layout.spec.ts:57,117` 加 `exact:true` 是消歧，属收紧。

### Findings
**必须修复**：无。

**可记录后继续**
- `App.test.tsx:49` / `e2e/scaffold.spec.ts:12`：断言范围收缩，记录的「无删除、无弱化」措辞与事实不符。建议二选一：补一行「左栏按钮恰为折叠这一个」，或把记录措辞改为「一处为范围收窄，已评估其失去的保证」。
- `e2e/scaffold.spec.ts:110` 的 `.first()`：该循环里各路由本就只有一个 h1，`.first()` 在此并无必要；若是本次新增，则是**未登记**的隐式唯一性放宽（旧 strict-mode 会顺带保证唯一）。我无 Bash 无法判定新旧，请主 Agent 用一条 `git diff base..candidate -- frontend/e2e/scaffold.spec.ts` 确认。
- 完成条件 5 的「**说明句**保持原样。须有用例」**无任何用例覆盖**：全仓无一处断言 `pages.ts` 的 caption 文案。h1 那一半有覆盖，说明句这一半没有。

**可选建议**
- `frontend/src/shell/heading.tsx` 实为 15 行，记录写「只有 12 行」。
- `ResourceToolbar.test.tsx:225-229` 的「可见文本为空」只覆盖 WEB 分支；FILE/PASTE 的「原件」「粘贴原文」按钮未断言 `textContent === ''`。
- 记录与 `ShellPages.test.tsx:35` 把 `/study-records` 称作「学习历史」，`pages.ts:75` 实为「学习记录」（该参数未被使用，仅可读性瑕疵）。

**剩余风险**：候选 SHA 与最终 diff 未经我复算（无 Bash），条件 12/14 的机械论据仍待主 Agent 以 `git diff` 补齐；图标可辨识度按记录只能靠人看，无机器守卫。

**结论：PASS**（附上述已处置的非阻断项；若 `.first()` 经 diff 确认为本次新增，请补记入「既有断言的改动」清单，不构成阻断）。

### Reviewer R1 · 增量复审（`c203bd5..2528466`）

## Reviewer R1 · 修订审查（`c203bd5..2528466`）

**只读证明**：仅 Read/Grep/Glob，无 Bash/写工具。**未复算 git**：无法列 `c203bd5..2528466` 的文件清单，故本轮结论基于对你点名的六处 + 受影响调用链的源码复读；**若该区间还有我未读到的文件，不在本结论覆盖内**（请在 Acceptance 用 git 级清单补齐）。首轮对 `652f938..c203bd5` 的覆盖在此继承，仅就变更点与被其影响的部分重判。

### 一、`focusedForRoute` 收敛后是否漏掉需要接管的情形 —— 不漏（核心性质成立）

`App.tsx:46-49` 接管后置 false。关键在于**窗口在每次路由切换时都会被重新打开**：`App.tsx:66-74` 的 effect 无条件先 `focusedForRoute=false`，再在 `heading.current` 存在时聚焦并置 true；而 `heading.current` 不会是失效指针（卸载时 `registerHeading(null)` 先于新元素的 attach）。因此即使窗口在 commit 期被提前消费掉，effect 也会重新置 true。逐条走查阅读器路由：

- 读取中→成功：唯一一次卸载/挂载，交接在窗口内 ✓
- 读取中→失败→重试→成功：失败态与读取中是**同一个 h1 节点只换文本**（`ResourceDetail.tsx:54-56`），不触发 ref，交接仍落在那唯一一次 ✓
- 成功后 `retry()`（改标签/改资料）：`shown` 跨刷新保留 → 工具条 h1 不卸载，本就不需要接管 ✓
- 唯一残留：后端返回的 id 与请求不一致（`shown.id !== resourceId`）导致成功后工具条再次卸载，此时不再接管、焦点留在 body。属病态返回、既有守卫路径，**可记录后继续**，不建议再加代码。

净效果是把敞口从整条路由收敛到一次，且没有换来新的失焦路径。

### 二、三类新断言的咬合力

1. **「直接打开 URL 不抢焦点」（`ResourceToolbar.test.tsx:250-258`）——有真咬合，且是精确的变异检测**：`mount()` 走异步 mock，必然先渲染占位 h1 再换成标题 h1；若删掉 `focusedForRoute` 这个条件（把接管改成无条件），此路径下标题必被聚焦，`not.toHaveFocus()` 立刻红。它同时能抓「effect 在首次挂载误聚焦」。`expect(document.body).toHaveFocus()` 不是同义反复，它排除了焦点落到别的元素上。
2. **非 WEB 图标按钮（`:238-248`）——补齐了我指出的那段 JSX**。`OriginalEntry` 对 PASTE/FILE 只按 `source_type` 分支，与 `source_url` 无关，故 PASTE 夹具未清 `source_url` 不影响判定 ✓。三面（可见文本空 / `title` 含名 / 有 svg）齐全。
3. **`title` 校验值（`:233`、`:246`）**：`toContain(name)` 是正确力度——它挡住写错的 tooltip，又允许「原网页（在新标签页打开）」这种名称为前缀的超集。
4. **附带**：`scaffold.spec.ts:119` 由 `.first()` 改回 `toHaveCount(1)`，在真实浏览器里**新增**钉住了错误态「恰好一个 h1」，比基线的 strict-mode 隐含保证更明确；`App.test.tsx:52-56` 与 `scaffold.spec.ts:15-19` 的「左栏按钮恰好一个且名为收起导航栏」确实补回了收窄丢掉的那条保证（我首轮只记录、未要求改，此处比我的处置更严，认可）。

### 其他

`toggleNav` 改为事件处理器内写入且 try/catch 仍在 ✓；`.sidebar-footer` 已随折叠隐藏 ✓；`ShellPages.test.tsx:38` 死参数已改为真实标题、且新增的说明句用例从 `pageAt()` 真值表取字面量（避免同形态第四次）✓。新增限制 6 的表述与我给出的不可达性判断一致。任务记录在标记区外的更新属新候选的实现记录，非证据写回，合规。

**剩余风险**：图标可辨识性仍无机器守卫（已登记）；正文重复 h1（已登记）；上述病态 id 返回的失焦（新记录）。均非阻断。

**结论：PASS**（覆盖新候选 `2528466`；继承首轮对 `652f938..c203bd5` 的审查范围；文件清单类论据**未复算**，需 Acceptance 以 git 补足）。

### Reviewer R2 · 增量复审（`c203bd5..2528466`）

## R2 增量复审：`c203bd5..2528466`（覆盖新最终候选）

**只读证明**：工具仍只有 `Read`/`Grep`/`Glob`，无写工具、无 Bash。
**方法与继承**：仍无法执行 `git diff`，故我改为**逐字通读**你列为改动的每个文件的当前内容，并用 mtime 排序界定增量集——最新一批恰为 `App.tsx`、`App.test.tsx`、`ShellPages.test.tsx`、`ResourceToolbar.test.tsx`、`e2e/scaffold.spec.ts`、`styles.css`（+ 任务记录），与你的描述一致，未见其他文件混入。上一轮对 `652f938..c203bd5` 的完整审查**继承有效**。

### 三条我提的问题，逐条核实
- **范围收缩已被补回，且确实变成收紧**：`App.test.tsx:52-56`（`getAllByRole('button')` 长度 1 + `toHaveAccessibleName('收起导航栏')`，在 4 条路由的 `it.each` 里各跑一次）、`e2e/scaffold.spec.ts:15-19` 同形。左栏此刻确只有折叠一个 `button`（brand/add-link/导航项均为 link），断言与实现绑得住。
- **`.first()` 已撤回并加强**：`scaffold.spec.ts:119-120` 改为 `toHaveCount(1)` + `toBeVisible()`，比原先靠 strict mode 的隐含保证更明确；`/resources` 卡片标题是 `h2`，该断言在 8 条路由 ×2 视口下成立。第 6 条如实登记为「未登记的弱化」，未粉饰。
- **完成条件 5 缺口已补**：`ShellPages.test.tsx:52-66` 从 `pageAt()` 真值表取 `title`/`caption`，并加一条反向用例（只有阅读器页丢掉页头块 + eyebrow）。你把「第一版凭印象写的 caption 全错」记为同形态第三次，与我上一轮的判断一致。

### R1 那五处（顺带核对，无异议）
`App.tsx:46-49` 交接成功后置回 `focusedForRoute`，窗口收敛到一次，方向偏保守（宁可不抢焦点），不构成无障碍退化；`:52-62` `setItem` 移出更新函数，纯函数化正确；`ResourceToolbar.test.tsx:233,246` `title` 改为校验值（`原网页` 用 `toContain` 覆盖后缀，合理）；`:238-248` 补齐 `OriginalEntry` 另一段 JSX 的 FILE/PASTE 反向断言；`:250-258` 补「直接打开 URL 不抢焦点」守卫；`styles.css:2344-2349` 折叠态收起 `.sidebar-footer`。

### 计数自洽（可核部分）
新增用例：ShellPages +4、ResourceToolbar +3 = **+7**，`527+7=534` ✓；e2e 仍 47 ✓；改动文件仍落在原 20 个之内 ✓。`frontend/test-results/.last-run.json` 为 `{"status":"passed","failedTests":[]}` 且 mtime **晚于本轮全部改动文件** ✓。
**仍未复算**：534/512 总数、`product_fingerprint=c884b2a6…`、typecheck/lint/prettier、空间收益三组数值、`git diff --name-only 652f938..2528466`。

### Findings
**必须修复**：无。

**可记录后继续（记录准确性，非断言问题）**
- 记录第 169 行对「再补 7 条」的拆分与实际不符：「左栏按钮唯一性 1 条」是**加在既有 `it.each` 里的断言**，不新增用例计数；而真正新增的 `ShellPages.test.tsx:62`「只有阅读器页丢掉页头块」那条未被列入。两处一增一减恰好抵消，总数 7 与 534 仍正确，但清单本身会误导后续核对者。

**可选建议**
- 第 175 行小标题仍写「其中一处是范围收缩，不是收紧」，与紧接其下第 0 条轻微冲突，建议同步更新；条目顺序为 0,1,2,6,3,4,5，纯排版。
- 条件 5 的说明句覆盖了 `/`、`/resources`、`/study-records` 三页，`/classifications`、`/notes` 未取样。页头块是单一通用代码路径且已有反向用例，残余风险很低，不必现在补。

**剩余风险**：未变——候选 SHA 与最终 diff 未经我以 git 复算；图标可辨识度仍只能靠人看。

**结论：`PASS`（覆盖新最终候选 `2528466`）**，附上述非阻断项；继承对 `652f938..c203bd5` 的完整审查范围。

### Acceptance · 首轮（候选 `db54437`）—— 判 BLOCKED

## 运行器只读证明与能力声明

- 我只有 `Read` / `Grep` / `Glob`，**没有 Bash**，没有任何写工具。我**没有也不能**执行 `git diff --name-only 652f938..db54437` 或任何命令；下面凡涉及 SHA、文件清单、测试计数、浏览器实测数值的部分一律标注「**未复算**」，用可核验的文件内容作替代论据。
- 候选 `db54437`（代码候选 `2528466`）/ 基线 `652f938`：**未复算**。我读到的是工作区当前内容，与候选一致性无法由我证明。
- 实现者自述的 git 复核（20 文件、六处 0 改动）与我能核到的部分**不矛盾**：`frontend/src` 下测试文件恰为 23 个，与「23 文件、基线 22、新增 `ShellPages.test.tsx`」自洽；被排除的 `ContentSnapshot.tsx` 内只有 TASK-043 痕迹、无 TASK-044 痕迹。但这只是弱一致性，**不构成独立证据**。

## 完成条件逐条判定

| # | 判定 | 依据 |
|---|---|---|
| 1 | **满足** | `e2e/reader-layout.spec.ts:106-125` 显式 `setViewportSize` 两档 `[390,844]`、`[1440,900]`，逐档断言 `box.y < height`。断言对象是 `{ name: '数组基础', exact: true, level: 1 }`——资料标题是 `阅读器改版 · 数组基础 B`，`exact` 排除它，取到的确是**正文首个标题**。窄屏视口确实显式设了，TASK-043 的形态已闭 |
| 2 | 满足 | `ResourceToolbar.test.tsx:94-102`；`pageHeadings()` 的 `.snapshot-rendered` 过滤绑在真实类名上，不是臆想选择器 |
| 3 | 满足 | 返回路径三条原样保留 `App.test.tsx:113-121`；进入详情获焦 `ResourcePages.test.tsx:137-139` 与真实浏览器 `reader-layout.spec.ts:127-134` |
| 4 | 满足 | `ResourceToolbar.test.tsx:104-120` 两条、`scaffold.spec.ts:86` |
| 5 | **部分满足** | h1 侧 5 页全覆盖；**说明句只覆盖 `/`、`/resources`、`/study-records` 三页**，完成条件点名的 `/classifications`、`/notes` 两页的 caption 全仓无断言 |
| 6 | 满足 | `ShellPages.test.tsx:26-45`、`App.test.tsx:44-46`、`scaffold.spec.ts:122-123`、`reader-layout.spec.ts:123` |
| 7 | 满足 | `ResourceToolbar.test.tsx:218-236` + `238-248` 参数化；均断言 `textContent === ''`、`title` **值**含名称、`svg` 存在 |
| 8 | 满足 | `ResourceToolbar.test.tsx:260-264`，从 `statusLabels` 真值表取名 |
| 9 | 满足 | `ShellPages.test.tsx:69-124` 五条；`App.tsx:121` 折叠时确实**不渲染文字节点** |
| 10 | **字面满足、实质未达** | 断言在 `reader-layout.spec.ts:136-148`，但见 finding A；另该用例**未设视口**，跑在默认 1280×720，而条件写的是「1440px 下」 |
| 11 | 满足 | 展开态 `scaffold.spec.ts:102-150`、`reader-layout.spec.ts:99-103`；折叠态 `reader-layout.spec.ts:150-153` |
| 12 | **未复算**（计数），可核部分满足 | 测试文件数 23/22 自洽；R2 更正后的拆分与文件实际条数吻合；`.first()` 弱化确已改回 |
| 13 | **未复算**（锁文件），可核部分满足 | 7 个新图标全部加在 `shell/Icon.tsx`，`aria-hidden` 统一；全部改动文件无新增第三方 import |
| 14 | **未复算** | 需 git 文件清单。弱旁证：三个被排除文件无 TASK-044 痕迹，调用面未变 |

## Findings

**必须修复 · A：折叠左栏并没有把空间还给正文，而完成条件 10 的断言恰好抓不到这一点**

- `styles.css:69-71` — `.app-shell { display: grid; grid-template-columns: 228px minmax(0, 1fr); }`
- `styles.css:2338-2343` — `.app-shell.nav-collapsed .sidebar { width: 68px; min-width: 68px; … }`
- 全仓**不存在** `.app-shell.nav-collapsed` 改 `grid-template-columns` 的规则。

结论：折叠后侧栏元素收到 68px，但**第一列网格轨道仍是 228px**，`main.workspace` 起点不动。用户点「收起导航栏」得到的是一条 68px 图标栏 + 约 160px 空白带，正文区**一个像素都没变宽**。而 `reader-layout.spec.ts:141-144` 量的是 `.sidebar` 的 boundingBox，记录里那行「左栏宽 228→68px」也正是这个量法——**断言与实测数值都比它们宣称守住的东西窄**，与本任务立项要修的 TASK-043 形态完全同形。

- 触发：桌面（>760px）每一次折叠，100%。
- 影响：用户原话「左边栏目也可以考虑只保存图标，这样的话比较省空间」的横向收益为零，且空白带在视觉上像渲染错误。
- **限于我无 Bash，这是静态 CSS 推演，未在浏览器复算。** 一次 Playwright 量测即可证实或推翻。

**可记录后继续 · B**：完成条件 5 的「说明句」只覆盖 5 页中的 3 页。记录写「已补」而未限定范围——这是本任务「陈述比证据宽」的**同形态残留**（第 5 次）。
**可记录后继续 · C**：完成条件 10 的断言未显式设 1440 视口，全程用默认 1280×720。
**可选 · D**：已知限制 5 写「窄屏（≤640px）」，实际断点是 **760px**。
**可选 · E**：`reader-layout.spec.ts:146` 用未限定容器、非 exact 的 `getByRole('link', { name: '资料库' })`，脆弱。

## 用户目标达成判断

- **纵向（主要目标）：达成，且有机器守卫。** 「390px 下正文进第一屏」由真实 Chromium 两档视口钉住。
- **横向（左栏省空间）：未达成。** 见 finding A：省下的 160px 变成空白带，没有给正文。

## 结论

**BLOCKED** — 唯一阻断项是 finding A。建议主 Agent 先用一次 Playwright 量测 `.workspace` 折叠前后的 boundingBox 证实/推翻；证实则改一条 CSS 并把断言改绑到正文区宽度上。findings B–E 可记录后继续。

### Acceptance · 第二轮（`db54437..71bc35e`）—— 仍判 BLOCKED

仍然只读、仍然**没有 Bash**：`db54437..71bc35e` 的 diff、536/512、e2e 47=47、指纹 `2e26fb…` 我一律**未复算**。

## 1. 新断言有咬合力吗——有，且修复前必红

`e2e/reader-layout.spec.ts:136-157`。用你给的修复前实测值 `{x:228,width:1212}` → `{x:228,width:1212}` 逐条代入：

- `:152` `collapsedWorkspace.x < expandedWorkspace.x` → `228 < 228` **红**
- `:153` `collapsedWorkspace.width > expandedWorkspace.width` → `1212 > 1212` **红**
- `:154-157` `toBeCloseTo(width 增量, 左栏减量, 0)` → `0` vs `160` **红**

三条各自独立地在旧 CSS 上必红。`:140` 显式 `setViewportSize({width:1440,height:900})`，**finding C 关闭**；`:159-162` 定位限定到 `complementary` 且 `exact:true`，**finding E 关闭**；`ShellPages.test.tsx:52` 五个路由且仍从 `pageAt()` 真值表取 caption，**finding B 关闭**。`styles.css:2351-2353` 的轨道收窄是根因的正确修法。**阻断项 A 我判定已关闭。**

（可选）`toBeCloseTo(…, 0)` 的容差是 0.5px。此处成立；但若将来某一态出现纵向滚动条而另一态没有，会假红。放宽到 ±1–2px 更稳。

## 2. ≤760px 那条媒体查询——**引入了新问题，且它宣称做到的事没有做到**（必须修复）

两条选择器**完全同名、同特异度 (0,3,0)、同源、无 `!important`**。媒体查询不增加任何权重，等特异度时**后出现者胜**——而 `width:68px` 那条在撤销规则之后。因此在 ≤760px 折叠态下：

- `width: 68px; min-width: 68px` **依然生效**，顶栏仍被压成 68px 窄带 —— 记录里写的「用媒体查询把宽度约束在这一档撤掉」**与实际行为相反**；
- 反倒是 `grid-template-columns: none` 这一条**真的生效了**，把 ≤760px 顶栏原有的两列布局拍平成单列。这一条本来根本不需要动。

净效果：该档的折叠形态比 `db54437` 更差，而唯一的守卫只有「不横向溢出」，两种情况都绿，**没有任何断言能发现这次撤销失败**。

- 触发：`collapsed` 记在 `localStorage`，桌面折叠过的用户之后在 ≤760px 窗口/手机打开即命中。
- 定性：功能影响落在已声明「未专门设计」的档位，本身属**可记录后继续**；但记录里那句「已撤掉」是**不成立的陈述**——这是本任务第六次「陈述比证据宽」，而且出现在为修正这一形态而做的修复里。这一点必须修复。
- 最小修法（二选一）：把撤销块移到折叠块之后，或把折叠块收进 `@media (min-width: 761px)`；顺手删掉多余的 `grid-template-columns: none`。
- **我没有浏览器，这仍是静态层叠推演。** 一次量测即可定论：390×844 折叠态下 `.sidebar` 的 boundingBox 宽度。

## 3. 其余同形态残留

- 完成条件 10 的字面仍窄于目标，但记录已把这一点自陈清楚，且新 e2e 已按目标加强——保持现状 + 自陈是正确处理。
- 计数叙述 512 + 24 = 536、e2e 仍 47 内部自洽；**未复算**。
- 除上述外，我在本轮读到的文件里未发现新的「保证了什么却无断言支撑」的句子。

## 结论

**BLOCKED（仅剩一项，范围已收敛到一条 CSS 规则的先后次序 + 记录里对应的一句话）。** 阻断项 A 已实质关闭，finding B/C/D/E 均已关闭，新断言经得起「修复前必红」的检验。不需要再走一轮完整复审。

### Acceptance · 第三轮（`71bc35e..6dac48c`）—— 转 PASS

`71bc35e..6dac48c` **未复算**（无 Bash）；以下基于工作区当前内容与你给的实测值。

## 复验

**层叠修法正确。** `styles.css:2347-2357` 把 `grid-template-columns: 68px minmax(0,1fr)` 与 `.sidebar{width:68px}` 整块收进 `@media (min-width: 761px)`，多余的 `grid-template-columns:none` 已删；grep 确认全文再无 `nav-collapsed` 出现在任何 `max-width` 块内。`:2358-2369` 的 `display:none` 与图标居中保持无条件，这是对的——≤760px 折叠态因此是「满宽顶栏 + 只显示图标」，而不是窄带。

**新守卫真的咬得住。** `reader-layout.spec.ts:175-178` 在 390×844 下断言 `.sidebar` 宽度 > 200；折叠选择存在 `localStorage`、跨 `goto` 保持，所以量到的确是折叠态。按你实测的修复前值 68：`68 > 200` **必红**。这条正好补上我上一轮指出的空洞。

**记录已如实。** 写明规则为何没生效（同名同特异度、后者胜、媒体查询不加权重）、实测 68px、比修复前更差在哪、以及「第六次且就出在为修正这一形态而做的修复里」；已知限制同步更正。原来那句「已撤掉」不存在了。**阻断项全部关闭。**

## 关于 `toBeCloseTo(…, 0)`——我的判断

**本仓当前布局下我判断不会真的假红**，理由：两次量测在同一页同一视口只切折叠态；`/resources` 的卡片区是**固定 2 列**，1212→1372 不改变行数，页面高度不会跨越 900px 的滚动条阈值；两态都稳定超过一屏；1440−68 与 1440−228 都是整数。所以「怕假红」不构成改它的理由。

**但我仍建议改成 ±2px，理由不同**：`0` 精度 = ±0.5px，比这条断言要守的性质**严格得多，却不多抓任何东西**——修复前是 0 vs 160，±2px 照样必红。多出来的那 1.5px 精度不承载任何语义，只承担未来布局变动带来的维护成本。改或记为遗留项我都不阻断，这是取舍不是缺陷。

## 本轮新增的小项（均不阻断）

1. **可选建议**：`reader-layout.spec.ts:175-178` 没有先断言「此刻确实是折叠态」。若哪天 `localStorage` 读取路径退化导致折叠状态丢失，侧栏满宽，这条会**空过**——恰是本任务反复出现的「断言可能在非目标状态上通过」。加一行 `await expect(page.getByRole('button', { name: '展开导航栏' })).toBeVisible()` 即闭合。
2. **可选建议**：记录「那一档不受折叠状态影响」略宽于事实——`brand-copy` 隐藏与图标居中在该档仍生效，React 也不渲染导航文字节点。实际行为是好的（满宽 + 只显示图标），措辞改成「不再被压成窄带」即准确。第七次同形态，但已无实质影响。
3. 备记：`max-width:760px` / `min-width:761px` 在小数视口宽（如 760.5px）下两侧都不匹配，该 0.5px 区间里折叠不产生收窄。无视觉破坏，不必处理。

## 结论

**PASS（覆盖最终候选 `6dac48c`）。** 完成条件 1–9、11 已逐条核对满足；条件 12/13/14 属 git 级与运行级证据，**我无 Bash、未复算**，以实现者单方 git 复核 + 我核到的结构性旁证为限，此点须原样写进 EVIDENCE，不得记为「已核实」。

### Acceptance · 终轮（`6dac48c..f95304d`）

`6dac48c..f95304d` **未复算**（无 Bash）；以下基于工作区当前内容。

## 复验（三条全部落实，且都没有削弱原有咬合力）

- `reader-layout.spec.ts:184` — 前置断言放在 `setViewportSize(390) + goto` 之后、量测之前，位置正确。空过路径关闭：折叠态一旦丢失，这一行先红，而不是让 `narrow.width > 200` 假绿。
- `reader-layout.spec.ts:157-161` — `Math.abs(正文区增量 − 左栏减量) <= 2`。语义与原 `toBeCloseTo` 一致，容差放到 ±2px；代入修复前的实测值 `|0 − 160| = 160 > 2` 仍**必红**，咬合力不变。`:152/:153` 两条方向断言未动，三条仍互相独立。
- 记录 — 「不受折叠状态影响」已改为「不会再被压成窄带（但仍受折叠影响：品牌文字与导航文字节点照样不渲染，所以是满宽顶栏 + 只显示图标）」，与 `styles.css:2347-2369` 的实际生效面一致。第七次同形态已注明由验收指出。

本轮**无新发现**。No further findings。

## 建议原样登记的 EVIDENCE 非阻断遗留项（终版，五条）

1. **完成条件 12/13/14 未经第三方复算。** 计数（536/512、e2e 47=47）、`files=20`、指纹 `a6227853…`、以及全部真实浏览器实测值（正文起点 582→391 / 867→709、正文区 1212→1372、390px 折叠态侧栏 68→满宽）均由实现者本人运行；两位 Reviewer 各两轮、独立验收四轮**全程无 Bash**。实现者的 git 级复核是**单方证据**，不得记为「已核实」。
2. **本任务共出现七次「陈述比证据宽」**，其中第六次出在为修正该形态而做的修复里，第七次为记录措辞。七次均已关闭，逐条在案。
3. **≤760px 折叠形态未专门设计**，守卫只有「不横向溢出」与「侧栏不被压成窄带」两条；该档是满宽顶栏 + 只显示图标。
4. **备记（按验收判断不处理）**：`max-width:760px` 与 `min-width:761px` 在 760.5px 这类小数视口宽下均不匹配，该区间内折叠不产生收窄；无视觉破坏。
5. **图标化的可学习性没有机器守卫。** 本仓测试全部按可访问名称查控件，图标化后照样全绿；唯一守卫是那条反向断言。「图标好不好认」只能靠人看——**建议主 Agent 在合并请求里当面请用户实际点一遍工具条与折叠态左栏**，这是本任务唯一无法由测试代偿的风险。

## 结论

**PASS，覆盖最终候选 `f95304d`。**

继承范围：`652f938..2528466` 的完整最终 diff 与调用链（首轮）、`db54437..71bc35e`、`71bc35e..6dac48c`、`6dac48c..f95304d`（三轮增量复验）。完成条件 1–11 逐条核对满足，其中条件 5 已由 3 页补到 5 页、条件 10 的交付与断言已强于其字面要求（从「左栏变窄」升到「省下的宽度落到正文区」）。**条件 12/13/14 属 git 级与运行级证据，我无 Bash、未复算**，仅有结构性旁证——此点须按遗留项 1 原样写入 EVIDENCE。用户目标实测达成：纵向正文进第一屏，横向折叠确实把 160px 还给了正文区。

状态可转 **ACCEPTED**；只有用户本人实际合并后才可记 MERGED。
<!-- EVIDENCE:END -->
