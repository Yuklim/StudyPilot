# TASK-091：目录开着时，网页阅读器的正文靠着目录放，不再偏右

```toml
schema_version = 2
id = "TASK-091"
status = "IN_PROGRESS"
risk = "L1"
risk_reason = "只改一处宽屏布局 CSS（目录开着时正文块在正文列里的横向位置），不碰契约、数据、后端与任何交互逻辑；用户看得见、能当场核对。CSS 在 jsdom 里量不出来，守卫加在既有的 reader-layout e2e 用例里（两条断言，对应用户的两句话）。执行链：1 Worker → 自动检查 + 自检 → 主 Agent 汇总；Review/验收 N/A。"
risk_flags = ["small-ui"]
owner = "coordinator"
base = "0a7c140dbfd312dc3bbdd78782988d2b47a41bce"
allowed_paths = [
  "frontend/src/styles.css",
  "frontend/e2e/reader-layout.spec.ts",
  "docs/tasks/TASK-091-reader-outline-gap.md",
  "docs/tasks/TASK-089-pdf-highlights.md",
  "docs/tasks/TASK-090-delete-dialog-test-waits.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-26 用户：「我感觉现在的网页阅读器视角有点偏右，没有打开心得的视图下，正文可以整体再向左移动一些。
现在的目录和正文之间的间距太大」。

### 现状与原因（量出来的，不是猜）

宽屏（≥1280px）目录开着时，`.reader-body.outline-open` 是 `240px + minmax(0, 1fr)` 两列、缝 24px；
正文块 `.resource-snapshot` 戴着 740px 的行宽帽子并 `margin: 0 auto` **在第二列里居中**。
1440px 宽的窗口下：第二列宽 1440 − 24×2（左右留白）− 240 − 24 = 1128px，正文两侧各剩 194px——
于是目录到正文之间是 24 + 194 = **218px** 的空白，正文中线落在 852px、比窗口中线（720px）偏右 132px。
用户的两句话说的是同一件事：那块空白全落在了目录与正文之间。

打开心得后（`240px + 1fr + 340px`）第二列只剩 764px，正文几乎填满，看不出偏——所以用户只在
「没有打开心得的视图下」有感觉。

### 目标

1. 目录开着时，正文块**靠着目录放**（左对齐于正文列），不再在剩余空间里居中；目录与正文之间留
   一段固定的、看得过去的间距（缝 24px + 正文块左边距 24px = 48px）。
2. 心得开着时同样左对齐：这样 1440px 下点开/收起心得，正文一个像素都不横向跳（此前也只差 12px）。
3. 目录收起时不变：正文仍在整个阅读区里居中（那是正常的居中阅读，用户没有说它偏）。
4. e2e 加两条断言守住：目录右缘到正文块左缘 ≤ 64px；正文块中线不在窗口中线右边。

### 非目标 / 禁止范围

- 不改目录列宽 240px、心得列宽 340px、行宽 740px、栅格缝 24px——三栏并存且正文列 ≥740px 的既有
  e2e 断言一条不动。
- 不改 PDF 阅读器（它的内容不是 `.resource-snapshot`，这条规则碰不到它；用户说的是网页阅读器）。
- 不改窄屏（<1280px，目录本来就不作为左栏存在）。
- 不改 `ResourceDetail.tsx`/`ReaderOutline.tsx` 任何逻辑。

### 顺带的到期登记（AGENTS.md §5，控制面）

用户 2026-09-23 已合并 PR #97（TASK-089，merge `68d6a6f`）与 PR #98（TASK-090，merge `0a7c140`）；
两份记录的 status 与索引行在本任务的控制面提交里登记为 MERGED，只改 EVIDENCE 区与索引行。

## 完成条件

- 1440×900 下，目录开着、心得收起：目录右缘到正文块左缘 ≤ 64px，正文块中线 ≤ 窗口中线。
- 既有 reader-layout e2e 用例（三栏并存、正文列 ≥740px、目录开关）继续通过。
- `check_task.py` 必要检查 PASS；`frontend` 组 PASS。
- TASK-089/090 记录 status 与索引行均为 MERGED（validate_governance 的索引一致性校验通过）。
- L1：Review/验收 N/A，主 Agent 自检；**改动先让用户在本机看过，确认再推 PR**（用户既定偏好）。

## 上下文包

- 文件：`frontend/src/styles.css` 的「三栏（TASK-067）」媒体查询块（约 L3428–3450）与
  `.resource-snapshot` 行宽规则（约 L3534）；`frontend/e2e/reader-layout.spec.ts` 的
  「the outline sits left of the body…」用例。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-091-reader-outline-gap.md --worktree`；
  `cd frontend && npx playwright test e2e/reader-layout.spec.ts`。

## 实现与测试

- 实现 SHA/变更摘要：本任务两次提交——第一次是实现 + 登记 + 089/090 的 MERGED 登记（SHA 在 EVIDENCE 区
  作候选记录），第二次只写回证据与状态。变更：`styles.css` 在宽屏媒体查询里加一条
  `.reader-body.outline-open .resource-snapshot { margin-left: 24px }`（7 行含注释）；
  `reader-layout.spec.ts` 的目录用例加两条断言（目录右缘到正文块左缘 ≤64px；正文中线 ≤ 窗口中线）。
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：
  - `check_task.py --task docs/tasks/TASK-091-reader-outline-gap.md --worktree` → 退出码 0，**CHECKS PASS**，
    `files=6`，`product_fingerprint=8c79cb3653042528da1ccbb98c87975645e68fd687e72b8bd5ba8e2618348100`，
    `profiles=frontend`（含 lint/format/typecheck/build；vitest 37 文件 825 条全过）。
  - `npx playwright test e2e/reader-layout.spec.ts` → **9/9 通过**（隔离沙盒，端口 18000/15173）。
  - **断言会咬**：临时 stash 掉 `styles.css` 的改动只跑目录用例 → 红，报
    `expect(218).toBeLessThanOrEqual(64)`——218 正是「现状与原因」里算出来的那个数；恢复后绿。
  - 环境：macOS，Node/Chromium 走 playwright 本机安装。
- 已知限制/未完成项：`margin-left: 24px` 只是一个看得过去的起点，用户在本机看过若嫌紧/松再调
  （只动这一个数）。PDF 阅读器不受影响（其内容不是 `.resource-snapshot`）。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：
- Review：L1 N/A。
- Acceptance：L1 N/A。
- 最终状态/风险/用户操作：
- 非阻断遗留项：
- 日期与决定日志：2026-09-26 用户提出「正文偏右、目录与正文间距太大」→ 登记本任务。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
