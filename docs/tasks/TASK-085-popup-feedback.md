# TASK-085：PDF 抓不到时，扩展弹窗当场说清并让用户决定

```toml
schema_version = 2
id = "TASK-085"
status = "READY"
risk = "L3"
risk_reason = "要改契约第 14.4 节（popup 的交互与权限询问时机写在那里），并修正 TASK-084 留下的一处**已失效的契约陈述**（§14.4 仍写「用户若在确认页取消勾选、改存网页正文」，而那个勾选框已被删）。`docs/contracts/**` 命中 risk-policy.json 的 high_risk_paths，取最高定 L3：1 Worker → 自动检查 → 独立只读 Reviewer → 独立只读 Integration/Acceptance。代码改动本身只在扩展 popup，但契约是公共事实来源，改它必须走满这条链。"
risk_flags = ["public-api", "business"]
owner = "coordinator"
base = "168830e5b2947f92677bea1dbd18489b30f51512"
allowed_paths = [
  "extension/src/popup/main.ts",
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
checks = ["extension", "contracts"]
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

- 实现 SHA：待填。
- 命令与结果：待填。
- 已知限制/未完成项：待填。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-21 用户要求「失败就在插件页反馈、再退回爬取正文」并指出 popup 一直是
  0.2.0 的样子 → 主 Agent 查明 popup 在确认页打开的瞬间被关闭、TASK-080 的回执从未显示 →
  画两种做法的草图 → 用户「明白了，使用方案 A」→ 登记 TASK-085（因要改契约 §14.4 定 L3）。
<!-- EVIDENCE:END -->
