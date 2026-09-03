# TASK-019：轻量心得页面与学习记录入口简化

```toml
schema_version = 2
id = "TASK-019"
status = "IN_PROGRESS"
risk = "L3"
risk_reason = "接入个人文本修改/删除与版本冲突恢复，并同步交付注释；不改标准接口或数据库，仍需防止草稿丢失、旧版本覆盖及误删。"
risk_flags = ["business", "deletion", "tests"]
owner = "frontend_worker"
base = "4b760010c8476ccda7e57f7a835a6cd21c547b84"
allowed_paths = ["frontend/src/features/notes/**", "frontend/src/features/taxonomy/ClassificationPages.test.tsx", "frontend/src/features/resources/ResourceDetail.tsx", "frontend/src/features/resources/ResourcePages.test.tsx", "frontend/src/features/learning/LearningPanel.tsx", "frontend/src/features/learning/RecordHistory.tsx", "frontend/src/features/learning/LearningPages.test.tsx", "frontend/src/api/client.ts", "frontend/src/api/client.test.ts", "frontend/src/App.tsx", "frontend/src/App.test.tsx", "frontend/src/shell/pages.ts", "frontend/src/shell/Screen.tsx", "frontend/src/styles.css", "frontend/e2e/notes-pages.spec.ts", "frontend/e2e/learning-pages.spec.ts", "README.md", "docs/contracts/API与数据契约基线.md", "docs/contracts/openapi-v1.json", "docs/tasks/TASK-017-notes-backend.md", "docs/tasks/TASK-018-core-product-focus.md", "docs/tasks/TASK-019-quick-notes.md", "docs/tasks/任务索引.md"]
checks = ["frontend", "contracts"]
```

## 需求与范围

- 用户“已合并，进行下一步”承接 TASK-018 确认的轻量心得页面。PR #22 于 2026-09-03T09:31:49Z 合并为 d2fc5ac，PR #23 于 09:32:01Z 合并为 base；均已通过 GitHub 核实，工作区干净。
- 依据《项目需求说明》5.5～5.7、8.1；契约 2.1～2.4、4.8、10 及五个 notes 操作；保留暖纸色、灰绿和圆角手帐风。
- 主 Agent 为唯一 frontend_worker，串行维护任务/合并事实/交付说明；使用 intake/implement/review/acceptance Skills。不另启机械 Worker，最终各一名独立只读 Reviewer、Acceptance。
- 资料详情主要记录区：一个心得正文框和显式保存；新增、分页回看、编辑、确认删除。时间自动显示服务端保存/更新时间，不填写或推断学习开始时间、时长、进度或学习后状态，不调用学习写接口生成虚构活动。
- 已有学习历史保留；旧状态/归档恢复流程留在明确标记的折叠辅助区域，默认不展示过程表单，不删除原有能力或改写历史。测试保留其行为/安全断言，只调整入口步骤。
- 使用已有 notes 接口和共享同源客户端，新增 NOTE_NOT_FOUND 固定映射；已有 If-Match 删除白名单只覆盖主题/标签，本次按已批准笔记契约精确加入 `/resources/{uuid}/notes/{uuid}`，不放宽其他路径、任意请求头或安全协议。校验消费的响应字段、归属、版本和分页。正文纯文本，不执行 Markdown/HTML、不写浏览器存储或日志。
- 单次显式写入；失败保留编辑内容。版本冲突读取最新内容后显式核对，删除重新确认；网络/响应不确定不得自动重试写入或冒称成功。页面离开后的响应不串入新资料；草稿仅本页内存，不承诺跨刷新恢复。切换正在编辑的内容需明确放弃，翻页不清空编辑框。
- 同步 README、页面边界文案，中文契约 1.3 和 OpenAPI x-delivery-profile.client_policy 仅更新页面交付说明；标准 paths/schemas/security/运行时操作清单不变。TASK-017/018 仅补实际合并事实。
- 禁止其他路径；特别是后端、数据模型/迁移、依赖/锁、治理/权限、安全协议、真实数据。不开心得全文检索、跨资料心得汇总、富文本、自动保存、历史修订/回收站、复习/统计/AI、资料整体删除。
- 回归补充：现有分类集成测试的资料详情现在会读取心得，精确补空心得响应，不放宽标签错误/版本断言；新增断言确保标签引发的同资料重读不会卸载心得草稿，资料暂不可确认时禁止写入。

## 完成条件

1. 新增一句心得即可保存，刷新/重新打开能回看和修改；服务端时间可见；默认没有四类过程字段，保存心得不改变资料进度/历史。
2. 分页/空态/错误/重读、纯文本、归属/版本响应验证、空白/超长拒绝、单次提交、旧版本冲突/删除确认、断网/结果不明保留草稿不自动重放、切页/离页隔离有测试。
3. 旧学习历史与状态/归档恢复仍可用但不抢占主要记录入口；既有资料/文件/分类能力回归不降低保护。
4. 前端检查/构建、契约检查和真实 Chromium 测试通过；覆盖新增→刷新→编辑→确认删除、旧版本冲突、断网与不重复写、原学习数据不变及 320/390/1440 布局/键盘操作，查看合成截图。测试仅隔离数据，trace 关闭。
5. 最终候选经实际只读独立 Review 与另一独立验收，最终只写回证据；不替用户合并。

## 上下文包

根/前端规则（旧脚手架限制由已合并契约及本次明确授权细化）、上述需求/契约章节、notes 后端契约、共享 client、LearningPanel/RecordHistory/ResourceDetail、现有测试夹具。按需读，不全仓扫描。命令：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-019-quick-notes.md --worktree`；`cd frontend && npm run test:e2e`。JSON 比较仅允许 client_policy 不同；后端未改，复用 TASK-017 已绑定的 415 后端测试证据，不重复跑。

## 实现与测试

- 待实际实现/检查；NOT_RUN 不等于 PASS。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- IN_PROGRESS，独立审查/验收待实现后执行。
<!-- EVIDENCE:END -->
