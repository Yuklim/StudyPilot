# TASK-095：网页阅读器渲染公式——正文里的 LaTeX 用 KaTeX 画出来

```toml
schema_version = 2
id = "TASK-095"
status = "IN_PROGRESS"
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
  - 测试：`snapshotMarkdown.test.ts` 新增 6 个 `it` 块、12 条用例（配置断言、四种写法各一、控制台安静、货币写法、错公式、三条注入样例、
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

- 候选 SHA：
- Review：（L3，待独立只读 Reviewer）
- Acceptance：（L3，待独立只读 Integration/Acceptance）
- 最终状态/风险/用户操作：
- 非阻断遗留项：
- 日期与决定日志：2026-09-29 用户「公式好像不能正常渲染」→ 查快照确认是没有数学插件 → 登记本任务。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
