# TASK-048：清理文档中的本机用户名与绝对路径

```toml
schema_version = 2
id = "TASK-048"
status = "IN_PROGRESS"
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
    但原链接指向本机绝对路径，在 GitHub 上本就不可达（`/Users/…` 会解析到站点根），故未使任何**原本可用**的链接失效。
    若要恢复可点击，还需把 `:行号` 一并改写为 GitHub 的 `#L行号` 锚点并改为相对路径，属范围更大的另一任务，未授权故不做。
  - 行尾空白（本轮真实触发并已处置）：`docs/tasks/TASK-004-governance-v2.md:139` 原本即带 markdown 硬换行尾随两空格，
    脱敏使它成为「新增行」，被 `git diff --check` 判为行尾空白（`check_task.py` 以 `FAIL: git command failed (exit 2): diff` 呈现）。
    已用 mistune 实测验证明：去掉该两空格前后渲染结果**完全一致**（该行下方为嵌套列表，不依赖硬换行），故只删该行尾随空格；
    同段 140–142 行未改（其为未变更行，不影响检查）。此后 `git diff --check <base>` 退出码为 0。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：
- Review：
- Acceptance：L2 N/A
- 最终状态/风险/用户操作：
- 非阻断遗留项（仅有真实问题时）：
- 日期与决定日志：2026-09-10 用户指示「清一下」；由 TASK-047 附带发现并登记；定级 L2。
<!-- EVIDENCE:END -->
