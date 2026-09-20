# TASK-075：扩展采集时认出文献信息（Zotero 式抓取的第二块）

```toml
schema_version = 2
id = "TASK-075"
status = "IN_REVIEW"
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

- 实现 SHA：`55dc0f5`（控制面登记 `5d8abee` + `b1f6a0e`）。变更摘要：
  - **`extension/src/injected/extract.ts`**：新增 `extractCitation(doc, url)`。只读这一页自己声明的东西——`citation_*`（Highwire）→ `DC.*` → JSON-LD 的 schema.org `@type`（含 `@graph`，坏 JSON 块跳过不放弃整页）。`metaValues` 同时看 `name` 与 `property`；`bounded` 去空白并按契约上限截断，空串折 `null`。
  - **识别门槛**：DOI／期刊会议名／schema.org 明说是论文书学位论文报告，三者有一即认，否则返回 `null`。
  - **类型推断**：book → BOOK；thesis 或 `citation_dissertation_name` → THESIS；report → REPORT；有会议名 → CONFERENCE_PAPER；`scholarlyarticle` 或有期刊名或有 DOI → arXiv 域名且无期刊名时 PREPRINT，否则 JOURNAL_ARTICLE；都不是 → OTHER。
  - **`CapturePayload.citation`**：契约第 14 节新增 `CapturedCitation`（字段、上限、门槛、「作者只认结构化来源」的理由都写进去了）；两份平行实现同步新增 `isCapturedCitation` 并**加进扩展侧的逐字比对名单**；前端那份按契约分工把规则钉成 24 条行为断言。
  - **`CapturePage.tsx`**：识别到时显示只读卡片（类型/作者/年份/出处/DOI）+ 默认勾选；保存资料与正文成功后写文献信息；写失败**停在本页**如实说明并给「打开这份资料」的入口，不回滚、不重试、不重复新建。
- **实施中改掉的两处自己的设计**：
  1. **schema.org 说是论文却判成 OTHER**（写用例时发现）：原实现用 `scholarlyarticle` 当门槛放行，却没把它算进类型推断——既然信它到显示卡片，就该信它到定类型。已改，并顺带补上 `report → REPORT`。
  2. **`citation` 由必填改为可选**：扩展里另外两个不在本任务授权路径内的测试文件构造 `CapturePayload` 时会因必填字段编译失败。改成可选**更符合已写进契约的那句「缺这个字段等同 null」**（旧版本扩展留下的暂存确实没有它），而不是为了绕过编译。
- 新测试与判别性：
  - `extract.test.ts` 8 例：Highwire 全字段；arXiv 判预印本而**同样标签换个域名就不判**；只在 JSON-LD 里声明也认、且相邻的坏 JSON 块不影响；**普通博客（有作者有日期）必须返回 null**；超限值按上限截断（出处 500／卷 50／ISBN 32／作者 100 位）且年份越界折 `null`；随 `CapturePayload` 带回、非文献时为 `null`。
  - `frontend/.../protocol.test.ts` 新增「citation 连同 authors 数组一起复制」（上一次漏掉的是 `images`，同一类错误的新面孔）+ `isCapturedCitation` 的 7 条接受与 17 条拒收，逐条对应后端 `contracts.py` 的约束。
  - `CapturePage.test.tsx` 4 例：识别到则显示并默认勾选、保存时整份写入且首次不带 `expected_version`；**取消勾选就不发那一次请求**；非文献时页面不多出任何节点；文献写失败时资料仍在、提示指向「信息」、且**不重复新建资料**。
  - **变异实测**：只改前端那一份校验（把 isbn 上限放宽成 200），扩展侧的逐字比对守卫**当场变红**——契约第 14 节说的那道「两份一模一样」的保证在本次改动上真实生效。
- 命令与结果（本机 macOS 25.5.0，工作区在 `55dc0f5`）：
  - `python3 scripts/governance/check_task.py --task docs/tasks/TASK-075-extension-citation.md --worktree` → **CHECKS PASS**（profiles=contracts,extension,frontend；`product_fingerprint=51540c26…`；extension **151 passed**（145 → 151）、frontend **744 passed**（715 → 744）、两侧 lint/typecheck/format/build 全过、OpenAPI 模型校验通过）。
  - `npx playwright test`（全量，不在自动检查组内）→ **75 passed**，无新增（本任务没有新的 e2e：采集链路的端到端需要真实扩展，仓库既有的 e2e 同样不覆盖它，见已知限制）。
- 已知限制/未完成项：
  - **没有覆盖真实扩展的端到端验证**：Playwright 跑的是应用页面，装载真实扩展、在真实网页上点图标这条链路仓库里一直没有自动化（TASK-038/040 也是如此）。本任务的确认页一侧有组件级用例，扩展一侧有 jsdom 用例，但「真扩展 → 真页面 → 真确认页」只能人工试。
  - **识别只看页面自己声明的元数据**：没有 `citation_*`/DC/JSON-LD 的学术站点（有些老期刊站）认不出来，用户仍可在资料的「信息」里手填。**第二轮 Review 之后又多一种认不出的情形**：只把出处写在 `dc.source` 里、且既无 DOI 也无 JSON-LD 的页面——`dc.source` 已从门槛里去掉（它常是站点名或网址）。Reviewer 核过：DC 本身没有无歧义的刊名字段（Google Scholar 也明说 DC 对期刊论文效果差），且 `dc.identifier.doi` 仍在门槛内，所以 DC 这条路没有被整条关掉。
  - **不解析自由格式的作者字符串**：Defuddle 给的 `author` 不拆，认不准就不填（理由见契约第 14 节）。
  - **PDF 页面不识别**：扩展的注入只处理 HTML 文档。
  - 确认页的卡片只显示 5 项（类型/作者/年份/出处/DOI），而载荷里还带着卷期页、出版方、ISBN、出版日期——它们会一并存下，只是不在这一屏上列出，以免把确认页变成表格。

### Review F1–F5 的修正（第二候选）

结论 CHANGES_REQUIRED（1 条必须修），逐条核实后**全部修掉**：

- **F1（必须修→已修，真缺陷）** 文献写失败时我只在表单**上方**加了提示，表单和「保存为资料」还留着——用户再点一次就会静默新建**第二份资料 + 第二份快照 + 重下全部图片**。同一个文件里的注释正是当初为图片分支修掉这个缺陷时写的，我又把它引了回来。现在告警时表单一并消失（`images || citationMiss ? null :`），重新提交前先清掉旧告警，并补了「表单与按钮都不在了」的回归断言。**变异实测**：把条件改回去即红。
- **F5（建议→一并改掉）** 原先文献写在图片之后，图片部分失败时直接 `return`，勾了「一并存下来」的文献**既没写也没提**，提示里只讲图片。改为：文献先写（一次小请求），失败只记下不中断，图片照冻，末尾把两件事一起如实汇报。两者互不阻断。
- **F2（可记录→已修，用例名不副实）** 那条名为「stores it alongside the resource」的用例，假响应回的是 `{ data: {} }`，通不过 `citationAt` 的逐字校验，**实际落在失败分支上**；请求体断言仍成立，但「写成功→离开本页」零覆盖。换成后端真会回的那一份，并补上「表单消失、没有失败提示」的断言。**变异实测**：换回 `{}` 即红。
- **F3（可记录→已修，实现比契约宽）** `dc.source` 在 DC 规范里常是站点名甚至一段网址，我却把它算进了「期刊名」门槛——任何声明了 DC 的普通 CMS 页面都会被判成期刊论文、出处显示成一段地址。契约第 14 节写的门槛是「期刊或会议名」，**实现不该比契约宽**，已收回。顺带：`citation_inbook_title` 原先推成 JOURNAL_ARTICLE，而枚举里本就有 `BOOK_CHAPTER`，已改。两条各补用例，**变异实测**均成立。
- **F4（建议→已修，守卫有缺口）** 八个 `MAX_CITATION_*` 常量没进数值镜像名单；逐字比对只比函数体文本，常量在两份里各自定义，**改一边两边照绿**。尤其**收紧**方向无人守：前端那份若把上限调小，合法载荷会被静默丢弃、页面停在空态而没有任何红。已全部纳入；契约第 14 节「核对三个上限」的说法也一并更正为「所有共享上限」。**变异实测**：把前端的 `MAX_CITATION_STAMP` 调成 8，扩展侧镜像守卫报 `shares the same MAX_CITATION_STAMP limit` 变红。
- Reviewer 对**安全面**（第 3 问）给出 No findings，并逐条核过：恶意页面无法让 `extractCitation` 抛出/死循环/产出通不过校验的值；`[...text]` 按码点切、代理对安全；arXiv 正则不被 `evil-arxiv.org`/`arxiv.org.evil.com` 绕过。对**第 6 问**（`citation` 改可选是不是事后合理化）判为**属实、不是事后合理化**，并自行核到了那两个不在授权路径内的文件确实会编译失败。
- 修正后重跑：`check_task.py --worktree` → **CHECKS PASS**（`product_fingerprint=a6769582…`；extension **161 passed**（151 → 161）、frontend **744 passed**）；全量 `playwright test` → **75 passed**。

### 第二轮 Review 的处置（第三候选）

结论 PASS、覆盖最终候选；三条均为可选建议，逐条处置：

- **组合状态的文案不准（可选→已修）** 图片与文献同时失败时，文献那块仍写「**只有**文献信息没存上」——那句话此刻是假的；两块还各有一个同名「打开这份资料」按钮堆叠。已去掉「只有」，并让图片那块已给出按钮时文献这块不再重复一个。Reviewer 还指出**该组合状态当时没有任何用例**，已补：两块提示都在、表单消失、「打开这份资料」只有一个。**变异实测**：把「只有」加回去即红；让两个按钮都渲染也即红。
- **已知限制没跟上 F3（可选→已修）** 收紧门槛后新增的假阴（只在 `dc.source` 里写出处、且无 DOI 无 JSON-LD 的页面）已补进已知限制；提取器用例数「6 例」也已改为实际的 8 例。
- **F2 的判别性归属（可选→已更正）** Reviewer 指出：`queryByRole('form')` 为 null 这条在 F1 修完之后**失败分支也成立**，单独看不具判别性；真正兜住的是紧随其后的「没有失败提示」。我上一轮把判别性记在了 form 那条上，此处更正——「换回 `{ data: {} }` 即红」的实测结论不变，但原因是后者。
- Reviewer 对 **F5 顺序调整**给出「无新缺陷」：文献写入不依赖快照版本，两条路径互不影响，组合失败时表单消失、二次提交不可达。对 **F3 假阴**的挑战给出「同意，且理由比主 Agent 给的更硬」（见上方已知限制里转述的理由）。
- 修正后重跑：见下方证据区。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-20 用户合并 PR #85 后「进行下一个任务」→ Pencil 草图 → 用户「开始」→ 登记 TASK-075；登记时核对契约第 14 节，发现必然碰契约，**由 L2 升为 L3** 并当面向用户更正。
<!-- EVIDENCE:END -->
