# TASK-070：独立心得按标题后端搜索（「我的心得」搜索框改走接口）

```toml
schema_version = 2
id = "TASK-070"
status = "READY"
risk = "L3"
risk_reason = "给已冻结的公共契约新增查询能力：顶层 `GET /api/v1/notes` 增加可选 `q`（只搜标题），需同步《API与数据契约基线》2.3 搜索白名单、10 节操作行、4.8 节笔记说明与 openapi-v1.json。按第 4 节「架构、公共 API」归 L3，与 TASK-027/032/034/057 同类（均为契约放宽，全部定 L3）。无数据迁移、无模型字段变化、不改写任何既有语义：资料内心得列表仍不接受 q（传了 422），/notes 仍只列独立心得。执行链：Worker → 自动检查 → 独立只读 Reviewer → 独立只读 Integration/Acceptance。"
risk_flags = ["contract", "public_api"]
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

- 实现 SHA/变更摘要：待填
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：待填
- 已知限制/未完成项：待填

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-19 用户选定「先做心得搜索」，并确认只搜独立心得、只按标题、只升级 /notes 搜索框 → 登记 TASK-070。
<!-- EVIDENCE:END -->
