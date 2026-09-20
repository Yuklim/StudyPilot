# TASK-072：阅读器里的高亮（标下来 / 上色 / 重新定位 / 高亮 Tab）

```toml
schema_version = 2
id = "TASK-072"
status = "ACCEPTED"
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

- 实现 SHA：`b77247b`（控制面登记 `3ef9a8e`）。变更摘要：
  - **`highlightAnchor.ts`（新，纯函数）**：`mapText` 把容器里的文本节点串成一条纯文本并记住每段起点；`anchorFrom` 从 `Range` 取锚点（`exact` + 前后文各 ≤200 + 偏移，跨行内标记的选区也按整段纯文本算偏移）；`locate` 四级降级——`exact` 唯一匹配 → 多处时按前后文打分（打平才看偏移远近）→ 两边都去空白再找（重新排版过）→ 原偏移 ±2000 内用开头片段（取原文六成、下限 8 字）找 → 判为孤立；`rangeFor` 把定位结果变成 `Range`。
  - **`highlights.ts`（新，受控客户端）**：`listHighlights`（默认 `page_size=100`，按文中顺序）/`createHighlight`（`note_id` 无值时不发该字段）/`bindHighlightNote`（`note_id` **总是显式给出**，`null` 即解绑；回来的锚点若变了按无效响应处理——锚点不可变）/`deleteHighlight`（`If-Match`）。
  - **`ReaderHighlights.tsx`（新，右栏「高亮」Tab）**：读高亮 + 本资料一页心得（只为显示配了哪条），对每条现算定位；孤立的排最后并说明原因；上色用 `CSS.highlights` + `new Highlight(...ranges)`，**不支持时静默降级为不上色**，列表照常；删除是就地一次确认（「删除」→「确认删除 / 取消」）。
  - **`ReaderQuote.tsx`**：胶囊改两个按钮——「▨ 标下来」只标；「✎ 记下这段」照旧进草稿。两者都把点击当时的 `Range` 交出去；取不到真 `Range` 时交 `null`，引文照走、只是这次不标（引文不该被上色的失败连累）。
  - **`ResourceDetail.tsx`**：右栏三个 Tab（高亮/心得/信息，高亮带条数角标）；`takeMark` 创建高亮并切到高亮 Tab；`takeQuoteAndMark` 引文 + 标记，并把这条高亮记为「在等一条心得」；`NotesPanel` 新建成功回调 `onSaved` 后 `PATCH` 配对；写高亮失败在栏内 `role="alert"` 提示。
  - **`NotesPanel.tsx`**：新增 `onSaved`，**只在新建成功时**回调（改既有心得不回调，避免白推版本）。
  - **删除影响**：`api/client.ts` 的 `DeletionImpact` 加 `highlight_count`，两处校验器同步；`ResourceDeleteDialog` 把心得数与高亮数并列成一句（只有一种时只说一种）。
  - **`styles.css`**：`--mark`/`--mark-soft`/`--ink` 三个色（Pencil 草图定的暖黄）、`::highlight(studypilot-mark)` 规则（浏览器不认识时整条被忽略，降级不需要额外代码）、胶囊两按钮与高亮列表卡片样式。
- 新测试（16 条净增）与判别性（逐条实测）：
  - `highlightAnchor.test.ts` 10 例：取锚点（含跨 `<strong>` 的选区、正文外/空/超长拒绝）、四级降级各一例、孤立、`rangeFor` 不动 DOM。**判别性**：去掉前后文打分 → 第 2 例红；去掉去空白匹配 → 第 3 例红；去掉模糊匹配 → 第 4 例红（第 2 例特意把偏移指向错误的一处，否则「离原偏移最近」会替前后文把题做了——首版正是这样没有判别性，已修）。
  - `highlights.test.ts` 6 例：请求形状、`note_id` 必显式、锚点变了即无效响应、重复 id / 跨资料响应拒绝、发送前的参数拒绝。
  - `ReaderHighlights.test.tsx` 6 例：交给注册表的是 Range 且正文 DOM 不变（判别性：改成插标签即红）、没有该 API 时列表照常、孤立排最后且无「跳到正文」、悬挂绑定按未配对展示（TASK-071 F5）、删除一次确认、`onWriteNote` 回传。
  - `ReaderQuote.test.tsx` +2：「标下来」发出的锚点与偏移正确且不碰草稿、右栏落在高亮 Tab；「记下这段」→ 保存心得 → `PATCH` 配对（断言 `note_id` 就是刚保存那条）。测试的选区替身改为在能找到文本时给**真的** `Range`。
  - `ResourceDeleteDialog.test.tsx` +2：心得与高亮并列的那句、只有高亮时只说高亮。
  - `e2e/reader-highlights.spec.ts`（新）3 例：真实浏览器里标下来 → 列表 + 注册表里确有那段 + 正文无 `<mark>` → 刷新后仍在；整份换掉正文 → 标记为「原文位置已找不到」且不乱落到别处 → 换回原文自动对上（孤立不落库）；「记下这段」→ 保存心得 → 后端那条高亮的 `note_id` 非空。
- 命令与结果（本机 macOS 25.5.0，工作区在 `b77247b`）：
  - `npm run lint` / `npm run typecheck`（`tsc -b`）/ format 均 0；`vitest run` **684 passed**（TASK-071 时 668，+16）；`playwright test` **70 passed**（+3）。
  - `python3 scripts/governance/check_task.py --task docs/tasks/TASK-072-highlight-reader.md --worktree` → **CHECKS PASS**（lint/format/typecheck/vitest/e2e/build）。
  - 过程记录：`npx tsc --noEmit` 单跑**不等于**项目的 typecheck（项目用 `tsc -b` 与自己的 tsconfig），两次漏掉的符号（`failureText`、`Note` 类型）都是 `npm run typecheck` 才报出来的。
- 已知限制/未完成项：
  - **正文上点不中高亮**：CSS Custom Highlight API 不产生 DOM 节点，要在正文上点中一条得自己做命中测试。所有针对单条的操作都在右栏「高亮」Tab 里（任务非目标已写明）。
  - **打开右栏的入口仍叫「心得」**：工具条按钮是 TASK-045 起的「心得＝开合 + 聚焦」，刷新后想看高亮要先点它再切 Tab。标过的段落在正文上本来就有颜色，所以不算找不回；入口文案是否要改留给用户看过真机后再定。
  - 偏移按**渲染后的正文纯文本**算，与后端存的数字只在同一渲染器下等价；这是有意的（偏移只是降级锚点，主锚点是原文与前后文）。
  - 一页 100 条心得之外的绑定会被当成悬挂绑定，多显示一个「写心得」入口（登记时已写明）。
  - 「记下这段」连点两次而心得还没保存时，配对目标是最后一次，先前那条留作没配心得的高亮（登记时已写明）。

### Review F1/F2/F3 的修正（第二候选）

- **F1（可记录→已修）** `rendered` 为 null（快照还在读、切到源码视图、这份资料没有快照）时，原实现把**所有**高亮都算作定位失败，界面上一律显示「原文位置已找不到——正文换过一版」。那是在冤枉数据：没有正文可查 ≠ 那段话没了。改为 `locatable = rendered !== null`，不可定位时不下孤立判断、不加 `orphaned` 样式、计数行改说「正文还没就绪」。**判别性已验**：把 `locatable` 写死为 true 即红。
- **F2（可记录→已修）** 高亮列表与心得列表原本同在一个 `Promise.all` 里，心得读失败会让整个 Tab 变成错误页、正文也不上色——而心得只是用来显示「配了哪条」。改为心得侧自带兜底（失败即空列表）。**判别性已验**：去掉兜底即红。
- **F3（可记录→已修）** `pendingNote`（在等心得的那条高亮）原本永不过期：用户「记下这段」后放弃草稿、或转头去改既有心得，之后**任意**一次新建心得都会被配到那条旧高亮上，而界面里没有解绑入口。改为：`takeMark`（只标记，明确不想配）与 `openNoteFromHighlight`（去改既有心得）显式清空；`bindSavedNote` 先取后清，并对超过 10 分钟的待配对直接放弃。**判别性已验**：去掉「标下来时清空」即红。
- **F4（次要，记录不改）** 见下方非阻断遗留项。
- 修正后重跑：lint/typecheck/format 0、`vitest run` **687 passed**（+3 回归用例）、`playwright test` **70 passed**、`check_task.py --worktree` **CHECKS PASS**。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：**`11251dd`**（代码 `4665a15`；`11251dd` 只写本记录）。演进：实现 `b77247b`/首轮候选 `4a5bcba` → Review F1/F2/F3 修正 `4665a15`/最终候选 `11251dd`。工作树与候选无差异，主 Agent 已核。
- Review：L2 独立只读 Reviewer（`.claude/agents/reviewer.md`），两轮，最终 **PASS**。权限证据：两轮均声明「仅 `Read`/`Grep`/`Glob`，无写工具、无 Bash，运行器层面真实只读」；无法跑 `git diff`/测试，按工作树读最终状态并用全仓 `TASK-072` 引用面核对写入范围，另与契约 4.15/10 节、后端 `resource_store.py` 的 `highlight_count` 对照。
  - **首轮**（`0522381..4a5bcba`）**PASS，4 项非阻断**。确认通过：`anchorFrom` 与 `rangeFor` 走同一套 `mapText` 坐标，元素端点经 `offsetOf` 折算（无文本后代返回 null ＝拒绝，不给错位置）；去空白级的下标映射与 `end=last+1`、片段级 `end` 的双重钳制均正确，**不会产出非法 Range 或错误位置**；上色只用 `CSS.highlights` + `new Highlight`，正文零写入，空集/卸载/换资料都清注册表键；PATCH `{note_id, expected_version}`、DELETE `If-Match`、`note_id` 必显式、锚点回传变更即判无效响应；未碰后端/契约/openapi，改动全在 `allowed_paths` 内；测试有判别性（`mark, span` 计数 + `textContent`、四级各一例、e2e 查注册表内容）。
  - **第二轮增量**（`4a5bcba..11251dd`）**PASS，无新缺陷**：「F1 的 `locatable` 同时管住孤立文案、`orphaned` 样式、`orphans` 计数与提示，用例断言四点；F2 兜底只吞心得侧失败，`notes` memo 类型同步，无其他消费者；F3 取后即清 + 显式清空 + 10 分钟时限，新例断言『标下来后再写心得零 PATCH』，判别性成立。未发现新缺陷或断言放宽。」Reviewer 同意 F4 四条全部只记录：「属会话内瞬态或刷新即恢复，且都不会造成**错误上色**」。
- Acceptance：L2，N/A。
- 最终状态/风险/用户操作：**ACCEPTED**，等用户合并 PR。风险低：纯前端，后端与契约一字未动；既有阅读器行为（Esc、焦点、⌘J、角标、窄屏浮层）由既有用例守住且全绿。用户操作：合并 PR，然后**在真机上试一次**——下面两条界面取舍要你看过才好定。
- 非阻断遗留项：
  - **（待用户定）窄屏点「标下来」会展开右栏浮层**：浮层会盖住正文并把正文置 `inert`，恰好挡住「标下来」唯一的结果（上色）。Reviewer 的独立意见是「宽屏保持现状，窄屏改为不自动展开，反馈交给『高亮』角标 +1」。主 Agent 当初展开是为了让用户看见确实存进去了。**交用户在真机确认后决定**，不在本任务改。
  - **（待用户定）打开右栏的入口仍叫「心得」**：刷新后想看高亮列表要先点工具条的「心得」按钮再切 Tab。标过的段落在正文上本来就有颜色，所以不算找不回；文案是否要改同样交真机后决定。
  - **（记录）F3 残留的窄路径**：「记下这段」后放弃草稿，**10 分钟内**另写一条新心得，仍会被配到那条高亮上。要根治需要观察草稿被清空的时机（`NotesPanel` 内部状态）。触发条件窄、后果是一条配错的绑定；重评触发：用户真的撞上，或将来加解绑入口时一并处理。
  - **（记录）F4 四条**：① `rows` memo 依赖 `.snapshot-rendered` 元素身份，会话内替换正文且元素被复用时不重算（刷新即恢复，不会错误上色）；② 降级的第三、四级取的是第一处匹配而非离原偏移最近的一处；③ `locate` 返回的 `degraded`（不是靠原文原样找到的）未在界面体现；④ 高亮列表固定 `page_size=100`，超过 100 条时角标与「共 N 条」会少报。四条均由 Reviewer 确认不会造成错误上色。
  - **（记录）正文上点不中高亮**：CSS Custom Highlight API 不产生 DOM 节点，要在正文上点中一条得自己做命中测试；本次所有单条操作都在右栏（任务非目标已写明）。
- 日期与决定日志：2026-09-19 用户「开任务 72 吧」，并选定胶囊两个按钮（标下来 / 记下这段，后者顺手也标上并在保存后配对）与右栏新增「高亮」Tab（孤立的排末尾并标明原因）→ 登记 TASK-072 → 2026-09-19 Pencil 草图（两个 Frame）经用户「可以」确认 → 实现 `b77247b` → L2 两轮独立 Review PASS（首轮 4 项非阻断，前三项已修）→ 最终候选 `11251dd` → ACCEPTED，待用户合并。
<!-- EVIDENCE:END -->
