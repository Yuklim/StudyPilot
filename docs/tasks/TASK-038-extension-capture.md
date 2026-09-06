# TASK-038：扩展采集网页正文（经 UI 页面写入快照）

```toml
schema_version = 2
id = "TASK-038"
status = "READY"
risk = "L3"
risk_reason = "本任务把扩展从「零权限」变成「能读用户当前打开的任意网页、并向本机 UI 页面注入脚本」。浏览器扩展权限是一次性授予、长期生效的，用户不会重新审视，因此这次授予的边界就是它此后的边界。同时新增一条**新的数据写入路径**：正文不再只由用户手工粘贴，而是由页面内容自动提取后进入永久快照（快照一旦写入即不可回溯重建）。第三处实质风险在信任边界：`/capture` 页面要接收来自扩展内容脚本的 postMessage，而任何网页都能向同源页面发 postMessage，所以「谁可以让 StudyPilot 写一条资料」这个问题必须在本任务里答对。命中 `**/AGENTS.md` 高风险路径下限。不改后端、不改契约、不改 `infrastructure/security/local_access.py`。"
risk_flags = ["security", "architecture", "business", "tests"]
owner = "coordinator"
base = "b4a3fd0c646f2ea144fb4b3cb6d9bb784e2fff23"
allowed_paths = [
  "extension/**",
  "frontend/src/features/capture/**",
  "frontend/src/shell/pages.ts",
  "frontend/src/shell/Screen.tsx",
  "frontend/src/styles.css",
  "README.md",
  "docs/tasks/TASK-038-extension-capture.md",
  "docs/tasks/TASK-037-extension-baseline.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

- 用户授权（2026-09-06，本轮明确回答）：
  1. **浏览器范围：「先只做 chrome 和 edge 浏览器，其他的不扩展」**，并要求记住这一点。据此本任务只做 Chromium，不引入 `browser.*` 兼容层、不产出第二套构建产物。
  2. **任务拆分：采集正文与图片冻结分开做**，本任务只做采集正文，图片冻结留给 TASK-039。
- 前序决策（TASK-036/037 已记录，本任务继承）：正文格式为 **Markdown**；扩展**走 UI 页面写入，不改安全边界**；实施顺序取「甲」：正文快照 → 浏览器扩展 → PDF 阅读器。

### 复核过的现状事实（主 Agent 在基线 `b4a3fd0` 亲自核实）

1. **扩展确实不能直连后端**：`infrastructure/security/local_access.py:17` 要求 `sec-fetch-site: same-origin`，`:154/:200` 要求 `Origin` 等于 UI 源。扩展发起的请求是 `chrome-extension://` 源、`Sec-Fetch-Site: cross-site`，必被拒。**这不是本任务要绕开的障碍，而是本任务的设计前提**：经 UI 页面转交，后端只信任 UI 源，该门禁一行不改。
2. **后端与契约零改动**：`createResource`（`frontend/src/features/resources/api.ts:256`）与 `putResourceSnapshot`（`:351`）已存在且已冻结，采集流程复用它们即可。故 `docs/contracts/**` 与 `backend/**` 不在允许路径内。
3. 前端路由由 `frontend/src/shell/pages.ts` 的 `pages` 注册表 + `frontend/src/shell/Screen.tsx` 的组件映射驱动，新增页面需同时改这两处。
4. 扩展骨架当前**零 `chrome.*` 调用、manifest 仅五个顶层键**（TASK-037 的 Acceptance 与两位 Reviewer 均已独立核实）。`extension/src/manifest.test.ts` 的白名单断言会因本任务新增的任何 manifest 键而失败——**这是 TASK-037 有意设计的门闩，本任务正是它的第一个考验**。
5. 遗留 L8：两处 README 与 `extension/AGENTS.md` 的加载说明已过时（仍写「尚未实机验证」、只给 Chrome 地址栏），按其重评触发条件由本任务一并改正。

### 目标

1. **扩展采集**：用户在任意网页点扩展图标 → 提取该页正文 → 转成 Markdown → 打开本机 UI 的 `/capture` 页并把内容交给它。
2. **`/capture` 确认页**：预填标题、原网址与正文预览，**必须由用户点击确认才写入**；确认后依次调用 `createResource`（WEB，带 `source_url`）与 `putResourceSnapshot`。
3. **权限最小化并逐条说明用途**：本任务预计需要 `activeTab`（仅在用户点击时授予当前页访问，优于 `<all_urls>`）、`scripting`（注入提取脚本）、`storage`（popup 关闭后仍能把内容交给新标签页）、`host_permissions: http://127.0.0.1:5173/*` 与一条 `content_scripts`（仅匹配 UI 源，用于把内容 postMessage 给页面）。**最终清单以实现时的实际需要为准，每一项都必须在实现记录里写明用途、替代方案与为何不能更小**，并同步更新 `manifest.test.ts` 的白名单与三处宣称口径。
4. **正文提取**：采用 `docs/research/阅读器与标注能力调研.md` 推荐的 Defuddle（JS 库，只能跑在扩展里）+ Markdown 转换。这将是 `extension/` 的**首批运行时依赖**（此前 `dependencies` 为空），须在实现记录中列出并说明选型。
5. **清理遗留 L8**：两处 README 与 `extension/AGENTS.md` 的加载说明改正——补 Edge 的 `edge://extensions` 路径、把「尚未实机验证」改为与事实相符的表述（Edge 已实测、Chrome 未实测），并写入「只支持 Chrome 与 Edge」这一用户决定。

### 非目标 / 禁止范围

- **不做图片冻结**（用户已决定拆分）。正文中的图片引用本任务仍指向原站，是已知的不完整冻结，与 TASK-036 的现状一致。
- **不改 `infrastructure/security/local_access.py`，不放宽 `Origin`/`Sec-Fetch` 校验**。若实现中发现非改不可，须停止并上报，不得自行放宽。
- **不引入任何第三方站点凭证**（继承 TASK-036/037 的硬性非目标）。扩展只读用户已登录、已渲染的页面；不得绕过任何站点的访问控制或付费墙。
- **不支持 Firefox / Safari**（用户明确决定）。不引入 `webextension-polyfill` 一类兼容层，不产出第二套构建产物。
- **不改后端、不改 API 契约、不改数据库**。`backend/**` 与 `docs/contracts/**` 不在允许路径内。
- **不做阅读器、不做 Markdown 渲染、不做标注、不做 PDF**。
- **不申请 `<all_urls>` host permission**，除非实现中证明 `activeTab` 无法满足且在记录中写明理由——即便如此也须独立 Review 认可。
- 不动未列路径。

- 依赖/前置条件：TASK-037 已由用户合并（PR #42，merge `b4a3fd0`）。无未合并依赖。
- 并行：否，单写入者 `coordinator`（主 Agent 亲自充当 Worker；L3 的 Review 与 Acceptance 由独立只读子 Agent 执行）。
- 状态收尾并入本任务控制面提交：把 TASK-037 由 `ACCEPTED` 标 **MERGED**（merge `b4a3fd0`、PR #42）。

## 完成条件

1. 在一个普通文章网页上点扩展图标，能打开 `/capture` 并看到该页的标题、网址与正文 Markdown 预览；正文不是整页 `innerText`，导航与页脚等噪声被剔除（以一个具体页面为例记录提取前后的字符数与实际效果）。
2. **不点确认就不写入任何数据**：`/capture` 打开后若用户直接关闭，资料库中不新增任何资料，也不产生快照。有测试覆盖。
3. 确认后创建的资料 `source_type=WEB`、`source_url` 为采集时的实际页面地址，且其快照内容与预览一致。
4. **信任边界成立**：`/capture` 只接受来自同源 `window` 的 postMessage，并校验消息结构；伪造的消息（错误 origin、错误结构、缺字段）被丢弃且页面显示可理解的空态而非崩溃。**有测试直接构造伪造消息证明其被拒绝。**
5. **创建成功但写快照失败时不留下误导状态**：资料已创建、快照未写入时，页面明确告知发生了什么以及下一步（去详情页手工粘贴），不谎称成功、不自动重试。有测试覆盖。
6. **manifest 权限清单逐条有据**：`manifest.test.ts` 的白名单更新为新的确切键集；`extension/AGENTS.md`、`extension/README.md`、根 `README.md` 三处宣称口径与实物一致（TASK-037 的教训：门闩比宣称窄，会让下一个人误以为受保护）。实现记录中逐条列出每个权限的用途、替代方案与为何不能更小。
7. 扩展不发起任何对 StudyPilot 后端的直接请求：有检查证明 `extension/src` 中无指向 `127.0.0.1:8000` 或 `/api/v1` 的调用。
8. **不接触第三方站点凭证**：有检查证明 `extension/src` 中无 `cookie` / `chrome.cookies` / 登录态相关调用。
9. 遗留 L8 清理完成：两处 README 与 `extension/AGENTS.md` 补 Edge 加载路径、改正验证状态表述、写入「只支持 Chrome 与 Edge」。
10. `cd extension && npm run format:check && npm run lint && npm run typecheck && npm run test -- --run && npm run build` 全绿（基线 5 tests，本任务后应 >5）；`cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test -- --run && npm run build` 全绿（基线 369，本任务后应 >369）；`cd backend && ruff format --check . && ruff check . && mypy src tests && pytest` 全绿（基线 525，本任务不应改变）；`npm run test:e2e` 全绿（基线 41）。
11. **e2e 的边界须如实说明**：Playwright 无法驱动浏览器扩展，因此「点扩展图标 → 采集」这一段**没有自动化端到端覆盖**；`/capture` 页面侧可以且必须有测试（用构造的 postMessage 驱动）。记录中不得把组件测试说成端到端验证。
12. `check_task.py` CHECKS PASS，记录 product_fingerprint；检查须在独立干净 worktree 中对被测提交运行（沿用 TASK-037 的路径，理由已由其 Review 认可）。
13. L3 执行链完整：独立只读 Reviewer 审 `b4a3fd0..candidate` 完整 diff；独立只读 Acceptance 核对上述 14 条完成条件。两者原文写回 EVIDENCE 区。
14. **实机验证由用户完成**：Agent 无法驱动浏览器加载扩展并点击图标。交付时必须当面请用户在 Edge（或 Chrome）中实测一次采集全流程，其结果据实补记——这条沿用 TASK-037 的做法，不得由 Agent 自行宣称满足。

## 上下文包

根 `AGENTS.md` + `extension/AGENTS.md` + `frontend/AGENTS.md` + 本记录。

只读参照（不改）：`backend/src/studypilot/infrastructure/security/local_access.py:17,154,170,200`（UI 源与 Sec-Fetch 校验，本任务不改但须据此设计转交路径）、`frontend/src/features/resources/api.ts:256,351`（`createResource` 与 `putResourceSnapshot` 的既有签名与校验）、`frontend/src/shell/pages.ts` 与 `Screen.tsx`（页面注册方式）、`frontend/src/features/resources/ContentSnapshot.tsx`（快照写入的既有交互与错误处理先例）、`extension/src/manifest.ts` 与 `manifest.test.ts`（白名单门闩）、`docs/research/阅读器与标注能力调研.md`（**作为调研输入，其建议须由本任务重新判断，不得当作已批准决定**；注意该文档至今未纳入 Git，见 TASK-037 遗留 L6）。

**审查输入的准备（TASK-037 的教训）**：本任务会引入 `extension/package-lock.json` 的大幅变更（首批运行时依赖）。派发 Review 时须用 `git diff <base>..<candidate> -- . ':(exclude)**/package-lock.json'` 导出 patch，另附直接依赖清单供核——TASK-037 的 Reviewer 因 2452 行锁文件连续三次被 watchdog 中断。同时须检查「必须共读才有意义」的文件对（如 manifest 权限清单与其宣称口径、检查组命令与 npm script 定义），不要把它们拆到不同 Reviewer。

准确命令：
- `cd extension && npm run format:check && npm run lint && npm run typecheck && npm run test -- --run && npm run build`
- `cd frontend && npm run format:check && npm run lint && npm run typecheck && npm run test -- --run && npm run build`
- `cd backend && ruff format --check . && ruff check . && mypy src tests && pytest`
- `cd frontend && npm run test:e2e`

## 实现与测试

- 实现 SHA/变更摘要：待填
- 命令、真实退出结果、product_fingerprint、环境、未运行原因：待填
- 已知限制/未完成项：待填

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：待填
- Acceptance：待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项（仅有真实问题时）：待填
- 日期与决定日志：2026-09-06 用户合并 TASK-037（PR #42，merge `b4a3fd0`）后回答本任务的两项范围问题：浏览器只做 Chrome 与 Edge、其他不扩展；采集正文与图片冻结拆成两个任务。主 Agent 据此把图片冻结移出本任务——理由是它躲不开后端改动（`content_snapshots` 只存 Markdown 且上限 100 万字符，`original_files` 为 `UNIQUE(resource_id)` 且 media_type 白名单不含图片，两者都装不下图片），属独立的 L3 数据模型任务。
<!-- EVIDENCE:END -->
