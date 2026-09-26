# TASK-093：高亮有了样子——契约 §4.15 加 `style`（高亮/下划线）与 `color`（四色），PATCH 可改

```toml
schema_version = 2
id = "TASK-093"
status = "IN_PROGRESS"
risk = "L3"
risk_reason = "改公共契约（§4.15 新增两个字段、PATCH 语义从「note_id 必填」改为「三字段至少一个、省略不动」）+ 一次迁移 0010（highlights 加两列带 CHECK）+ 关键数据模型；命中 risk-policy.json 的 docs/contracts/**、backend/**/models/**、backend/**/migrations/**。执行链：1 Worker → 自动检查 → 独立只读 Reviewer → 独立只读 Integration/Acceptance → 主 Agent 汇总。"
risk_flags = ["public-api", "migration", "critical-data"]
owner = "coordinator"
base = "4eb622f0711bce9caf74ace1288c85ff6019d400"
allowed_paths = [
  "docs/contracts/API与数据契约基线.md",
  "docs/contracts/openapi-v1.json",
  "backend/migrations/versions/0010_highlight_style.py",
  "backend/src/studypilot/infrastructure/database/models.py",
  "backend/src/studypilot/infrastructure/database/highlight_store.py",
  "backend/src/studypilot/application/highlights.py",
  "backend/src/studypilot/api/highlights.py",
  "backend/src/studypilot/modules/highlights/contracts.py",
  "backend/tests/test_highlights.py",
  "backend/tests/test_migrations.py",
  "docs/tasks/TASK-093-highlight-style-color.md",
  "docs/tasks/任务索引.md",
]
checks = ["backend", "contracts"]
```

## 需求与范围

### 用户授权

2026-09-26 用户提出把标注改成「顶栏放工具：荧光笔、橡皮、下划线等；心得可以选中文字、选中高亮、选中下划线进行书写」，
追问后选定：荧光笔**多种颜色**、橡皮**点一下立刻删 + 撤销**、**先画 Pencil 草图**。草图（`pencil-new.pen` 里
「阅读器｜标注工具栏（TASK-093/094 草图）」与「标注｜四个状态」）用户看后答「**可以，按草图开 TASK-093 和 094**」。
草图里替用户定下并已明示的细节：四色（黄/绿/蓝/粉）；气泡里「写心得 / 换色 / 改为下划线」、不放删除；
下划线跟荧光笔当前色走；高亮与下划线可互转。

### 依赖（写在最前面）

叠在 TASK-092 分支上（base = 092 分支合并了 091 补修后的 `4eb622f`；PR #99/#100 未合并）——只为
`任务索引.md` 的插行锚点，产品改动互不相关。PR 指向 092 的分支。

### 本任务只做后端与契约；前端归 TASK-094

要让「下划线」「换色」「改为下划线」存得住，一条高亮必须记着自己的样子。现在 `highlights` 只有锚点 + 心得绑定。

### 目标

1. 契约 §4.15 新增 `style`（枚举 `mark`/`underline`，默认 `mark`）与 `color`（枚举 `yellow`/`green`/`blue`/`pink`，
   默认 `yellow`）；`HighlightCreate` 可选给出；`HighlightPatch` 可改。
2. **PATCH 语义**：`note_id`/`style`/`color` 至少给一个，省略的不动；一个都不给 422；`style`/`color` 给 null 422；
   `note_id` 给 null 仍是解绑。这是对 TASK-071「note_id 必填、省略即 422」的**有意修订**，理由写进契约：
   三个字段时「省略＝不动」才是「漏字段永远不丢东西」的规则。
3. 迁移 0010：两列 NOT NULL 带默认（旧行 = 黄色高亮）+ CHECK；降级在存在非默认行时拒绝（同 0009 的做法）。
4. openapi 逐行同步（`Highlight`/`HighlightCreate`/`HighlightPatch` 三个 schema 与两个操作的描述）。
5. 后端测试：字段集、默认值、枚举拒绝、只改颜色不动心得、改样式、多字段并改、null 拒绝；迁移测试：升级默认值、
   CHECK、降级拒绝/放行。

### 非目标 / 禁止范围

- 不改前端（`highlights.ts` 解析器只取列出的字段，多出的字段不影响现有阅读器——已核对）。
- 不改锚点规则、写入前置条件、删除、列表排序；不加「按颜色筛选」查询参数。
- 不做颜色的具体色值（那是阅读器 CSS 的事）。

## 完成条件

- 契约 §4.15、操作表、历史段与 openapi 三个 schema 一致，`contracts` 检查 PASS。
- `backend` 检查 PASS（ruff format/check、mypy、pytest 全量、uv build）。
- 迁移 `0010_highlight_style` 为唯一 head，`compare_metadata` 与模型无差异。
- 独立只读 Reviewer 结论 + 独立只读 Integration/Acceptance 结论（L3）。

## 上下文包

- 契约：`docs/contracts/API与数据契约基线.md` §4.15 与操作表 PATCH 行、第 52 行历史段；`docs/contracts/openapi-v1.json`
  的 `Highlight`/`HighlightCreate`/`HighlightPatch`、`createResourceHighlight`/`updateResourceHighlight`。
- 后端：`modules/highlights/contracts.py`（`HighlightPatch` 的 `model_fields_set` 判「哪些字段被点名」）、
  `highlight_store.py`（`rebind` → `update`）、`models.py` `Highlight`、迁移 0009 的 batch 写法。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-093-highlight-style-color.md --worktree`。

## 实现与测试

- 实现 SHA/变更摘要：实现与登记同一个提交（SHA 在 EVIDENCE 区作候选记录；之后的证据写回是另外的提交）。变更：
  - 契约 §4.15 加 `style`/`color` 两行、`note_id`/`version` 两行改写、「锚点不可变」段改写为三字段规则、操作表 PATCH 行、
    第 52 行历史段追加 TASK-093 一句；openapi **逐行文本改**（文件是每个 schema 一行的紧凑 JSON，`json.dumps` 会把全文重排，
    所以只做定点替换）：`Highlight` required + 两个属性、`HighlightCreate` 两个可选属性带默认、`HighlightPatch` 整个重写
    （`required` 只剩 `expected_version`，`minProperties: 2`）、四处示例对象补 `style`/`color`、两处操作描述；改完仍是合法 JSON。
  - 迁移 `0010_highlight_style`：batch 加两列（NOT NULL、server_default）+ 两条 CHECK；降级遇非默认行 `RuntimeError`。
  - `models.py`：两列 + 两条 CHECK + 文档串；`contracts.py`：`Style`/`Color` Literal、`HighlightCreate` 默认值、
    `HighlightPatch` 三字段可选 + `model_fields_set` 判点名 + `changes()`；`highlight_store.py`：`rebind` → `update`
    （只动点名字段；与库里相同的值不算改动）；`application`/`api` 随之改名。
  - 测试：`test_highlights.py` 字段集 + 新用例（默认值、枚举/null 拒绝、只改颜色不动心得、改样式、并改三字段、版本推进）；
    `test_migrations.py` 四处 head 改 0010 + 新用例（默认回填、CHECK、降级拒绝/放行、往返）。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：
  - `check_task.py --task docs/tasks/TASK-093-highlight-style-color.md --worktree` → 退出码 0，**CHECKS PASS**，
    `files=12`，`product_fingerprint=3226a8836a9263066579c0000497cfb92ed04e95f460a46dfd9e4a1aa460f897`，
    `profiles=backend,contracts`（ruff format/check、mypy 83 文件无问题、pytest **598 passed**、uv build、openapi 校验）。
  - 中途两次失败留痕：① 迁移测试首版用 `Highlight.__table__.insert()` 在 0009 库里造行，mypy 报 `FromClause` 无 `insert`，
    且 Core insert 会把模型上的 Python 默认列（style/color）一起写进 0009 没有的列——改为「在 head 建默认行 → 降到 0009 →
    再升回」来验证回填；② 少了两个 import（ruff F821），随①一起消失。
- **第二次实现提交（按第一轮 Review 的三条非阻断项）**：F1 openapi `updateResourceHighlight` 的 200 示例 `color` 改为
  `green`，与请求示例一致；F2 补「同值 PATCH → 200 且 version 不变」用例；F3 迁移测试的 CHECK 同时验 `style`。
  重跑：ruff format/check、mypy 无问题；两份测试 21/21；`check_task.py --worktree` → 退出码 0，**CHECKS PASS**，
  `files=12`，`product_fingerprint=7e5f0e6859cd7f2f35ffad3a92ff82372cd0f2bb242506e46a917d4f6e47c0cc`（pytest 598 passed）。
- 已知限制/未完成项：前端还不认识这两个字段（归 TASK-094）；在 093 单独合并的窗口里阅读器照常工作（解析器只取列出的字段）。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：
- Review：（L3，待独立只读 Reviewer）
- Acceptance：（L3，待独立只读 Integration/Acceptance）
- 最终状态/风险/用户操作：
- 非阻断遗留项：
- 日期与决定日志：2026-09-26 用户看过草图答「可以，按草图开 TASK-093 和 094」→ 登记本任务。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
