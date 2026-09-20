# TASK-078：文献信息的显示与编辑（右栏「信息」Tab）

```toml
schema_version = 2
id = "TASK-078"
status = "ACCEPTED"
risk = "L2"
risk_reason = "已批准契约之下的前端实现：文献元数据的表、三个接口与校验都已由 TASK-074 交付并合并，本任务只是把它们接到界面上。不改后端、不改契约、不做迁移、不新增接口。按第 4 节属「不改变已批准公共契约和关键数据含义的普通业务实现」，定 L2：1 Worker → 自动检查 → 1 独立只读 Reviewer；独立验收 N/A。若发现必须改契约或后端，停止并重新定级。"
risk_flags = ["business"]
owner = "coordinator"
base = "bcfa7805666d19d9dfaba0f6732f916fd8ca52b6"
allowed_paths = [
  "frontend/src/api/client.ts",
  "frontend/src/api/client.test.ts",
  "frontend/src/features/resources/citation.ts",
  "frontend/src/features/resources/citation.test.ts",
  "frontend/src/features/resources/ReaderCitation.tsx",
  "frontend/src/features/resources/ReaderCitation.test.tsx",
  "frontend/src/features/resources/ResourceToolbar.tsx",
  "frontend/src/features/resources/ResourceToolbar.test.tsx",
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/citation.spec.ts",
  "backend/src/studypilot/api/citations.py",
  "backend/tests/test_citations.py",
  "docs/tasks/TASK-077-pending-registrations.md",
  "docs/tasks/TASK-078-citation-ui.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend", "backend"]
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
- 不改契约、openapi、迁移；不动资料标题与来源地址（它们是资料自身的字段，在「编辑资料」里改）。后端只改下面登记的那一处**违约修正**，不碰业务逻辑。
- 所有未列入 `allowed_paths` 的路径。

### 依赖与并行

依赖：TASK-074（文献元数据后端）已合并（merge `48f232e`），三个接口在 main 上可用。基线 `bcfa780`。
并行：本任务**持有 `docs/tasks/任务索引.md`**。若用户授权 TASK-075（扩展抓取）并行，则 075 不写索引，其索引行延后补登记（AGENTS.md 第 3 节）。两者路径不相交：本任务只写 `frontend/**` 与两份文档，075 只写 `extension/**`。

### 登记后的路径修订（实施中，写入前记录）

把 `frontend/src/api/client.ts` 与 `frontend/src/api/client.test.ts` 追加进 `allowed_paths`：文献接口在资料没有文献信息时返回 **404 `CITATION_NOT_FOUND`**，而前端的 `messages` 表与服务端错误码白名单里**没有这个码**（其余的 `VALIDATION_ERROR`/`VERSION_CONFLICT`/`VERSION_REQUIRED`/`RESOURCE_NOT_FOUND` 都已有）。不加这个码，「还没填文献信息」这个**正常状态**会被当成未知错误。改动仅此一码：`messages` 加一行中文提示 + 白名单加一行，不动 `client.ts` 的任何既有行为。

另记一条**登记时的完成条件口径修正**（写入前发现，如实登记）：完成条件里写「422 的字段错误落到对应字段旁」。实际核对后端后确认，**422 只返回 `VALIDATION_ERROR` 一个码，不带字段级明细**。因此改为：前端按契约的边界（年份 1000–2200、作者至多 100 位且单个至多 200 字、各字符串上限）**在本地校验并把错误落到对应字段**；万一服务端仍返回 422，给一句整体提示并保留用户已填内容。这不降低要求，只是把「谁来判定字段」说准。

### 范围修订二：后端的时间戳违约（实施中发现，用户当场授权后写入）

e2e 跑真实后端时，前端把文献接口的响应判成「格式不正确」。查下来是**后端违反契约**：契约第 533 行写明「后端规范化为 UTC 保存并**以 `Z` 返回**」，仓库里 `api/notes.py`、`api/highlights.py`、`api/learning.py` 与 `resource_store.py` 都带了 `.replace("+00:00", "Z")` 的 datetime 编码器，**只有 TASK-074 的 `api/citations.py` 没带**，于是它返回 `2026-09-20T06:52:43.123456+00:00`——全 API 里唯一一个。TASK-074 的 L3 Review 与独立验收核的是字段语义、迁移与删除影响，没有比对时间戳编码，所以漏过去了；单元测试也发现不了（那里接口是替身，返回的是用例自己造的 `Z`）。

2026-09-20 主 Agent 把三个选项（并进本任务修／单开后端任务／前端容忍两种格式）摆给用户，用户选**「并进 TASK-078 一起修」**。据此：`backend/src/studypilot/api/citations.py` 与 `backend/tests/test_citations.py` 追加进 `allowed_paths`，`checks` 加 `backend`。

**风险仍定 L2**：这是让实现回到已批准契约，不是改契约本身；改动是把别处现成的 datetime 编码器搬过来（一处），外加一条断言时间戳以 `Z` 结尾的后端用例。不碰文献的任何业务逻辑、校验、迁移与删除影响。若 Review 认为「改变了已交付接口的响应字节」应当升级，主 Agent 接受重新定级。

### 范围修订三：`isbn` 字段要原样带回（实施中发现，写入前记录）

契约里文献还有 `isbn`，而草图与目标里的字段清单没有它（用户确认的那一版就没有）。问题在于 **`PUT` 是整份替换**：如果表单不认识 `isbn`，那么一条带 ISBN 的文献（将来由扩展抓取写入）只要在界面上按一次保存，ISBN 就被悄悄抹掉了。

处置：把 `isbn` 与 `abstract` 一样**放进类型并原样带回**（读到什么就写回什么），但**不做可编辑的输入框**——加字段属于扩需求，不在用户确认的范围里。这样既不丢数据，也不擅自扩界面。「ISBN 与摘要不可在界面上编辑」记入已知限制。

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

- 实现 SHA：`6405987`（控制面登记 `eddebb1`）。变更摘要：
  - **`citation.ts`（新）**：受控客户端 + 纯函数。`getCitation` 把 **404 `CITATION_NOT_FOUND` 折成 `null`**（「还没填」是正常状态，不是错误）；`putCitation` 整份写入、只把有值的字段放进请求体（契约要求清空用「省略」而不是空串）、首次不带 `expected_version`；`deleteCitation` 带 `If-Match`。`draftProblems` 按**与后端同一组边界**在本地判并定位到字段；`normalizeDraft` 把空格子折成 `null`、丢掉空作者行；`doiUrl` 与 `containerLine` 负责两处易错的拼接。
  - **`ReaderCitation.tsx`（新）**：空态（写清楚填了有什么用）／编辑态（整块表单：类型九选一、作者一行一位可增删、年份、出处、卷期页、DOI、出版方）／已填态（类型徽章 + 年份、作者、出处、出版方、可点开的 DOI）。清空走二次确认；**保存失败不关表单**（关掉等于替用户丢掉刚填的内容）。
  - **`ResourceToolbar.tsx`**：`ReaderInfo` 在既有三行下面挂上文献区块。**不新开 Tab**。
  - **`styles.css`**：文献区块与资料信息之间一条细线；作者行的输入框吃掉剩余宽度、删除键固定在右侧。
- **实施中修掉的三个真问题**（都不是原计划内的，按登记的范围修订执行）：
  1. **后端时间戳违约（范围修订二，用户授权）**：`api/citations.py` 缺 datetime 编码器，返回 `+00:00` 而非契约第 533 节要求的 `Z`，是全 API 唯一一个。补上别处现成的编码器。**既有后端用例拦不住**——它用 `datetime.fromisoformat(...).tzinfo == UTC`，两种写法都认；新增 `endswith("Z")` 断言，**变异实测**：把编码器去掉，该用例即红。
  2. **共享客户端的删除白名单**：`versionedDeleteTarget` 只放行 topics/tags/notes/snapshot，文献路径不在内，`DELETE` 在发请求前就被自己拒掉。按 snapshot 的同款写法放行 `resources/{id}/citation`，并补一条「正确路径放行、相近路径（`/citations`）仍拒」的正反用例。这道白名单是有意的安全网，所以是逐个放行而不是放宽规则。
  3. **读取失败不该喊 alert**：最初把读取失败也渲染成 `role="alert"`，结果任何渲染阅读器的用例都多出一个断言级报警，**撞红了 `ClassificationPages` 的一条既有用例**。改成读取失败只给一行安静提示 + 「重新读取」，`role="alert"` 只留给用户刚点过保存/清空的失败。
  - 另外 **`isbn` 与 `abstract` 原样带回**（范围修订三）：`PUT` 是整份替换，界面不认识的字段若不带回去，一条带 ISBN 的文献（将来由扩展写入）按一次保存就被抹掉。有用例守着。
- **登记时口径修正的落实**：422 只回一个不带明细的 `VALIDATION_ERROR`，所以字段级提示由前端按契约边界判（年份 1000–2200、作者至多 100 位且单个至多 200 字、各字符串上限）；服务端真回 422 时给一句整体提示并保留已填内容。
- 新测试 16 条（前端 699 → **715**）与判别性：
  - `citation.test.ts` 8 例：404 折成 null 且别的失败不吞；请求体省略空字段、首次不带 `expected_version`、替换时带；DELETE 带版本且拒绝无效版本；**六种坏响应各自被拒**；本地边界逐字段；空格子折 null；**DOI 的斜杠不许编成 `%2F`**（写这条时我自己先写错成 `encodeURIComponent`，用例把它锁住了才发现）；`containerLine` 缺块不留孤标点。
  - `ReaderCitation.test.tsx` 7 例：空态文案与无 alert；一次保存回到只读且请求体正确；替换带 `expected_version` 且冲突时提示「刚在别处改过」**并且表单不关**；本地拦住坏年份且**没白跑一趟服务端**；清空必须先确认；**ISBN 不被悄悄丢掉**；读取失败安静且可重读。
  - `client.test.ts` 1 例：文献路径的 If-Match 删除放行、相近路径仍拒。
  - `e2e/citation.spec.ts` 2 例（真实 Chromium + 真实后端）：填一份 → 刷新仍在 → **把出处清空后保存，它真的消失**（证明是整份替换不是逐字段合并）→ 清空确认 → 回到空态；坏年份停在字段上且上方三行资料信息不受影响。
  - **e2e 是唯一能抓到后端违约的一层**：单元测试里接口是替身，返回的是用例自己造的 `Z`。
- 命令与结果（本机 macOS 25.5.0，工作区在 `6405987`）：
  - `python3 scripts/governance/check_task.py --task docs/tasks/TASK-078-citation-ui.md --worktree` → **CHECKS PASS**（profiles=backend,frontend；`product_fingerprint=e898e7e6…`；backend pytest **593 passed**、ruff/mypy/build 全过；frontend format/lint/typecheck 0、vitest **715 passed**、build 通过）。
  - `npx playwright test`（全量，不在自动检查组内，单独跑）→ **75 passed**（73 → 75）。
- 已知限制/未完成项：
  - **资料库列表里不显示文献信息**（非目标，原因见上：要改契约）。
  - **摘要与 ISBN 没有输入框**：两者都原样带回、不会丢，但界面上改不了。摘要是用户确认过不做；ISBN 是登记后才发现后端有、而草图里没有，加字段属扩需求，留给下一次。
  - 每打开一个资料详情页就多一次文献 GET（右栏三个 tabpanel 都会挂载，即使停在「心得」）。一次请求换来切到「信息」时即时可见，本机应用这个代价可接受；真要省可以改成首次切到该 Tab 才读。
  - 文献信息只读到本地库，不联网解析 DOI/ISBN（本机应用不出网）。

### Review F1–F3 的修正（第二候选）

结论 PASS、三条均非阻断，逐条核实后**全部修掉**（都属「陈述比证据宽」或真实死路，成本各一两行）：

- **F1（可记录→已修，说法与实现不符）** `isbn` 在客户端按 `MAX_NAME`（200）判，而后端 `contracts.py:97` 是 `Stamp`（**32**）；`abstract` 在 `draftProblems` 里**根本没判上限**。注释写着「判的是同一组边界，不是更松的一组」，对这两项不成立。已改为 `MAX_STAMP` 并补 `MAX_ABSTRACT`。当前无数据影响（两项都没有输入框、只从服务端原样带回），但记录里已把「以后加 ISBN 输入框」列为待办，那时本地会放行、服务端 422 且没有字段提示。新增边界用例，**变异实测**：改回 200 即红。
- **F2（可记录→已修，真死路）** 冲突提示让用户「点『重新读取』」，可那个按钮**只在空态渲染**；编辑态里冲突后手里这份的版本已过时，再按保存必然再撞，取消→编辑→保存也一样，唯一出路是离开页面重进。已在编辑态的失败区就地给出「**重新读取（放弃这次修改）**」——按钮名字直说会丢掉这次输入，因为它确实会。新增回归用例（重读后再保存带的是新版本 7 而不是撞过的 2），**变异实测**：把按钮去掉即红。
- **F3（可选→已修，覆盖缺口）** 前端没有任何用例钉住「`+00:00` 必须被拒」——正则一旦被放宽，没有用例会变红，而这正是本次真正的缺陷面。已把两种写法加进坏响应清单，**变异实测**：把正则放宽成接受 `+00:00` 即红。
- Reviewer 对「后端改动是否该升 L3」的判断：**同意维持 L2**，理由是它只作用于两处响应构造，不动字段集、状态码、校验、事务与迁移，存量数据不变，属「让实现回到已批准契约」。其保留意见（「这确实改变了已交付接口的响应字节，授权只来自记录中的用户当场选择，我无法核验该陈述」）如实记录在此——该授权是 2026-09-20 用户在三个选项里选定「并进 TASK-078 一起修」。
- Reviewer 的方法学限制（无 Bash 故无法跑 `git diff base..candidate`，改为整文件审 + mtime 核对变更集）已知悉；主 Agent 另行确认本次改动文件与 `allowed_paths` 一致。
- 修正后重跑：`check_task.py --worktree` → **CHECKS PASS**（`product_fingerprint=382c38fd…`，backend **593**、frontend **715**）；全量 `playwright test` → **75 passed**。测试条数不变是因为三条修正都是往既有用例里加断言，没有新开用例。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：第一候选 `3622b9f`；**最终候选 `0191ae6`**。
- 最终候选上的机械检查：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-078-citation-ui.md --worktree` → **CHECKS PASS**（profiles=backend,frontend；`product_fingerprint=382c38fd6a5b480a30986ca627c1711b3ead522d2dd6ce6ad71d0fe1d7080c67`；backend pytest **593 passed**、frontend vitest **715 passed**、ruff/mypy/lint/typecheck/format/build 全过）；另单独跑全量 `npx playwright test` → **75 passed**（e2e 不在自动检查组内）。
- Review：独立只读 Reviewer（`.claude/agents/reviewer.md`，仅 Read/Grep/Glob，无写工具、无 Bash），**两轮**：
  - 第一轮（`bcfa780..3622b9f`）**PASS**，3 条非阻断，逐条处置见正文「Review F1–F3 的修正」。其中它**自行核实了后端违约的说法**（契约 533 行、另外三个接口与 `resource_store` 的同款编码器），并**同意维持 L2**：新增的 `encoded()` 只作用于两处响应构造，不进哈希/删除影响令牌，不动字段集、状态码、校验、事务与迁移，存量数据不变，`openapi-v1.json` 无 `+00:00`。其保留意见原文：
    > 唯一保留：这确实改变了已交付接口的响应字节，其授权只来自记录中的用户当场选择，我无法核验该陈述。

    （该授权是 2026-09-20 用户在「并进本任务修／单开后端任务／前端容忍两种格式」三选项里选定第一项。）
  - 第二轮（增量 `3622b9f..0191ae6`，结论覆盖 `bcfa780..0191ae6`）**PASS**。要点原文：
    > F1 已修，核实通过：`isbn` 在响应校验与本地校验都改成 `MAX_STAMP`=32，`abstract` 补 `MAX_ABSTRACT`=20000，与后端 `Stamp`/`Abstract` 逐条相符，不再更松。
    > F2 已修，核实通过：`conflicted` 与既有状态**没有打架**……`reread` 用 `pending` 而不是 `loading`，不会把正在编辑的表单换成「正在读取…」屏——这点是对的。
    > 「重读后 `latest` 为 null 就退出编辑态回到空态」——**对的**。另一种做法（留在表单里、下次保存当新建）会把别处刚删掉的那份**悄悄复活**，更糟。
    > 取舍判断：选「放弃这次输入」是对的，不要改成只换版本号。只换版本号会把乐观锁的拒绝直接变成一次必然的丢失更新——PUT 是整份替换，会连用户**从没看见过的字段**（将来扩展写入的 ISBN/摘要）一起覆盖掉，而这正是你们当初做「ISBN 原样带回」要防的那件事。
    > 用例判别性：三条都不是恒真（逐条说明略）。
    > 剩余风险：无法字节级核对增量（无 Bash），变异实测无法复跑，按记录采信。无阻断项。
  - Reviewer 两轮都如实声明了方法学限制：**没有 Bash，跑不了 `git diff base..candidate`**，改为整文件通读 + 按 mtime 核对变更集。主 Agent 另行确认本次改动文件与 `allowed_paths` 一致（`git status` 的 14 个文件）。这条限制记在此处，不当作已做过字节级 diff。
- Acceptance：L2，N/A。
- 最终状态/风险/用户操作：**ACCEPTED**。L2 执行链走完（1 Worker → 自动检查 → 独立只读 Reviewer 两轮 PASS；独立验收 N/A）。风险：本任务**动了已交付的后端响应格式**（时间戳 `+00:00` → `Z`），这是回到契约、且经 Reviewer 独立核实与用户当场授权；除此之外都是前端新增。**需要用户操作：合并 PR。** 合并后文献元数据才第一次在界面上可见可改；下一步的扩展自动抓取（TASK-075）写进来的数据，也要靠这个界面才看得见。
- 非阻断遗留项：
  1. **（第二轮 Review，Reviewer 判「可选、不必修」）** `ReaderCitation.tsx` 的 `clear()` 失败分支没有像 `save()` 那样 `setConflicted(...)`，所以 DELETE 撞 409/428 时给了「刚在别处改过」却没有就地的重读入口。**不是死路**——取消确认 → 按一次「保存」会再撞一次并让按钮出现——只是绕一步。触发需并发改同一条，本机单用户罕见。**重评触发**：下一次动这个文件时顺手补一行；或用户真的遇到。
  2. **资料库列表不显示文献信息**（非目标）：要改契约（资料摘要挂一小块文献字段，或加批量读），属后端 L3，留给单独任务。
  3. **摘要与 ISBN 没有输入框**：两者都原样带回、不会丢，但界面上改不了。加 ISBN 输入框时记得它的上限是 32 不是 200（Review F1 已把本地校验改对）。
  4. 每打开一个资料详情页多一次文献 GET（右栏三个 tabpanel 都会挂载）。要省可以改成首次切到「信息」Tab 才读。
  5. **TASK-078 自己的 MERGED 登记**留给下一个任务（按用户 2026-09-20 的要求，登记类小活不单开 PR）。
- 日期与决定日志：2026-09-20 用户选定文献元数据方向 → 主 Agent 出 Pencil 草图并列四个待定项 → 用户「可以，开始」→ 登记 TASK-078；同日登记时核实列表行需改契约，划为非目标并当面说明。
<!-- EVIDENCE:END -->
