# TASK-048：清理文档中的本机用户名与绝对路径

```toml
schema_version = 2
id = "TASK-048"
status = "MERGED"
risk = "L2"
risk_reason = "改动全部落在文档，不含产品代码、契约、门禁与数据，本质是文本脱敏（documentation 命中 low_risk）；但改动对象是 17 份**既有历史文档**（16 份任务/交接记录 + TASK-047 记录自身），其中含 V1 保全的 TASK-003 证据与治理相关的 TASK-004，属证据载体。若改错会篡改历史结论，影响面跨越十余个已完成任务，故按「不确定升一级」路由为 L2，需独立只读 Review 确认无任何结论被改动。"
risk_flags = ["documentation", "uncertain"]
owner = "coordinator"
base = "a4a244f1a141b8fa47a909f296aabc3c4ae216cf"
allowed_paths = [
  "docs/StudyPilot-主Agent交接说明.md",
  "docs/tasks/TASK-003-REVIEW.md",
  "docs/tasks/TASK-004-governance-v2.md",
  "docs/tasks/TASK-005-database-baseline.md",
  "docs/tasks/TASK-008-local-access-foundation.md",
  "docs/tasks/TASK-009-resource-backend.md",
  "docs/tasks/TASK-011-taxonomy-backend.md",
  "docs/tasks/TASK-012-taxonomy-pages.md",
  "docs/tasks/TASK-015-learning-backend.md",
  "docs/tasks/TASK-016-learning-pages.md",
  "docs/tasks/TASK-018-core-product-focus.md",
  "docs/tasks/TASK-033-tag-usability.md",
  "docs/tasks/TASK-034-taxonomy-usage.md",
  "docs/tasks/TASK-037-extension-baseline.md",
  "docs/tasks/TASK-042-snapshot-rendering.md",
  "docs/tasks/TASK-043-reader-toolbar.md",
  "docs/tasks/TASK-047-repo-public-showcase.md",
  "docs/tasks/TASK-048-redact-local-paths.md",
  "docs/tasks/任务索引.md",
]
checks = ["governance"]
```

## 需求与范围

- 用户授权/相关需求章节：用户 2026-09-10 在 TASK-047 合并后明确指示「B，清一下」——
  前半句选定「提交不再加 `Co-Authored-By: Claude Code` 尾注」（已另行记为会话约定，**不属本任务、不改仓库文件**），
  后半句授权清理文档中的本机用户名与绝对路径。该问题由 TASK-047 的 Review 附带发现并记入其证据段（「越界记录」），
  当时因不在 `allowed_paths` 内未处置。
- 目标与非目标：
  - 目标：消除 `docs/` 中对**本机用户名**与 `/Users/<用户名>/…` 形态绝对路径的暴露，使仓库公开后不泄露
    本机用户名与个人目录结构；**仅做文本替换，不改变任何陈述的含义、结论、数字、SHA 或状态**。
  - 非目标：不修改任何产品代码（`backend/` `frontend/` `extension/`）、契约、门禁（`AGENTS.md`、`docs/governance`）、
    迁移与数据；不改写 Git 历史；不重写任何已合并任务的证据结论；不把历史记录中的旧 SHA/命令「修正」为现值。
- 禁止范围：所有未列入 allowed_paths 的路径；额外禁止项：`backend/**`、`frontend/**`、`extension/**`、
  `AGENTS.md`、`docs/governance/**`、`docs/contracts/**`、`.agents/**`、`.claude/**`。
- 依赖/前置条件：无未合并依赖；基线 main = `a4a244f`（TASK-047 与 TASK-045 状态登记均已合并）。
- 并行：默认否。

### 替换方案（唯一写入者适用）

按「保留含义、去掉身份」原则，逐类替换。下表**刻意以 `<用户名>` 占位而不写出字面量**，
否则本任务记录自身会成为新的泄露源、并使完成条件 1 的判定命令失效：

| 原串（以占位符表示） | 替换为 | 理由 |
| --- | --- | --- |
| `/Users/<用户名>/Desktop/StudyPilot` | `<repo>` | 去掉用户名与个人目录层级，后续相对路径与行号保留，可读性不变 |
| `/Users/<用户名>/Documents/Study` | `~/Documents/Study` | 去用户名；该目录本就以 `~` 语义被描述 |
| `/Users/<用户名>`（裸） | `~` | 去用户名 |
| `/private/tmp/claude-501/-Users-<用户名>/<uuid>/…` | `/private/tmp/claude-501/…/…` | 该段是 Claude 临时目录对本机路径的转义，同样暴露用户名；uuid 与具体日志名一并省略 |
| 正文中的裸用户名与 `uid=501` 并列处（仅 TASK-018 一处） | 改为中性表述「本机非特权用户」 | 保留原判断（只读、非 root）不变，仅去掉身份 |

**不替换**：GitHub 账号 `Yuklim`（README、LICENSE、徽章、仓库 URL 中**有意公开**的作品集身份，与本次清理无关）。

## 完成条件

1. 本分支内不再出现本机用户名（判据见「补充检查命令」，期望 **0 行**）。
   由于改动前的全部真实绝对路径（`/Users/<用户名>/…` 与 `/private/tmp/claude-501/-Users-<用户名>/…`）
   **均含该用户名**，此判据成立即同时排除了这些本机路径，无需再单独断言路径形态；
2. 替换仅限上表所列形态，未引入任何其他字面改动——可由 diff 逐行核对；
3. 所有被改行的**语义不变**：涉及的数字、SHA、状态、测试计数、结论、findings 判定一个字不改；
4. 未触碰 `allowed_paths` 之外的任何文件，尤其未改产品代码与门禁；
5. 未把 markdown 链接指向的文件路径/行号改错（链接 label 与目标行的对应关系保持）；
6. 历史记录中的旧 SHA、reflog 路径、行号引用等原样保留，只脱敏路径前缀，不「修正」为现值；
7. 本任务记录与任务索引行**自身不含字面量**（否则脱敏自相矛盾）。

## 上下文包

适用规则版本：AGENTS.md V2（2026-09-03 生效，本次未变）。
必要源文件：`docs/governance/risk-policy.json`（定级）、`docs/governance/templates/TASK_TEMPLATE.md`（记录格式）。
相关契约章节：无（本任务不触碰 `/api/v1`）。
补充检查命令：

```bash
# 期望 0 行。正则写成字符类而非字面量：否则本行命令文本会把自己匹配出来，
# 使 0 行永远不可能达成（自指陷阱）。该正则经实测能匹配真实用户名。
git grep -nIE 'yuklim[a-z]*ching'

# 辅助：绝对路径前缀。此处允许残留，因为本记录与 TASK-047 记录需用
# <用户名> 占位来描述替换方案与发现过程，属说明文字而非泄露。
git grep -nE '/Users/[^<]'
```

## 实现与测试

- 实现 SHA/变更摘要：见 EVIDENCE 段候选 SHA。
- 命令、真实退出结果、环境：
  - 改动前（base `a4a244f`，`git grep -nIE` 实测）：**17 个文件 / 40 行**命中本机用户名。
    两个口径必须分开说，混写会得到自相矛盾的数字：
    - **16 个文件 / 39 行**属既有历史文档，与 TASK-047 证据段「越界记录」所载「16 个文件、39 处」**完全吻合**；
    - 第 17 个文件是 TASK-047 记录**自身**，其唯一 1 行即「记录这个发现」的那句话（`:122`），
      属**引用/描述**该串的行，而非泄露源。
    本轮修订前本节曾把两个口径混写为「17 个文件 / 39 行」（由 Review 指出），此处按实测更正。
  - 改动后：`git grep -nIE 'yuklim[a-z]*ching'` → **0 行**（上述 40 处已全部清除）；
  - `scripts/governance/validate_governance.py` 与 governance 单测通过。
- **实现中真实发生的失误与其处置（如实记录）**：
  - 首版替换脚本对「记录**引用**该字符串」的行做了机械替换，产生废句：TASK-047 证据段
    「…本机用户名与绝对路径 `<字面量>`」被替换成「…绝对路径 `~`」，任务索引同行亦然。共 2 处。
  - 该失误**未被脚本自带的校验拦住**——校验逻辑是「去掉被替换 token 后逐行比对」，而问题行恰好是双方 token
    都被去掉后相等的情形，属该校验方法的盲区。由主 Agent逐行复核 diff 时发现并修正为不含字面量的中性表述。
  - 教训（供后续同类任务参考）：脱敏不能只看「串是否被替换」，必须先分类出**引用/描述该串**的行，单独处置。
- 已知限制/未完成项：
  - 历史记录中形如 `[文本](/Users/<用户名>/…/x.md:12)` 的链接脱敏后变成 `[文本](<repo>/x.md:12)`。
    本轮补充实测：`<repo>` 会被 CommonMark 当作 HTML 标签，导致**整条链接语法失效、渲染为纯文本**，
    比原先记录的「不可点击」更彻底，属本次改动引入的**渲染形态变化**，如实记录。
    需一并说明两点，避免概括过宽（初稿曾写成「未使任何原本可用的链接失效」，不实）：
    - （a）这些链接在**本地编辑器的 Markdown 预览**中原本是可点的（指向本机真实文件），脱敏后该可用性
      随本机路径一并消失——这是本任务「去掉身份」的预期代价，不是意外；
    - （b）在 **GitHub 上它们本就不可达**：目标以 `/` 开头且仓库内不存在 `Users/` 路径，无论按站点根
      还是按仓库根解析都是 404。此处**只断言「不可达」，不断言其具体解析到何处**（Review 指出后者未经验证）。
    故本改动未使任何**在 GitHub 上原本可达**的链接失效。
    若要恢复可点击，还需把 `:行号` 一并改写为 GitHub 的 `#L行号` 锚点并改为相对路径，属范围更大的另一任务，未授权故不做。
  - 行尾空白（本轮真实触发并已处置）：`docs/tasks/TASK-004-governance-v2.md:139` 原本即带 markdown 硬换行尾随两空格，
    脱敏使它成为「新增行」，被 `git diff --check` 判为行尾空白（`check_task.py` 以 `FAIL: git command failed (exit 2): diff` 呈现）。
    已用 mistune 实测验证明：去掉该两空格前后渲染结果**完全一致**（该行下方为嵌套列表，不依赖硬换行），故只删该行尾随空格；
    同段 140–142 行未改（其为未变更行，不影响检查）。此后 `git diff --check <base>` 退出码为 0。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：`59e17be`
  （本任务提交序列 `ba9f723`（登记）→ `6b45706`（脱敏实现）→ `e15b466`（数字口径更正）
  → `985e4f0`（行尾空白 + 链接形态记录）→ `59e17be`（链接措辞收敛））
- 差异范围（base `a4a244f`..候选）：**19 个文件，+180/−40**；**无任何 `backend/` `frontend/` `extension/`
  产品代码、契约、门禁与数据改动**，无文件新增/删除。已逐条核对 19 个改动文件**全部落在 `allowed_paths` 内**。
- 检查：`scripts/governance/check_task.py --task docs/tasks/TASK-048-redact-local-paths.md --candidate <候选>` →
  **CHECKS PASS**（含 `validate_governance.py`、governance 23 项单测、ruff format）。
  完成条件 1 判据 `git grep -nIE 'yuklim[a-z]*ching'` → **0 行（exit 1）**；`git diff --check <base>` → **exit 0**。
- Review（L2 独立只读，独立于实现者；三轮均由**同一** Reviewer 完成，增量方式）：
  - Reviewer 运行器层仅注册 Read/Grep/Glob（无 Bash、无写工具），全程未改动文件；
    因无 git 工具，diff 由主 Agent预生成到 `/tmp`（`task048.diff` / `task048-incr*.diff` / `task048.stat`）供其阅读。
  - 第 1 轮（候选 `6b45706`）：**PASS（2 非阻断）**。独立复核所有数字/SHA/状态/测试计数/findings 判定未被改动
    （抽查 TASK-003/005/008/009/011/012/016 的 SHA 与计数）；确认判据正则自指安全且全仓 0 命中；确认未碰产品代码与门禁。
    findings：①任务索引行与本记录写「17 个文件 / 39 处」、TASK-047 记录写「16 个文件 / 39 处」，两数并存；
    ②历史链接形态变化属已知限制未处置。
  - 第 2 轮（增量 `6b45706..985e4f0`，候选 `985e4f0`）：**PASS（2 非阻断）**。
    **确认数字更正属实**：在全量 diff 中逐行数出 base 侧含字面量的删除行 = **40 行**，
    其中 16 文件 39 行 + TASK-047 记录自身 1 行（`:122`），与 17=16+1、40=39+1 分解完全吻合；
    确认 TASK-004:139 去尾随空格渲染等价；确认「新候选 + 同 Reviewer 复核」路径符合 AGENTS.md 第 6 节，
    非「借证据写回变更实现记录」。findings：①派单描述 hunk 计数有误（**属主 Agent叙述错误，不在仓库产物中**）；
    ②记录中「`/Users/…` 会解析到站点根」一句无法证实，建议改为不断言具体解析目标。
  - 第 3 轮（增量 `985e4f0..59e17be`，候选 `59e17be`）：**PASS（1 非阻断）**，结论**覆盖最终候选 `59e17be`**。
    确认增量仅 1 文件 1 hunk 无夹带；独立用 Glob 确认仓库根确无 `Users/` 路径，故「按站点根或仓库根解析都是 404」成立；
    确认未改任何数字/SHA/状态/结论/完成条件。明确**继承**其前两轮对 `6b45706`/`985e4f0` 的全部审查范围。
    findings：①已知限制 (a) 句「本地预览中原本是可点的（指向本机真实文件）」**仍偏宽**——
    VSCode 等把 `/` 起头当工作区相对路径，且多数链接带 `:行号` 后缀、目标名实为 `file.md:135`，
    即便支持绝对路径的预览器也打不开；建议软化为「在部分支持绝对路径的预览中可能可点」。
  - **停止迭代的理由（如实记录）**：Reviewer 连续三轮的 finding **全部是主 Agent论述文字的精度问题，
    而非改动本身的问题**，呈「每修一处措辞即出现下一处措辞精度问题」的模式。按 AGENTS.md 第 7 节
    「连续两轮仍未收敛时汇总根因和最小下一步，停止无界 Reviewer 循环」，主 Agent在此停止开第四轮。
    根因：主 Agent反复写下**需要浏览器/编辑器才能证实**的因果断言（「可点」「指向本机真实文件」），
    而 Reviewer 与本 Agent 均无该验证手段。最小下一步（若用户要求零近似表述）：把此类断言整体删除，
    只保留可验证事实，而非继续逐句软化。
- 验收：L2 独立 Acceptance N/A（按 AGENTS.md 第四节）。
- 最终状态/风险/用户操作：
  - 状态 **MERGED**：L2 链路（实现 → 自动检查 PASS → 独立只读 Review 三轮 PASS → 主 Agent汇总；无独立 Acceptance），
    随后由**用户本人**合并 PR #53，merge commit `194d77b`（2026-09-10，分支 tip `59e17be` 已核实是 `origin/main` 祖先）。
  - 交付时为 **ACCEPTED**；按 AGENTS.md 第 2 节，**只有用户本人可决定并执行最终合并**，本任务未自行推送 main 或合并。
- 非阻断遗留项：
  1. 已知限制 (a) 句仍偏宽（第 3 轮 findings ①，原文见上）。**本证据段为准**：这些链接指向本机绝对路径，
     **是否可点取决于具体预览器**，且多数链接带 `:行号` 后缀、目标文件名实际不存在，故**不能断言原本可点**。
     该句方向偏保守（多承认损失），不影响本任务任何结论。
  2. 历史链接脱敏后由「渲染为（不可达的）链接」变为「渲染为纯文本」（`<repo>` 被当作 HTML 标签）。
     在 GitHub 上两者均 404，未使任何**在 GitHub 上原本可达**的链接失效；若日后要恢复可点击，
     需另开任务改写为相对路径 + `#L行号` 锚点。
  3. README 等门面文件中的硬编码计数（如「50 余份」）仍需随任务推进更新（承接 TASK-047 遗留项 4）。
- 日期与决定日志：
  - 2026-09-10 用户指示「清一下」；该问题由 TASK-047 附带发现并记入其证据段「越界记录」；定级 L2。
  - 2026-09-10 实现 → 自动检查 → 独立只读 Review 三轮 PASS；状态置 ACCEPTED。等待用户决定合并。
  - 2026-09-10 用户合并 PR #53（merge `194d77b`）；状态置 MERGED（本状态分支登记）。
<!-- EVIDENCE:END -->
