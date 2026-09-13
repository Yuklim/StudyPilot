# TASK-057：资料库筛选重做——主题多选（任一）、标签任一匹配、点选即生效

```toml
schema_version = 2
id = "TASK-057"
status = "IN_PROGRESS"
risk = "L3"
risk_reason = "改公共 API 与契约基线：`GET /resources` 的 `topic_id` 由单值改为可重复（任一匹配）、`topic_unassigned=true` 由与 `topic_id` 互斥改为可并列（OR）、新增 `tag_match=any|all`（默认 `all` 保持既有语义）；同步 `openapi-v1.json` 与契约文档，后端 ResourceQuery/存储层/测试随之改。前端资料库筛选形态重做（主题/标签以已有项芯片列出、点选即生效、去掉「按主题与标签筛选」面板）。命中 risk-policy `public-api`；跨 backend/docs/frontend 三处。L3：独立只读 Review + 独立 Integration/Acceptance。"
risk_flags = ["public-api", "business"]
owner = "coordinator"
base = "d3a075421d48beb10fbb1f2953a7e00f9bc8885e"
allowed_paths = [
  "backend/src/studypilot/modules/resources/contracts.py",
  "backend/src/studypilot/api/resources.py",
  "backend/src/studypilot/infrastructure/database/resource_store.py",
  "backend/tests/test_resources.py",
  "docs/contracts/openapi-v1.json",
  "docs/contracts/API与数据契约基线.md",
  "frontend/src/features/resources/ResourceLibrary.tsx",
  "frontend/src/features/resources/LibraryFilters.tsx",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/features/resources/ResourceDeleteDialog.test.tsx",
  "frontend/src/features/taxonomy/ClassificationPicker.tsx",
  "frontend/src/features/taxonomy/ClassificationPages.test.tsx",
  "frontend/src/styles.css",
  "frontend/e2e/taxonomy-pages.spec.ts",
  "frontend/e2e/resource-pages.spec.ts",
  "frontend/e2e/reader-notes-sidebar.spec.ts",
  "frontend/e2e/file-pages.spec.ts",
  "frontend/e2e/scaffold.spec.ts",
  "docs/tasks/TASK-055-sidebar-polish.md",
  "docs/tasks/TASK-056-delete-dialog.md",
  "docs/tasks/TASK-057-library-filters.md",
  "docs/tasks/任务索引.md",
]
checks = ["backend", "frontend", "contracts"]
```

## 需求与范围

### 用户授权（2026-09-12）

> 资料库的筛选功能，不要设计成点击"按主题与标签筛选"才能筛选，直接改成点击主题，显示已经有的主题，多选想要筛选的主题即可。标签同理。

主 Agent 检查后就契约层面三点提问，用户选定：**主题真多选（任一匹配）**、**标签任一匹配**、**点选即生效**（搜索框仍回车或点按钮才搜）。用户明知前两项需改后端接口与契约（L3）。

### 现状（main `d3a0754`）

- 契约 §「搜索、筛选与排序」：`topic_id` 单值；`topic_id` 与 `topic_unassigned=true` **互斥**（422）；重复 `tag_id` = **必须同时具有全部**。`ResourceQuery`、`api/resources.py:124`（可重复参数白名单）、`resource_store.py:444-452` 与之一致；`test_resources.py:197` 钉住互斥 422，`:382-393` 钉住 tag 全匹配。
- 前端：`ClassificationPicker` 的 `filter` 模式——点「按主题与标签筛选」展开主题单选框 + 标签复选框（各带搜索/排序/分页），选完点「搜索 / 应用筛选」生效；类型/状态/排序三个下拉同样要点按钮。

### 契约变更（本任务的公共 API 决定，随用户选定）

1. `topic_id` **可重复**：资料的主题属于其中任一即匹配。单值写法不变，完全向后兼容。
2. `topic_unassigned=true` **可与 `topic_id` 并列**：语义为「主题属于所选之一 **或** 未分配」。原互斥规则删除（`test_resources.py:197` 相应改为并列合法并断言 OR 结果）。`topic_unassigned=false` 仍等同省略。
3. 新增 `tag_match`：`all`（默认，= 现状「必须同时具有全部」）| `any`（含任一）。其他值 422。**默认值不变，既有调用方语义不变。**
4. `openapi-v1.json`：`topic_id` 改 array（`explode` 可重复）、新增 `tag_match` 参数（enum，default all）；契约文档相应两行改写；既有 openapi 对照测试（各模块 `test_*_contract`）不受影响（它们只核 schemas，本任务改的是 query 参数）。

### 目标

1. 后端：`ResourceQuery.topic_id: list[UUID]`、去掉互斥校验、`tag_match: Literal["all","any"]="all"`；`api.list_resources` 把 `topic_id` 纳入可重复白名单；存储层主题条件 `OR(topic_id IN set, topic_id IS NULL if unassigned)`，标签 `any` 用一个 `EXISTS(tag_id IN set)`，`all` 沿用逐个 EXISTS。测试：多主题 OR、主题+未分配 OR、`tag_match=any`/`all`/非法 422、`topic_id` 重复与非法值 422、默认行为不变。
2. 契约：openapi + 文档同步；`check_task` 的 `contracts` profile 通过。
3. 前端筛选行：去掉「按主题与标签筛选」按钮与展开面板；「主题」一行列出**已有主题**芯片（按名称升序，最多前 100 个）+「未分配」芯片，可多选；「标签」一行列出已有标签芯片（同上），可多选，说明文字「含任一所选标签」；类型/状态/排序三个下拉**改动即生效**；主题/标签芯片**点选即生效**；搜索框仍回车/点「搜索」生效；「重置」清空全部。
4. 网址仍是唯一事实来源：`topic_id`（可重复）、`topic_unassigned=true`、`tag_id`（可重复）；请求时有标签即附 `tag_match=any`。网址里有已不存在的 id 仍生效并提示（现状保留）。
5. `ClassificationPicker` 去掉 `filter` 模式（只剩表单里的「选择主题与标签（选填）」，行为不变）。
6. 既有用例按新交互重写（`ResourcePages.test.tsx` 筛选相关、`ClassificationPages.test.tsx` 库内筛选、e2e `taxonomy-pages.spec.ts:85-93`），契约断言（网址↔请求参数、重置、不存在 id 提示）逐条保留；新增：多主题 OR、未分配并列、标签任一、点选即生效（不点按钮请求就发）。
7. 顺带：`reader-notes-sidebar.spec.ts:117` 的 `getByRole('status')` 改为按文字定位（CI 上与「正在翻开心得…」撞出 strict mode，PR #64 首跑失败、重跑通过）。

### 实现中修订授权范围（登记后、冻结前）

- 追加 `frontend/e2e/file-pages.spec.ts`：库内「搜索 / 应用筛选」按钮改名「搜索」（它现在只管搜索词），该文件一处按名称点击需同步；断言不变。
- 追加 `frontend/src/features/resources/ResourceDeleteDialog.test.tsx`：其中一条用例按名称点「搜索 / 应用筛选」，随按钮改名同步为「搜索」；断言不变。
- 追加 `frontend/e2e/scaffold.spec.ts`：「只用批准的读请求」守卫把资料库页允许的 GET 白名单加上 `/api/v1/topics`、`/api/v1/tags`（筛选行芯片的两次列表读取是本任务新增的正当读请求）；守卫本身不放宽。

### 非目标

- 不做跨页全部主题/标签的加载（>100 个时提示去分类整理页）；不做芯片内搜索。
- 不改学习记录/复习列表的 `topic_id`（另一端点，仍单值）。
- 不改分类整理页、资料表单里的主题/标签选择。
- 不改标签 `all` 的既有语义与默认值。

### 顺带完成的状态登记

`TASK-055-sidebar-polish.md`（PR #63，merge `bcebb87`）与 `TASK-056-delete-dialog.md`（PR #64，merge `d3a0754`）登记为 MERGED（均已 `gh pr view` 与 `git log origin/main` 核实），索引同步。

## 完成条件

1. 后端测试覆盖目标 1 的每条分支且通过；`uv run pytest` 全绿；ruff/mypy 通过。
2. `openapi-v1.json` 与实现一致（参数名/类型/默认值/enum）；`check_task` contracts profile PASS。
3. 前端：单测 + e2e 直证目标 3/4/5/6 各条；新增用例对旧实现（点按钮才生效 / 单主题 / 全匹配）变红（记录验证）。
4. 全部既有单测/e2e 通过（可重写的仅限目标 6 列出的文件）；`check_task` backend+frontend+contracts PASS；`git diff --check` exit 0。
5. L3：独立只读 Review PASS；独立 Integration/Acceptance PASS。

## 上下文包

- 契约文档「搜索、筛选与排序」节（第 155-166 行）；openapi `GET /api/v1/resources` 参数；`ResourceQuery`；`resource_store.page()`；`ResourceLibrary.tsx`（Applied/URL 读写）；`ClassificationPicker.tsx`；`taxonomy/api.ts listClassifications`。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-057-library-filters.md --worktree`。

## 实现与测试

（实施后填写）

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

（实施后填写）
<!-- EVIDENCE:END -->
