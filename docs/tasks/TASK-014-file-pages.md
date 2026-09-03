# TASK-014：文件上传与原件下载页面

```toml
schema_version = 2
id = "TASK-014"
status = "IN_ACCEPTANCE"
risk = "L3"
risk_reason = "接入既定文件接口并扩展共享客户端的受控 multipart/二进制传输与令牌失效处理；不改安全协议。保留独立只读 Review 和独立 Acceptance。"
risk_flags = ["business", "security", "sensitive-storage", "tests"]
owner = "frontend_worker"
base = "761479459a5895adacb262c5f57862dd8373c2ed"
allowed_paths = ["frontend/src/api/client.ts", "frontend/src/api/client.test.ts", "frontend/src/features/resources/**", "frontend/src/App.tsx", "frontend/src/App.test.tsx", "frontend/src/shell/pages.ts", "frontend/src/styles.css", "frontend/e2e/file-pages.spec.ts", "frontend/e2e/local-access.spec.ts", "frontend/e2e/scaffold.spec.ts", "frontend/e2e/resources.spec.ts", "README.md", "docs/contracts/API与数据契约基线.md", "docs/contracts/openapi-v1.json", "docs/tasks/TASK-013-original-files.md", "docs/tasks/TASK-014-file-pages.md", "docs/tasks/任务索引.md"]
checks = ["frontend", "contracts", "governance"]
```

## 需求与范围

- 用户确认“已合并”，承接 PR #18 后明确的文件页面任务。已核实 #18 MERGED（2026-09-03T06:58:05Z），合并提交为 base；起始工作区干净。TASK-013 只补真实合并事实，不重写历史证据。
- 依据：需求 5.1/5.2/5.10、已批准契约 1.3/2/4.2/5/7/8，以及 TASK-013 已交付的 FILE 后端。前端规则里的 TASK-002 预留说明属历史阶段，不阻止本次已授权接口接入。
- 主 Agent 兼任 frontend_worker，唯一实现写入者；coordinator 串行维护本任务/索引。使用 intake / implement / review / stage-acceptance Skills，不另派机械实现 Worker；L3 各一个独立实际只读 Reviewer/Acceptance，复用未变测试证据。
- 现有添加资料页增加“上传文件”：选择一个 PDF/DOC/DOCX/MD/Markdown/TXT、显示名称与大小、移除/重新选择，前端提前检查空文件/25 MiB 上限/扩展名，格式安全最终由后端判断。只提交选中来源字段与公共元数据/分类；不上传另两来源草稿。
- 上传待处理时锁定表单、防重复、不伪造百分比；失败保留当前页文件与输入，网络/响应失败提示先检查资料库，不自动重试；成功导航真实资料详情。离页后返回结果不能导航或更新新页。
- 资料详情展示 READY 文件元数据与“下载原件”；只由显式点击请求。共享客户端固定上传入口与按文件 UUID 下载入口，不暴露令牌、任意头/路径或原始 Response。保持同源、omit Cookie、no-store、禁止重定向、不自动重放、旧令牌失效清理。
- 下载检查附件/类型/有界大小等响应，再通过短期对象 URL 交给浏览器保存；不是内联预览、不能执行内容。受控下载名，离页/失败清理 URL，迟到下载结果不触发保存。固定中文错误提示，不显示服务端原文/路径；未完成或损坏文件不显示成功。
- 保持暖纸色、灰绿、圆角与简约手帐风，增加文件收纳卡片；320/390/1440 无横溢、键盘可操作。同步首页能力说明/README，既有 WEB/PASTE/分类和安全测试保持。
- coordinator 另同步契约的交付元数据中“页面未接入”旧说明：只改中文 1.3 和 OpenAPI x-delivery-profile.client_policy 的页面状态，不变更后端 stage/操作列表、标准契约字段/行为或已确认需求；以测试、独立审查、验收及用户合并后的实际交付为准。
- 禁止所有未列路径，尤其后端/模型/迁移、标准契约（仅上述交付元数据例外）、治理、依赖/锁文件、真实运行数据。不开正文解析/病毒扫描/资料修改删除/学习操作/公网；不重新实现格式识别或后端哈希规则。

## 完成条件

1. 文件选择/清除/格式与大小提示、公共分类/说明、上传待处理/成功/失败/防重入/离页保护可用；只发一个正确 multipart 请求，WEB/PASTE 行为保持。
2. 新传输仅固定同源授权入口，令牌不返回或持久化，multipart 由浏览器生成 boundary，不允许任意 headers。失效/网络/非法响应不自动重放；安全固定错误映射，错误正文无敏感外泄。
3. READY 详情可显式下载原件，安全附件/类型/大小与元数据验证，浏览器收获正确名称与相同字节；失败/迟到结果无下载、无错误成功提示，短期 URL 可释放，不内联运行文件。
4. 新增客户端/适配层/页面单测；真实 Chromium 文件页面创建→刷新→文件筛选→下载比对，格式拒绝/连接失败输入保留与不重放、键盘及 320/390/1440 布局验证；查看合成截图，trace 关闭、临时数据。前端/治理全检和浏览器回归通过，无后端变更不重复其已合并 273 项检查。
5. README/页面说明准确，独立实际只读 Review 与独立 Acceptance 覆盖最终候选并通过，最终合并权留给用户。

## 上下文包

根/前端规则、本任务、上述局部契约、现有 client/resources 相关代码和测试；不读全仓或旧任务历史。命令：`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-014-file-pages.md --worktree`；`cd frontend && npm run test:e2e`（临时端口 15173/18000）。无依赖变化。

## 实现与测试

- 已实现：固定入口的 FormData 快照上传、受控附件流下载和旧令牌失效处理；三来源共用元数据/分类表单；文件选择/移除/防重入/失败保留/离页保护；READY 详情按显式操作下载、核对大小/类型、安全名称和短期 URL 清理。未扩展后端协议或依赖。
- 已同步页面/README 与契约的页面交付注释。针对 base 的结构比较通过：OpenAPI 标准内容完全未变，交付扩展仅 client_policy 变化；中文契约仅 1.3 变化。TASK-013 仅登记真实合并。
- 实现提交：`cc066a60cbd7c6a40475ca9a6dda94d06f0c5e76`；所有下列检查针对同一最终产品内容。
- 2026-09-03，macOS 本机已安装工具；`PYTHONDONTWRITEBYTECODE=1 backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-014-file-pages.md --worktree` 退出 0 / CHECKS PASS。base 为本任务基线；24 个文件，product_fingerprint=`e86f25a636b98b370c707fc788037c71ff3613cb478656d7d1d6a9fd6d5dc385`。范围/敏感模式/JSON/diff、OpenAPI/FastAPI 结构、前端格式/lint/类型/构建全部通过；前端 168 项、治理 23 项通过。治理测试内故意构造的失败命令是被测夹具，不是本任务失败。
- `cd frontend && npm run test:e2e` 退出 0：Chromium 19 项通过（19.4 秒，原 16 + 文件 3）；真实临时后端 18000/前端 15173，单 Worker、无重试、trace 关闭。覆盖上传→刷新→FILE 筛选→键盘下载，浏览器下载名称及实际落盘字节相同；伪造格式拒绝、上传断网不重放与保留输入、下载受控错误/显式重试；既有网页/粘贴/分类/访问保护回归通过。临时服务正常退出，无真实用户数据。
- 自动测试覆盖受控路径/表单字段/重复字段与快照、浏览器 multipart boundary、不泄露或持久化令牌、有界流/附件/名称/类型/大小验证、固定中文错误、上传与下载防重入/迟到结果、URL 释放及不内联内容。无后端改动，未重复 TASK-013 已合并的 273 项后端测试；本次浏览器测试实际使用该后端。
- 320/390/1440 上传和详情截图在 `frontend/test-results/file-pages-file-page-saves-a3888-dentical-bytes-after-reload-chromium/`（不提交合成截图）；各尺寸自动无横溢检查通过。已查看初版 1440 表单/320 详情及最终 320 表单/1440 详情：暖纸灰绿与圆角保留，长文件名换行，最终移除按钮使用现有圆角样式。原生文件选择器文案跟随浏览器语言。
- 修正记录（未隐藏失败）：开发时测试辅助类型错误已修正；初次单测 167/168，旧来源数量断言由 2 更新为 3 并新增上传来源断言；初次任务检查只有新浏览器用例 Prettier 未过，格式化后全检通过；初次浏览器 18/19，新合成标题与旧搜索用例重叠，改为独立测试标题后全套 19/19。未修改产品搜索行为、放宽断言或遗留必要失败。
- 当前限制：本机个人、单进程模式；原件保存/下载不等于正文解析或病毒扫描；下载提示只说明已交给浏览器，不冒称文件一定保存成功。没有新增未确认功能。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 2026-09-03：IN_PROGRESS；L3，已合并依赖可用。
- 2026-09-03：IN_REVIEW；实现与测试记录固定，等待独立实际只读 Review。未提前声称审查或验收通过。

### 独立只读 Review

- 2026-09-03：独立 CLI 会话 `01a06623-2d87-7702-8bb2-79382f7f1dd2`；沿用已批准临时 `gpt-5.4 / medium`，不更改默认模型。启动头实际为 read-only / never，禁子派发；进程退出 0。固定候选 `3d0966e0a13c1690b48b3fadd94c5a7416615fcb`；以下为报告原文。

PASS `base=761479459a5895adacb262c5f57862dd8373c2ed` `candidate=3d0966e0a13c1690b48b3fadd94c5a7416615fcb`。权限/独立性证据：当前会话按用户指定仅做 Reviewer；运行环境为 `sandbox=read-only`、`approval=never`，仓库内执行 `test -w .` 返回 `exit=1`；未做试写、修改、提交、推送、派发或联网。Git 证据：`git status --short --branch` 仅显示 `## agent/frontend_worker/TASK-014-file-pages`，无未提交改动；`HEAD` 与 candidate 一致。

No findings。已完整审阅 `base..candidate` 24 文件 diff，并定点核查 `frontend/src/api/client.ts`、`frontend/src/features/resources/api.ts`、`ResourceForm.tsx`、`FileOriginal.tsx` 及相关测试。上传固定到受控 `/api/v1/resources`、不允许自带 boundary/任意头、不暴露或持久化令牌；403 失效令牌清理且不自动重放。下载仅按文件 UUID，请求后校验附件、`nosniff`、媒体类型、长度和文件名；迟到结果、离页清理、无假成功提示。WEB/PASTE 既有路径保持，TASK-013 仅补合并事实。覆盖/证据缺口：复用同指纹 `e86f25…dc385` 的 168 前端 / 23 治理 / 19 Chromium 通过证据，未见需定向重跑的具体缺口。

- coordinator：Review PASS，No findings，无需修订产品；进入 IN_ACCEPTANCE。后续仅本任务 status/EVIDENCE 与本行索引写回，验收不重新审整份代码。

<!-- EVIDENCE:END -->
