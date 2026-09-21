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

- 实现 SHA：`16b2424`。
- **命令与结果**：
  - `python3 scripts/governance/check_task.py --task docs/tasks/TASK-086-docs-catchup.md --worktree`
    → **FAIL: binary file needs explicit manual validation: docs/images/06-extension-popup.png**。
    这是**检查器的设计行为**（`check_task.py:369` 对任何非 UTF-8 文件一律拒绝），不是缺陷；
    TASK-047 加那 6 张截图时是同一条路。
  - 为了证明「除二进制之外的一切都过」，把两张 PNG 临时移出工作区后重跑：
    **CHECKS PASS**，`files=10`
    `product_fingerprint=072d951b64b69dec21b42bb06e4b070fa990a726ab48dea6a81faaedecfb55bf`。
    随后把图片放回。
  - `python3 scripts/governance/validate_governance.py` → **PASS**。
- **二进制人工核验**（按 TASK-047 的先例逐张确认）：
  - `06-extension-popup.png`：584×300px，31,196 字节，PNG 签名正确、`IEND` 完整，
    `file(1)` 识别为 `PNG image data, 8-bit/color RGB, non-interlaced`。
    目视：真实加载的扩展 popup，显示 `StudyPilot 采集 v0.2.0.678`、按钮「保存这一页」——
    **旧图里的按钮还叫「保存这一页的正文」，这正是要换它的原因**。无个人数据、无令牌、无本机路径。
  - `07-pdf-reader.png`：2880×1800px（1440×900 @2x），721,524 字节，签名与 `IEND` 同上。
    目视：站内 PDF 阅读器读 arXiv:1706.03762，可见一条工具条（返回/标题/文件徽章/页码 2 of 15/
    缩放 100%/适合宽度/学习状态/心得/原件/⋯）与**页与页之间的间距**（连续滚动的形态）。
    无个人数据、无令牌、无本机路径。

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

### 截图是怎么来的——与 TASK-047 的做法有一处差别，如实说明

TASK-047 那 6 张是在**隔离的 e2e 沙盒**（临时目录 + 端口 18000/15173）里拍的，
明确「未读取也未改动用户本机 `backend/var/studypilot.db`」。

**本次没有那么做**：`07-pdf-reader.png` 需要一份真实的 PDF 资料，我是在**用户本机的库**里
采了一份 arXiv:1706.03762，截完图**随即经正规删除流程（deletion-preview → DELETE）删掉**，
并核对剩余资料数回到 `0`（与我开始前一致）。
`06-extension-popup.png` 只加载扩展、不碰数据库。

**这一点值得写明而不是略过**：它动了用户的数据（哪怕只是增删自己刚造的那一条）。
更稳妥的做法是照 TASK-047 起隔离沙盒；本次为省事走了近路，留档供审查，下次拍图应回到沙盒。

### 已知限制 / 未完成项

- **01–05 五张旧截图未重拍**。它们拍于 2026-09-11/12，此后阅读器顶栏（TASK-081）、确认页
  （TASK-084）都变过——`03-reader.png` 拍的是网页正文阅读器，顶栏形态与现在的 PDF 阅读器不同，
  但网页那条路本身没改版式，仍与现状相符；其余四张（概览/资料库/分类/心得）本次未触及的页面。
  **没有逐页核对过**，只是未发现明显不符；要严谨应当重拍一轮。
- README 的英文摘要只覆盖主干，未逐条翻译新增的边界说明。
- 本任务不碰代码，因此没有新增任何测试；证据全在文档一致性与上面的人工核验。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-21 用户合并 #91/#92/#93 后要求「把这些收尾做了，同时 github 主页也
  相应更新一下新内容」→ 登记 TASK-086。
<!-- EVIDENCE:END -->
