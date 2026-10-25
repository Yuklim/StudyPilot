# TASK-100：调研 DoCube 的全文搜索、定位链接、动态筛选与引用是怎么做的

```toml
schema_version = 2
id = "TASK-100"
status = "ACCEPTED"
risk = "L1"
risk_reason = "只新增一份非权威调研文档（docs/research/），不改产品代码、契约、需求、治理规则或权限；另按 §5 把用户已合并的 TASK-098/099 登记为 MERGED（只改状态行与索引行）。无公共行为、数据或安全影响。执行链：1 Worker → 自动检查 + 自检；独立 Review / 验收 N/A。"
risk_flags = ["documentation"]
owner = "coordinator"
base = "545f01a6bbbdc6cf5cd4a310b303a9be47c583cc"
allowed_paths = [
  "docs/research/DoCube实现调研.md",
  "docs/tasks/TASK-100-docube-research.md",
  "docs/tasks/TASK-098-annotation-panel.md",
  "docs/tasks/TASK-099-note-tool.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

- 用户授权：2026-10-25 用户先要求「调研一下 DoCube……看看我们有什么异同」，再要求「使用 rea 工具调研一下他们的全文搜索，定位链接、筛选、引用等功能具体是怎么实现的，我要学习一下」；在本机安装 DoCube 并导入两份资料、做了高亮后，要求「你再分析分析，然后帮我写一个调研文档」。
- 目标：把对 DoCube 1.8.1（Mac）的只读静态分析结论写成 `docs/research/DoCube实现调研.md`，区分观察 / 帮助原文 / 推断，并对照 StudyPilot 给出借鉴建议。
- 非目标：不实现任何借鉴项；不改需求说明、契约、架构文档；不反编译 Swift 代码，不解密 DoCube 的加密文件；不把用户资料的内容写进文档；不搬 DoCube 代码。
- 禁止范围：所有未列入 allowed_paths 的路径；TASK-098/099 记录只改 `status` 与「最终状态」一行，不动其他内容。
- 依赖/前置条件：无。TASK-098（PR #108，merge `dc587dd`）、TASK-099（PR #109，merge `545f01a`）已由用户合并进 main，本任务据此登记 MERGED。
- 并行：否。

## 完成条件

- 调研文档入库，写明文档性质（调研，非提案）、对象版本、方法与边界、每条结论的证据等级、未解决问题和证据位置。
- 文档不含用户资料内容、密钥或个人数据；DoCube 的文档 ID 等只用占位符。
- TASK-098/099 的记录 `status` 与索引行一致为 MERGED；TASK-100 索引行与本记录一致。
- `check_task.py` 与 `validate_governance.py` 通过。

## 上下文包

根 `AGENTS.md` V2；`docs/governance/风险分级与检查规则.md` 的 L1 定义；格式参照 `docs/research/阅读器与标注能力调研.md`；对照用的 StudyPilot 事实取自 `README.md`「已知边界」、`docs/contracts/API与数据契约基线.md` §4.15、`项目需求说明.md` §2～§3。

## 实现与测试

- 变更摘要：新增调研文档（10 节 + 证据附录）；TASK-098/099 登记 MERGED；索引新增 TASK-100 行。
- 调研过程（只读，均在本机）：`Info.plist` / 资源包 / `otool -L`；读随包 `html-doc.js` 第一方模块；REA `inspect_sqlite_database` 读复制到临时目录的 `global_terms.sqlite`（Evidence `ev_503bef97…`、`ev_63febf83…`）；查看段文件与 `.articles` 的结构；主程序字符串；`zh-Hans.lproj/Localizable.strings` 帮助原文。
- 命令与真实结果（2026-10-25，macOS 本机）：
  - `backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-100-docube-research.md --worktree`
    → `STATIC PASS`、`risk=L1 stages=('worker',)`、`files=5`、`profiles=`（纯文档，无测试组被选中）、`product_fingerprint=447857bd5b244c72d43f0840268a0dd7eaaebcbc92c26d61025d8b2390effa44`、`CHECKS PASS`，退出 0。
  - `backend/.venv/bin/python scripts/governance/validate_governance.py` → `Governance V2 PASS`，退出 0。
  - 首次运行因 `risk_flags = ["docs"]` 不在 `risk-policy.json` 词表内而 FAIL，改为 `documentation` 后通过。
- 已知限制：BM25 参数、标注加权、动态项目规则的数据结构、标注实际存储内容未知（文档第 10 节）。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：见提交（本记录与文档同一提交，不自引用）。
- Review：L1 N/A。
- Acceptance：L1 N/A。
- 最终状态/风险/用户操作：**ACCEPTED**（L1）。待用户看过后 push 开 PR → main。
- 日期与决定日志：2026-10-25 用户要求写调研文档 → 从 `545f01a` 开分支登记本任务 → 写入 → 自动检查 → ACCEPTED。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
