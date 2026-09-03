# TASK-012：分类管理页面与资料分类接入

```toml
schema_version = 2
id = "TASK-012"
status = "IN_PROGRESS"
risk = "L3"
risk_reason = "接入既定分类删除与版本保护，并扩展共享客户端的受控版本头及安全错误映射；不改变服务端安全协议或契约。保留独立 Review 与独立验收。"
risk_flags = ["business", "deletion", "security", "tests"]
owner = "frontend_worker"
base = "06025c70f460f77a0fb5ca89a36a6676a85b0171"
allowed_paths = ["frontend/src/features/taxonomy/**", "frontend/src/features/resources/**", "frontend/src/api/client.ts", "frontend/src/api/client.test.ts", "frontend/src/shell/pages.ts", "frontend/src/shell/Screen.tsx", "frontend/src/App.tsx", "frontend/src/App.test.tsx", "frontend/src/styles.css", "frontend/e2e/taxonomy-pages.spec.ts", "frontend/e2e/scaffold.spec.ts", "README.md", "docs/tasks/TASK-011-taxonomy-backend.md", "docs/tasks/TASK-012-taxonomy-pages.md", "docs/tasks/任务索引.md"]
checks = ["frontend", "governance"]
```

## 需求与范围

- 用户确认上一项已合并，承接 #16 明确的分类管理页面、资料表单选择与资料库筛选。已核实 PR #16 MERGED（2026-09-03T05:48:24Z），合并提交为 base；初始工作区干净。
- 依据：需求 5.1～5.4、5.10；架构 6/7/12 节；已批准契约 2.1～2.4、4.5～4.7、7 及 TASK-011 已交付的分类操作。前端 AGENTS 中 TASK-002 脚手架限制属于历史阶段，后续已批准任务与冻结契约授权真实页面。
- 主 Agent兼任 frontend_worker，唯一实现写入者；coordinator 串行维护任务/索引。无并行写入；L3 各一次独立只读 Review 和独立 Acceptance。使用 intake / implement / review / stage-acceptance Skills，不重复全仓读取或全量测试。
- 新增独立 `/classifications` 分类整理入口，保留 `/topics` 主题统计预留，不伪装统计已实现。主题与标签切换、真实分页/名称搜索/排序、创建、修改、明确确认后删除未使用项；沿用暖纸色、灰绿、圆角、便签/索引卡的简约手帐风。
- 名称与描述长度遵守契约；修改携带所见 version，删除强 If-Match。冲突/引用中/重名/不存在/连接失效提示使用固定中文，不回显服务端原文；冲突不能自动改版本并重放。保留失败输入，用户明确放弃草稿、载入最新版本后才能重新决策。不把加载失败当空数据。
- 共享客户端仅增加受控正整数 `ifMatchVersion` 选项（分类 DELETE、无正文），不开放任意头或凭据访问；安全错误仅增加既定分类代码和经校验的计数/版本字段，不保存原始 details/message。保留同源、内存令牌、不持久化、不自动重放。
- 添加资料可选一个主要主题及最多 20 个已有标签，通过原 createResource 请求一次保存，不分拆写入。选择器按需加载、可搜索/分页，已选项跨页保留，可清除；不加载全量分类。资料库可主题/未分配主题及多个标签（全部匹配）组合筛选，应用/重置回第一页；列表和详情显示真实主题与标签。
- 详情页支持逐个添加/解除标签关联，不整组覆盖；明确动作才写入、忙碌防重复、成功后重新读真实详情、失败结果不伪装成功。资料主要主题后补/重分配仍待资料修改接口，本次不开放。
- 禁止所有未列路径，尤其后端/模型/迁移/契约/治理/安全配置/依赖/锁文件；不做文件上传、资料主体修改/删除、学习/笔记/复习/统计/AI/公网部署。TASK-011 只追加真实合并事实，不重写历史。

## 完成条件

1. 分类页空/加载/失败/分页/搜索/排序/创建/修改/删除确认可用；重名与使用中删除受控，旧版本不覆盖，失败草稿保留，用户明确载入最新版，不自动重放。
2. 请求路径、字段、正整数版本头、204 和响应校验符合既定契约；令牌与正文不进入持久化或日志；恶意错误原文不显示，禁止任意头绕过，现有客户端安全测试仍通过。
3. 资料表单可无分类或选择主题/多个标签保存；选择跨页不丢失，最多 20 项；资料库按主题/未分配/多标签全部匹配组合过滤与重置，真实主题展示。详情标签增删后从服务重读，不改正文、进度或主要主题；延迟响应不覆盖新页面。
4. 新交互有 RTL 与客户端单测；真实 Chromium 临时库覆盖分类管理→分类保存资料→组合筛选→详情标签关联/解除、重名/使用中/旧版本保护、刷新和键盘操作；320/390/1440 布局无横溢，人工查看新页面截图。全套 trace 关闭、只合成数据，不碰用户库。
5. 自动前端/治理检查、浏览器回归通过；README 与能力一致；独立只读 Review 与独立验收覆盖最终候选，合并权保留给用户。

## 上下文包

根/前端规则、当前任务、上述局部需求/契约、已有 client/resources/shell 与测试；不读取全部历史任务。附加命令：`cd frontend && npm run test:e2e`（既有隔离端口 15173/18000）。任务检查：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-012-taxonomy-pages.md --worktree`。无依赖变更。

## 实现与测试

- 已实现独立分类整理页、主题/标签分页搜索排序与增删改、删除确认与版本冲突提示；分类选择按需加载、跨页/收起保留、最多 20 个标签；创建资料一次提交分类；组合筛选与主题名补查、详情逐标签操作成功后重新读取。保留主题统计预留，不改变后端、标准契约、模型、依赖或安全配置。
- 共享客户端只新增分类 DELETE 的正整数 ifMatchVersion 和固定错误代码/安全数值字段；不能传任意 headers 或覆盖令牌。原同源、内存令牌、不自动重放策略保持。新增前端测试 44 项，共 114 项；浏览器新增 3 项，共 15 项。
- 最终任务检查 `PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-012-taxonomy-pages.md --worktree` exit=0 / CHECKS PASS；范围/敏感模式/Git diff、前端 format/lint/typecheck、Vitest **114 PASS**、生产构建（index-B16M3D_k.js）、治理校验/Ruff/**23 PASS** 全部通过。输入指纹 `398affed01ccb82ebaa8abbdcf204871794b2268085b31d0504d0c2333d36942`，27 文件。实现 SHA 在提交后冻结记录。治理单测中的 missing-tool/fake-test 是对失败检测的合成测试，不是当前失败。
- `cd frontend && npm run test:e2e` 首次 exit=1，**14 PASS / 1 FAIL**：唯一失败为新增分页场景用 getByLabel exact 定位包含选项文本的 select，30 秒超时；浏览器快照确认“标签排序”控件可用。只改为可访问角色 combobox 的精确定位，不改变生产代码/断言或增加超时。随后 `npm run test:e2e -- e2e/taxonomy-pages.spec.ts --grep 'classification search, paging' --output test-results/task012-paging-recheck` exit=0，**1 PASS / 8.7s**；复用未变更的 14 个场景证据，15 场景均有有效通过结果，不冒称原整套 exit=0。原套 46.4s（含唯一定位超时）。配置/依赖不变，单 Worker、零重试、trace off；两个运行的自启测试服务均正常退出。
- 真实 Chromium 覆盖分类创建/描述清空/重名拒绝/确认取消与删除、带主题双标签保存→刷新→组合筛选与未分配筛选→引用中删除拒绝→资料标签解除/添加、主题旧版修改与删除被拒→显式载入最新版再确认、21 个标签的分页/排序及网络失败草稿保留。已有 12 场景保持。只浏览器内调用共享客户端模拟另一窗口修改，不导出凭据，无外部请求、Cookie/localStorage/sessionStorage 写入。
- 已查看 `frontend/test-results/taxonomy-pages-classificat-29ef6-urces-with-combined-filters-chromium/` 的 classification-1440/320.png、picker-1440/320.png；暖纸色、灰绿、圆角索引卡、便签风格一致，窄屏单列与换行正常。自动验证 320/390/1440 无横溢，截图合成数据、不入 Git。没有为此生成图像或改视觉方案。
- 环境：macOS，已有 Python 3.13.9、Node 24.18.0 / npm 11.16.0；后端未改，不重复其 226 项已合并测试，真实浏览器仍运行原后端作集成验证。无新依赖。主 Agent完成一次变更范围与实现自检，不冒充独立 Review。
- 开发期失败：RTL 测试按钮定位误加 Playwright 的 exact 选项，114 测试运行通过但 tsc 报不支持的字段；删掉该测试选项（字符串默认精确匹配）后 typecheck 与最终检查通过。浏览器定位失败如上，未隐藏、删除或放松断言。
- 已知边界：只承诺个人本机/少量 SQLite 写入和 Chromium；分类说明/草稿在离开页面或切换类型时不持久化；主题名称补查失败不隐藏资料，刷新可恢复。分类删除不代表资料删除；主要主题后补/重分配、文件、学习/笔记/统计/AI 仍待后续。下一项为原始文件上传/保存/下载及失败保护，按已批准契约另行登记。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 2026-09-03：IN_PROGRESS；按 L3 登记，依赖已合并。
<!-- EVIDENCE:END -->
