# TASK-078：文献信息的显示与编辑（右栏「信息」Tab）

```toml
schema_version = 2
id = "TASK-078"
status = "READY"
risk = "L2"
risk_reason = "已批准契约之下的前端实现：文献元数据的表、三个接口与校验都已由 TASK-074 交付并合并，本任务只是把它们接到界面上。不改后端、不改契约、不做迁移、不新增接口。按第 4 节属「不改变已批准公共契约和关键数据含义的普通业务实现」，定 L2：1 Worker → 自动检查 → 1 独立只读 Reviewer；独立验收 N/A。若发现必须改契约或后端，停止并重新定级。"
risk_flags = ["business"]
owner = "coordinator"
base = "bcfa7805666d19d9dfaba0f6732f916fd8ca52b6"
allowed_paths = [
  "frontend/src/features/resources/citation.ts",
  "frontend/src/features/resources/citation.test.ts",
  "frontend/src/features/resources/ReaderCitation.tsx",
  "frontend/src/features/resources/ReaderCitation.test.tsx",
  "frontend/src/features/resources/ResourceToolbar.tsx",
  "frontend/src/features/resources/ResourceToolbar.test.tsx",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/citation.spec.ts",
  "docs/tasks/TASK-077-pending-registrations.md",
  "docs/tasks/TASK-078-citation-ui.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-20 用户问「下一个任务是什么」「有没有能并行做的」，主 Agent 给出三个方向并指出文献元数据「后端已合并但界面上完全看不见」。用户选「先看草图」；主 Agent 在 Pencil 出了两张（`文献信息｜三个状态（TASK-078 草图）`、`资料库｜文献行（TASK-078 草图）`），并列出四个待定项（放信息 Tab 不新开 Tab／列表行怎么体现／整块表单还是行内编辑／摘要做不做）。用户看过答**「可以，开始」**——即按草图与主 Agent 的推荐执行。

### 目标

1. **资料详情页右栏「信息」Tab 里新增「文献信息」区块**，三个状态按草图：
   - **空态**：现有的 来源／学习进度／收藏时间 三行不动，下面一块卡片写清楚「填了有什么用」+「填写文献信息」按钮。
   - **编辑态**：类型（九种，下拉）、作者（一行一位、可增可删）、年份、出处/期刊、卷、期、页、DOI、出版方；底部「取消 / 保存」。
   - **已填态**：类型徽章 + 年份在最上，然后 作者／出处（含卷期页）／出版方／DOI（可点开 `https://doi.org/<doi>`），右上角「编辑」。
2. **走已合并的三个接口**：`GET|PUT|DELETE /api/v1/resources/{id}/citation`。PUT 是**整份替换**（契约 2.4），所以界面也按整块表单一次保存，不做逐字段行内编辑。乐观锁按契约带 `expected_version`；`DELETE` 用 `If-Match`。
3. **删除文献信息**：编辑态里给一个「清空文献信息」，走 DELETE，要二次确认（它是不可逆的数据删除）。
4. **错误要说人话**：版本冲突（409/428）提示「这条文献信息刚在别处改过，重新打开再填」；字段校验失败（422）落到对应字段旁边，不是一句笼统的失败。
5. 顺带把 **TASK-077 登记为 MERGED**（用户 2026-09-20 合并 PR #84，merge `bcfa780`）——按用户 2026-09-20「下次这种简单的任务就不用单独开 pr 了，并入下一个任务一起做了就好」。

### 非目标 / 禁止范围

- **不做资料库列表里的「作者 · 年份 · 出处」那一行**（草图第二张）。登记时核实：资料列表的投影字段写死在 `RESOURCE_FIELDS`（标题/来源/保存原因/主题/版本/时间），**不含文献字段**；文献接口也只有单条 GET/PUT/DELETE、**没有列表或批量接口**。要在列表里显示就只能一行一个请求（一屏十几条＝十几个请求），这不可接受。真要做得改契约（给资料摘要挂一小块文献字段，或加批量读），属后端 L3，已向用户说明并留给单独任务。
- **不做摘要（`abstract`）字段**：契约里有（至多 20000 字），但塞进 374px 宽的右栏会把整个 Tab 撑长；用户已同意这一版不做。
- 不新开右栏 Tab（文献信息与来源/收藏时间同类，属「这篇资料是什么」，放进既有「信息」Tab）。
- 不做引文格式化与导出（APA/BibTeX 之类）、不做按作者/年份的搜索与筛选、不碰 `extension/**`（那是并行的 TASK-075）。
- 不改后端、契约、openapi、迁移；不动资料标题与来源地址（它们是资料自身的字段，在「编辑资料」里改）。
- 所有未列入 `allowed_paths` 的路径。

### 依赖与并行

依赖：TASK-074（文献元数据后端）已合并（merge `48f232e`），三个接口在 main 上可用。基线 `bcfa780`。
并行：本任务**持有 `docs/tasks/任务索引.md`**。若用户授权 TASK-075（扩展抓取）并行，则 075 不写索引，其索引行延后补登记（AGENTS.md 第 3 节）。两者路径不相交：本任务只写 `frontend/**` 与两份文档，075 只写 `extension/**`。

### 主 Agent 登记的实现决定（非用户决定，Review 可挑战）

- **整块表单而不是逐字段行内编辑**：后端 PUT 就是整份替换，逐字段编辑会让界面看起来像逐字段合并，与真实语义不符（漏填的字段会被清空）。
- **作者用一行一位的输入行**：契约里 `authors` 是字符串列表（不是结构化姓名），所以界面也不假装能拆姓/名。
- **DOI 在已填态显示为可点开的链接**（`https://doi.org/<doi>`），但**不校验 DOI 是否存在**，也不联网解析——本机应用不出网。
- **空态文案写「填了有什么用」而不是只写「暂无」**：这一块是新东西，用户不填就永远看不到价值。
- **清空文献信息要二次确认**：它删的是用户数据，按底线走既有的确认口径。

## 完成条件

- FILE/WEB/PASTE 任意资料的右栏「信息」Tab 都能看到文献区块；没填时是空态，填了是已填态。
- 编辑态能保存九种类型、多位作者、年份、出处、卷/期/页、DOI、出版方；保存后立刻看到已填态，不需要刷新。
- 保存走 PUT 且带 `expected_version`（用例断言请求体与并发冲突的提示）；清空走 DELETE 且带 `If-Match`，有二次确认。
- 422 的字段错误落到对应字段旁；409/428 给「刚在别处改过」的提示。两者各有用例。
- 年份、作者数量等边界与后端一致（年份 1000–2200、作者至多 100 位、单个至多 200 字），越界在前端就拦住并说明原因。
- 既有的右栏行为不变（高亮/心得 Tab、信息 Tab 原有三行），既有用例保持绿。
- e2e：真实浏览器里对一条资料填写文献信息 → 刷新后仍在 → 清空 → 回到空态。
- `check_task.py` 必要检查 PASS。
- L2 独立只读 Reviewer 对 `base..candidate` 最终 diff 给出结论。

## 上下文包

- 设计：Pencil `文献信息｜三个状态（TASK-078 草图）`（2026-09-20 用户确认）。
- 契约：`docs/contracts/API与数据契约基线.md` 第 4.16 节与 `docs/tasks/TASK-074-citation-metadata.md`（字段、九种类型、整份替换语义、乐观锁与 `If-Match`）。
- 既有实现：`highlights.ts`（同形态的受控客户端写法）、`ResourceToolbar.tsx` 的 `ReaderInfo`（信息 Tab 现有三行）、`ResourceDetail.tsx`（右栏 Tab 骨架）、`ResourceDeleteDialog.tsx`（二次确认的既有口径）。
- 检查：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-078-citation-ui.md --worktree`。

## 实现与测试

- 实现 SHA：待填。
- 命令与结果：待填。
- 已知限制/未完成项：待填。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：L2，N/A。
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-20 用户选定文献元数据方向 → 主 Agent 出 Pencil 草图并列四个待定项 → 用户「可以，开始」→ 登记 TASK-078；同日登记时核实列表行需改契约，划为非目标并当面说明。
<!-- EVIDENCE:END -->
