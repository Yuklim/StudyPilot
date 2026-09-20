# TASK-075：扩展采集时认出文献信息（Zotero 式抓取的第二块）

```toml
schema_version = 2
id = "TASK-075"
status = "READY"
risk = "L3"
risk_reason = "要给 CapturePayload 增加字段，而它是契约第 14 节定义的**非 HTTP 公共契约**（扩展与 /capture 页面之间的 postMessage 消息），两份平行实现还有一道逐字比对的机器守卫。改动落在 docs/contracts/** —— risk-policy.json 的 high_risk_paths 命中，且属「公共契约 + 跨模块（extension 与 frontend 各一份实现）」，取最高定 L3：1 Worker → 自动检查 → 独立只读 Reviewer → 独立只读 Integration/Acceptance。登记前主 Agent 曾对用户说「只动 extension/**、与前端不相交」，核对契约第 14 节后发现该说法错误，已当面更正并按 L3 登记。"
risk_flags = ["public-api", "architecture"]
owner = "coordinator"
base = "75067e177cbed9969580e793fa813785218be7f1"
allowed_paths = [
  "extension/src/injected/extract.ts",
  "extension/src/injected/extract.test.ts",
  "extension/src/shared/protocol.ts",
  "extension/src/shared/protocol.test.ts",
  "frontend/src/features/capture/protocol.ts",
  "frontend/src/features/capture/protocol.test.ts",
  "frontend/src/features/capture/CapturePage.tsx",
  "frontend/src/features/capture/CapturePage.test.tsx",
  "frontend/src/styles.css",
  "docs/contracts/API与数据契约基线.md",
  "docs/tasks/TASK-078-citation-ui.md",
  "docs/tasks/TASK-075-extension-citation.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend", "contracts"]
```

## 需求与范围

### 用户授权

2026-09-20 用户合并 TASK-078（PR #85）后说「进行下一个任务」。主 Agent 按既定规矩先在 Pencil 出草图 `采集确认页｜识别到的文献信息（TASK-075 草图）`（两块：识别到／认不出），并列出四条待定（只在认出足够信号时才显示／确认页只读不可编辑／默认勾选／不联网核对）。用户看过答**「开始」**。

### 目标

1. **扩展在采集时顺手认出文献信息**：从页面自己声明的元数据里读——`citation_*`（Google Scholar 那套 Highwire 标签）、`DC.*`、JSON-LD 的 schema.org 类型，以及 Defuddle 已经给出的 `author`/`published`/`site`。**不联网核对**（本机应用不出网，见契约第 8 节的既有结论）。
2. **只在认出足够信号时才带回**：有 DOI、或有期刊/会议名、或 schema.org 明说是 `ScholarlyArticle`/`Book` 之类。否则 `citation` 为 `null`，确认页与今天**一字不差**——多数网页不是文献，摆一块空卡片只会碍事。
3. **契约第 14 节同步**：`CapturePayload` 增加可空的 `citation`，并把它的字段、上限与「认不出就是 null」写进契约；两份平行实现（`extension/src/shared/protocol.ts` 与 `frontend/src/features/capture/protocol.ts`）按既有的逐字比对守卫同步更新。
4. **确认页显示并一并保存**：识别到时在「保存为资料」上面显示一块只读卡片（类型/作者/年份/出处/DOI）+ 默认勾选的「一并存下来」；保存资料成功后调 TASK-078 已有的 `putCitation` 写入。**卡片只读**：要改去资料详情页的「信息」里改，确认页的正事是「这篇正文对不对」。
5. **文献写入失败不能连累资料**：资料与正文已经存好时，文献信息写失败只提示「资料已保存，文献信息没存上，可以在资料的『信息』里补」，不回滚、不重复新建（沿用该页既有的 partial 处置口径）。
6. 顺带把 **TASK-078 登记为 MERGED**（用户 2026-09-20 合并 PR #85，merge `75067e1`）。

### 非目标 / 禁止范围

- **不联网**：不解析 DOI、不查 Crossref/arXiv API、不请求任何外部服务。识别只看这一页自己声明了什么。
- **不在确认页编辑文献信息**：不做第二份表单（TASK-078 的「信息」Tab 已经能改）。
- 不动后端、`/api/v1` 的任何接口与数据库；不碰文献接口本身（TASK-074 已交付）。
- 不做 PDF 页面的文献识别、不做批量补全已有资料的文献信息、不做引文导出。
- 不改图片冻结、正文提取与权限流程的任何既有行为。
- 所有未列入 `allowed_paths` 的路径。

### 依赖与并行

依赖：TASK-074（文献后端，merge `48f232e`）与 TASK-078（文献界面与 `putCitation`，merge `75067e1`）均已合并。基线 `75067e1`。
并行：否。本任务持有 `docs/tasks/任务索引.md`。

### 登记时发现的治理工具不一致（写入前记录）

`checks` 原本写成 `["extension", "frontend", "contracts"]`，被 `validate_governance.py:218` 判为「unknown or missing check groups」——它认的显式组名只有 `governance/backend/frontend/contracts`，**没有 `extension`**；而 `check_task.py` 明明有 `extension` 组，并且会在变更路径以 `extension/` 开头时**自动选上它**（`selected_profiles`）。

处置：`checks` 去掉 `"extension"`（自动选组已覆盖，本任务的 `allowed_paths` 里就有 `extension/**`，实际执行时该组照跑）。**不在本任务里改治理脚本**——那是 `scripts/governance/**`，属另一条 L3 的治理改动，与本任务的产品目标无关。记为非阻断遗留，交给下一个治理任务。

### 主 Agent 登记的实现决定（非用户决定，Review 可挑战）

- **`citation` 整体可空，而不是每个字段各自可空地平铺进 `CapturePayload`**：认不出是常态，一个 `null` 比十个 `null` 更好判，也让「要不要显示那一块」只看一个条件。
- **识别门槛定在「DOI ／ 期刊或会议名 ／ schema.org 明说是论文或书」**：只有作者和日期的普通博客不算文献——否则每篇博客都会弹出那块卡片，用户很快就会无视它。
- **类型推断保守**：认不准就是 `OTHER`，不猜。`arxiv.org` 且无期刊名 → `PREPRINT`；有期刊名或 DOI → `JOURNAL_ARTICLE`；schema.org `Book` → `BOOK`。
- **扩展侧就按契约的上限截断**（作者至多 100 位、各字符串按后端上限），不把超长内容送进页面再被拒。
- **确认页的勾选默认开**：识别到了却默认不存，等于白识别；取消一次只影响这一次。

## 完成条件

- 认出 DOI／期刊／schema.org 类型时，确认页出现只读卡片并默认勾选；认不出时**页面与今天完全一致**（有用例对比「无 citation 时不出现任何新节点」）。
- 勾选保存后：资料、正文、（可选）图片照旧，另有一次 `PUT /resources/{id}/citation`；取消勾选则**不发**那次请求。两者各有用例。
- 文献写入失败时资料仍在，页面如实说明「可以在资料的『信息』里补」，且不重复新建资料（有用例）。
- 契约第 14 节写明新字段、上限与「认不出为 null」；两份平行实现的逐字比对守卫保持绿（这正是它存在的意义）。
- 提取器对**真实形态的页面**有用例：Highwire `citation_*`、DC、JSON-LD `ScholarlyArticle`、arXiv 形态、以及「普通博客不该被认成文献」的反例。
- 越界输入被挡在扩展侧（超长作者名、101 位作者、年份越界、`citation_doi` 是一段脚本等），有用例。
- `check_task.py` 必要检查 PASS（extension + frontend + contracts）。
- L3：独立只读 Reviewer 审最终 diff；独立只读 Integration/Acceptance 核完成条件与跨模块证据（本任务横跨 extension／frontend／contracts 三处，正是它该核的）。

## 上下文包

- 设计：Pencil `采集确认页｜识别到的文献信息（TASK-075 草图）`（2026-09-20 用户确认）。
- 契约：第 14 节（消息契约、两道机器守卫、哪些可由扩展单方面改动）、第 4.16 节（文献字段与上限）。
- 既有实现：`extension/src/injected/extract.ts`（Defuddle 的产出与截断口径）、`extension/src/shared/protocol.ts` / `frontend/src/features/capture/protocol.ts`（两份平行校验）、`frontend/src/features/capture/CapturePage.tsx`（确认页与 partial 口径）、`frontend/src/features/resources/citation.ts`（`putCitation` 与本地边界）。
- 检查：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-075-extension-citation.md --worktree`。

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
- 日期与决定日志：2026-09-20 用户合并 PR #85 后「进行下一个任务」→ Pencil 草图 → 用户「开始」→ 登记 TASK-075；登记时核对契约第 14 节，发现必然碰契约，**由 L2 升为 L3** 并当面向用户更正。
<!-- EVIDENCE:END -->
