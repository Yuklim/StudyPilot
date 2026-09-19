# TASK-069：遗留小项清理（068 引文连点丢段 + 063/064 记录项）

```toml
schema_version = 2
id = "TASK-069"
status = "READY"
risk = "L2"
risk_reason = "唯一有行为变化的是 TASK-068 F2：`quoteRequest` 从单槽位改成待消费队列，让 `available=false` 瞬态窗口内的连续两次「记下这段」都进草稿，不再被后一次覆盖。改的是既有前端组件间的 prop 形状与消费逻辑（ResourceDetail ↔ NotesPanel），不碰接口、契约、数据含义，按 business 归 L2：独立只读 Review；验收 N/A。其余为文档数字、提示文案、ref 赋值、useMemo、测试清理与注释，单独看是 L1，取最高级按 L2 走一次 Review。"
risk_flags = ["business"]
owner = "coordinator"
base = "63ab98f43bd241537c1b9563fd747d26172893a9"
allowed_paths = [
  "frontend/src/features/resources/ResourceDetail.tsx",
  "frontend/src/features/resources/ReaderQuote.test.tsx",
  "frontend/src/features/notes/NotesPanel.tsx",
  "frontend/src/features/notes/NotesPanel.test.tsx",
  "frontend/src/features/notes/NoteEditorPage.tsx",
  "frontend/src/features/notes/NoteEditorPage.test.tsx",
  "frontend/e2e/note-images.spec.ts",
  "docs/开发与运行.md",
  "docs/tasks/TASK-069-leftover-cleanup.md",
  "docs/tasks/TASK-068-quote-note-progress.md",
  "docs/tasks/任务索引.md",
]
checks = ["frontend"]
```

## 需求与范围

### 用户授权

2026-09-19 用户问「连点两次记下这段只留最后一段引文是什么意思」，主 Agent 解释 F2 的触发窗口与修法，并问「要我顺手把它和另外几个小遗留打包成一个任务改掉吗」，用户答「**改吧**」。因此本任务范围＝F2 + 主 Agent 在同一句里点名的「另外几个小遗留」，不含任何新产品决定。

### 目标

1. **TASK-068 F2（必须）**：`ResourceDetail` 把引文改成**待消费队列**，`NotesPanel` 按已消费下标一次追加全部未消费引文。`available=false` 的瞬态窗口内连点两次「记下这段」，两段都要进草稿（顺序不变、段间空行），不再只剩最后一段。
2. **TASK-068 F3（可选）**：`ReaderQuote.test.tsx` 里 `vi.spyOn(window, 'getSelection')` 显式 restore，不靠 vitest 的隔离默认值。
3. **TASK-063 F4（记录项）**：`docs/开发与运行.md` 两处心得正文上限 `50,000` → `2,000,000`（TASK-063 已改契约与实现，文档漏改，当时越 allowed_paths）。
4. **TASK-064 F2（记录项）**：编辑页图片占位符说明补一句——跨心得复制占位符文本不带图。
5. **TASK-064 F3（记录项）**：`NoteEditorPage` 的 `load()` 一并把 `note` 写进 `latest.current`，消掉 `.then`→commit 宏任务窗口内 `beforeunload` 以 `note=null` 重复 POST 的理论路径。
6. **TASK-064 F4（记录项）**：`frontend/e2e/note-images.spec.ts` 里已不成立的注释（「切换预览触发保存」，实际守卫是轮询）改成实际证明链。
7. **TASK-064 F5（记录项）**：`NotesPanel` 的 `expanded` 用 `useMemo`。
8. 顺带把 **TASK-068 登记为 MERGED**（用户 2026-09-18 合并 PR #76，merge `63ab98f`）并更新索引行。

### 非目标 / 禁止范围

- 不动后端、契约、openapi、迁移；不改渲染器与 XSS 边界；不加快捷键（用户 2026-09-17 决定）。
- 不改「记为学习进度」的直写行为（用户 2026-09-18「不要再返回确认」）。
- 不处理 TASK-064 F1 前提、TASK-051 F2/F3、TASK-052 F3/F4 等不在本次点名范围内的旧记录项。
- 所有未列入 `allowed_paths` 的路径。

### 依赖

无；基线为已合并的 main `63ab98f`。并行：否（主 Agent 亲自实施，唯一写入者）。

## 完成条件

- 新单测：`NotesPanel` 在 `available=false` 期间收到两次引文请求，`available` 回 true 后草稿里**两段引文都在**、顺序为点击顺序；去掉队列改回单槽位时该用例必须变红（判别性）。
- 既有引文用例（单段追加、草稿非空时空一行、删除/保存中作废、同 token 只消费一次、焦点与光标落末尾）保持绿。
- `docs/开发与运行.md` 不再出现 `50,000` 作为心得正文上限。
- `check_task.py --task TASK-069` 必要检查 PASS：lint/format/typecheck 0 问题、vitest 全绿、受影响 e2e 绿。
- L2 独立只读 Reviewer 对 `base..candidate` 最终 diff 给出结论。

## 上下文包

- 规则：`AGENTS.md`（V2）、`frontend/AGENTS.md`；风险分级见 `docs/governance/风险分级与检查规则.md`。
- 源文件：`ResourceDetail.tsx:218-224`（`takeQuote`）、`NotesPanel.tsx:103-122`（渲染期消费 + 聚焦 effect）、`NotesPanel.tsx:61`（`expanded`）、`NoteEditorPage.tsx:82-87`（`load`）、`NoteEditorPage.tsx:541-542`（占位符说明）。
- 遗留项原文：`docs/tasks/TASK-068-quote-note-progress.md`（F2/F3）、`TASK-064-image-placeholders.md`（F2–F5 表）、`TASK-063-note-images.md`（F4）。
- 检查：`python3 scripts/governance/check_task.py --task TASK-069`。

## 实现与测试

- 实现 SHA/变更摘要：待填
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：待填
- 已知限制/未完成项：待填

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：L2，N/A。
- 最终状态/风险/用户操作：待填
- 非阻断遗留项：待填
- 日期与决定日志：2026-09-19 用户「改吧」→ 登记 TASK-069。

此区禁止放入或变更任务授权、风险等级、允许路径、检查要求、实现或测试记录。
<!-- EVIDENCE:END -->
