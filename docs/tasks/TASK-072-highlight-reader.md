# TASK-072：阅读器里的高亮（标下来 / 上色 / 重新定位 / 高亮 Tab）

```toml
schema_version = 2
id = "TASK-072"
status = "READY"
risk = "L2"
risk_reason = "在 TASK-071 已合并、已审的契约之下做前端实现：不改后端、不改契约、不做迁移，新增的只有前端文件与既有阅读器组件的接入。按第 4 节属「不改变已批准公共契约和关键数据含义的普通业务实现」，与 TASK-068（阅读器交互）同级，定 L2：1 Worker → 自动检查 → 1 独立只读 Reviewer 检查最终 diff；独立验收 N/A。两点自觉升级注意：① 本任务会创建与删除用户数据（高亮），删除走一次确认、不做静默删除；② 重定位逻辑错误会让用户看见「标过的段落不见了」，因此纯函数部分必须有成规模的定向用例与判别性验证。若实施中发现需要改契约或后端，立即停止并重新定级。"
risk_flags = ["business"]
owner = "coordinator"
base = "052238164abd430be7fc39b5d140443a78342b9b"
allowed_paths = [
  "frontend/src/features/resources/highlightAnchor.ts",
  "frontend/src/features/resources/highlightAnchor.test.ts",
  "frontend/src/features/resources/highlights.ts",
  "frontend/src/features/resources/highlights.test.ts",
  "frontend/src/features/resources/ReaderHighlights.tsx",
  "frontend/src/features/resources/ReaderHighlights.test.tsx",
  "frontend/src/features/resources/ReaderQuote.tsx",
  "frontend/src/features/resources/ReaderQuote.test.tsx",
  "frontend/src/features/resources/quoteSelection.ts",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ResourceDeleteDialog.tsx",
  "frontend/src/features/resources/ResourceDeleteDialog.test.tsx",
  "frontend/src/features/resources/api.ts",
  "frontend/src/features/resources/api.test.ts",
  "frontend/src/features/resources/fixtures.ts",
  "frontend/src/api/client.ts",
  "frontend/src/api/client.test.ts",
  "frontend/src/features/notes/NotesPanel.tsx",
  "frontend/src/features/notes/NotesPanel.test.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/reader-highlights.spec.ts",
  "docs/开发与运行.md",
  "docs/tasks/TASK-072-highlight-reader.md",
  "docs/tasks/TASK-071-highlight-backend.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-19 用户选定第三部分（阅读器方向）的第一块＝「高亮能存住」，形态＝高亮可单独存在、心得可选配（后端已由 TASK-071 交付并合并，PR #79，merge `0522381`）。同日用户说「**开任务 72 吧**」，并在界面追问中选定：

1. **胶囊给两个按钮**：「标下来」＝只上色、不开心得框；「记下这段」保持既有用法（引文进心得草稿），并**顺手把这段也标上**，心得保存后自动与该高亮配对；
2. **右栏新增「高亮」Tab**（变成 高亮 / 心得 / 信息 三个）：按文中顺序列出，点一条跳到正文那一段；**找不到原文的排在末尾并标明原因，不静默消失**。

### 目标

1. **取锚点**（纯函数）：从正文选区取 `exact` + 前后文各 ≤200 字 + 在快照正文里的字符偏移，按 TASK-071 契约 4.15 的字段发给后端。
2. **重新定位**（纯函数）：打开文章时把存下来的锚点重新落到当前正文上，按契约 4.15 的降级顺序——`exact` 唯一匹配 → 前后文消歧 → 偏移附近模糊匹配 → **标为孤立**。孤立的保留内容，在「高亮」Tab 里标明「原文位置已找不到」，可删除、可保留等正文换回来。
3. **上色**：用 CSS Custom Highlight API（`CSS.highlights`）直接给 Range 着色，**不往 DOM 里插节点**（调研 5.2：插 wrapper 会在长代码块产生上千节点、打碎无障碍树、重叠时还要拆节点）。浏览器不支持时**降级为不上色**，列表照常工作（jsdom 里就是这条路径）。
4. **胶囊两个按钮**：「标下来」→ 创建高亮；「记下这段」→ 创建高亮 + 引文进心得草稿，且**心得保存后把它与这条高亮配对**（`PATCH note_id`）。
5. **「高亮」Tab**：按文中顺序列出（孤立的排最后），每条显示原文摘录与配的心得首行；操作：跳到正文、写心得/解绑、删除（一次确认）。
6. **悬挂绑定（TASK-071 遗留 F5）**：高亮的 `note_id` 指向的心得若已被 `detachNote`/`attachNote` 移出本资料，按「没配心得」展示并允许重新配，不显示错误也不丢高亮。
7. **删除资料对话框显示高亮数**：`DeletionImpact` 加 `highlight_count`（后端已返回），对话框把它和心得数一起摆出来。
8. 顺带把 **TASK-071 登记为 MERGED**（用户 2026-09-19 合并 PR #79，merge `0522381`）。

### 非目标 / 禁止范围

- 不改后端、契约、openapi、迁移。若发现必须改，停止并重新定级。
- **不做正文上的点击命中**：CSS Custom Highlight API 不产生 DOM 节点，要在正文上点中一条高亮得自己做命中测试（`caretRangeFromPoint` 一类）。本次所有针对单条高亮的操作都在「高亮」Tab 里，正文只负责上色。
- 不做多色、标签、表情、导出；不做边注布局；不做 PDF/Word 阅读；不加快捷键（用户 2026-09-17 决定）。
- 不改「记为学习进度」「记下这段」的既有行为，除目标 4 明确的追加之外。
- 所有未列入 `allowed_paths` 的路径。

### 依赖

TASK-071 已合并（契约 4.15 与五个接口在 main 上）。基线 `0522381`。并行：否（主 Agent 亲自实施，唯一写入者）。

### 主 Agent 登记的实现决定（非用户决定，Review 可挑战）

- **偏移以「渲染后的正文纯文本」为准**，不是 Markdown 源码：重定位时两端用同一套文本，才可能对上。这会让偏移与后端存的数字只在同一渲染器下有意义——但偏移本来就只是降级锚点，`exact` 与前后文才是主锚点。
- **模糊匹配的范围有界**：偏移附近 ±2000 字符内找最接近的一处 `exact` 前缀匹配；找不到就判孤立，不做全文编辑距离扫描（正文可达百万字符，代价与收益不成比例）。
- **一次只挂一条待配对的高亮**：「记下这段」连点两次而心得还没保存时，配对目标是最后一次；先前那条留作没配心得的高亮（不丢数据）。
- **悬挂绑定按「未配对」展示**：读一页本资料的心得（`page_size=100`）做匹配，匹配不上即视为没配心得。超过 100 条心得的资料可能把在第二页的心得误判为悬挂——代价只是多显示一个「写心得」入口，记录在案。

### 登记后的路径修订（实施中，写入前记录）

`frontend/src/api/client.test.ts` 追加进 `allowed_paths`：该文件里有一条删除影响的夹具，按固定键构造 `impact`。`DeletionImpact` 新增 `highlight_count` 后，那条夹具不补字段就会让既有用例红。改动限于夹具补一个字段，不放宽任何断言。

## 完成条件

- 取锚点：选中一段 → 「标下来」后接口收到 `exact`/前后文/偏移，且偏移与渲染正文对得上（有定向用例）。
- 重定位四级降级各有用例：唯一匹配、重复措辞靠前后文消歧、正文上方插入文字后靠偏移附近找回、彻底找不到判孤立；**判别性**：去掉前后文消歧或去掉模糊匹配，对应用例必须变红。
- 上色：`CSS.highlights` 可用时把 Range 交给它且不修改正文 DOM（用例断言 DOM 未变）；不可用时不抛错、列表照常。
- 胶囊两个按钮各自行为正确；「记下这段」保存心得后该高亮的 `note_id` 被 PATCH 上（有用例）。
- 「高亮」Tab：文中顺序、孤立排末尾并标明原因、跳到正文、删除需一次确认、悬挂绑定按未配对展示。
- 删除对话框显示高亮数。
- `check_task.py` 必要检查 PASS（lint/format/typecheck/vitest/e2e/build）。
- L2 独立只读 Reviewer 对 `base..candidate` 最终 diff 给出结论。

## 上下文包

- 规则：`AGENTS.md`（V2）、`frontend/AGENTS.md`。
- 契约：`docs/contracts/API与数据契约基线.md` 4.15（字段、降级顺序、孤立不落库、锚点不可变、`PATCH` 的 `note_id` 必填可空）、2.3（高亮列表排序白名单）、10 节五个操作；`openapi-v1.json` 的五个 operation。
- 调研：`docs/research/阅读器与标注能力调研.md` 5.1（分层选择器与降级）、5.2（CSS Custom Highlight API 与浏览器支持）。
- 源文件：`ResourceDetail.tsx`（右栏 Tab 在 187-190、398-455；`takeQuote` 在 218-232）、`ReaderQuote.tsx` 与 `quoteSelection.ts`（TASK-068 的选区与胶囊）、`NotesPanel.tsx`（草稿与保存链路）、`ResourceDeleteDialog.tsx:137`（影响计数展示）、`api/client.ts:12-21,154-173` 与 `features/resources/api.ts:118-137`（两处 `DeletionImpact` 校验器）。
- 检查：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-072-highlight-reader.md --worktree`。

## 实现与测试

- 实现 SHA/变更摘要：待填
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：待填
- 已知限制/未完成项：待填

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：L2，N/A。
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-19 用户「开任务 72 吧」，并选定胶囊两个按钮（标下来 / 记下这段，后者顺手也标上并在保存后配对）与右栏新增「高亮」Tab（孤立的排末尾并标明原因）→ 登记 TASK-072。
<!-- EVIDENCE:END -->
