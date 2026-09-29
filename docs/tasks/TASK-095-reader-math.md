# TASK-095：网页阅读器渲染公式——正文里的 LaTeX 用 KaTeX 画出来

```toml
schema_version = 2
id = "TASK-095"
status = "ACCEPTED"
risk = "L3"
risk_reason = "改的是 `snapshotMarkdown.ts`——本项目唯一的 XSS 边界（`html: false` 的 markdown-it 渲染器，输出经 dangerouslySetInnerHTML 进 DOM）。公式渲染必然要往这条管线里加一个会产出 HTML 的插件（KaTeX），安全性质从「渲染器转义一切」变成「渲染器转义一切 + KaTeX 在 trust:false 下只产出它自己生成的、内容已转义的标记」。命中 risk_flags 的 security。执行链：1 Worker → 自动检查 → 独立只读 Reviewer → 独立只读 Integration/Acceptance。"
risk_flags = ["security", "business"]
owner = "coordinator"
base = "e2b7ebc70d33e5d95186df2fc2ee3939c137baf9"
allowed_paths = [
  "frontend/package.json",
  "frontend/package-lock.json",
  "frontend/src/main.tsx",
  "frontend/src/styles.css",
  "frontend/src/features/resources/snapshotMarkdown.ts",
  "frontend/src/features/resources/snapshotMarkdown.test.ts",
  "frontend/e2e/snapshot-rendering.spec.ts",
  "docs/tasks/TASK-095-reader-math.md",
  "docs/tasks/TASK-091-reader-outline-gap.md",
  "docs/tasks/TASK-092-highlight-delete-whitelist.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-29 用户：「我爬了一篇文章，发现网页阅读器的公式好像不能正常渲染，你检查一下」。

### 现状（查过用户库里那篇）

用户 2026-09-29 抓的《通俗理解 Batch Normalization（含代码）》正文快照 20,834 字，里面公式是标准 LaTeX：
`$$…$$` 块 8 个、`\[…\]` 块 9 个、行内 `$…$` 2 个、`\begin{aligned}` 4 个。阅读器的渲染器是 markdown-it 14
（`html: false`、`linkify: false`），**没有任何数学插件**，所以公式原样按文字显示，还会被 markdown 语法啃掉一些
（下划线、反斜杠）。

### 目标

1. `renderSnapshot` 认四种写法：`$$…$$`、`\[…\]`（块，display）与 `$…$`、`\(…\)`（行内），用 KaTeX 渲染
   （`@mdit/plugin-katex@0.25.2`，最后一个支持 markdown-it 14 的版本 + `katex@0.16.44`，均锁定精确版本）。
2. **安全边界不后退**：`html: false` 不动；KaTeX 以 `trust: false`（挡 `\href`/`\url`/`\includegraphics`/`\htmlId` 一类）、
   `throwOnError: false`（错的公式以转义后的源码显示，不抛、不吞）、`strict: 'ignore'`、`output: 'html'`（不出 MathML
   那份隐藏文本，选区与锚点的纯文本里公式只出现一次）运行。测试**直接断言这几个配置值**，并验证
   `$<script>$`、`$\href{javascript:…}{x}$` 进不了 DOM。
3. KaTeX 的 CSS 与字体随包进入构建（`main.tsx` 引入 `katex/dist/katex.min.css`）；块级公式过宽时在自己的框里横向滚，
   页面不出横向滚动条（既有 e2e 守着 320/390px 不横向溢出）。
4. 心得预览与资料正文共用同一渲染器，心得里的公式也随之能画。

### 非目标 / 禁止范围

- 不改后端、契约、采集扩展；不改 markdown-it 的其他配置；不做 mhchem 等扩展宏包。
- 货币写法 `$5 和 $10` 不当公式（插件规则：`$` 后不能是空白、闭合 `$` 后不能是数字），测试守住。
- 高亮锚点在公式上的行为（选中公式「记下这段」得到的是渲染后的文本）不在本任务内调整，记为已知限制。

## 完成条件

- 单测：四种写法各渲染出 `.katex`（块级带 `.katex-display`）；两条注入样例进不了 DOM；货币写法保持文字；
  `RENDERER_OPTIONS.html` 仍为 false；KaTeX 选项值被直接断言。
- e2e（真后端、真浏览器）：含 `$$…$$` 的快照渲染出 KaTeX 元素且 390px 下页面不横向溢出。
- `check_task.py` 必要检查 PASS（`frontend` 组，含构建——字体资源随构建产出）。
- 独立只读 Reviewer + 独立只读 Integration/Acceptance 结论（L3）。
- 顺带登记：TASK-091（PR #99，merge `e1e4e6a`）、TASK-092（PR #100，merge `fcefef7`）记 MERGED；
  093/094 因 #101/#102 合进了 092 分支而非 main，等 #103 合并后再登记。

## 上下文包

- `frontend/src/features/resources/snapshotMarkdown.ts`（`createRenderer`/`RENDERER_OPTIONS`）、
  `ContentSnapshot.tsx:378`（唯一的 dangerouslySetInnerHTML）、`highlightAnchor.ts` `mapText`（遍历全部文本节点——
  这是选 `output: 'html'` 的原因）。
- 插件选项类型：`node_modules/@mdit/plugin-katex/dist/index.d.ts`（`delimiters: 'all'` 认四种写法）。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-095-reader-math.md --worktree`；
  `cd frontend && npx playwright test e2e/snapshot-rendering.spec.ts`。

## 实现与测试

- 实现 SHA/变更摘要：实现与登记同一个提交（SHA 在 EVIDENCE 区作候选记录；之后的证据写回是另外的提交）。变更：
  - `package.json`/`package-lock.json`：`katex@0.16.44`、`@mdit/plugin-katex@0.25.2`（精确版本；后者是最后一个 peer 为
    markdown-it ^14 的版本，1.x 起要求 markdown-it 15）。
  - `snapshotMarkdown.ts`：导出 `MATH_OPTIONS`（`delimiters:'all'`、`trust:false`、`throwOnError:false`、`logger:()=>'ignore'`、
    `output:'html'`），`createRenderer` 里 `md.use(katex, MATH_OPTIONS)`；`RENDERER_OPTIONS` 一字未动。
  - `main.tsx` 引入 `katex/dist/katex.min.css`（字体随构建产出，dist 里 59 个字体文件）；`styles.css` 给
    `.snapshot-rendered .katex-display` 加横向滚动。
  - 测试：`snapshotMarkdown.test.ts` 新增 7 个 `it` 块、12 条用例（含第二次提交加的「控制台安静」；增量复核指出此处此前写 6，已订正）（配置断言、四种写法各一、控制台安静、货币写法、错公式、三条注入样例、
    公式旁的原始 HTML；第一版记录写成「9 条」，Review F2 订正）；
    `snapshot-rendering.spec.ts` 新增 1 条真后端用例（KaTeX 元素、字体真的装进来了、1440/390 两档不横向溢出）。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：
  - `check_task.py --task docs/tasks/TASK-095-reader-math.md --worktree` → 退出码 0，**CHECKS PASS**，`files=11`，
    `product_fingerprint=a80f7cddf6a3b43763917ae18550896fa070e5c926a3e7a8dcd0251909106f30`，`profiles=frontend`
    （lint/format/`tsc -b`/build；vitest 39 文件 **845** 条全过）。
  - `npx playwright test`（**全套**）→ **86/86**（含新增那条）。
  - 真机截图（一次性 spec，已移出工作区）：用用户库里那篇《通俗理解 Batch Normalization》的快照片段在沙盒里渲染，
    分式、求和、上下标、`aligned` 环境全部画出；目录/标题/工具栏不受影响。
  - 构建体积：主 JS 557.87 → 819.59 kB（gzip 186 → 265 kB），CSS 55.8 → 84.9 kB；本机应用，可接受。
- **第二次实现提交（按第一轮 Review）**：F1 `strict:'ignore'` 会被插件自己的 `strict` 回调覆盖、实际不生效（中文进数学
  模式会往控制台写告警）→ 改传 `logger: () => 'ignore'`，补一条「控制台安静」用例（spy `console.warn`）；F2 计数订正；
  建议①：e2e 字体断言从 `getComputedStyle().fontFamily`（只证明样式表生效）改为 `document.fonts.check('1em KaTeX_Math')`；
  建议②：已知限制补无障碍代价。重跑：单测 55/55（文件内）、e2e 该 spec 2/2；`check_task.py --worktree` → 退出码 0，
  **CHECKS PASS**，`files=11`，`product_fingerprint=5db6c1f4f608874145120e1e7132d28d7615ad5c69d5ee4fd6a2894f19bc329f`（vitest 846）。
- 已知限制/未完成项：
  - `output:'html'` 没有 MathML 那份可读文本，屏幕阅读器读不出公式内容（KaTeX 的 HTML 输出带 `aria-hidden`）；这是
    与高亮锚点纯文本唯一性的取舍，本机个人工具先取后者（Review 建议记录）。
  - 极深嵌套等非 `ParseError` 异常会从 `renderSnapshot` 抛出（与基线 markdown-it 行为同类，理论场景）。
  - 选中公式「记下这段」/标高亮，取到的是 KaTeX 渲染后的纯文本（如 `u=m1∑hi`），不是 LaTeX 源码；锚点按该文本定位，
    正常回得到。想要源码得另议。
  - 不支持 mhchem 等宏包与 `\newcommand` 之外的 KaTeX 不认的命令（以转义源码显示，带 `.katex-error`）。
  - 心得预览共用渲染器，公式随之能画，但心得编辑器没有公式输入辅助。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：`9d4976a`（= `9c00818` 实现 + 登记，再加按 Review 的 `9d4976a`）。本条证据写回是之后的另一个提交。
- Review：独立只读 Reviewer（`.claude/agents/reviewer.md`，工具仅 Read/Grep/Glob，运行器层无写工具）。
  **第一轮**（`e2b7ebc..9c00818`）报告原文：
  > **权限证据：仅 Read/Grep/Glob**（本 Agent 未授予 Write/Edit/Bash，运行器层面只读）。
  > **候选/基线**：`9c00818` / `e2b7ebc`；审查了 base..candidate 产品 diff（7 个前端文件）+ `node_modules` 里 `katex@0.16.44`、`@mdit/plugin-katex@0.25.2`（依赖 `@mdit/plugin-tex@0.24.2`，peer markdown-it ^14.1.0）的源码，以及 `highlightAnchor.ts`、`ContentSnapshot.tsx:178-184` 调用链。
  > **结论：PASS**（带两条可记录后继续项）
  > **安全边界核对（No findings）**：KaTeX 所有 HTML 出口（`toMarkup` 通用助手 katex.mjs:983-1011、SymbolNode :1201、Svg/Path/Line、Img）对 class/style/attribute/文本一律 `escape`（:69-80）；错误分支 `renderError` :16372-16379 的 `title`/`style` 走同一 escape。`trust:false` 下 `\href`/`\url`（:11057-11100）、`\htmlClass/Id/Style/Data`（:11226）、`\includegraphics`（:11367-11371）全部走 `formatUnsupportedCmd` → 纯文本 color 节点，参数体丢弃；`Anchor`/`Img` 节点在不信任路径不可达。测试断言的 `a`/`[href]`/`img` 是正确的观测对象：改成 `trust:true` 时 `\href{javascript:…}` 会产出 `<a href>`，该条会红。插件 render 规则只把 `renderToString` 结果或经 `escapeHtml` 的源码拼进 HTML，无未转义拼接；`html:false` 对公式外内容不变。`renderSnapshot` 每次新建渲染器，`macros:{}` 不跨文档持久。`output:'html'` 与 `mapText` 的理由成立；高亮走 Range 不包裹 DOM。
  > **Findings**：1. `snapshotMarkdown.ts:182,195` **`strict:'ignore'` 实际不生效**——插件用自己的 `strict` 回调覆盖，默认 logger 对 `newLineInDisplayMode` 外的一切返回 `'warn'`，中文进数学模式会 `console.warn`。无安全/渲染影响；若要真正 ignore，传 `logger: () => 'ignore'`。可记录后继续。2. 记录「新增 9 条」与 diff 不符（`it` 块 6 个，用例 11 条）。可记录后继续。
  > **可选建议**：e2e 的 `getComputedStyle().fontFamily` 只证明样式表生效，要证字体可用 `document.fonts.check('1em KaTeX_Math')`；`overflow-y:hidden` 在非 overlay 滚动条平台可能遮住公式底部；无障碍：`output:'html'` 无 MathML 可读文本，建议在已知限制补一句。
  > **覆盖与一致性**：`allowed_paths` 11 项与 `files=11` 及 diff 一致；091/092 已改为 MERGED 且索引行同步；package-lock 抽查版本一致。**剩余风险**：非 `ParseError` 异常会从 `renderSnapshot` 抛出，与基线同类，理论场景，不阻断。
  主 Agent 处置：两条 Findings 与两条建议全部落实（`9d4976a`），请同一 Reviewer 增量复核。**增量复核**（`9c00818..9d4976a`）报告原文：
  > **权限证据：仅 Read/Grep/Glob**。
  > **结论：PASS**，覆盖最终候选 `9d4976a`；继承上一轮对 `e2b7ebc..9c00818` 的完整审查，本轮只复核 `9c00818..9d4976a` 三个文件及记录。
  > ① 插件把 `logger` 包成 `strict: (…) => logger(…) ?? 'ignore'`；KaTeX `reportNonstrict`（:283-289）与 `useStrictBehavior`（:309-321）对函数返回 `'ignore'` 直接返回，不 `console.warn`。撤掉 `logger` 时默认 logger 对 `unicodeTextInMathMode` 返回 `'warn'`，spy 用例会红；同时 `MATH_OPTIONS.logger()` 断言编译即失败。② 计数：formulas 块内 `it`/`it.each` 共 **7 个**，用例 12 条——记录写「6 个 it 块」仍差 1，可记录后继续。③ e2e 改 `document.fonts.check` 正确；「HTML 输出带 aria-hidden」属实（katex.mjs:5635）；指纹/846 与记录一致。可选：记录「目标」段仍写 `strict:'ignore'`，属授权原文，不强制改。
  > No blocking findings.
  主 Agent 处置：计数改为 7（记录准确性，非产品改动）；「目标」段保留原文，以实现段与 EVIDENCE 为准。
- Acceptance：独立只读 Integration/Acceptance（同一 reviewer 角色定义、另起的 Agent，独立于实现者与第一轮 Reviewer），
  最终候选 `9d4976a`。报告原文：
  > **权限证据：仅 Read/Grep/Glob**（无 Write/Edit/Bash，运行器层面只读）。候选 `9d4976a`，base `e2b7ebc`，reflog 显示分支只有 `9c00818`、`9d4976a` 两个提交。
  > **结论：PASS**
  > 1. 单测 → `snapshotMarkdown.test.ts:328-400`：`:337-343` 直接断言 `trust/throwOnError/output/delimiters/logger()` 与 `RENDERER_OPTIONS.html===false`；`:346-362` 四种写法各 `.katex`、`.katex-display` 按 display 布尔断言、无 `.katex-mathml`；`:372-376` 货币保持文字；`:384-393` 三条注入查不到 `script`/`a`/`img`/`[href]`/事件属性。→ 满足。
  > 2. e2e → `snapshot-rendering.spec.ts:127-158`：`.katex-display` 可见、`.katex` ≥3、`document.fonts.check('1em KaTeX_Math')`、1440/390 两档 `scrollWidth<=innerWidth`。记录全套 86/86 对应 `9c00818`；第二版仅重跑该 spec 2/2——增量仅改断言方式与 logger，按 §6 可复用。→ 满足。
  > 3. check_task → 两次指纹（`a80f7cdd…` vitest 845 / `5db6c1f4…` vitest 846）分别对应两次提交前的工作区；`check_task.py:359` 指纹排除任务文件与索引，覆盖的正是产品/测试 9 个路径；`profiles=frontend` 含 build。无 Bash 无法重算，按记录与 reflog 时序采信。→ 满足。
  > 4. L3 两道 → 第一轮 Reviewer PASS；本报告为第二道。→ 满足（写回后闭合）。
  > 5. 登记 → TASK-091/092 记录 `status` MERGED、EVIDENCE 写了 #99 `e1e4e6a`、#100 `fcefef7`；索引行同为 MERGED；093/094 ACCEPTED 与各自记录一致；095 IN_PROGRESS 与记录一致。→ 满足。
  > 安全边界：`snapshotMarkdown.ts:19` `RENDERER_OPTIONS` 既有测试仍断言；`:41-47` `MATH_OPTIONS` 五键与记录一致；`:71` `md.use(katex, MATH_OPTIONS)`。插件源确认 `strict` 被覆盖、走 `logger` 正确。`main.tsx:9` 引入 KaTeX CSS；`package.json`/lock 均为精确版本。跨模块：allowed_paths 11 项全在 `frontend/` 与 `docs/tasks/`，无 `backend/`、`docs/contracts/`。
  > Findings（非阻断）：记录「新增 6 个 it 块」已过时，实为 7 个、12 条。剩余风险：`RENDERER_OPTIONS`「一字未动」继承第一轮 Reviewer 的完整 diff 结论；`output:'html'` 无障碍代价与公式高亮取渲染文本已记为已知限制。
- 最终状态/风险/用户操作：**ACCEPTED**（L3 执行链走完：实现 → 每轮机械检查 → 独立只读 Reviewer 两轮 → 独立只读
  Integration/Acceptance PASS）。风险：改了 XSS 边界，靠 KaTeX `trust:false` + 全量转义 + 直接断言配置的测试兜住；
  最坏情况是某条冷门 LaTeX 显示成红色源码。**等待用户操作**：推 PR（指向 main），**须在 PR #103 之后合并**；合并后
  重启启动脚本（前端依赖变了要 `npm ci`——启动脚本会做）。
- 非阻断遗留项：见「已知限制」（无 MathML；公式上的引文是渲染后文本；非 ParseError 异常会抛）。
- 日期与决定日志：2026-09-29 用户「公式好像不能正常渲染」→ 查快照确认是没有数学插件 → 登记本任务。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
