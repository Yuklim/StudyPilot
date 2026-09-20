# TASK-070：独立心得按标题后端搜索（「我的心得」搜索框改走接口）

```toml
schema_version = 2
id = "TASK-070"
status = "IN_REVIEW"
risk = "L3"
risk_reason = "给已冻结的公共契约新增查询能力：顶层 `GET /api/v1/notes` 增加可选 `q`（只搜标题），需同步《API与数据契约基线》2.3 搜索白名单、10 节操作行、4.8 节笔记说明与 openapi-v1.json。按第 4 节「架构、公共 API」归 L3，与 TASK-027/032/034/057 同类（均为契约放宽，全部定 L3）。无数据迁移、无模型字段变化、不改写任何既有语义：资料内心得列表仍不接受 q（传了 422），/notes 仍只列独立心得。执行链：Worker → 自动检查 → 独立只读 Reviewer → 独立只读 Integration/Acceptance。"
risk_flags = ["public-api", "architecture"]
owner = "coordinator"
base = "44eb28aef9cb91e013bde3f4cde5f2b3b96ed935"
allowed_paths = [
  "backend/src/studypilot/modules/notes/contracts.py",
  "backend/src/studypilot/infrastructure/database/note_store.py",
  "backend/src/studypilot/api/notes.py",
  "backend/src/studypilot/application/notes.py",
  "backend/tests/test_notes.py",
  "docs/contracts/API与数据契约基线.md",
  "docs/contracts/openapi-v1.json",
  "frontend/src/features/notes/api.ts",
  "frontend/src/features/notes/api.test.ts",
  "frontend/src/features/notes/NotesPage.tsx",
  "frontend/src/features/notes/NotesPage.test.tsx",
  "frontend/e2e/notes-pages.spec.ts",
  "docs/开发与运行.md",
  "docs/tasks/TASK-070-note-title-search.md",
  "docs/tasks/TASK-069-leftover-cleanup.md",
  "docs/tasks/任务索引.md",
]
checks = ["backend", "frontend", "contracts"]
```

## 需求与范围

### 用户授权

2026-09-19 主 Agent 汇报「接下来可以做什么」，列出核心闭环「再次找回」上的缺口：心得不参与统一搜索、`/notes` 的搜索只是**前端在已加载的几页里过滤**，翻不到的旧心得搜不到。用户选定「**先把 2 的第一条做了**」（心得搜索），并在范围追问中逐条确认：

1. 搜索范围＝**只搜心得**，不碰资料正文快照、不做跨类型统一搜索；
2. 入口＝**先只升级 `/notes` 现有搜索框**，不新增全局搜索页；
3. 集合与检索标准（用户原话）＝「**只搜独立心得吧，检索标准的话就只搜标题**」。

用户同时说明「后面我想做第三部分」（阅读器方向），本任务不涉及。

### 目标

1. **后端**：顶层 `GET /api/v1/notes` 新增可选 `q`，按**心得标题**做契约 2.3 规定的匹配（Unicode NFKC 规范化 + 大小写折叠 + 连续空白折叠后「包含」）。心得没有标题字段，标题＝**正文首个非空行**，与前端 `noteTitle.ts` 同口径：去掉行首 `#{1,6} `、行内图片 `![替代文字](地址)` 只留替代文字；纯图片且无替代文字的行跳过。匹配用**未截断**的该行（60 字截断只是界面显示）。
2. **集合不变**：`/notes` 仍只返回 `resource_id` 为 null 的独立心得；`GET /resources/{id}/notes` **不接受** `q`（传了返回 `422 VALIDATION_ERROR`，靠独立的 query 模型 + `extra="forbid"`）。
3. **分页语义**：`total_items`/`total_pages`/`has_more` 均按**过滤后**的结果集算；排序白名单与默认值不变。`q` 显式空串 `422`，最长 200 字符（与资料 `q` 同形）。
4. **契约同步**：2.3 白名单表新增「独立心得列表」一行；10 节 `GET /api/v1/notes` 操作行补 `q`；4.8 节「第一阶段笔记不进入资料统一搜索」旁补明「顶层独立心得列表支持按标题搜索，不改变该结论」；1.x 交付说明追加本任务一句；`openapi-v1.json` 的 `listStandaloneNotes` 增加 `q` 参数。
5. **前端**：「我的心得」搜索框改为**走接口**——输入防抖后带 `q` 请求第一页，「加载更多」沿用同一 `q`；命中覆盖全部独立心得而不只是已加载页。界面文案改为明说**按标题搜索**（现状是按正文全文过滤，范围会变窄，不能让用户以为正文也能搜）；空结果、读取中、失败各有态；`?note=` 选中行为不变。
6. 顺带把 **TASK-069 登记为 MERGED**（用户 2026-09-19 合并 PR #77，merge `44eb28a`）。

### 非目标 / 禁止范围

- 不搜正文全文、不搜资料正文快照、不做跨类型统一搜索入口、不新增 `/search` 页。
- 不改 `/notes` 只列独立心得的集合语义（不加 `scope`/`include` 参数），不让心得进入资料统一搜索。
- 不加数据库列、不建迁移、不改 `Note` 响应 schema、不动写入路径与版本语义。
- 不碰复习/统计/阅读器/扩展；不改快捷键（用户 2026-09-17 决定）。
- 所有未列入 `allowed_paths` 的路径。

### 依赖

无；基线为已合并的 main `44eb28a`。并行：否（主 Agent 亲自实施，唯一写入者）。

### 主 Agent 登记的实现决定（非用户决定，Review 可挑战）

- **匹配在 Python 侧做**，与既有资料搜索（`resource_store.py:502` 起）同形：SQLite 无 NFKC，规范化必须在应用层；`notes` 模块自带一份 `normalized_search`，与 `resources`/`taxonomy` 各自持有一份的既有形态一致。
- **不为标题建列/建索引**：个人本机数据量小；建列要迁移 + 写路径维护 + 规则变更需回填，成本高于收益。
- **只取正文前缀**：含图心得正文可达 2,000,000 字符，`q` 匹配不能把全部正文拉进内存。取 `substr(content, 1, 4000)` 派生标题；若前缀被截断且其中找不到任何可用标题行（首行是大 base64 图片时会这样），**再单独回源读这一条的完整正文**，保证结果正确。
- **不改 `noteTitle.ts`**：前后端各自实现同一规则，由测试固定同口径（与既有 `displayText`/摘要的做法一致）。

## 完成条件

- 后端 `GET /api/v1/notes?q=…`：命中标题返回该条；只出现在正文（非首行）里的词**不命中**；NFKC/大小写/连续空白折叠三项各有用例；`q=`（空串）与 `q` 超 200 字符返回 422；`GET /resources/{id}/notes?q=x` 返回 422；过滤后分页的 `total_items`/`total_pages`/`has_more` 与实际页内容一致；首行是内嵌图片的心得能按其后的真实标题行命中（前缀回源路径有用例）。
- OpenAPI 校验通过，且 `listStandaloneNotes` 的参数与实现一致；契约文档四处同步。
- 前端：搜索框输入后请求带 `q`（有防抖，一次输入不打一串请求）、清空恢复默认列表、「加载更多」带 `q`、空结果有明确文案、文案说明只按标题搜；单测对「请求确实带 q」有判别性断言（去掉 q 透传必红）。
- e2e：真实后端下建两条独立心得（标题不同、正文里塞入只在正文出现的词），搜标题只剩一条、搜正文词为空结果。
- `check_task.py` 必要检查 PASS（backend + frontend + contracts 三组）。
- L3：独立只读 Reviewer + 独立只读 Integration/Acceptance 各出结论。

## 上下文包

- 规则：`AGENTS.md`（V2）第 4/6 节、`backend/AGENTS.md`、`frontend/AGENTS.md`。
- 契约：`docs/contracts/API与数据契约基线.md` 2.3（分页/搜索白名单）、4.8 与 §312（Note 语义）、10 节操作清单第 596 行；`docs/contracts/openapi-v1.json` 的 `listStandaloneNotes`。
- 源文件：`modules/notes/contracts.py:48`（`NoteQuery`）、`infrastructure/database/note_store.py:163`（`_page`）、`api/notes.py:137,210`（两个列表端点）、`modules/resources/contracts.py:42` 与 `resource_store.py:492-525`（既有搜索的规范化与「过滤后分页」写法，照抄形态）、`frontend/src/features/notes/noteTitle.ts`（标题派生口径）、`NotesPage.tsx:60-150`（现有前端过滤）、`api.ts:98`（`listNotes`）。
- 检查：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-070-note-title-search.md --worktree`。

## 实现与测试

- 实现 SHA：`776e9ba`（登记 `d807e85`；`2bc5f0f` 只改本记录的 `risk_flags` 取值——原写 `contract`/`public_api`，`docs/governance/risk-policy.json` 的合法值是 `public-api`/`architecture`，`check_task.py` 因此先 FAIL，改后 PASS；等级仍是 L3，未变更风险判断）。
- 变更摘要：
  - **后端契约模型**（`modules/notes/contracts.py`）：新增 `normalized_search()`（NFKC + casefold + 空白折叠，与 `resources`/`taxonomy` 各自持有一份同形）、`note_title()`（首个非空行；去行首 `#{1,6} `、行内图片只留替代文字、纯图片行跳过；**不截断**）、`StandaloneNoteQuery(NoteQuery)` 只给顶层集合加 `q`（`min_length=1, max_length=200`，与资料 `q` 同形）。资料下的列表仍用 `NoteQuery`，`extra="forbid"` 使 `?q=` 得到 422。
  - **存储层**（`note_store.py`）：`_page` 增加可选 `q`；无 `q` 时与以往一字不差。有 `q` 时按排序取 `(id, substr(content, 1, 4001))`，在 Python 侧派生标题并匹配，过滤后再切片，只为**当页**读完整行。`_search_title()` 处理前缀被截断的情形：只从完整行派生，找不到就单独回源读这一条完整正文（首行是大 base64 图片时会走到）。
  - **API/应用层**：`list_standalone_notes` 改用 `StandaloneNoteQuery`，`page_standalone` 透传 `q`；其余端点未动。
  - **契约文档**（`API与数据契约基线.md`）：2.3 白名单表新增「独立心得列表」一行；10 节 `GET /api/v1/notes` 操作行补 `q` 与「分页计数按过滤后结果集算」；4.8/§312 补明标题搜索不改变「笔记不进入资料统一搜索」；交付说明段追加 TASK-070 一句。**`openapi-v1.json`** 的 `listStandaloneNotes` 增加 `q` 参数（含派生规则说明），`x-contract-section` 补 `2.3`。
  - **前端**：`listNotes` 增加第 5 个参数 `q`（空白串＝不搜、不发 `q=`；带 `q` 却指定了 resourceId、或超 200 字符 → 本地 `INVALID_REQUEST`，不发无效请求）。`NotesPage` 去掉对已加载项的前端过滤，改为停笔 250ms 后带 `q` 请求第一页（`useResourceQuery` 的 key 含 `needle`，第一页一换旧的「加载更多」页自动作废），「加载更多」沿用同一 `q`；文案改为「按标题搜索全部心得」「只按标题搜索，正文里的词不算」，空结果、搜索中、选中项不在结果里各有对应文案。
  - `docs/开发与运行.md` 心得一节补一句搜索口径。
- 新测试与判别性（均实际验证）：
  - backend `tests/test_notes.py` +5 例：标题派生规则（与前端 `noteTitle.ts` 同口径，含「不截断」）；只搜标题（正文里的 Kubernetes 不命中）+ NFKC/大小写/空白折叠三种写法都命中；前缀之外的标题（首行是 6000 字符 base64 图片）仍命中、图片替代文字可搜；过滤后分页（`total_items`/`total_pages`/`has_more` 与页内容一致、排序仍生效）；`?q=` 在资料下的列表 422、空串 422、201 字符 422、200 字符 200、未知参数仍 422。**判别性**：去掉回源 → 「前缀之外的标题」红；把匹配对象从标题换成正文前缀 → 「只搜标题」红。
  - frontend `NotesPage.test.tsx`：旧的「前端过滤、不问后端」用例改写为「搜索走接口、有防抖、显示接口返回的结果」，另加「翻页带着同一搜索词」。**判别性**：`q` 不透传 → 两例红；去掉防抖 → 前一例红（连敲三次会打出三条请求）。`api.test.ts` 补 `q` 的编码/空白/越界与跨集合拦截。TASK-063 那条图片用例里原本断言「前端搜索跳过 base64」的部分删去并注明：该职责自本任务起在后端的标题派生上，由 backend 用例守。
  - e2e `notes-pages.spec.ts` +1：真实后端下建两条独立心得（一条标题含冷僻词、一条只有正文含），搜索只命中前者，搜正文词得到「没有标题含…」，清空恢复两条；同文件原有那条流程用例的搜索断言同步改为新文案。
- 命令与结果（本机 macOS 25.5.0，backend `uv` 虚拟环境 Python 3.13，frontend Node devDependencies；均在 `776e9ba` 的工作区）：
  - backend：`ruff check src tests` / `ruff format --check` / `mypy`（71 文件）均 0；`pytest -q` **561 passed**（TASK-069 时 556，+5）。
  - frontend：`npm run lint` / `typecheck` / `format:check` 0；`vitest run` **657 passed**（+1 净增：新增 2 例、删除 1 例旧的前端过滤用例）；`playwright test` **67 passed**（+1）。
  - 治理：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-070-note-title-search.md --worktree` → **CHECKS PASS**，`profiles=backend,contracts,frontend`（含 OpenAPI 模型校验 exit=0、`uv build --offline` exit=0、前端 build exit=0）。
- 已知限制/未完成项：
  - 匹配在应用层做、不建索引：`q` 请求会按排序读一遍该集合的 `(id, 正文前 4001 字符)`。个人本机数据量下可接受；上千条心得时应改为持久化标题列 + SQL 过滤（当前不做，理由见任务的「主 Agent 登记的实现决定」）。
  - 标题派生规则在前后端各有一份实现（`noteTitle.ts` / `note_title()`），靠两侧测试固定口径；规则若要改，必须两边同改。
  - 搜索只覆盖**独立心得**（用户 2026-09-19 选定）：绑定资料的心得既不在该页，也没有搜索参数。
  - 首行是大图片的心得会触发「回源读完整正文」：这类心得有 N 条，一次 `q` 请求就多 N 次单条全量读（每条上限 2,000,000 字符）。正常心得不走这条路；真到了图片心得很多的时候，正确的解法同样是持久化标题列（Review F4 记录）。

### Review F1/F2/F3 修正（第二候选）

- **F1（必须）** `NotesPage.tsx`：「加载更多」的产物原本散在 `extra`（页）与独立的 `moreHasMore`（还有没有下一页）两处，只有前者按「第一页是不是同一个对象」作废。本次把 `needle` 放进第一页的 query key 后，翻过页再搜索会把上一批的 `has_more=false` 带进新结果——命中再多也不给「加载更多」，反向（搜索中翻页后清空搜索）同样卡住。改为把页、`hasMore`、失败原因**一起**挂在 `after`（当时那一页第一页）上，`after` 不是当前第一页就整体当不存在；`loadMore` 的成功/失败分支都按点击时捕获的 `firstPage` 写回，在途请求撞上换词会自然作废。新增回归用例「先加载更多到底、再搜索，按钮必须回来」，**判别性已验**（把 `hasMore` 改回不随第一页作废即红）。
- **F2（可记录→已修）** `StandaloneNoteQuery` 补 `q` 规范化后为空即 `422` 的校验，与资料搜索同形；否则 `?q=%20`、`?q=　` 会被当成「所有有标题的心得」，把无标题心得从 `total_items` 里悄悄漏掉。用例覆盖半角空格、全角空格、`\t \n`。
- **F3（可选→已修）** `note_title()` 由 `splitlines()` 改为按 `\r?\n` 切行，与前端 `noteTitle.ts` 完全同口径（`splitlines()` 还会在 `\r`、`\x0b`、`\u2028` 处断行，可能让「页面显示的标题」搜不到）。契约 2.3 与 openapi 描述同步写明「行以 `\r?\n` 分隔」与空白 `q` 的 422。
- **F4（可选）** 记录为已知限制（见上），不改实现。
### 第二轮复审残留的两条修正（第三候选）

- **可选→已修** `note_store.py:_search_title`：从前缀派生标题时仍用 `splitlines()` 再以 `\n` 拼回，F3 只改了 `note_title()` 本身。于是「正文超过 4000 字符、标题行落在窗口内且含孤立 `\r`」的心得会派生出更短的标题而漏命中。改为 `LINE.split(prefix[:TITLE_PREFIX])[:-1]`，与切行口径统一。新增定向用例（标题行含 `\r` + 5000 字正文），**判别性已验**：改回 `splitlines()` 即红。首轮加的那条「图片后标题」用例走的是回源分支，覆盖不到这里——这正是 Reviewer 指出的缺口。
- **可记录→已修** `openapi-v1.json`：描述里的 `\r?\n` 在 JSON 源码中是转义序列，解析后变成真正的回车换行控制符，规则表述被破坏（OpenAPI 结构校验发现不了）。改为双反斜杠，解析后是字面 `\r?\n`；已用 `json.load` 复核解析结果。
- 第三候选重跑：`check_task.py --worktree` **CHECKS PASS**（backend 561 passed、frontend 658 passed、OpenAPI 校验 exit=0），`playwright test` 全量 **67 passed**。

- 修正后重跑：backend `ruff`/`mypy` 0、`pytest` **561 passed**（新断言并入既有用例，条数不变，判别性已验：撤销 F2/F3 各自变红）；frontend lint/format/typecheck 0、`vitest` **658 passed**（+1 回归用例）、`playwright notes-pages` 11 passed；`check_task.py --worktree` **CHECKS PASS**。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-19 用户选定「先做心得搜索」，并确认只搜独立心得、只按标题、只升级 /notes 搜索框 → 登记 TASK-070。
<!-- EVIDENCE:END -->
