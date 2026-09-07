# TASK-044：给阅读器腾出空间 —— 压缩页面外壳与按钮图标化

```toml
schema_version = 2
id = "TASK-044"
status = "READY"
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

- 实现 SHA/变更摘要：待填
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：待填
- 已知限制/未完成项：待填

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：L3，两位独立只读 Reviewer，待填
- Acceptance：L3，独立只读，待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项（仅有真实问题时）：待填
- 日期与决定日志：2026-09-07 用户合并 PR #48 后指出页面上部占用空间过大、按钮可图标化、左栏可只留图标。主 Agent **先用 Playwright 在真实浏览器实测**了各块的高度与正文起点（390px 下正文起点 867px > 视口 844px，正文不在第一屏），再据此给出三个选项。用户答：阅读器页把 h1 换成资料标题、开发阶段横幅只在概览页显示、工具条图标化 + 左栏可折叠。主 Agent 定 L3，理由是 h1 是全局的路由焦点落点契约、图标化的退化本仓测试结构性抓不到、以及左栏折叠引入新的本地状态。原定的心得侧栏顺延为 TASK-045。
<!-- EVIDENCE:END -->
