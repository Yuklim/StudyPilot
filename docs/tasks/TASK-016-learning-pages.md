# TASK-016：学习记录表单、状态进度与历史页面

```toml
schema_version = 2
id = "TASK-016"
status = "IN_PROGRESS"
risk = "L3"
risk_reason = "页面接入关键进度的版本写入和冲突/不确定结果恢复，同时同步权威交付注释；不改变后端模型或标准契约。保留各一次独立只读 Review/Acceptance。"
risk_flags = ["business", "critical-data", "tests"]
owner = "frontend_worker"
base = "cd348e9d9935a69902e24223b1e5421bba6821bd"
allowed_paths = ["frontend/src/features/learning/**", "frontend/src/features/resources/api.ts", "frontend/src/features/resources/api.test.ts", "frontend/src/features/resources/fixtures.ts", "frontend/src/features/resources/ResourceDetail.tsx", "frontend/src/features/resources/ResourcePages.test.tsx", "frontend/src/api/client.ts", "frontend/src/api/client.test.ts", "frontend/src/App.tsx", "frontend/src/App.test.tsx", "frontend/src/shell/Screen.tsx", "frontend/src/shell/pages.ts", "frontend/src/styles.css", "frontend/e2e/learning-pages.spec.ts", "frontend/e2e/scaffold.spec.ts", "README.md", "docs/contracts/API与数据契约基线.md", "docs/contracts/openapi-v1.json", "docs/tasks/TASK-015-learning-backend.md", "docs/tasks/TASK-016-learning-pages.md", "docs/tasks/任务索引.md"]
checks = ["frontend", "contracts", "governance"]
```

## 需求与范围

- 用户确认已合并，承接上一轮明确 TASK-016 页面工作。已核实 PR #20 MERGED（2026-09-03T07:56:06Z），合并 SHA 为 base；工作区干净，基于 origin/main 创建专用分支。TASK-015 仅补真实合并事实。
- 依据：已确认需求 5.5/5.7/5.10、契约 2.3/4.4/4.9/6 与三个 study-records 操作，已合并 TASK-015 后端；保持既有简约暖纸/灰绿/圆角手帐风。
- 主 Agent 为唯一 frontend_worker，coordinator 串行维护任务/索引及交付注释。使用 intake/implement/review/acceptance Skills，不启动机械 Worker；最终各一次独立实际只读审查与验收。
- 资料详情按需展开学习区：表单输入本地开始时间、时长（秒，附单位解释）、结束状态、0～100 整数进度、总结和疑问。提交固定现有 JSON 入口，版本/before 取已读取快照；不信任伪造或缺失版本。只提交学习字段，不改资料本体/原件/主题标签。
- 前端按既定矩阵提供当前可执行状态提示；100% 不自动完成；回未开始必须用户填写 0；归档/恢复保持当前进度并显示确认与影响，恢复只回记忆状态。读取必要复习计划条件，不通过学习表单创建/暂停/完成复习计划，复习动作仍待后续。
- 提交中防重入/锁定；失败保留本页输入，409 或不确定结果锁住再次保存，须显式读取最新快照并重新核对/确认，提示检查历史防重复。无自动重放、无乐观假成功；迟到请求不得更新离开的页面。草稿只在页面内存，不持久化；重读失败不解除保护。
- 单资料学习历史按需显示，侧栏学习记录接入全局真实分页；展示时长、前后状态/进度、总结/疑问、时间与打开对应资料链接。支持时间起止（结束不含）、既定排序、翻页和重置；本次不扩展高级主题/资料选择器或统计。纯文本显示用户内容；加载/空/错误/刷新、筛选失败与迟到读取正确处理。
- 资源投影补当前 UI 真正消费的完整进度/计划字段验证；共享客户端仅增加 STATE_CONFLICT/INVALID_STATE_TRANSITION 固定错误码，不改授权/传输机制。同步首页/说明，不伪装复习、笔记、概览统计已可用。旧测试只按新真实能力/完整合成进度更新，不放宽安全断言。
- coordinator 只改中文契约 1.3 与 OpenAPI x-delivery-profile.client_policy 页面状态，标准 schema/path、后端阶段/操作不变；README 说明界面用法及限制。
- 禁止其他路径，尤其后端、模型/迁移、依赖/锁、治理规则、安全协议、真实数据。不开编辑/删除历史、资料删除、笔记、复习写入、统计、AI 或公网。

## 完成条件

1. 详情表单与全局/局部历史真实联通既定接口；时间/时长/状态/进度/总结/疑问正确存取；服务器快照版本与 before 成对提交、纯文本展示，资料原件等既有功能保持。
2. 状态/归档恢复/回未开始提示与确认、严格输入、读错/空态、单次提交、防重入、失败留草稿、冲突显式重读再确认、重读失败继续锁定、离页迟到保护均有测试；不自动重放或伪称完成。
3. 适配层、组件与共享错误映射单测；真实 Chromium 新增记录→刷新→历史/进度一致、归档/恢复、真实旧版本冲突、断网与不重复、全局时间筛选/分页联通；键盘及 320/390/1440 无横溢且查看合成截图。浏览器仅临时数据库，trace 关闭，不导出令牌。
4. 前端/契约/治理全检及浏览器回归通过；标准契约结构未变；未改后端，复用 TASK-015 已合并 366 项后端证据，不重复跑。所有失败如实记录。
5. 固定实现/测试候选，独立实际只读 Review 和另一只读 Acceptance 通过；审查后仅合法证据写回，最终由用户合并。

## 上下文包

根/前端规则、本任务、上述局部需求/契约、现有 client/resources 查询与组件、合成夹具和浏览器测试。准确命令：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-016-learning-pages.md --worktree`；`cd frontend && npm run test:e2e`（临时 15173/18000）。不完整重复读取全仓/旧任务。

## 实现与测试

- 已实现资料详情按需学习手帐、真实版本/前值提交、归档恢复确认，以及全局/单资料历史的本地时间筛选、排序、分页。既有 API/存储/授权协议不变；资源投影补当前 UI 消费的进度/计划验证。总结/疑问按纯文本显示，无浏览器持久化。
- 冲突与不确定保存保留草稿并锁定重发，必须显式重读最新进度/历史并确认；失败重读继续锁定，迟到响应不更新卸载表单。保存后只消费已验证的服务端进度，并刷新历史；用独立组件键避免保存后表单重复。
- 最终全检：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-016-learning-pages.md --worktree`，整体退出 0；27 文件、`product_fingerprint=41326293e4a6f48bf81ff1de2693b7d7f58d49d03a9772e6eb7ce0bffeba522f`。范围/敏感模式/JSON/Git diff、OpenAPI/FastAPI 结构、前端格式/lint/类型/构建、203 项前端测试（12 文件）、治理规则/lint/格式/23 项治理测试均 PASS。治理测试中的 missing-tool/fake-test 是验证失败报告能力的受控夹具，测试整体退出 0。
- 真实 Chromium：`cd frontend && npm run test:e2e`，22/22 PASS（20.4 秒，含 19 项既有回归与 3 项新场景）；临时 SQLite 与本机 15173/18000，trace 关闭，只合成内容，不导出令牌，测试服务已退出。覆盖记录→刷新→历史/进度一致→归档→恢复、秒精度时区转换、纯文本防执行、真实旧版本 409 与断网保留草稿/显式确认/不重放、全局 21 条排序分页及结束不含边界。键盘保存/翻页、320/390/1440 无横溢；主 Agent 查看学习表单 320/1440 合成截图，布局及风格可用。截图位于忽略的 `frontend/test-results/learning-pages-real-learni-0b190-keyboard-and-narrow-layouts-chromium/learning-form-{320,1440}.png`，不纳入提交。
- 合约对比退出 0：解析 OpenAPI 后移除双方唯一 client_policy 字段再深比较，完全相同（含标准 paths/schemas/security、阶段及操作清单）；中文契约 diff 只在 1.3 页面交付说明。后端未修改，复用已合并 TASK-015 的 366 项后端证据，不重复运行。
- 如实记录开发期失败：首次类型检查发现 StudyCommand 不满足共享 JSON 对象类型，改为显式对象展开；新增测试未用 import 导致下一次类型检查失败，已移除。一次单测 202/203 通过，失败暴露表单与历史重复 key，已改为分别带前缀的键并保持原单表单断言。首轮浏览器 19/22 通过：两项日期填值被 Chromium 规范化后与 Playwright 输入比较不符，改用规范分钟值并单独保留非零秒精度测试；旧导航白名单未包含本次新增历史 GET，限定在打开学习记录后精确允许该只读路径。未放宽其他安全断言；最终上述检查全过。
- 已知边界：草稿只在页内，收起/离页/刷新会丢失，已提示；发出请求不因离页撤销；网络不确定结果由用户核对历史，不能承诺恰好一次。复习计划、笔记、概览统计、历史编辑删除及高级主题/资料筛选未开放。当前仅本机个人运行，未承诺公网或大量并发。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 2026-09-03：IN_PROGRESS，依赖已合并，L3 边界已确认。
<!-- EVIDENCE:END -->
