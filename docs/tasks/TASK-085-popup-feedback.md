# TASK-085：PDF 抓不到时，扩展弹窗当场说清并让用户决定

```toml
schema_version = 2
id = "TASK-085"
status = "IN_ACCEPTANCE"
risk = "L3"
risk_reason = "要改契约第 14.4 节（popup 的交互与权限询问时机写在那里），并修正 TASK-084 留下的一处**已失效的契约陈述**（§14.4 仍写「用户若在确认页取消勾选、改存网页正文」，而那个勾选框已被删）。`docs/contracts/**` 命中 risk-policy.json 的 high_risk_paths，取最高定 L3：1 Worker → 自动检查 → 独立只读 Reviewer → 独立只读 Integration/Acceptance。代码改动本身只在扩展 popup，但契约是公共事实来源，改它必须走满这条链。"
risk_flags = ["public-api", "business"]
owner = "coordinator"
base = "168830e5b2947f92677bea1dbd18489b30f51512"
allowed_paths = [
  "extension/src/popup/main.ts",
  # 范围修订 2（2026-09-21，独立 Review F3 之后、写入前登记）：接线零覆盖而完成条件写了
  # 「有用例」，补一个 DOM 用例文件。
  "extension/src/popup/main.test.ts",
  "extension/src/popup/popup.ts",
  "extension/src/popup/popup.test.ts",
  "extension/src/popup/capture.ts",
  "extension/src/popup/capture.test.ts",
  "extension/popup.html",
  "docs/contracts/API与数据契约基线.md",
  "docs/tasks/TASK-083-pdf-page-boxes.md",
  "docs/tasks/TASK-084-capture-simplify.md",
  "docs/tasks/TASK-085-popup-feedback.md",
  "docs/tasks/任务索引.md",
]
checks = ["contracts"]
```

## 需求与范围

### 用户授权

2026-09-21 用户：「如果爬取成功，就跳转保存 pdf；**如果爬取失败，就在插件页就反馈爬取失败，
然后退回爬取正文**。现在的插件页面根本没有和草图中一致，还是和 0.2.0 版本的页面是一样的。」

主 Agent 画了两种做法的草图（Pencil `扩展 popup｜失败时怎么反馈（TASK-085 草图）`），
用户看过后：**「明白了，使用方案 A」**——失败时 popup 停下来等用户点一下。

### 登记前已查清的事实

- **popup 现在从 v0.2.0 起一个字没改**：一个按钮「保存这一页的正文」（而文献现在存的是 PDF）、
  一句权限说明、以及有图时的「连图片一并保存 / 只保存正文」。
- **TASK-080 其实给 popup 加过 PDF 回执**（`deliveryText` 的 pdf 分支），但**它从来显示不出来**：
  `deliverCapture` 内部先 `openConfirmPage()` 打开标签页，popup 当场被浏览器关闭，
  之后 `main.ts` 才往 `note.textContent` 里写那句话——写给了一个正在消失的窗口。
  这解释了用户「插件页还是 0.2.0 的样子」的观感。
- **Pencil 里没有扩展 popup 的草图**（唯一与采集相关的 `采集确认页｜识别到的文献信息（TASK-075 草图）`
  画的是 `/capture` 页）。所以 popup 不是「偏离了草图」，是从来没有草图——本任务补上。
- **payload 里已有判据**：`runCapture` 返回的 `payload` 带 `citation` 与 `pdf`/`pdf_problem`，
  popup 侧不需要新增任何消息或权限就能知道「是文献、试过、没拿到」。

### 目标

1. **抓到 PDF**：行为不变——直接交付、打开确认页（TASK-084 的确认页已无勾选框）。
2. **是文献、试过但没拿到 PDF**（`citation` 非空且 `pdf_problem` 非空）：**popup 停下来**，
   显示失败原因（按 `pdf_problem` 五种分别成话），并给两个动作：
   - **「改存这一页的正文」**——继续原来的正文路径（有图时仍走既有的图片询问）；
   - **「算了」**——什么都不存，关掉。
3. **不是文献 / 这一页本来就没声明 PDF**：行为一字不变。
4. **popup 主按钮的文案不再写死「保存这一页的正文」**：它在文献页上是错的。
5. **契约第 14.4 节同步**：写明 popup 的这条新分支；**并修正 TASK-084 留下的失效陈述**
   （「用户若在确认页取消勾选、改存网页正文」——那个勾选框已不存在）。
   `extension/src/popup/popup.ts` 里同句过期注释一并改。
6. 顺带把 **TASK-083、TASK-084 登记为 MERGED**（待用户合并 PR #91 / #92 后填实），
   并补上 TASK-084 延后的索引行。

### 非目标 / 禁止范围

- **不改确认页**（TASK-084 刚定）、不改抓取逻辑、不改权限集合。
- **不做自动退回**（草图里的做法 B）：用户明确选了 A。
- 不合并「失败提示」与「图片询问」两屏：后者是既有且已测的路径，本次按顺序串联，
  不为省一次点击去动它。**如实登记：文献 + PDF 失败 + 正文有图时，一共要点三次。**
- 不改 popup 的视觉风格（它没有草图可依，本次只加必要的状态）。

### 范围修订 1（2026-09-21，写入前登记）

实机渲染 popup 时发现：**它显示的版本是 `v0.2.0`，而扩展管理页显示 `0.2.0.638+…`**——
正是用户 2026-09-21 早先抱怨过的那个不一致（他当时的原话：「扩展页：0.2.0.632+b657284-dirty；
实际使用：StudyPilot 采集 v0.2.0」）。

根因：`popupText(manifest.version)` 里的 `manifest.version` 来自 `buildVersion()` 的**无参调用**，
运行时拿不到构建号；构建号只在 `vite.config.ts` 生成 `dist/manifest.json` 时被显式注入。
**TASK-079 修好了扩展管理页，漏了 popup 自己。**

本任务改它：popup 改用 `chrome.runtime.getManifest().version`（浏览器实际装着的那一份），
取不到时退回静态常量。这不在原登记的目标里，故明示登记为范围修订；涉及文件
（`main.ts`/`popup.ts`/`popup.test.ts`）本就在 `allowed_paths` 内。

### 主 Agent 登记的实现决定（非用户决定，Review 可挑战）

- **判据用 `citation && pdf_problem` 而不是只看 `pdf_problem`**：`pdf_problem` 只在「是文献且
  声明了 PDF」时才非空，但双重判据让意图显式，也挡住将来别处误设该字段。
- **「算了」什么都不做**：不落暂存、不开页面。此时扩展存储里可能还留着上一次的暂存内容，
  与既有行为一致（那份会被下次采集覆盖或下次交付清除）。
- **主按钮文案改为「保存这一页」**：它要同时涵盖「存 PDF」与「存正文」两种产物，
  在点下去之前扩展还不知道是哪一种。

## 完成条件

- 文献 + 抓到 PDF：popup 不多一步，直接开确认页。有用例。
- 文献 + `pdf_problem` 非空：popup 停住并显示对应原因；点「改存这一页的正文」走正文路径；
  点「算了」不交付、不开页面。**五种 `pdf_problem` 各有对应文案**。有用例。
- 非文献页：与改前逐项一致。有用例，且做变异验证。
- 契约 §14.4 写明新分支，并修正那处失效陈述；`popup.ts` 的过期注释一并改。
- `check_task.py` 必要检查 PASS（extension + contracts）。
- L3：独立只读 Reviewer 审最终 diff；独立只读 Integration/Acceptance 核完成条件与跨模块证据。
- **按用户 2026-09-21 的指令：本次不主动推 PR**，先交给用户检查（需在真实 Edge 里点一次图标），
  确认后再推。

## 上下文包

- 草图：Pencil `扩展 popup｜失败时怎么反馈（TASK-085 草图）`（A 已标注选定、B 置灰）。
- 实现：`extension/src/popup/main.ts`（DOM 接线）、`popup.ts`（纯文案与判断）、
  `capture.ts`（`runCapture`/`deliverCapture`）、`extension/popup.html`。
- 契约：第 14.4 节。
- 检查：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-085-popup-feedback.md --worktree`。

## 实现与测试

- 实现 SHA：登记 `db7279b`；首轮候选 `76dd81a`；Review 修正 `0db4f96` + 类型修正 `7b90bfe`。
- 命令与结果（**对最终候选 `7b90bfe` 重跑**）：`check_task.py` → **CHECKS PASS**
  （`profiles=contracts,extension`）；扩展单测 **196 项**全绿（新增接线用例 6 条）。
  记录初稿写的「190 项」是首轮候选 `76dd81a` 的数字，已作废——独立 Review 要求绑到新候选。

### 落点

1. **`needsPdfDecision(payload)`**（`popup.ts`）：`Boolean(payload.citation && payload.pdf_problem)`
   ——是文献、试过、没拿到。判据放在纯函数里，可测。
2. **`pdfFailureText(problem)`**：五种原因各一句人话，比确认页那套更短。
3. **`main.ts`**：命中判据时**停在 popup**，显示原因 + 两个按钮；「改存这一页的正文」走既有的
   `askImagesThenDeliver`（有图仍问一次权限），「算了」不交付、不开页面。
   顺手把原来内联在 `.then()` 里的图片询问抽成 `askImagesThenDeliver`，两条路共用一个收口。
4. **`popup.html`**：主按钮文案 `保存这一页的正文` → **`保存这一页`**（点下去之前还不知道
   会存成 PDF 还是正文），新增隐藏的 `#pdf-failed` 区块。
5. **契约 §14.4**：写明这条新分支与「为什么必须停在 popup 里」；**并订正 TASK-084 留下的失效陈述**
   （「用户若在确认页取消勾选、改存网页正文」——那个勾选框已不存在）。`popup.ts` 的同句过期注释一并改。
6. **范围修订 1**：popup 版本改取 `chrome.runtime.getManifest().version`。

### 实测（真实 Edge，加载真实扩展）

| 状态 | popup 显示 |
| --- | --- |
| 初始 | `StudyPilot 采集 v0.2.0.660` ／ 按钮「**保存这一页**」／ 权限说明 |
| PDF 没拿到 | `⚠ PDF 没能取下来——多数出版社要求先登录才给，而扩展从不带你的账号信息。`<br>「改存这一页的正文」「算了」 |
| 点了「算了」 | `这次什么都没保存。` |

**版本那一项是这次实机渲染才发现的**：popup 一直显示 `v0.2.0`，而扩展管理页显示 `0.2.0.660+…`
——正是用户早先抱怨过的不一致，TASK-079 只修好了管理页那边。修后两处对上了。

**自动化触不到的一段**：点扩展图标授予 `activeTab` 那一下无法自动触发（TASK-037 起的既有限制），
所以上面的失败态是**直接驱动 DOM 摆出来**的，验的是版式与文案；「真的抓失败时会走到这一屏」
由单测的 `needsPdfDecision` 与接线覆盖，**仍需用户在真实网页上点一次确认**。

### 用例与变异验证

新增 7 条：`needsPdfDecision` 的五种组合、五种 `pdfFailureText` 各自成话、以及「五种原因不得共用
同一句话」。变异验证：
- 判据退化成只看 `pdf_problem` → 变红（普通网页会被误判成要停下来）；
- 把两种原因写成同一句 → 变红。

### Review 之后的修正（L3 首轮 CHANGES_REQUIRED，三条全部处理）

- **F1（必须修）契约 §14.7 留下新的失效陈述**：它仍写「抓不到就退回既有行为……并在确认页说清原因」，
  而本次之后退回不再自动。**这正是本任务要修的那一类缺陷，我在订正 §14.4 的同时又在 §14.7 新造了一处。**
  已改：写明「先停在 popup 上问一句（在那之前是自动退回）」，并保留「确认页上仍会再说一次原因」。
- **F2（必须处理）§14.4 把未合并分支当成既成事实**：那段订正描述的是 TASK-084 的行为，
  而 TASK-084 当时仍在 PR #92 未合并（AGENTS.md §5：未合并的依赖不得被当作已批准）。
  已改为「**生效前提：TASK-084 先合并**」并加了一条**合并顺序要求**的引用块；`popup.ts` 的同句注释同改。
  **→ 本任务必须在 TASK-084（PR #92）之后合并。**
- **F3（覆盖缺口）接线零用例**：完成条件写了「有用例」，而 `popup.test.ts` 只测纯函数，
  `main.ts` 的接线没有任何机械证据——**两说**。已按范围修订 2 新增 `main.test.ts`（jsdom，
  把真实 `popup.html` 铺进 document 再动态 import），6 条覆盖：版本取实装值、抓到 PDF 直接交付、
  失败时停住且未交付、点「改存正文」才交付、点「算了」不交付且按钮回来、普通网页照旧问图片。

**另两条非阻断也修了**：`chrome` 顶层直读改为 `typeof chrome !== 'undefined'` 守卫（本仓既有写法；
未定义时原本会 ReferenceError 打死整段接线）；「算了」之后把采集按钮放回来（否则同一次 popup 里
再也点不了第二次）。

**接线的变异验证**：失败时不停下来 → 2 条红；「算了」也交付 → 1 条红；版本退回源码常量 → 1 条红。

### 已知限制 / 未完成项

- **文献 + PDF 失败 + 正文有图时要点三次**（采集 → 改存正文 → 图片选择）。登记时即写明不合并这两屏：
  图片询问是既有且已测的路径，不为省一次点击去动它。
- **「算了」之后扩展存储里可能仍留着上一次的暂存内容**（本次不落新暂存，但不清旧的），
  与既有行为一致——那份会被下次采集覆盖或下次交付清除。
- popup 的视觉风格没有草图可依，本次只加必要状态，未做整体设计。
- **接线用例未覆盖四条分支**（独立 Review 二轮指出，均非阻断）：失败 + 正文有图 → 改存正文 →
  应弹图片询问且此刻仍未交付（即「要点三次」那条已知限制的组合路径）、`#text-only`、
  `runCapture` 失败时的 `outcomeText`、`deliver` 的 catch 分支。建议下次顺手补。
- **用户文档有两处漂移，本任务改不了**（不在 `allowed_paths`，独立 Review 非阻断①）：
  `extension/README.md` 仍写按钮叫「保存这一页的正文」，`docs/开发与运行.md` 仍写「抓不到时**自动**
  退回」。登记为遗留，**并入下一个已授权任务**。
- **`cross-origin` 这一种其实一次请求都没发**，把它归进「失败」在用户语义上成立（「这篇 PDF 没拿到」），
  但记录与注释里「试过」二字对这一种不够准确（独立 Review 的措辞小疵）。文案本身没有谎称发过请求。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- **最终候选 SHA**：`7b90bfe5fb392ec5b64182a3c77a4fac4dc9dff5`（基线 `168830e`）。
  候选链：`76dd81a`（首轮）→ `0db4f96`（Review F1–F3 修正）→ `7b90bfe`（补齐接线用例的类型）。
- **Review**：L3 独立只读 Reviewer 两轮——首轮 **CHANGES_REQUIRED**（F1 契约 §14.7 新失效陈述、
  F2 把未合并分支当既成事实、F3 接线零覆盖却声称「有用例」），二轮 **PASS**。

### 过程失误留痕（独立 Review 要求记一句，因为它会复发）

首轮候选提交时 `vitest run` 是绿的、`tsc` 是红的（新用例的 mock 没标类型，`calls[0][2]`
落在空元组上；vitest 不做类型检查）。我当时用

```bash
python3 scripts/governance/check_task.py ... | grep -E "^CHECKS" && git commit ...
```

看结果，而检查失败时输出的是 `CHECKS FAIL: 2`——**`grep` 匹配到它照样返回 0**，`&&` 后面的
提交正常执行。于是一个类型错误的候选被提交并送去 Review。**同一天这个坑踩了两次**（TASK-085
登记时也发生过一次）。正确写法是把检查与提交拆成两步，或用 `grep -qE "^CHECKS PASS"`。
已写入主 Agent 的长期记忆。

### 合并之后必须做的清理（独立 Review 二轮指出）

契约 §14.4 里那句「**生效前提：TASK-084 先合并**」与它下面的合并顺序引用块，
**在 TASK-084 合并之后自身就成了过期陈述**。最迟在把 TASK-085 标为 MERGED 时删掉它们。
同理，本记录 TOML 的 `risk_reason` 里仍写「那个勾选框**已被删**」——属冻结区的小疵，
不为它重开候选，一并在收尾时处理。

### Review 报告（二轮，覆盖最终候选）原文

> **结论：PASS**（覆盖新候选 `7b90bfe`，继承上一轮对 `76dd81a` 的其余结论）
>
> **① §14.7 新写法**：与代码逐条对得上——「先停在 popup」对 `main.ts:84-99`；「点改存正文才走既有行为」对 `:89-92`→`askImagesThenDeliver`；「点算了什么都不存」对 `:93-98`（不调 `deliverCapture`）；「确认页仍会再说一次原因」属实（载荷带 `pdf_problem`，`CapturePage.tsx:309-311` 渲染）。未发现新的不一致。
>
> **② F2 处置**：足够。条件化陈述在任一合并顺序下都不为假。**剩余风险**：TASK-084 合并后这条引用块与「生效前提」就成了新的过期陈述——请在 084 合并后（最迟在 085 标 MERGED 时）删掉它。
>
> **③ 6 条接线用例**：真有判别力——断言失败时 `deliverCapture` **未被调用**、「算了」未交付、交付时的 `images` 实参、实装版本、按钮回来，都钉在被测输入上，不是形状断言；所报三组变异与断言分布一致。**未覆盖的分支**（均非阻断）：a) 失败 + 正文有图 → 改存正文 → 应弹 `#choices` 且此刻仍未交付（即记录里「要点三次」那条已知限制的组合路径）；b) `#text-only`；c) `outcome.ok=false` → `outcomeText`；d) `deliver` 的 catch → 采集按钮回来。
>
> **④ 其他**：`main.test.ts` 已随范围修订 2 进 `allowed_paths`，无越界；`typeof chrome` 守卫与「算了」后 `show(button, true)` 均已落地，后者有用例钉住。
>
> 剩余风险：失败屏仍只有手工 DOM 实测 + 接线单测，真实网页上「抓失败→这一屏」仍需用户点一次确认；用户文档两处漂移已登记待下一个任务。

- Acceptance：待填
- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-21 用户要求「失败就在插件页反馈、再退回爬取正文」并指出 popup 一直是
  0.2.0 的样子 → 主 Agent 查明 popup 在确认页打开的瞬间被关闭、TASK-080 的回执从未显示 →
  画两种做法的草图 → 用户「明白了，使用方案 A」→ 登记 TASK-085（因要改契约 §14.4 定 L3）。
<!-- EVIDENCE:END -->
