# TASK-074：文献元数据进契约（Zotero 式抓取的第一块）

```toml
schema_version = 2
id = "TASK-074"
status = "READY"
risk = "L3"
risk_reason = "新增一张用户数据表与三个公共接口，并改动删除确认协议的影响集合：命中架构/公共 API/迁移/关键数据模型多项高风险标志，取最高按 L3 走。执行链：Worker → 自动检查 → 独立只读 Reviewer → 独立只读 Integration/Acceptance。"
risk_flags = ["architecture", "public-api", "migration", "critical-data"]
owner = "resource_worker"
base = "92a476404eced01d2c2957946227f7c07a620dce"
allowed_paths = [
  "backend/src/studypilot/modules/citations/__init__.py",
  "backend/src/studypilot/modules/citations/contracts.py",
  "backend/src/studypilot/infrastructure/database/models.py",
  "backend/src/studypilot/infrastructure/database/citation_store.py",
  "backend/src/studypilot/infrastructure/database/resource_store.py",
  "backend/src/studypilot/application/citations.py",
  "backend/src/studypilot/api/citations.py",
  "backend/src/studypilot/main.py",
  "backend/migrations/versions/0008_resource_citations.py",
  "backend/tests/test_citations.py",
  "backend/tests/test_resource_deletion.py",
  "backend/tests/test_migrations.py",
  "backend/tests/test_taxonomy.py",
  "docs/contracts/API与数据契约基线.md",
  "docs/contracts/openapi-v1.json",
  "docs/tasks/TASK-074-citation-metadata.md",
  "docs/tasks/任务索引.md",
]
checks = ["backend", "contracts"]
```

## 需求与范围

### 用户授权

2026-09-20 用户提出复刻 Zotero 的文献抓取能力，主 Agent 指出「作者/年份/DOI/期刊放哪」是必须先定的岔口：现有资料字段只有 标题/来源地址/来源名称/保存原因/主题/标签，没有文献元数据；不进契约就只能塞进「保存原因」或标签，搜不出结构、将来做引文导出还得回来补。用户答「**元数据进契约，开始吧**」。同日用户另行授权本任务与 TASK-073（前端 PDF 阅读器）并行。

### 目标

1. **新表 `resource_citations`**（迁移 `0008_resource_citations`，owner `resources`，与资料 1:1）：
   - `resource_id` FK → `learning_resources.id`，`ON DELETE CASCADE`，**唯一**（一份资料至多一条）；
   - `item_type`：CHECK 取值 `JOURNAL_ARTICLE` / `PREPRINT` / `CONFERENCE_PAPER` / `BOOK` / `BOOK_CHAPTER` / `THESIS` / `REPORT` / `WEBPAGE` / `OTHER`，默认 `OTHER`；
   - `authors`：JSON 数组，元素为字符串（**顺序即作者顺序**），可空；至多 100 个，单个至多 200 字符；空数组视为未填，存 NULL；
   - `issued_year`：int，可空，1000～2200；`issued_date`：字符串，可空，≤32（原样保留页面上写的日期，不做解析）；
   - `container_title`（期刊/会议/书名）≤500、`volume`/`issue`/`pages` 各 ≤50、`publisher` ≤200、`doi` ≤200、`isbn` ≤32，均可空；
   - `abstract`：文本，可空，≤20000；
   - `version` / `created_at` / `updated_at`，沿用既有 `Identified`/`Created`/`Versioned` 基类与命名约定。
2. **三个接口**，形态**完全照抄正文快照那三个**（`getResourceSnapshot`/`putResourceSnapshot`/`deleteResourceSnapshot`，见 `api/snapshots.py` 与契约 4.13）：
   - `GET /api/v1/resources/{resource_id}/citation` → 200 `Citation`；没有则 404 `CITATION_NOT_FOUND`；
   - `PUT /api/v1/resources/{resource_id}/citation` → 首次写入 201、整份替换 200 且必须带 `expected_version`（缺失 428、不符 409）；**整份替换**语义，不做字段级合并；
   - `DELETE /api/v1/resources/{resource_id}/citation` → 204，强版本头 `If-Match`。
   - 前置条件：资料必须存在且可读（与 `note_store.require_resource` 同一条规则），否则 404 `RESOURCE_NOT_FOUND`。
3. **删除确认协议同步**：`DELETION_IMPACT_KEYS` 增加 `citation_count`（0 或 1），清单增加 `citations` 条目（id + version），契约第 9 节第 2 条的令牌绑定集合写入 Citation。
4. **契约同步六处**：第 1 节「当前可用操作」表新增一行；2.3 白名单**不需要**加行（该资源没有列表接口，如你认为需要请在报告里说明理由）；新增实体小节 **4.16 Citation（resources 所有）**（字段表 + 为什么单独一张表 + 整份替换语义 + 与 `source_url`/`title` 的关系）；第 9 节令牌绑定集合；第 10 节操作清单三行；交付说明段追加一句。
5. **openapi-v1.json** 同步：新增 `Citation`/`CitationWrite`/`CitationEnvelope` schema、`citations` tag、一个 path 三个 operation、`x-delivery-profile.available_operations` 增加三项、`DeletionImpact` 增加 `citation_count`。

### 非目标 / 禁止范围

- **不碰前端与扩展**（`frontend/**`、`extension/**`）：显示与编辑界面、浏览器连接器都是后续任务（TASK-075/076）。
- 不改 `learning_resources` 表与既有资料接口语义；不动快照、原件、心得、高亮、学习、复习、分类任何既有接口。
- 服务端**不出网**：不解析 DOI、不查 Crossref、不校验 DOI 是否真实存在。元数据全部由调用方提供。
- 不做引文格式导出（BibTeX/CSL）——那是另一个任务。
- 不做按作者/DOI 的搜索与排序（本次只存与读；`authors` 是 JSON，不建索引）。
- 所有未列入 `allowed_paths` 的路径。

## 完成条件

- 三个接口按契约工作：首次 PUT 201、替换 200 且版本推进、`expected_version` 缺失 428 / 不符 409、DELETE 用 `If-Match`、GET 在没有时 404 `CITATION_NOT_FOUND`、资料不存在 404 `RESOURCE_NOT_FOUND`、跨资料取不到。
- 字段校验各有用例：`item_type` 非法值 422；`authors` 超 100 个 / 单个超 200 字符 / 非字符串元素 422，空数组存成 NULL 读回为 null；`issued_year` 越界 422；各字符串字段超长 422；未知字段 422（`extra="forbid"`）。
- 删除资料：`citation_count` 进影响预览与清单，级联删除有用例（参照 `test_resource_deletion.py` 里既有的依赖夹具写法）。
- 迁移 `0008` 升级可建表、降级可回滚；`test_migrations.py` 的 head 与表数同步（当前 head 是 `0007_highlights`，表数 15）；`compare_metadata` 仍为空。
- `test_taxonomy.py` 的交付目录用例同步（当前断言 `len(available) == 40`，新增三个 operation 后应为 43，并补一条集合断言）。**只许改计数与新增集合断言，不许放宽其他断言。**
- OpenAPI 模型校验通过；契约文档六处同步。
- `python3 scripts/governance/check_task.py --task docs/tasks/TASK-074-citation-metadata.md --worktree` → CHECKS PASS。

## 实现与测试

（由你填写：实现 SHA、变更摘要、命令与真实退出结果、已知限制。）

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-20 用户「元数据进契约，开始吧」→ 登记 TASK-074（与 TASK-073 并行）。
<!-- EVIDENCE:END -->
