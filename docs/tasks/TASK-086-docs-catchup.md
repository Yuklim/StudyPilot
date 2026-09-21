# TASK-086：把文档追上这五个任务的实际行为，并更新仓库门面

```toml
schema_version = 2
id = "TASK-086"
status = "IN_REVIEW"
risk = "L3"
risk_reason = "要改 `docs/contracts/API与数据契约基线.md`（删除 TASK-085 留下的「生效前提」块、订正 §14.2 一处过期描述），命中 risk-policy.json 的 high_risk_paths，机器策略即 L3。其余是文档与登记。执行链：1 Worker → 自动检查 → 独立只读 Reviewer → 独立只读 Integration/Acceptance。"
risk_flags = ["public-api", "documentation"]
owner = "coordinator"
base = "9c64e7122494ce606ae86c6d9c06e79a7b9b8a35"
allowed_paths = [
  "README.md",
  "docs/contracts/API与数据契约基线.md",
  "docs/开发与运行.md",
  # 范围修订 1：用户 2026-09-21「重拍然后更新」
  "docs/images/01-overview.png",
  "docs/images/02-library.png",
  "docs/images/03-reader.png",
  "docs/images/04-classifications.png",
  "docs/images/05-notes.png",
  "docs/images/06-extension-popup.png",
  "docs/images/07-pdf-reader.png",
  "extension/README.md",
  "docs/tasks/TASK-083-pdf-page-boxes.md",
  "docs/tasks/TASK-084-capture-simplify.md",
  "docs/tasks/TASK-085-popup-feedback.md",
  "docs/tasks/TASK-086-docs-catchup.md",
  "docs/tasks/任务索引.md",
]
checks = ["contracts"]
```

## 需求与范围

### 用户授权

2026-09-21 用户（合并 #91/#92/#93 之后）：「**把这些收尾做了，同时 github 主页也相应更新一下新内容。**」
「这些收尾」指主 Agent 在上一轮汇报里列的三项——它们都是前几个任务里**明确登记、约定并入下一个任务**的。

### 要做的四件事

1. **删掉契约 §14.4 里那句「生效前提：TASK-084 先合并」与它下面的合并顺序引用块**。
   TASK-084（PR #92）已于 2026-09-21 合并，那段话自身随之过期——
   **这正是这几轮反复犯的同一种错**（改了行为没同步文档），TASK-085 的独立验收要求把它
   写进索引行让机器守着，本任务执行。
2. **补 083 / 084 / 085 三行索引并登记 MERGED**（PR #91 merge `36e09e2` / #92 merge `f0c5e21` / #93 merge `9c64e71`，均已合并），
   085 那一行里写上第 1 条的要求。
3. **修五处用户文档漂移**（TASK-085 独立验收给出的清单）：
   - `extension/README.md:5`、`:39`——仍写扩展按钮叫「保存这一页的正文」；
   - `docs/开发与运行.md:194`——同时含「抓不到时**自动**退回」与旧按钮名；
   - `docs/开发与运行.md:206`——`cross-origin` 仍写「当场放弃、退回存正文」；
   - `docs/contracts/API与数据契约基线.md:859`——仍写「页面据此告诉用户……退回存正文」，未提 popup。
4. **更新仓库门面 `README.md`**：它描述的仍是「采集网页正文 → 冻结快照 → 读」这条 2026-09 上旬的
   链路，而此后新增的三块能力一个字都没提——**文献 PDF 直抓与站内 PDF 阅读器**（TASK-073/080–083）、
   **文献信息**（TASK-075/078）、**高亮**（TASK-071/072）。同时换掉已经过期的扩展 popup 截图，
   补一张 PDF 阅读器截图。

### 范围修订 1（2026-09-21，写入前登记）

主 Agent 在汇报里主动说明「01–05 五张旧截图拍于 2026-09-11/12，此后阅读器顶栏（TASK-081）与
确认页（TASK-084）都变过，**没有逐页核对**，要严谨应当重拍一轮」，并问是否顺手重拍。
用户：**「重拍然后更新」**。

因此把 01–05 纳入范围。**并且这次回到隔离沙盒**——上一轮拍 07 时我在用户本机库里采了一份论文
（截完即删、核对剩余为 0），但那比 TASK-047 的做法差，我当时自己写下「下次拍图应回到沙盒」，
这一轮执行：用 `playwright.config.ts` 已有的 e2e 沙盒（临时目录 + 端口 18000/15173），
**全程不读也不写用户本机 `backend/var/studypilot.db`**。

新增路径：`docs/images/01-overview.png` … `05-notes.png`。

### 非目标 / 禁止范围

- **不改任何行为**：本任务只动文档、截图与登记，不碰 `.ts`/`.tsx`/`.py`（一次性截图脚本除外，
  它不入库）。
- 不改 README 的整体结构与语气。

### 主 Agent 登记的决定（Review 可挑战）

- **截图用真实运行的实例重拍**，数据是此前实测采集的真实公开论文（arXiv `1706.03762`）——
  README 已声明「截图取自真实运行的实例，数据为演示用途的合成内容」，这一句要同步改准：
  新截图里的论文是**真实公开文献**，不是合成数据。
- **「已知边界」一节要补**：出版社站基本拿不到 PDF（跨域身份握手），这是「不碰登录态」的必然结果。

## 完成条件

- 契约 §14.4 的「生效前提」与合并顺序引用块已删除，且 §14.4 全节读起来不再依赖任何未合并分支。
- §14.2 那处过期描述已订正。
- 索引含 083/084/085 三行、状态 MERGED、与各自记录的 status 一致，`validate_governance.py` PASS。
- 五处文档漂移逐项改正，且**全仓再无「保存这一页的正文」这个旧按钮名**（用 grep 自证）。
- README 写明三块新能力；扩展 popup 截图与当前实现一致；新增 PDF 阅读器截图；
  「合成内容」那句声明与实际截图相符。
- `check_task.py` 必要检查 PASS。
- L3：独立只读 Reviewer + 独立只读 Integration/Acceptance。
- **按用户既定指令：本次不主动推 PR**，先交给用户检查（README 是仓库门面，需要他看过）。

## 上下文包

- 来源：TASK-085 记录的「合并之后必须做的清理」「非阻断遗留项」，以及其独立验收给出的漂移清单。
- 检查：`python3 scripts/governance/check_task.py --task docs/tasks/TASK-086-docs-catchup.md --worktree`。

## 实现与测试

- 实现 SHA：**第一轮（契约 §14.4/§14.2、索引三行、五处漂移、README 改写、06/07 截图）`d755b4d`**
  ——登记时写的 `16b2424` 是这条提交改写前的 SHA，已随本次订正；
  **第二轮（范围修订 1：重拍 01–05 + README 另五处新发现的漂移）`96d384e`**。
- **第一轮的命令与结果**：
  - `python3 scripts/governance/check_task.py --task docs/tasks/TASK-086-docs-catchup.md --worktree`
    → **FAIL: binary file needs explicit manual validation: docs/images/06-extension-popup.png**。
    这是**检查器的设计行为**（`check_task.py:369` 对任何非 UTF-8 文件一律拒绝），不是缺陷；
    TASK-047 加那 6 张截图时是同一条路。
  - 为了证明「除二进制之外的一切都过」，把两张 PNG 临时移出工作区后重跑：
    **CHECKS PASS**，`files=10`
    `product_fingerprint=072d951b64b69dec21b42bb06e4b070fa990a726ab48dea6a81faaedecfb55bf`。
    随后把图片放回。
  - `python3 scripts/governance/validate_governance.py` → **PASS**。
- **第二轮的命令与结果**：
  - `npx playwright test e2e/_shots.spec.ts` → **1 passed (19.3s)**，在 `playwright.config.ts` 已有的
    隔离沙盒里跑（后端 18000 / 前端 15173，`backend/tests/run_browser_server.py` 用
    `TemporaryDirectory` 起临时库与临时文件目录）。**本机 `backend/var/studypilot.db` 的 mtime
    仍是 09-21 04:34**（早于本轮两次运行 05:43 与 06:25），未读未写。
  - `check_task.py --worktree`（本轮同样先把 7 张 PNG 移出工作区，理由见第一轮那条）→
    **CHECKS PASS**，`files=15`
    `product_fingerprint=ee18975ffa531cffb0d70d741497ce7066e041608ffab2480a767cca5a55367c`，
    `profiles=contracts,extension`。随后把图片放回。
  - `validate_governance.py` → **PASS**。
  - README 那张测试结果表的数字是本轮真实重跑的：`backend uv run pytest` **593 passed**、
    `frontend npm run test -- --run` **793 passed（36 个文件）**、
    `extension npm run test -- --run` **196 passed（9 个文件）**；本任务不碰代码，所以这三个数字
    对应的基线就是 main 的 `9c64e71`，表头已照此改写（原写 `f609145` / 550 / 539 / 145）。
- **第三轮（第一轮 Review 的 F1 + 一处观感）**：
  - **F1（必须修复，Reviewer 抓到）**：`docs/开发与运行.md:194` —— 本任务第一轮**自己重写过的
    同一句话**里，仍写着确认页显示「保存这份 PDF」。那个勾选框已被已合并的 TASK-084 删除
    （`CapturePage.tsx:221` 标题改为「确认要保存的文献」，`:303-308` 换成陈述句）。
    **这正是本任务要清除的同一类漂移，却在修它的过程中被漏在原地**。已按实装文案改写。
  - 索引里 083/084/085/086 四行原来排成 083 → 086 → 085 → 084（083 那行是 #91 合并时带进来的，
    我把新三行插在了它下面），与 AGENTS.md §3「按最新在上插行」不符，已重排为 086 → 085 → 084 → 083。
    仅调整行序，四行内容一字未动。
  - 重跑 `check_task.py --worktree`（同样先移出 PNG）→ **CHECKS PASS**，`files=15`
    `product_fingerprint=eec82cbf06e13ec48c507c87bc8cc73d40aa5518fb18c2c30e03e01e658b737f`；
    `validate_governance.py` → **PASS**。
- **第四轮（Review PASS 后主 Agent 自己又查出的同类漂移）**：`extension/README.md` 的「用法」
  只描述了**网页正文**那条路——而认出文献时扩展根本不问图片
  （`extension/src/popup/popup.ts:58` 的 `shouldAskAboutImages` 在 `payload.pdf` 非空时返回
  `false`），确认页标题也不同。照原文操作的人在论文页上会等一个不会出现的提问。已补上文献
  分支（含抓不到时 popup 停下来问），并在「未确认的采集会暂存」那条补上「抓到的 PDF 也一起留着」
  ——`docs/开发与运行.md` 早就这么写了，两份文档原本不一致。
  同时发现一处**本任务不能动的同类残留**，记入遗留项：`extension/src/popup/popup.ts:55`
  的注释里仍写着「**前提是 TASK-084 先合并**」。它与契约 §14.4 那句「生效前提」是同一种东西，
  而 TASK-084 已于 2026-09-21 合并（`f0c5e21`）。但它在 `.ts` 里，**本任务的非目标明确写了
  不碰 `.ts`/`.tsx`/`.py`**，因此不在这里改；建议下一个任务顺手删掉那半句。
- **二进制人工核验**（按 TASK-047 的先例逐张确认）：
  - `06-extension-popup.png`：584×300px，31,196 字节，PNG 签名正确、`IEND` 完整，
    `file(1)` 识别为 `PNG image data, 8-bit/color RGB, non-interlaced`。
    目视：真实加载的扩展 popup，显示 `StudyPilot 采集 v0.2.0.678`、按钮「保存这一页」——
    **旧图里的按钮还叫「保存这一页的正文」，这正是要换它的原因**。无个人数据、无令牌、无本机路径。
  - `07-pdf-reader.png`：2880×1800px（1440×900 @2x），721,524 字节，签名与 `IEND` 同上。
    目视：站内 PDF 阅读器读 arXiv:1706.03762，可见一条工具条（返回/标题/文件徽章/页码 2 of 15/
    缩放 100%/适合宽度/学习状态/心得/原件/⋯）与**页与页之间的间距**（连续滚动的形态）。
    无个人数据、无令牌、无本机路径。
  - **第二轮的 `01`–`05`**：均为 1440×900px、PNG 签名与 `IEND` 完整（脚本校验：签名 `True`、
    `IEND` `True`），`file(1)` 均识别为 `PNG image data, 8-bit/color RGB, non-interlaced`；
    字节数 147,525 / 149,017 / 168,025 / 117,594 / 148,271。目视逐张：
    - `01-overview.png` 学习概览：未开放的能力仍如实标注「尚未开放」，没有编造数字；
    - `02-library.png` 资料库：默认的**列表**视图（`ResourceLibrary.tsx:100` 的默认值就是 `list`，
      旧图拍的是卡片视图）、TASK-028 之后的紧凑筛选区（主题/标签胶囊带计数）、
      共 5 份合成资料，其中两份带真实的学习进度「学习中 · 30%」「已完成 · 100%」；
    - `03-reader.png` 阅读器：**一条顶栏**（返回/学习中 · 45%/目录/原件/外链/⋯）、左侧目录 3 节、
      右侧心得栏展开且**确实列出 2 条心得**——这正是旧脚本静默失败时拍不出来的部分；
    - `04-classifications.png` 分类整理：3 个主题及各自「N 份资料在用」；
    - `05-notes.png` 我的心得：TASK-070 之后的左列表 + 右预览两栏形态（旧图还是「上输入框 + 下列表」
      的老版式，这也是必须重拍的直接原因），共 3 条独立心得并选中第一条。
    五张均为沙盒里的合成数据，无个人数据、无令牌、无本机路径。

### 四件事各自的落点

1. **契约 §14.4**：删掉「生效前提：TASK-084 先合并」与合并顺序引用块，改写成一段不依赖任何
   分支状态的陈述。§14.2 的 `pdf_problem` 描述补上「先由 popup 停下来问一句，用户选择改存正文后
   确认页再说明一次」。
2. **索引**：补 083/084/085 三行（均 MERGED，带各自的 merge 提交）与 086 一行；
   085 那一行写上了收尾要求并标注「已由 TASK-086 执行」。
   期间 `validate_governance` 抓到两处真问题：**TASK-083 的行重复了**（#91 合并时已带进来一条，
   我又加了一条）、以及一处状态不同步；已并成一条。
3. **五处文档漂移**：`extension/README.md` 2 处、`docs/开发与运行.md` 2 处（旧按钮名 + 「自动退回」）、
   契约 §14.2 1 处。**自证**：`grep -rn "保存这一页的正文"` 在 `.md/.ts/.tsx/.html` 里除任务记录的
   历史引用外**已无命中**。
4. **README**：开头两段（中/英）改写；「这个项目做了什么」的四步链路按现在的行为重写，
   并新增一段说明「抓不到 PDF 时会明说原因、出版社站为什么抓不到」；截图表新增第 7 张；
   「已知边界」新增两条（出版社站抓不到 PDF、站内 PDF 阅读器只读不做文字层选择/搜索/高亮）。

### 第二轮另修的五处 README 漂移（重拍时逐张比对新截图发现）

重拍不是只换图：新图把 README 里几处**已经与实现对不上的话**直接照了出来。

1. **「两层工具条」**（`README.md:26` 正文链路第 3 步、`:37` 03 那张的图注）——
   TASK-067 起上下文层（标签 + 「收下它是因为」）已从正文顶部移进右栏「信息」Tab
   （`ResourceToolbar.tsx:537` 的注释写明了这次搬迁），阅读器只剩**一条**置顶工具条。
   新 03 图与旧 03 图并排即可见：旧图标题下有一行标签 + 保存原因，新图没有。已改写成
   「一条置顶工具条、左侧目录、右侧可展开心得／高亮／信息侧栏」。
2. **跨域 PDF 仍写「当场放弃、退回保存网页正文」**（`README.md:120`）——与本任务第 3 件事
   要修的是同一处漂移，只是它藏在「扩展申请了哪些权限」一节里，独立验收给的清单没覆盖到，
   而同一份 README 的 `:31` 已按 TASK-085 写成「弹窗会停下来告诉你」。**同一份文件里两种说法**，
   已统一为后者。
3. **`Alembic 当前至 0005`**（`README.md:50`）——实际已到 `0008`（`0006` 心得上限、`0007` 高亮、
   `0008` 文献信息），按 `backend/migrations/versions/` 实际文件订正。
4. **`50 余份任务记录`**（`README.md:165`）——`docs/tasks/` 现有 **86** 个任务号，改为「80 余份」。
5. **测试结果表停在基线 `f609145`**（`README.md:128`–`134`）——数字比实际少了近一半。本轮三套
   全部重跑并按真实输出改写，基线写成 main 的 `9c64e71`（本任务不碰代码，这三个数字就对应它）。

### 截图是怎么来的——第一轮走了近路，第二轮按范围修订回到沙盒

TASK-047 那 6 张是在**隔离的 e2e 沙盒**（临时目录 + 端口 18000/15173）里拍的，
明确「未读取也未改动用户本机 `backend/var/studypilot.db`」。

**第一轮（06/07）没有那么做**：`07-pdf-reader.png` 需要一份真实的 PDF 资料，我是在**用户本机的库**里
采了一份 arXiv:1706.03762，截完图**随即经正规删除流程（deletion-preview → DELETE）删掉**，
并核对剩余资料数回到 `0`（与我开始前一致）。
`06-extension-popup.png` 只加载扩展、不碰数据库。
**这一点值得写明而不是略过**：它动了用户的数据（哪怕只是增删自己刚造的那一条）。

**第二轮（01–05）按范围修订回到沙盒**：一次性 Playwright 脚本（`_shots.spec.ts`，按登记
**不入库**，留在会话临时目录）跑在既有 `playwright.config.ts` 上，数据全部现造，全程不碰本机库。

**第二轮自己也栽了一次，一并留痕**：脚本第一版的造数把所有请求的失败都吞掉了——
绑定资料的心得发去了顶层 `/api/v1/notes`（该集合只收独立心得，422），学习记录漏了
`started_at`/`duration_seconds` 且用了不存在的字段名（422）——**却照样出了五张图**：
资料库五份全是「未开始 · 0%」、阅读器右栏写着「还没有心得」。那批图一度已经落在工作区里。
改法是把造数统一走 `must()`（**非 2xx 当场抛错**），并在截图前加断言（阅读器右栏不得出现
「还没有心得」），重拍后才是现在这五张。教训与 §6「不得隐藏检查失败」同源：**静默失败的脚本
产出的证据，看起来和成功没区别**。

### 已知限制 / 未完成项

- **拍图脚本按登记不入库**，因此这五张图无法一键重现：下次页面再改版仍要重写一次造数脚本。
  更稳妥的做法是把它收进 `frontend/e2e/`（或 `scripts/`）并标为手动运行，但那要改本任务的
  非目标，属另一个任务的范围，这里只留建议。
- README 的英文摘要只覆盖主干，未逐条翻译新增的边界说明。
- 测试结果表的数字是**手工抄录**的真实输出，没有机器校验；下次代码变动后它会再次过期。
- 本任务不碰代码，因此没有新增任何测试；证据全在文档一致性与上面的人工核验。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：第一次送审 `3e4903a`（base `9c64e71`）；修掉 F1 后的新候选见下一条 Review 记录。
- Review（第一轮，独立只读 Reviewer，审 `9c64e71..3e4903a` 全量最终 diff，**报告原文**）：

  > ## 结论：CHANGES_REQUIRED（1 条必须修复，改一句话即可）
  >
  > **只读证明**：本 Agent 仅授予 Read/Grep/Glob，无 Write/Edit/Bash，未改动、未提交任何文件。
  > **范围**：`9c64e71..3e4903a` 全量最终 diff（16 文件：7 PNG + 9 文本，无任何代码文件，全部落在 allowed_paths 内）；逐条回源码核对，未复用记录的结论。
  >
  > ### 必须修复（F1）
  > `/Users/yuklimching/Desktop/StudyPilot/docs/开发与运行.md:194` —— 本任务重写的**同一句话**里仍写「…确认页上显示**「保存这份 PDF」**」。该勾选框已由已合并的 TASK-084（`f0c5e21`）删除：`frontend/src/features/capture/CapturePage.tsx:221` 标题为「确认要保存的文献」，`:303-308` 是陈述句「这次会存下：**PDF 原件**（name，X MB）…」，全仓再无此 UI 文案。触发：任何按该文档采文献的用户；成本：一句话；性质正是本任务要清除的同一类漂移。
  >
  > ### 已逐条核实为真（No findings）
  > 契约 §14.4 重写后不再依赖任何未合并分支，语义未变；§14.2 新措辞与代码精确相符（`extract.ts:444` 保证 `pdf_problem` 仅在已认出文献时非空 → popup 必然停下来问；`CapturePage.tsx:310` 确认页仍会再说明一次）。旧按钮名全仓仅余任务记录历史引用（`extension/popup.html:57` = 「保存这一页」）。Alembic 至 `0008`、「一条工具条」（`ResourceToolbar.tsx:537` TASK-067 搬迁注释）、02 默认列表（`ResourceLibrary.tsx:100`）、25 MiB/20 s（`protocol.ts:94`、`extract.ts:356`）均属实。索引 083/084/085/086 各一行、无重复、状态与各自记录 `status` 一致；#93=`9c64e71` 经 reflog 证实。七张图逐张目视：03 一条顶栏+2 条心得、05 两栏、02 列表 5 份、06「保存这一页」、07 真实 arXiv:1706.03762，与 README 图注及「01–06 合成、07 真实预印本」声明相符，**无个人数据、令牌、本机路径、账号痕迹**。沙盒声明与 `backend/tests/run_browser_server.py`（TemporaryDirectory + 18000/15173）一致；`_shots.spec.ts` 确未入库、工作区已移除；「脚本静默失败出废图」留痕与脚本内 `must()` 实现吻合；实现 SHA `16b2424→d755b4d` 的 amend 说明与 reflog 一致。未发现把未执行说成通过。
  >
  > ### 剩余风险 / 下一步
  > 1. 检查证据绑在 `96d384e`，候选 `3e4903a`（仅记录写回）未重跑 `check_task.py`——建议 Integration 在候选上跑一次或写明复用理由。2. 索引行序 083 位于 086/085/084 之上，与「最新在上」惯例不符（仅观感）。3. 记录称「86 个任务号」，实缺 TASK-054，实为 85；README「80 余份」不受影响。4. 07 仍是第一轮在用户实库采集后拍的，记录已如实留痕且已按流程删除，与范围修订一致，不要求返工。
  > 修完 F1 形成新候选后，我可只复核 `previous_candidate..new_candidate`，本轮其余覆盖可继承。

- 主 Agent 对 Review 的处置：
  - **F1 已修**（见「第三轮」）。
  - 剩余风险 1（检查绑在 `96d384e`）：**已在新候选上重跑** `check_task.py`（CHECKS PASS，
    `files=15`、`product_fingerprint=eec82cb…`）与 `validate_governance.py`（PASS），不需复用理由。
  - 剩余风险 2（索引行序）：**已重排**为 086 → 085 → 084 → 083。
  - 剩余风险 3（任务号份数）：**Reviewer 这条算错了**。`docs/tasks/` 的任务号是 TASK-000–086 共 87 个
    编号、缺 TASK-054，实得 **86** 个，与记录一致；`ls docs/tasks | grep -oE '^TASK-[0-9]{3}' |
    sort -u | wc -l` → `86`。README 的「80 余份」两种算法下都成立，无需改动。
  - 剩余风险 4：接受，不返工。
- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-21 用户合并 #91/#92/#93 后要求「把这些收尾做了，同时 github 主页也
  相应更新一下新内容」→ 登记 TASK-086。
<!-- EVIDENCE:END -->
