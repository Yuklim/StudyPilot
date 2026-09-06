# TASK-038：扩展采集网页正文（经 UI 页面写入快照）

```toml
schema_version = 2
id = "TASK-038"
status = "ACCEPTED"
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
  "docs/contracts/API与数据契约基线.md",
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
- **不改后端、不改 `/api/v1` 的 HTTP 契约、不改数据库**。`backend/**` 与 `docs/contracts/openapi-v1.json` 不在允许路径内；本任务复用既有的 `createResource` 与 `putResourceSnapshot`，不新增、不修改任何 HTTP 操作。
- **但中文契约文档要改一处**：`extension/AGENTS.md` §4（TASK-037 写入）规定「与 UI 页面之间的消息格式属跨模块契约，须在相应任务中与 frontend 一并定义并写入契约文档；不得由本模块单方面约定」。本任务新增的扩展↔`/capture` 页面 postMessage 格式正是这样一份跨模块契约，故须写入 `docs/contracts/API与数据契约基线.md`。**登记时把契约整体列为非目标是错的**——那会让本任务违反自己模块的嵌套规则。实现开始前据此修订 `allowed_paths`，新增 `docs/contracts/API与数据契约基线.md` 一条（不含 openapi 快照，因为这不是 HTTP 操作）。此项修订属**扩大**授权面，与 TASK-037 决定日志中「授权面修订只有在收窄时才安全」的判据方向相反，故须特别说明：① **【此条初版陈述不实，经第一轮 Review 后用 git 证伪，据实更正，不删除】** 初版写的是「它发生在任何实现写入之前、登记刚完成时」。实际情况是：`allowed_paths` 里的契约那一条**首次出现在实现提交 `540027e` 中**（登记提交 `6891166` 的 `allowed_paths` 只有 9 条、不含它），也就是**授权面的扩大与实现代码落在同一个提交里，没有一个独立的前置控制面提交**。我在编辑器里确实是先改记录再写代码，但提交历史里没有这个先后，而我把它当作事实写进了正当性论证的第一条。**本次修订的正当性因此不依赖时序**，而依赖下面②③两条可独立核验的事实；② 它的动因是遵守既有的嵌套规则，不是为了让某段已写好的代码合法；③ 若 Reviewer 认为该扩大不成立，正确的处置是把消息契约的定义方式退回讨论，而不是保留代码删掉文档。
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

- 实现 SHA/变更摘要：**最终实现 SHA `7baf19e`**（base `b4a3fd0`，33 个文件；其中 `extension/package-lock.json` 一个文件占了大部分行数）。前三轮实现 SHA 依次为 `540027e`、`4ed3062`、`5574d5d`，均已被取代。**本段下方记录的命令与指纹一律是最终值**（`7baf19e` → `2235caca…`）；早先轮次的值只在明确标注轮次处出现。
  1. **扩展侧**：`src/shared/protocol.ts`（消息契约与载荷校验）、`src/injected/extract.ts`（在文章页运行，Defuddle 提取 + 转 Markdown）、`src/injected/relay.ts`（只在本机 UI 源运行的中转脚本）、`src/popup/capture.ts`（编排逻辑，与 chrome API 解耦）、`src/popup/bridge.ts`（真实 chrome 接线）、popup 增加「保存这一页的正文」按钮。
  2. **构建**：内容脚本与注入脚本必须是经典脚本，而 Rollup 只在 es/system 下支持多入口，故新增 `vite.injected.config.ts`，用 `--mode` 选入口各构建一次（`extract.js`、`relay.js`），跟在 popup 构建之后、`emptyOutDir: false`。
  3. **权限**：`activeTab` + `scripting` + `storage` + 一条只匹配 `http://127.0.0.1:5173/*` 的 `content_scripts`。**未申请 `host_permissions`、未申请 `<all_urls>`**。manifest 白名单断言由五键扩到七键，另新增两条断言分别锁死权限清单的确切三项与内容脚本的唯一匹配源。
  4. **前端**：`features/capture/protocol.ts`（扩展协议的平行实现）与 `CapturePage.tsx`（确认页），在 `shell/pages.ts` 与 `shell/Screen.tsx` 注册 `/capture`；不放进导航（没有从扩展过来就没有内容可看）。
  5. **契约**：`docs/contracts/API与数据契约基线.md` 新增 **§14**「浏览器扩展与 UI 页面的消息契约」，含消息表、载荷约束、信任边界与权限边界。**openapi 快照一字未改**（本任务不新增、不修改任何 HTTP 操作）。
  6. **文档漂移守卫**：`extension/src/boundaries.test.ts` 新增一条断言——manifest 申请的每一项 reach 都必须在 `extension/README.md` 与 `extension/AGENTS.md` 里被提到，否则失败。
  7. **清掉 TASK-037 遗留 L8**：两处 README 与 `extension/AGENTS.md` 补 Edge 加载路径、改正验证状态表述、写入「只支持 Chrome 与 Edge」。

- 命令、真实退出结果、product_fingerprint、环境、未运行原因：

  **任务检查（全套，最终）**：`check_task.py --task docs/tasks/TASK-038-extension-capture.md --candidate 7baf19e` → **CHECKS PASS**，base=`b4a3fd0`、files=33、`profiles=contracts,extension,frontend`、`product_fingerprint=2235caca2596ae7178d8515cbf94c10c01531ebc9ad3cdc925d41804f778708f`。完整输出留存于 `scratchpad/check-038-r4.log`（145 行）；extension 组报 **7 files / 84 tests passed**；frontend 组报 **18 files / 408 tests passed**。

  **extension 84 条的逐文件对账**（第二轮 R2 曾指出有 9 条无人认领，第三轮 R1 已独立推导出全部七个加数并逐一对上；数字由 `vitest --reporter=json` **实测**得出，非估算）：`boundaries.test.ts` 5、`manifest.test.ts` 9、`injected/extract.test.ts` 12、`injected/relay.test.ts` 11、`shared/protocol.test.ts` **26**、`popup/capture.test.ts` 13、`popup/popup.test.ts` 8 —— 合计 **84**（第三轮 O13 在 `protocol.test.ts` 各补一条控制字符用例，扩展侧由 25 增至 26；前端侧同理由 407 增至 408）。

  前两轮（已被取代，仅备查）：`--candidate 540027e` → CHECKS PASS，files=31、`product_fingerprint=f6c1552186cb08ae8c15c344a201c437b9a24f8dd5669ef886a0a4fef2bcc268`（`scratchpad/check-038.log`）；`--candidate 4ed3062` → CHECKS PASS，files=32、`product_fingerprint=f22c17dbe1b81716f474543e350cc709eee2dc488e3eb2b313bb5b51984f4114`（`scratchpad/check-038-r2.log`）。

  第一轮（已被取代，仅备查）：`--candidate 540027e` → CHECKS PASS，files=31、同样三个 profile、`product_fingerprint=f6c1552186cb08ae8c15c344a201c437b9a24f8dd5669ef886a0a4fef2bcc268`，输出留存于 `scratchpad/check-038.log`；当时 extension 44 tests / frontend 380 tests。运行环境沿用 TASK-037 经 Review 认可的路径：主工作区因未跟踪的 `docs/research/` 不满足脚本的干净要求，故 `git worktree add` 一个独立干净的 worktree 检出 `540027e` 后在其中运行（临时分支 `...-capture-check`，零提交差异、未推送，检查后连同 worktree 与 `.git/info/exclude` 的临时行一并删除）。

  **governance 组未被自动选中**：`selected_profiles()` 的治理规则只匹配根 `AGENTS.md` 与 `.codex/`、`.agents/`、`docs/governance/`、`scripts/governance/` 前缀，`extension/AGENTS.md` 不在其中——这与 TASK-037 第一轮 A 部分 Review 核实并接受的既有行为一致（其风险下限仍由 `risk-policy.json` 的 `**/AGENTS.md` 独立兜住 L3）。本任务未改治理脚本，另行单独运行治理组：`validate_governance.py` PASS、`ruff check/format --isolated scripts/governance` 全绿、`unittest discover -s scripts/governance` **23 tests OK**。

  **backend 组未被自动选中**（本任务不改 `backend/**`），另行在主工作区单独运行：`ruff format --check . && ruff check . && mypy src tests && pytest -q` → 全绿，**525 passed**，与基线一致；处置后再次单跑 `pytest -q` 仍为 **525 passed**。

  **e2e**：`cd frontend && npm run test:e2e` → **41 passed**，与基线一致。本任务未新增 e2e，原因见「已知限制」第 1 条。

  **变异验证（六 + 四 + 三 + 二，共十五项，均已回滚，回滚后复跑全绿）**：
  1. *信任边界是否真被测住*：删掉 `capturedFrom` 里的 `event.source` 与 `event.origin` 校验 → 采集页测试 **2 failed / 9 passed**。
  2. *「必须用户确认」是否真被测住*：让页面一收到内容就自动 `createResource` → **2 failed / 9 passed**。
  3. *内容脚本范围是否被锁死*：把 `matches` 放宽为 `[RELAY_MATCH, '<all_urls>']` → 扩展测试 **1 failed / 42 passed**。
  4. *扩展是否真的不直连后端*：在 `bridge.ts` 里加一行指向 `http://127.0.0.1:8000/api/v1/resources` 的常量 → **1 failed / 42 passed**。
  5. *权限清单是否被锁死*：给 manifest 加 `'tabs'` 而不改文档 → **2 failed**（权限断言 + 新增的文档漂移守卫各一条）。
  6. *文档漂移守卫是否有效*：见上第 5 项；该守卫在首次运行时就真实抓到一处缺漏（`extension/README.md` 未写出内容脚本的确切匹配源），已修。
  7. *（处置 R1 F2 后）「不发网络请求」是否被钉住*：把 `useAsync` 改回 `true` → `extract.test.ts` **1 failed / 11 passed**；把 `.parse()` 改成 `.parseAsync()` → **3 failed**（该断言 + 两条依赖同步提取的实质断言）。
  8. *（处置 R2 F1 后）带锚点的网址是否被拒*：`normalizeSourceUrl` 与两份 `isCapturePayload` 各有用例；前端新增两条伪造投递用例（`#锚点`、带凭据）断言页面停在空态、不出现表单。
  9. *（新增守卫）协议漂移是否被捕获*：把**前端那份**的 URL 规则放宽（去掉 `#` 与反斜杠的拒收）→ 扩展侧的跨目录守卫 **1 failed / 24 passed**，报两份 `isSafeSourceUrl` 函数体不一致。
  10. *（R1 S6 的推断）实测不成立*：见「已知限制」第 5 条。
  11. *（处置 N1 后）只改前端那份协议是否会被捕获*：放宽**前端**那份的 authority `@` 规则 → `frontend/.../protocol.test.ts` 变红。这条是关键 —— 处置前该方向**没有任何机器守着**（扩展组根本不会运行），而它恰是更可能发生的方向。
  12. *（处置 N1 后）只改扩展那份是否会被捕获*：同样放宽**扩展**那份 → 扩展侧的逐字守卫变红。两个方向都有。
  13. *（处置 P1 后）改构建产物文件名模板是否会被捕获*：把 `outputName` 改成 `` `${mode}.bundle.js` `` → `manifest.test.ts` 变红。处置前这一改动会全绿通过，而产出的 manifest 指向不存在的文件。
  14. *（处置 O13 后）控制字符规则是否被测住*：删掉 `isSafeSourceUrl` 里那一行 → 前端 `protocol.test.ts` 变红。**处置前删掉它两侧行为用例全绿**（实测确认），是「这一份符合规格」里唯一的洞。
  15. *（处置 N-R2 后）只改一侧的 JSDoc 是否被捕获*：只改**前端**那份 `isSafeSourceUrl` 的规则说明 → 扩展侧逐字守卫变红。**处置前 JSDoc 不在比对范围内**，N-R1 那类「改了实现没回头看描述」的漂移完全抓不到。

  **实现过程中自查发现并修正的两处**（记录在案，因为它们都属本任务链上反复出现的缺陷类型）：① `extension/README.md` 与 `AGENTS.md` 仍写「顶层键恰好五个」，而实物已是七个——与 TASK-037 F1「宣称比实物宽」方向相反但同族，是「文档口径落后于实物」，第 6 项守卫即为此而加；② 我最初写的「不可用内容不开确认页」测试实际走的是超时分支，**是一条空断言**，改为让假 bridge 真实回传不可用内容、并断言结论必须是 `unusable` 而非 `timeout`。

  环境：macOS（Darwin 25.5.0）、Node v24、npm 11、Python 3.13（`backend/.venv`）。`extension/` 的依赖安装因用户级 npm 缓存 `EACCES` 需用仓库内 `.npm-cache`（README 既有 FAQ）。

- 已知限制/未完成项：
  1. **「点扩展图标 → 采集」这一段没有自动化端到端覆盖**：Playwright 驱动不了浏览器扩展。有覆盖的是两端各自的逻辑——扩展侧 `runCapture` 的编排顺序与五种失败分支、`relayHandler` 的消息过滤、`extractFromDocument` 在 jsdom 里的真实提取；前端侧 `/capture` 的握手、伪造消息拒绝、确认写入与半成功状态。**中间那一跳（真实 chrome.storage + 真实 content script）只有靠人实机验证**，见第 2 条。**本记录中的任何组件测试都不得被称作端到端验证。**
  2. **全流程从未在真实浏览器里跑过**：Agent 无法加载扩展、无法点击图标。完成条件 14 因此须由用户实测后据实补记，与 TASK-037 的做法一致。
  3. **图片不冻结**：正文里的图片引用仍指向原站，原站改版或删图后这部分内容会失效。属 TASK-039 的范围。
  4. **提取质量只在合成页面上验证过**：`extract.test.ts` 用的是一个人工构造的典型文章骨架（导航/正文/推荐位/广告/页脚），证明了噪声剔除与 Markdown 转换成立，但真实站点千差万别，尤其是知乎/CSDN 这类重前端框架的页面。首次实机使用时值得留意提取效果。
  5. **`extract.js` 产物 707.60 kB**（Defuddle full 含 Markdown 转换）。对本机扩展无实际影响，但它是注入到用户浏览页面的脚本，体积值得知道。R1 的 S6 曾推断 `--mode extract` 可能导致 development 构建、体积数字要重报；**实测不成立**：产物中无 `process.env.NODE_ENV` 残留、无 `"development"` 字面量，且以 `--mode production` 重建得到**完全相同的 707.60 kB**。另一项观察：产物内有 5 处 `console.log` 调用点（来自 Defuddle），**我未验证它们在 `debug: false` 默认值下是否可达**，记为观察而非结论。
  6. **创建资料与写快照不是一个事务**，且有**两个**半成功状态，不是一个：
     - **创建成功、写快照失败**：留下一份没有正文的资料。页面明确告知、给出去处、并把正文原样留在屏幕上供复制（完成条件 5），不自动重试。
     - **创建请求在服务端成功但客户端没拿到可解析响应**（后端重启、`INVALID_RESPONSE`）：此时 `created` 仍为 null，页面走普通错误分支，**不会提示可能已经产生了一份孤儿资料**，用户重试就会得到重复资料。这条是第二轮 Review（R2 的 F3）指出的，初版记录只写了前一种。
     两者都无法在客户端根治——除非后端提供「创建资料同时写快照」的合并操作，那属新的 HTTP 契约，不在本任务范围。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：第一轮候选 **`8533b87`**（代码 `540027e`，base `b4a3fd0`）。经第一轮 Review 处置后的代码修订 SHA 为 **`4ed3062`**（`product_fingerprint=f22c17dbe1b81716f474543e350cc709eee2dc488e3eb2b313bb5b51984f4114`，全套 CHECKS PASS）；其后 `f274c05` 只更正了任务记录中被 git 证伪的时序陈述并把「实现与测试」段改为最终值，指纹不变。**本轮冻结候选即本条写回所在的提交**，其精确 SHA 在下一次写回（增量复核结论）时补记 —— 提交无法引用自身，与根 `AGENTS.md` §6「候选精确 SHA 在之后的 Review/证据段记录」一致。
- Review（第一轮，L3 独立只读，`b4a3fd0..8533b87`，按问题域拆 R1 扩展侧 / R2 前端与契约两部分并行，协议三件套**故意重叠**给双方）：**整体 CHANGES_REQUIRED**（R1 PASS + R2 CHANGES_REQUIRED，按「任一为 CHANGES_REQUIRED 则整体从其严」计）。两份报告原文如下，未作任何压缩或改写。

# TASK-038 Review · R1 部分：扩展侧、权限与提取

## 只读身份与权限证据

本实例通过 `tools` 白名单只被授予 `Read` / `Grep` / `Glob`，**没有** `Write`/`Edit`/`NotebookEdit`，也**未授予** `Bash`。因此在运行器层面无法写文件、无法提交/推送/合并，本轮全程只有读取与检索调用。独立于实现者（唯一写入者 `coordinator`），无上下文继承。

- base = `b4a3fd0`，冻结候选 = `8533b87`（实现 SHA `540027e`）。
- 审查输入：`.../scratchpad/T038-R1-ext.patch`（1132 行 / 22 文件）完整读毕，并按要求跳过 `extension/package-lock.json`。
- 机械证据（CHECKS PASS、`profiles=contracts,extension,frontend`、`product_fingerprint=f6c1552…c268`）按 **NOT_RUN** 对待，本报告不声称验证过任何命令。

## 覆盖文件全集

patch 内已逐行读透：`README.md`、`extension/AGENTS.md`、`extension/README.md`、`extension/package.json`、`extension/popup.html`、`extension/tsconfig.json`、`extension/vite.injected.config.ts`、`extension/src/manifest.ts`、`extension/src/manifest.test.ts`、`extension/src/boundaries.test.ts`、`extension/src/shared/protocol.ts`、`extension/src/injected/extract.ts`、`extension/src/injected/extract.test.ts`、`extension/src/injected/relay.ts`、`extension/src/injected/relay.test.ts`、`extension/src/popup/{main,bridge,capture,popup}.ts`、`extension/src/popup/{capture,popup}.test.ts`、`frontend/src/features/capture/protocol.ts`（仅作扩展侧对照）。

patch 外为交叉验证而独立读取：`extension/vite.config.ts`、`extension/eslint.config.js`、`extension/package.json`（实物）、`extension/node_modules/defuddle/package.json`、`defuddle/dist/index.full.d.ts`、`dist/types.d.ts`、`dist/defuddle.js`（构造/`parse`/`parseAsync`/`parseInternal`）、`dist/index.full.js`（检索）。

---

## 核查结论要点

**权限最小性（重点 1）——通过。** `activeTab`/`scripting`/`storage` 三项**逐项都被真实使用**，无冗余：`scripting` 用于 `bridge.ts:21` 的 `executeScript`；`storage` 用于 `bridge.ts:24` 的 `chrome.storage.local.set` 与 `relay.ts:26` 的读取，确为必需（popup 打开新标签页后即被关闭，内容必须落存储中转）。`bridge.ts:9` 用 `chrome.tabs.query` 只取 `tab.id`、`bridge.ts:27` 用 `chrome.tabs.create` — 二者在 MV3 下**不需要** `tabs` 权限（无该权限时仅 `url`/`title`/`pendingUrl` 被抹去），所以没有申请 `tabs` 是正确且必要的最小化，`manifest.test.ts:56` 的 `not.toContain('tabs')` 与实现自洽。`activeTab` 的语义按 Chrome MV3 实际规则复核：点击工具栏图标（打开 popup）即构成一次调用，只对当前活动标签页授予临时主机访问，这正是本流程所需，`host_permissions`/`<all_urls>` 的替代方案确实严格更大。**这套组合我判断已经不能再小**。

**白名单门闩（重点 1 续）——仍然咬得住。** `manifest.test.ts` 的顶层键断言从 5 键诚实地改为 7 键的精确集合（`:37-45`），新增 `host_permissions`、`optional_permissions`、`externally_connectable`、`web_accessible_resources`、CSP 覆写、`background` 等**任何顶层键仍会变红**。新增的三条断言是实质加固而非稀释：`permissions` 精确等于三项；`content_scripts` 长度为 1、`matches` 精确等于 `[UI_ORIGIN + '/*']`，**并且额外断言 `expect(UI_ORIGIN).toBe('http://127.0.0.1:5173')`** —— 这一条关键，它堵死了「改 `UI_ORIGIN` 常量来偷偷放宽 matches 而测试仍绿」的洗白路径；再加一条 `EXTRACT_SCRIPT` 不得被声明为静态内容脚本。门闩没有被改成形同虚设。

**`extension/AGENTS.md` 底线——只增不减。** §3 三条底线逐字保留（`extension/AGENTS.md:20-22`：不引入第三方站点凭证、不绕过访问控制、不改 `security/local_access.py` 且不直连 `/api/v1`），一字未松。新增的 `:16`（浏览器范围）、`:23`（已授予 reach 逐条有据、明确「不申请 host_permissions/`<all_urls>`」）都是**新增约束**。白名单条目 `:24` 从「五个」放宽到「七个」是必要且**诚实**的：它列出了确切键名，而非模糊化。`boundaries.test.ts` 新增的两条源码扫描（禁 `/api/v1`、`127.0.0.1:8000`；禁 `chrome.cookies`/`document.cookie`/`cookieStore`/`webRequest`）把两条原本只能靠人眼守的底线变成了会报警的机械门闩，且带 `sources().length >= 6` 反恒真守卫（当前实为 8 个源文件），是本轮的正向增量。

**注入链路与依赖上下文（重点 4 + 依赖问题）——设计正确。** `defuddle` 只被 `extract.ts` 引用，因此只会被打进 `dist/extract.js` 这**一个**产物；`relay.js` 与 popup 产物都不含它。`extract.js` 仅在用户点击后经 `chrome.scripting.executeScript` 注入，运行在**隔离世界（isolated world）**，不是页面主世界：它能读页面 DOM，但页面 JS 拿不到它，且 IIFE 的全局名 `StudyPilotExtract` 落在隔离世界的 global 上，不会泄漏给页面。构建入口与格式与 `package.json:16` 的 `build` 脚本一致（"共读文件对 3" 核对通过）：主 `vite build` 先以 `emptyOutDir: true` 产出 popup，随后两次 `-c vite.injected.config.ts --mode extract|relay` 以 `emptyOutDir: false` 追加 `dist/extract.js`、`dist/relay.js`，名字与 `manifest.ts:34-35` 及 `bridge.ts:21` 相符；顺序正确，不会互相清空。`vite.config.ts` 仍从 `src/manifest.ts` 单一来源生成 `dist/manifest.json`，测试断言的就是构建发货的同一模块，无第二份可漂移。

关于 `defuddle` 的供应链定级（我的独立判断）：它是一个**零权限基线扩展的第一个运行时依赖**，因此定级不能只看包本身，要看它落在哪个上下文。落点是隔离世界的内容脚本，那里可以访问 `chrome.runtime` 与 `chrome.storage`（扩展已申请 `storage`），因此**一旦该包被投毒，攻击者可读取 `pendingCapture` 暂存的正文，并可在用户点击过的那一页里注入元素做外发**；但由于**没有任何 host_permissions**，它无法跨源读取响应，攻击面被 activeTab 的「一次点击、一个标签页」显著收窄。我复核了实物：`defuddle/full` 是 webpack 自包含浏览器 bundle，**bundle 内没有任何 `require(`/`node:`/`fs`/`child_process` 引用**，`commander`、`linkedom` 等不可达，即不会有 Node 代码进入产物；对 `new Function`/`eval` 的检索唯一命中是 LaTeX 宏字符串 `\eval`/`\evaluated`（temml 的数学宏表），**不是 JS 动态求值**，不会撞 MV3 的 CSP。综合定级：**中等且已被架构收窄，非阻断**；主要控制手段是 `npm ci` 的锁文件钉死与升级时的重新审查。

**"不发网络请求"这一用户可见承诺——对本候选成立，但只是偶然成立。** `defuddle` 的 `DefuddleOptions` 明确提供 `useAsync`（"allow async extractors to **fetch content from third-party APIs**"，**默认 true**）与 `fetch` 覆写，其 `index.full.js` 内含大量 `fetch(` 调用点。我据 `dist/defuddle.js` 复核：`defuddle.js` 自身**零个** `fetch(` 调用点，全部 16 处分散在 `fetch.js`/`extractors/_base.js`/`youtube|reddit|bilibili|x-oembed|c2-wiki` 中，**只经 `extractAsync()` 到达**，而 `extract.ts:14` 调用的是同步 `parse()`，同步方法无法 await 这些路径。故根 `README.md:252` 的「它不发网络请求」对 `8533b87` **是真的**。但见 F2。

**测试是否咬得住（重点 5）——按代码判断，能变红，且实现者自述的那条空断言确已被真正修好。** `capture.test.ts` 的 `unusable` 四例中，假 bridge 的 `inject` 会**同步**调用 `deliver(bad)`，`extracted` promise 因此在 race 前就已 resolve，必然走到 `capture.ts:33` 的 `isCapturePayload` 失败分支；测试又**显式断言 `reason: 'unusable'`** 而非只断言「没开确认页」，这正好使「悄悄退化成 timeout 分支」不可能再无声发生。其余关键用例逐条验过可变红：调用顺序 `['subscribe','inject','stash','open','unsubscribe']`（把先订阅后注入的顺序改反即红）、`inject-failed`、`timeout`（用 `NOTHING` 哨兵，`deliver` 永不被调用，是真超时）、`no-tab`（`calls` 为空）。`relay.test.ts` 的 5 条拒收 + 4 条坏暂存均绑定真实输入并附 `storage.get` 未被调用的断言。`extract.test.ts` 跑真实 `defuddle` + jsdom，断言是「正文必须在、噪声必须不在」的实质断言而非 `toBeDefined()` 式空壳。**我没有找到同类空断言。**唯一接近恒真的是 `manifest.test.ts:57-58` 的 `not.toContain('tabs'|'cookies')`——在其上一行精确相等断言已通过的前提下它必然为真，但它不制造虚假信心（真正的门闩是精确相等那一条），属无害的意图注释。

---

## Findings

### 必须修复（阻断）

**No blocking findings.**

### 可记录后继续

**F1 — 文档漂移门闩覆盖不到根 README，而根 README 正是四处宣称之一。**
`extension/src/boundaries.test.ts:40-43` 的 docs 门闩只读 `../README.md` 与 `../AGENTS.md`，即 `extension/README.md` 与 `extension/AGENTS.md` **两份**；但该测试自身的注释（`:38`）写的是「三处宣称」，而任务口径是四处。我实测根 `README.md`：`:252` 对权限清单与「不发网络请求」的陈述**准确**，但它写的是「只匹配**本机 UI 源**的内容脚本」，**不含字面的 `http://127.0.0.1:5173/*`**——因此即使把它塞进门闩的 docs 列表，当前写法也会直接失败。
触发：将来任何一次 manifest 权限/匹配源变更，只要作者只改了 `extension/` 下两份文档，根 README 就会静默停在旧口径，测试全绿。
影响：根 README 是普通用户最先读到的权限承诺；口径滞后属隐私陈述失准。这与 TASK-037 阻断项 F1 是同一条链（"宣称范围 > 门闩实际覆盖范围"），本轮**没有重演 F1 本身**（本轮各处宣称与实物一致，我逐条比对过），但**留下了同一条链上的机械覆盖缺口**。
最小修复：把根 `README.md` 纳入 `boundaries.test.ts` 的 docs 列表（路径 `../../README.md`），并把 `:252` 的「只匹配本机 UI 源」补成「只匹配本机 UI 源 `http://127.0.0.1:5173/*`」；同时把该测试注释里的「三处」改为与实际读取的份数一致。
分类：**可记录后继续**（当前无口径失准，属预防性门闩缺口；修复成本约三行）。

**F2 — `defuddle` 的 `useAsync` 默认为 true，"不发网络请求"未被任何显式开关或测试钉死。**
`extract.ts:14` 未传 `useAsync: false`；该承诺当前仅由「调用了同步 `parse()` 而非 `parseAsync()`」这一实现细节保障（我已核实 `defuddle.js` 同步路径无 fetch 调用点）。
触发：升级 `defuddle`、或将来有人把 `parse()` 改成 `parseAsync()` 以支持 YouTube/Reddit 抽取、或上游把 fire-and-forget 请求挪进同步路径。
影响：扩展会向第三方 API 发出请求（可能携带用户正在阅读的页面 URL），直接推翻根 `README.md:252`、`extension/README.md`、`extension/AGENTS.md` 中面向用户的绝对承诺；因无 host_permissions，跨源响应读不到，但请求本身仍会外发，属隐私陈述失准。当前发生概率为零。
最小修复：`extract.ts:14` 改为 `new Defuddle(doc, { url, markdown: true, useAsync: false })`，并在注释中写明「这一行是『不发网络请求』这条用户承诺的落点」。成本一行。
分类：**可记录后继续**（强烈建议本轮顺手修，因为它把一条偶然为真的用户承诺变成结构性为真）。

**F3 — `extension/AGENTS.md` §3 内部存在字面自相矛盾：`:25` 禁止「不记录用户正文」，`:23` 又授权把正文暂存进 `chrome.storage.local`。**
`bridge.ts:24` 确实把整篇采集正文写入 `chrome.storage.local` 的 `pendingCapture`。`:23` 明确授权（"暂存一份待交付内容，交付即删"），`relay.ts:16-18` 也确实在校验**之前**就 `remove`，因此坏数据同样会被清掉，实现是稳妥的。但 `:25` 那条不变量自 TASK-037 一字未改，两条并列会让后续 Agent 可以各取所需地援引。另有一处真实残留：若用户点了采集却再也不打开 `/capture`，这份正文会**无限期留在扩展 profile 的磁盘上**，直到下次采集覆盖或下次 relay 触发。
触发：下一位改扩展存储的 Agent 援引 `:25` 或 `:23` 中任一条。
影响：模块不变量可被两向解释；以及未交付正文的磁盘滞留。
最小修复：把 `:25` 改为「除 §3 已授权、交付即删的 `pendingCapture` 暂存外，不在扩展存储中持久化…」，并在 `extension/README.md` 隐私段落用一句话告知用户「未确认的采集会暂存在扩展本地存储中，下次采集或下次打开确认页时清除」。
分类：**可记录后继续**。

### 可选建议

- **S1** `manifest.test.ts` 只锁了 `content_scripts[0]` 的 `matches`、`js` 与数组长度，**未锁该条目的键集合**。新增嵌套键 `world: 'MAIN'`、`all_frames`、`exclude_matches`、`match_origin_as_fallback` 都**不会**让顶层白名单变红；当前唯一拦阻是 `manifest.ts:29` 手写 `Manifest` 类型的多余属性检查，而那个类型就在同一文件、放宽只需一行。影响有限（内容脚本只跑在自家 UI 源上），但门闩宣称的是「任何新增键都会失败」，严格说只对顶层成立。建议加 `expect(Object.keys(manifest.content_scripts[0]!).sort()).toEqual(['js','matches','run_at'])`。同理，`extension/README.md` 与 `AGENTS.md` 中「新增任何键都会让测试失败」建议写成「任何新增**顶层**键」。
- **S2** `bridge.ts:21` 用字符串字面量 `'extract.js'` 而非 `manifest.ts:35` 已导出的 `EXTRACT_SCRIPT`。同时构建产物文件名来自 `vite.injected.config.ts` 的 `mode`（`${mode}.js`），于是 "extract.js"/"relay.js" 在仓库里有**三处独立拼写**，没有任何测试把它们绑在一起（`manifest.test.ts` 只对 `POPUP_PAGE` 做了 `existsSync`）。重命名入口会产出指向不存在文件的 manifest，且测试全绿、只在实机加载时暴露。建议 `bridge.ts` 改用 `EXTRACT_SCRIPT`，并导出 `ENTRIES` 后加一条断言其键与两个常量一致。
- **S3** `defuddle` 的 `parse()` 在克隆前会对**用户的活文档**做两处轻微改写：`defuddle.js:53-56` 的 `_normalizeAttributes(this.doc.body)` 与 `_resolveNoscriptImages(this.doc.body)`。所有删除/清理都发生在 `defuddle.js:794-797` 的 `cloneNode(true)` 副本上，**用户页面不会被掏空**，但 `srcSet→srcset` 一类属性归一化与 noscript 懒加载图替换会落在实页上，理论上可能在 React/Vue 页面引发一次 hydration 抖动或图片跳变。文档一律称「只读取」，建议在 `extract.ts` 注释里如实标注这一处非只读副作用。
- **S4** `extract.ts:29` 的 `chrome.runtime.sendMessage` 没有 `.catch()`。MV3 popup 会在失焦时关闭；若用户点击采集后立刻点向别处，唯一的接收端消失，会在页面控制台留下未处理的 rejection，整次采集静默丢失（无数据泄漏）。鉴于「TASK-038 采集全流程尚待首次实机确认」，建议加 catch 并在实机验证时专门试一次这个时序。
- **S5** `relay.test.ts:35` 的 `postMessage` mock 只捕获第一个实参，`relay.ts:21` 的 `targetOrigin`（`win.location.origin`）**没有任何断言**；改成 `'*'` 不会有测试变红。同源自投场景下不可利用，但这是信任边界上的参数，值得断言。
- **S6** `vite build -c vite.injected.config.ts --mode extract|relay` 用 `--mode` 传入了非 `production` 的模式名，这会影响 Vite 的 `isProduction` 判定与 `process.env.NODE_ENV` 替换值，可能让 `extract.js` 走上 defuddle 的 development 分支（体积/日志差异，非安全问题）。若实机确认时发现产物异常大或控制台有调试输出，先查这一点。**我未运行构建，此项属推断，不作为 finding。**

---

## 覆盖与缺口

**已看透**：权限最小性与 `activeTab` 的 MV3 实际语义、内容脚本 matches 的可放宽性、`manifest.test.ts` 门闩的实际咬合力、四处宣称与实物的逐条比对、`extension/AGENTS.md` 三条底线的存废、注入链路的执行上下文与数据流向、构建入口与 `build` 脚本的一致性、扩展侧全部新增测试的可变红性、`defuddle` 的产物落点与网络能力可达性。

**明确缺口（未读或未读透，不猜测）**：

1. **`extension/package-lock.json` 完全未读**（按任务指令排除）。因此「228 包、resolved 全部指向官方 registry、无 `file:`/`git+`、唯一 `hasInstallScript` 为 `fsevents`」**纯属实现者自述抽查，我未做任何独立核实**，报告中不得当作已验证。我独立核实的只有 `package.json` 的依赖清单本身，以及 `defuddle/full` 产物内不含 Node 代码。注意 `defuddle` 声明了 4 个 `optionalDependencies`（`linkedom`/`mathml-to-latex`/`temml`/`turndown`），npm 默认会安装它们——它们进入了本机 `node_modules`（开发机供应链面），但**不进入扩展产物**。若主 Agent 需要完整供应链结论，应就锁文件补派一次定向审查。
2. **`defuddle/dist/index.full.js` 只做了定向检索**（`fetch(`/`eval`/`new Function`/Node 内置模块/凭证 API），**未逐行审读**这个压缩 bundle，也未审 `markdown.js` 的 HTML→Markdown 转换是否会在极端输入下产生异常输出。对一个第三方 bundle 而言逐行审读不现实，这是接受依赖时的固有残留。
3. **所有机械检查按 NOT_RUN 处理**：我未运行 `npm run test`/`typecheck`/`lint`/`build`。`extract.test.ts` 依赖真实 `defuddle` 在 jsdom 下的行为，我只能判断其**断言是实质的**，无法判断其**当前是否通过**——这一点必须由 CHECKS PASS 证据承担。
4. **`extension/dist/` 产物未检视**（未构建，且产物不入库）。IIFE 全局名不泄漏给页面、`extract.js` 自包含 defuddle 等结论来自配置与源码推理，**未经实机或产物验证**。
5. **R2 范围整体未覆盖**：前端 `/capture` 页与 `CapturePage.tsx`、postMessage 信任边界的前端侧校验、契约文档 §14、e2e 覆盖陈述、任务记录叙述。我只从扩展侧看了 `frontend/src/features/capture/protocol.ts`，确认它与 `extension/src/shared/protocol.ts` 的 `CAPTURE_READY`/`CAPTURE_PAYLOAD` 常量值、三个上限值与 `isCapturePayload` 逻辑**逐字一致**；但**两份定义之间没有任何构建或测试耦合，没有任何机械手段能在将来发现漂移**——是否需要一条跨目录的常量一致性检查，请与 R2 的结论合并判断。
6. 明示非目标（图片冻结、Firefox/Safari、A4 契约清单漂移、`validate_governance.py` 第二份清单）未审，按要求不作为 findings。

## 剩余风险

1. 采集全流程**从未实机运行过**（文档自述 TASK-037 只在 Edge 验证过弹窗加载，Chrome 未实测，TASK-038 全流程待首次确认）。activeTab 授予时机、popup 失焦关闭的时序（S4）、`chrome.storage` 中转握手在真实 React 挂载时序下是否可靠，都只有单测覆盖。
2. 第一个运行时依赖引入后，供应链面从零变为非零，且落在能访问 `chrome.storage`/`chrome.runtime` 的内容脚本上下文中；控制手段仅有锁文件钉死，且锁文件本轮未经独立审查（缺口 1）。
3. 协议双份定义无构建耦合，漂移只能靠人守（缺口 5）。
4. 未交付的采集正文会滞留在扩展本地存储磁盘上（F3）。

## 结论

**PASS**

覆盖边界：本结论**仅覆盖 R1 问题域**（扩展侧、权限与提取），且以上述「覆盖与缺口」为限——特别是 `package-lock.json` 的供应链完整性**未经我独立核实**，全部机械检查按 NOT_RUN 计。核心四项（权限最小性、四处宣称口径一致性、`extension/AGENTS.md` 底线存废、白名单门闩是否仍咬得住）我已逐条看透，**均无阻断项**：权限组合已不能再小且逐项有真实使用，`activeTab` 语义与实现者描述相符，内容脚本匹配源被 `UI_ORIGIN` 字面断言双重钉死，TASK-037 的门闩被诚实放宽而非架空，TASK-037 阻断项 F1 未重演。F1/F2/F3 三项建议按「可记录后继续」处置，其中 F2 与 F3 的修复各约一行、建议本轮顺手做。本任务的完整 Review 结论须与 R2 报告合并后才成立。

# TASK-038 Review · R2 部分：前端、信任边界与契约

## 只读身份与权限证据

我作为独立子 Agent 运行，工具白名单仅 `Read` / `Grep` / `Glob`：无 `Write`/`Edit`/`NotebookEdit`，无 `Bash`（因此也无法 git 操作、无法提交/推送/切分支、无法运行任何检查）。这是运行器层面的真实只读，非声明式承诺。我独立于实现者（`coordinator`），无上下文继承。本轮未写入任何文件。

**base** `b4a3fd0` → **candidate** `8533b87`（实现 SHA `540027e`）。机械证据（CHECKS PASS、`profiles=contracts,extension,frontend`、`product_fingerprint=f6c1552…268`、六项变异验证）按 **NOT_RUN** 处理，我未运行也未复核其执行事实；下文所有判断均出自源码静态分析。

## 覆盖文件全集

patch 内 8 文件全部逐行读完：`docs/contracts/API与数据契约基线.md` §14（新增 42 行）、`extension/src/shared/protocol.ts`、`extension/src/injected/relay.ts`、`frontend/src/features/capture/{protocol.ts,CapturePage.tsx,CapturePage.test.tsx}`、`frontend/src/shell/{Screen.tsx,pages.ts}`。
交叉验证另读（工作树，未在 patch 内）：`backend/.../resources/contracts.py`、`.../resources/snapshots.py`、`frontend/src/features/resources/api.ts`、`frontend/src/App.tsx`、`frontend/src/test/render.tsx`、`frontend/src/features/resources/fixtures.ts`、`extension/src/injected/extract.ts`、`extension/src/popup/{capture.ts,bridge.ts,popup.ts}`、`extension/AGENTS.md`、`frontend/AGENTS.md`、`docs/tasks/TASK-038-extension-capture.md`、`TASK-037-extension-baseline.md`（相关段）、`docs/tasks/任务索引.md`、`frontend/src/styles.css`（类名存在性）、全 `frontend/src` 的 HTML 汇聚点检索。

---

## 核查重点逐条结论

### 1. postMessage 信任边界 —— **成立，未找到可用绕法**（最高优先级，明确结论）

`frontend/src/features/capture/protocol.ts:510-517` 的 `capturedFrom` 我逐条推演过实现者点名的每一种绕法：

- **`event.source === window` 能否被伪造**：`source` 由浏览器按 HTML 规范的 incumbent settings object 填写，脚本无法设置，`MessageEvent` 构造函数只在**页面自己 dispatchEvent** 时可控（那已等价于同窗口代码执行）。
- **iframe**：子框架调 `parent.postMessage(...)`，incumbent 是子框架的 global，接收端 `event.source` 是 iframe 的 `contentWindow` ≠ `window` → 拒。同源子框架若想伪造，须先在父窗口执行脚本，那已是同源代码执行，越过任何 JS 层校验。
- **`window.opener` / `window.open`**：无论跨源还是同源，opener 发来的消息 `source` 是 opener 窗口 ≠ 本窗口 → 拒。攻击者拿到 `/capture` 的 window 句柄也只能作为发送方出现。
- **其它信道**：`MessagePort`/`BroadcastChannel`/`ServiceWorker.client.postMessage` 的 message 事件不派发到 `window` 的 `message` 监听器（前二者派发到 port/channel 对象，后者到 `navigator.serviceWorker`），不构成旁路。
- **隔离世界**：这一条实现者问得对——`source === window` 证明的是「消息由**本窗口内运行的脚本**发出」，**不是**「由 StudyPilot 扩展发出」。内容脚本虽在隔离世界，共享同一个 Window，故 `source === window` 成立；同理，**任何**对 `127.0.0.1:5173` 有访问权的第三方扩展的内容脚本同样能满足。这不是缺陷：能在该源注入内容脚本的扩展本就能直接替用户点击按钮，不构成权限升级；而**远程网页无法在该窗口内执行脚本**，正是这道校验要挡的对象，它挡住了。
- **结构校验被骗**（原型污染 / getter / `toString`）：`postMessage` 走结构化克隆，接收端拿到的是接收方 realm 的纯数据对象，getter/Proxy/自定义原型都无法穿过；`__proto__` 反序列化用 CreateDataProperty，不触发 setter。`isCapturePayload`（:499-507）先 `typeof !== 'string'` 全部拒非字符串，无对象注入面。

**唯一实现层面的瑕疵**（不构成漏洞，见可选建议 O1）：`isCapturePayload` 校验的是解构出的**副本**，`capturedFrom` 返回的却是原对象 `envelope.payload`，`CapturePage.tsx:342-346` 之后又重新读取属性——这在有 getter 的世界里是 TOCTOU，但结构化克隆使其在真实浏览器中不可达（仅在测试的 `dispatchEvent` 路径下可构造）。

**纵深防线我独立核实为真**：全 `frontend/src` 检索 `dangerouslySetInnerHTML|innerHTML|new Function|eval(` **零命中**；唯一的 URL 出链 `ResourceDetail.tsx:106-111` 的 `href` 走 `safeWebUrl`（`api.ts:419-432`，拒 `javascript:`、空白、控制字符、`#`、凭据）。因此契约 §14.3 末段「即便以上全部被绕过，攻击者也只能让确认页预填一段文字」**属实**——被注入的文本没有任何 HTML/JS 汇聚点，最坏后果限于文本预填 + 用户误点。

### 2. 「必须用户确认才写入」 —— **守住，未发现任何非点击写入路径**（明确结论）

`createResource` / `putResourceSnapshot` 在 `CapturePage.tsx` 中**只有一处调用**（:377,:382），位于 `save()` 内，`save` 只被 `<form onSubmit={save}>`（:424）引用。全文件两个 `useEffect`（:334 生命周期标志、:349 注册监听 + 发 READY）均无写入；消息处理器 `receive`（:341-347）只 `setState` 预填。无自动提交、无错误重试（半成功分支只 `setPartial`，:387）、无定时器。竞态：`busy.current` 在 `await` 前同步置位（:371），且 `fieldset disabled={pending}`（:425）在挂起期间禁用提交按钮，重复提交双重挡住。扩展侧 `capture.ts:27-66` 的 `runCapture` 也确实不写入，只 stash + 开页。

### 3. 协议三处一致性 —— **一致；三个长度数字我独立核对无误**

我不采信记录的行号引用，直接读了后端：`contracts.py:50` 标题 `max_length=200`、`contracts.py:68` `source_url` `max_length=2048`、`snapshots.py:8` `SnapshotContent` `max_length=1_000_000`（且 `min_length=1` + `not_blank`）。三处（`extension/src/shared/protocol.ts:112-116`、`frontend/.../protocol.ts:483-487`、契约 §14.2 表）**数值与语义完全一致**，`isCapturePayload` 两份实现逐字等价，`CAPTURE_READY`/`CAPTURE_PAYLOAD` 字符串一致。`extract.ts:21-23` 在提取端就按同样上限截断，所以「超长导致整条静默丢弃」不成立。
**但 URL 的格式约束三处都不足**，见 F1。

### 4. 契约 §14 与授权面扩大 —— **判定成立，不阻断**（这是与 TASK-037 判据方向相反的一次修订，我按其原文逐条判）

TASK-037 沉淀的判据原文（`TASK-037-extension-baseline.md:431,746`）我已核对，其阻断情形是「**为让已写进去的东西合法而扩写授权**」，其安全性论证的机制是「收窄绝不可能放行未经审查的产品变化」。据此对本次扩大逐条核：

1. **动因是外部既有规则，不是本任务的产物**：`extension/AGENTS.md:31` 逐字写着「与 UI 页面之间的消息格式属跨模块契约，须在相应任务中与 `frontend/` 一并定义并写入契约文档；不得由本模块单方面约定」。该规则在 TASK-037 已合并冻结。不扩 `allowed_paths` 就必然违反自己模块的嵌套规则——这与「为既成事实追认」有实质区别。
2. **风险面被 diff 形态本身限死（我从 patch 独立核实，非采信记录）**：契约文件的 hunk 是 `@@ -697,3 +697,45 @@`，**零删除、零改写**，§14 纯追加于文件末尾，既有条款一字未动；§14.1 明确写明第 7 节本机访问门禁一字未改。因此这次扩大**没有**放行任何未经审查的既有契约变更。
3. **被"追认"的对象正在本次审查范围内**：§14 描述的协议就是本候选交付的协议，它与实现同处一个 diff、同受这次 Review 覆盖，不存在"绕过审查取得合法性"的空间。

**我未能核实的一点（如实标注）**：记录理由①称该修订发生在任何实现写入之前。我无 Bash/git，**无法验证 `allowed_paths` 修订提交与实现提交 `540027e` 的先后**。建议由主 Agent 或 Acceptance 用一条 `git log` 确认；即便时序相反，上述 1、2 两条仍独立成立，我的结论不变。
按任务交代的处置口径：我**不**建议"删掉文档保留代码"——那恰恰会违反 `extension/AGENTS.md:31`。

### 5. e2e 边界陈述 —— **诚实；测试可以变红，非恒真**

记录 完成条件 11 与 已知限制 1 都明确写「Playwright 驱动不了扩展」「本记录中的任何组件测试都不得被称作端到端验证」，`CapturePage.test.tsx` 全篇用 `dispatchEvent` 构造消息，无一处自称 e2e。**未发现把组件测试说成端到端验证。**
断言可红性我逐条推演：伪造用例（:207-223）的**第二条**断言 `queryByRole('form', {name:'确认采集内容'})).not.toBeInTheDocument()` 在 `await waitFor` 之后执行，此时 React 的同步 lane 微任务已冲刷，若删掉 source/origin/结构任一校验，表单会出现 → 变红；六个用例分别绑定 `source`、`origin`、缺字段、空白正文、`javascript:` scheme、非对象载荷，与被测输入真实绑定。正向用例（:196-205、:225-267）用 `findByDisplayValue`/断言 POST body 等于采集内容，构成有效的"正反配对"，使负向用例不至于恒真。写入断言 `request.mock.calls.filter(([, options]) => options?.method)).toEqual([])` 虽弱，但确实会因任何写请求变红。前端 380 − 基线 369 = 11，恰等于本文件的 11 个用例（3 + 6 + 2），口径自洽。
**注意第一条断言 `await waitFor(() => expect(getByText(空态)))` 本身近似恒真**（空态在 deliver 之前就在，waitFor 首次同步检查即通过），它不承担鉴别力——鉴别力全在紧随其后的 form 断言上。这不是缺陷，但值得记录（见 O2）。

### 6. 六条已知限制 —— **基本如实；第 6 条覆盖不完整**

逐条核：①②与代码事实一致；③图片不冻结与 §14.5 一致；④⑤属 R1 范围，未复核。**第 6 条（两步写入非事务）**：`CapturePage.tsx:376-392` 确实产生"资料已建、正文未写"的状态，页面 :408-416 明确告知并给出去处、不自动重试，记录属实。但它**只覆盖了两个半成功状态中的一个**，且其补救指引与实际渲染冲突，见 F2、F3。

---

## Findings

### 必须修复（阻断）

**F1｜带 `#` 的网址会走完全程后在保存时必然失败，且用户无法修复 — `extension/src/injected/extract.ts:31` + `frontend/src/features/capture/protocol.ts:504` + 契约 §14.2（第 30 行）**

- **触发**：在任何 URL 含片段标识符的页面上采集（文档站锚点、GitHub/MDN 锚点、hash 路由 SPA）。`extract.ts:31` 用 `location.href` 原样作为 `url`，链路上（`capture.ts` → `bridge.ts:24` stash → `relay.ts:77` → `capturedFrom`）**无任何一处规整或去 fragment**（bridge/popup 我已读，确认无规整）。
- **影响**：`isCapturePayload` 只查 `^https?://`，放行 → 确认页正常预填 → 用户点「保存为资料」→ 后端 `contracts.py:74-86` 的 `"#" in value` 判定无效，返回 422 → `failureText`（`api.ts:444`）只显示「资料内容未通过检查，请检查输入的格式和长度。」。**页面不提供网址编辑框**，用户没有任何可行动作；此时扩展暂存已在交付时被 `relay.ts:75` 删除，本次采集的正文只能靠回原页重采。核心用例（完成条件 1/3）对一类常见页面直接不可用。讽刺的是页面**已经知情**：`CapturePage.tsx:399` 的 `safeWebUrl` 对含 `#` 的网址返回 null，页面只在 :429 印一句「该网址无法安全打开，仅显示文本」，却仍放用户去撞 422。
- **为何判必须修复**：触发条件常见、发生在已确认需求的主路径末端、无用户可执行的补救、且因"全流程从未实机跑过"没有任何其他环节会先发现它；修复成本极小。
- **最小修复**：在 `extract.ts` 取 URL 时去掉 fragment（`const u = new URL(location.href); u.hash = ''`，失败时回退原值），并把该约束同步进**三处**——两份 `isCapturePayload` 的 url 规则与契约 §14.2 的 `url` 行（应写明须满足 4.1 `source_url` 的全部规则：不含 `#`、空白、`\`、控制字符与凭据，而不只是 `http(s)://` 开头）。若认为「去 fragment 后就不是采集时的实际地址」与完成条件 3 有张力，请在记录中明写该取舍——后端契约本就不接受带 fragment 的 `source_url`。

### 可记录后继续

**F2｜半成功提示把唯一一份正文从屏幕上抹掉，而提示语要用户「粘贴进去」 — `frontend/src/features/capture/CapturePage.tsx:408-417`**
触发：POST 成功、PUT 失败。影响：`partial ? … : !captured ? … : form` 的三元使表单**整体被替换**，含正文的 textarea 消失；提示语「你可以打开它把正文粘贴进去」指向一份用户手里并不存在的剪贴板内容（扩展暂存已删、原页可能已关）。状态本身在 `markdown` state 里仍然存在，只是不再渲染。最小修复：半成功时保留（或只读展示）正文文本框，让提示语中的「粘贴」真的可执行。

**F3｜已知限制 6 只描述了两个半成功状态中的一个 — `docs/tasks/TASK-038-extension-capture.md:136`**
触发：POST 在服务端成功但客户端未拿到可解析响应（后端重启、`api.ts:87` 的 `INVALID_RESPONSE`）。影响：`created` 仍为 null，页面走普通错误分支（`CapturePage.tsx:390`），**不提示可能已创建一份孤儿资料**；用户重试即产生重复资料。记录只写了"第一步成功第二步失败"。最小修复：在已知限制 6 补一句该状态与其后果（或在错误文案中提示先去资料库确认）。

**F4｜`risk_reason` 与本候选事实矛盾 — `docs/tasks/TASK-038-extension-capture.md:8`**
`risk_reason` 仍写「不改后端、**不改契约**、不改 `local_access.py`」，而 `allowed_paths:18` 已含契约文件、§14 已交付，矛盾的解释写在 57 行的非目标段。触发：任何依据 `risk_reason` 复核授权面的读者/后续任务。影响：正是本任务链反复出问题的「宣称与实物不一致」，且方向是**宣称比实物窄**——读者会得出"本任务未触碰契约"的错误结论。处置：按 TASK-037 已背书的先例（`TASK-037…md:438`「保留原文 + EVIDENCE 记录更正」），**不要回头改冻结区原文**，在 EVIDENCE 记录这处更正即可；若选择改原文，则形成新候选。

**F5｜索引状态滞后 — `docs/tasks/任务索引.md:24`** 索引写 `READY`，TOML 写 `IN_PROGRESS`。与 TASK-037 第二轮 Finding 2 同型（当时判可记录后继续）。最小修复：EVIDENCE 写回时一并对齐（索引本行属证据段允许改动范围，零成本）。

### 可选建议

**O1** `frontend/.../protocol.ts:516` 返回 `envelope.payload` 原对象而非已校验的解构副本；真实浏览器有结构化克隆兜底，不可利用。建议返回 `{ title, url, markdown }` 副本，让"校验的即所用的"在代码层面自明（两份 protocol 同步）。
**O2** `CapturePage.test.tsx:221` 的空态断言不承担鉴别力（详见上文第 5 条），建议要么删除、要么改为在 deliver 后先 `await` 一次微任务再断言，避免后来者误以为它是那道防线的守护者。
**O3** `CapturePage.test.tsx:172-175` 的 `mount(handler?: Parameters<typeof api.request>[1] extends never ? never : unknown)` 是无意义的条件类型 + `void handler` 死参数，全部调用点都是 `mount()`。建议删成 `function mount() {…}`。
**O4** `CapturePage.tsx:399` 的 `link` 只用于决定是否印一句提示，从不渲染为链接；措辞「无法安全打开」易被读成"不影响保存"。与 F1 一并处理更自然。
**O5** 契约 §14 声明「改动须三处同步」，但 `extension/src/shared/protocol.ts` 还含 §14 未提的 `CAPTURE_EXTRACTED`、`PENDING_KEY`、`UI_ORIGIN`/`RELAY_MATCH`。建议在 §14 一句话说明哪些常量属契约、哪些属扩展内部，避免"改了该文件就必须改契约"的误判。
**O6** `extension/AGENTS.md:22` 写 `backend/src/studypilot/security/local_access.py`，而任务记录与实物是 `.../infrastructure/security/local_access.py`（路径漂移，可能属 R1 口径范围，供合并时判归属）。

---

## 覆盖与缺口

**已覆盖**：patch 内 8 文件全部；信任边界的全部已知绕法面；写入触发路径的全调用点；三处协议一致性与三个后端数字的独立核对；契约 §14 的越界/漏项与授权面判据；`CapturePage.test.tsx` 的可红性（静态推演）；六条已知限制中的 ①②③⑥；`/capture` 的路由与导航可见性（无 `section` → 不入 `primaryNavigation`/`moreNavigation`；旧导出 `navigation` 全仓无引用，注释与实物一致）；CSS 类名全部预先存在，故 `styles.css` 未改属合理。

**缺口（如实标注，未读或未读透）**：
1. **我未运行任何检查**，CHECKS PASS、380/44 tests、六项变异验证均为记录自述，我只做了口径自洽性核对（如 380−369=11 恰等于本文件用例数），**不构成验证**。
2. **无 git 能力**：无法确认 `allowed_paths` 修订与实现提交的时序（见第 4 条）、无法确认候选 diff 的**全部 31 个文件**均在 `allowed_paths` 内。我只见到 8 个文件，**`docs/contracts/openapi-v1.json` 一字未改这一点我无法证实**（记录声称如此，且 `profiles` 含 `contracts` 与之相容）。**建议 Acceptance 明确核这两项。**
3. **R1 范围未审**：manifest 权限清单、`manifest.test.ts` 与 `boundaries.test.ts` 的门闩、Defuddle 提取实现与其测试、构建配置、四处宣称口径、`extract.js` 707 kB、扩展侧测试的可红性——均不在本报告结论内。我读 `extract.ts`/`capture.ts`/`bridge.ts`/`popup.ts` 仅为追 URL 数据流与写入触发点，**不构成对这些文件的审查**。
4. 已知限制 ④⑤（提取质量、产物体积）未复核，属 R1。
5. 明示非目标（图片冻结、Firefox/Safari、A4 清单漂移、`validate_governance.py` 第二份清单）按要求未审。

## 剩余风险

1. **同源框嵌/点击劫持**：任何网站都能把 `http://127.0.0.1:5173/capture` 放进 iframe（Vite 不发 `X-Frame-Options`/`frame-ancestors`），框内的 relay 会正常交付暂存内容，攻击者虽读不到（跨源），但可诱导用户误点「保存为资料」。危害限于本机库多出一条用户自己采集的资料，且这是**全站既有属性、非本任务引入**，故不列为 finding；建议记入长期风险台账。
2. **第三方扩展**：任何对 `127.0.0.1:5173` 有内容脚本权限的扩展都能满足 `source === window` 从而预填表单。因其已能直接代用户点击，不构成升级；但契约 §14.3 第 1 条的措辞（「跨源 opener 或 iframe」）容易让人误读为"只有本扩展能发"，建议将来补一句"本校验证明的是同窗口来源，不证明发送方是 StudyPilot 扩展"。
3. F1 未修前，一类常见页面的采集会在最后一步失败；F2 使半成功状态下的正文更难挽回。
4. 全流程从未实机跑过（记录已如实声明），完成条件 14 须由用户实测补记。

## 结论

**CHANGES_REQUIRED**（针对候选 `8533b87`，仅覆盖 R2 问题域）。

阻断项一条：**F1**（带 `#` 的网址走完全程后必然保存失败且用户无从修复，三处协议对 URL 格式的约束共同不足）。其余为 4 项可记录后继续 + 6 项可选建议。

最高优先级的两条我给出明确正面结论：**postMessage 信任边界成立**（未找到可用绕法，且"被绕过也只能预填文字"的纵深防线经我独立核实为真）、**「必须用户确认才写入」守住**（全文件唯一写入路径挂在表单提交上，无自动/重试/竞态旁路）。契约 §14 的授权面扩大我判**成立、不阻断**，理由是动因源于先在的 `extension/AGENTS.md:31` 且 diff 为纯追加零改写；其中时序一条我无法核实，已标注。

本结论**仅覆盖 R2**，须与 R1 对同一候选的结论合并方构成 TASK-038 的完整 Review；R1 若判 CHANGES_REQUIRED 或 BLOCKED，整体从其严。

- 第一轮 findings 的处置（代码修订 SHA **`4ed3062`**，记录更正 **`f274c05`**）：
  - **R2 F1（唯一阻断项）→ 已修，且修的范围比最小修复大。** 在 `extract.ts` 新增 `normalizeSourceUrl()` 于提取端去掉 fragment；**并把 URL 约束在三处协议定义里都换成后端 `source_url` 的完整规则**（新增共用的 `isSafeSourceUrl`：http(s) 开头、不含空白/控制字符/反斜杠/`#`、可解析且有主机名、不含凭据、长度上限），而不只是原来的 `^https?://`。只修 `extract.ts` 一处能让当前问题消失，但下一个人看到的仍是那个宽松版本；把规则写进三处才让它**保持**为真。契约 §14.2 的 `url` 行同步改写，并明写取舍：存下的地址可能不等于地址栏原文（少了 `#锚点`），这是必要的——后端本就不接受带 fragment 的 `source_url`，保留它只会让资料存不进去。
  - **R1 F2 → 已修，并加断言钉住。** `extract.ts` 提出 `EXTRACT_OPTIONS = { markdown: true, useAsync: false }`，注释明写「这一行是『扩展不发网络请求』这条用户承诺的落点」。**只加开关不加测试等于把一条偶然为真换成另一条偶然为真**，故另加断言：`EXTRACT_OPTIONS.useAsync` 必须为 `false`，且源码（剥注释后）必须含 `.parse()`、不得含 `parseAsync`。变异验证：两种改法各自变红（见「实现与测试」段第 7 项）。
  - **R1 F1 → 已修。** 文档漂移门闩纳入根 `README.md`（此前只读 `extension/` 下两份），根 README 补上字面的 `http://127.0.0.1:5173/*`，测试注释的份数与实际读取一致。R1 的判断很准：本轮各处口径都对，但**机械覆盖缺的恰是普通用户最先读到的那一处**。
  - **R1 F3 → 两半都修。** ① `extension/AGENTS.md` 的「不记录用户正文」改为明确 `pendingCapture` 暂存是唯一例外、交付即删；② **未交付正文滞留磁盘是真实的隐私残留**，`extension/README.md` 与根 `README.md` 都如实告知用户。这一条我原本没意识到。
  - **R2 F2 → 已修。** 半成功时保留只读正文框供复制，并把提示语改为「把**下面这段**正文粘贴进去」。原实现把唯一一份正文连同提示一起抹掉，提示语指向一个用户手里没有的东西。新增回归断言 `getByLabelText(/待粘贴的正文/)` 的值等于采集内容。
  - **R2 F3 → 已修。** 已知限制 6 补上第二个半成功状态（创建请求服务端成功但客户端未拿到可解析响应 → 不提示可能已产生孤儿资料 → 用户重试得到重复资料）。
  - **R2 F5 → 已修。** 索引与 TOML 状态对齐为 `IN_REVIEW`。
  - **R2 F4（`risk_reason` 说「不改契约」与实物矛盾）→ 不改冻结区原文，在此记录更正。** 采纳 R2 给出的首选处置与 TASK-037 已背书的先例：保留原文 + EVIDENCE 记录更正，信息量严格大于改写原文。**更正内容**：`risk_reason` 中的「不改契约」应读作「不改 `/api/v1` 的 HTTP 契约与 `openapi-v1.json` 快照」；本任务确实修改了 `docs/contracts/API与数据契约基线.md`，新增 §14 描述扩展↔UI 页面的 postMessage 契约，理由见「非目标」段。
  - **关于理由①的时序 → 已在 EVIDENCE 区外据实更正，未删除。** 派发会话用 `git log -S` 证伪：`allowed_paths` 里的契约那一条**首次出现在实现提交 `540027e` 中**，登记提交 `6891166` 不含它——授权面的扩大与实现代码在同一个提交里，**没有独立的前置控制面提交**。我在编辑器里确实是先改记录再写代码，但提交历史里没有这个先后，而我把它当事实写进了正当性论证的第一条。按建议改成如实描述而非删掉，以免读者不知道这里曾有过一个被证伪的论证。R2 事先声明「即便时序相反结论不变」，其 PASS 判定不受影响。**这是本任务链上第四次「宣称与实物不符」，而这次落在授权面的正当性论证里。**
  - **R1 S1/S2/S3/S4/S5 与 R2 O1/O2/O3/O4/O5/O6 → 全部处理。** 其中 S2 值得单说：`"extract.js"` 在仓库里原有三处独立拼写（manifest 常量、`bridge.ts` 字面量、构建配置的 mode），**没有任何测试把它们绑在一起**——改个入口名会产出指向不存在文件的 manifest 而测试全绿，只在实机加载时炸。已改用常量并加断言绑定三处。O4 随 F1 一并解决。
  - **R1 S6 → 实测不成立，不采纳其推断。** 它自己标了「未运行构建、属推断」。实测：产物中无 `process.env.NODE_ENV` 残留、无 `"development"` 字面量，且以 `--mode production` 重建得到**完全相同的 707.60 kB**。另记一项观察：产物内有 5 处 `console.log` 调用点（来自 Defuddle），**我未验证它们在 `debug: false` 默认值下是否可达**，记为观察而非结论。
  - **新增一道跨目录协议漂移守卫 —— 这是主 Agent 的决定，不是审查要求。** 准确情况：**R1** 在其「覆盖与缺口」第 5 条指出两份协议定义之间没有任何构建或测试耦合、漂移只能靠人守，并请与 R2 合并判断；**R2 独立核对了当前三处一致，但没有要求加机械检查**（其 O5 是另一件事）。也就是说两边都确认当前一致、都指出没有机械耦合，**但没有任何审查者要求加这条检查**。我判断它属「测试全绿但东西是坏的」那一族，值得一道门闩，故自行加了 `extension/src/shared/protocol.test.ts`：逐字比对两份 `isSafeSourceUrl` 与 `isCapturePayload` 的函数体、核对三个上限的数值、并先断言镜像文件确实存在（防止路径写错让整组变成空断言）。变异验证见「实现与测试」段第 9 项。
- Review（第二轮增量，L3 独立只读，`8533b87..1399037`，R1 / R2 各由**第一轮同一实例**复核并显式声明继承范围）：**整体 PASS**（R1 PASS + R2 PASS），第一轮的 CHANGES_REQUIRED 已解除。两份报告原文如下。

# TASK-038 Review · R1 部分增量复核

## 只读身份与权限证据

本实例的 `tools` 白名单仍只有 `Read` / `Grep` / `Glob`——**无** `Write`/`Edit`/`NotebookEdit`，**未授予** `Bash`。本轮全部调用均为读取与检索，运行器层面无法写文件、提交、推送或合并。仍独立于实现者（唯一写入者 `coordinator`）。

- previous_candidate = `8533b87` → **new_candidate = `1399037`**（代码修订 `4ed3062`）
- 增量输入：`.../scratchpad/T038r2-R1.patch`（502 行 / 17 文件）**逐行读毕**
- 机械证据按 **NOT_RUN** 处理：`check_task --candidate 4ed3062` CHECKS PASS、`files=32`、`product_fingerprint=f22c17db…`、extension 7 files / 78 tests、frontend 17 files / 382 tests，均由协调者从日志实读转达，**我未运行任何命令**。六项变异验证仍为实现者自述、无第三方复核。

## 继承声明

**我显式继承第一轮 R1 报告对 `b4a3fd0..8533b87` 的全部覆盖与结论**，包括：权限最小性（`activeTab`/`scripting`/`storage` 三项逐项被真实使用、无冗余、不能再小；未申请 `tabs` 是正确的最小化）、`activeTab` 的 MV3 实际语义核对、内容脚本 matches 不可放宽（`UI_ORIGIN` 字面断言堵死洗白路径）、`extension/AGENTS.md` §3 三条底线逐字保留、白名单门闩 5→7 键的诚实放宽、注入链路的隔离世界执行上下文、`defuddle` 只落在 `dist/extract.js` 单一产物、构建入口与 `build` 脚本一致、扩展侧测试可变红性。上述结论**未被本次增量推翻**——我逐个核对了增量触及的文件，没有一处削弱它们。

本轮新审的是 `8533b87..1399037` 的改动本身及受影响上下文。基线未变、架构未变、风险等级未变，因此按 AGENTS.md §6 走增量路径，不做完整复审。

## 增量覆盖文件（17 文件全读）

`README.md`、`extension/AGENTS.md`、`extension/README.md`、`extension/src/boundaries.test.ts`、`extension/src/manifest.test.ts`、`extension/src/injected/extract.ts`、`extension/src/injected/extract.test.ts`、`extension/src/injected/relay.test.ts`、`extension/src/popup/bridge.ts`、`extension/src/shared/protocol.ts`、`extension/src/shared/protocol.test.ts`（新增）、`frontend/src/features/capture/protocol.ts`（仅从扩展侧作镜像对照）。为交叉验证另读实物：`extension/src/manifest.test.ts:1-12`、`extension/src/injected/extract.ts` 全文，并 Glob 核实后端路径。

---

## 逐项处置复核

### F1（根 README 未纳入文档门闩）——已修，且修得比我给的最小修复更完整
`boundaries.test.ts:67-75` 把 docs 列表改为三份含 `{name, path}` 的显式条目，根 README 以 `../../README.md` 纳入。我核了会不会误红：`declared` = `['activeTab','scripting','storage','http://127.0.0.1:5173/*']`，而根 `README.md:252` 经本轮改写后**确实含全部四个字面串**（`http://127.0.0.1:5173/*` 由本轮补上）。三份文档均通过，**不会误红**。测试注释的份数也已改对。**F1 关闭。**

### F2（`useAsync` 默认 true）——已修，处置方式优于我的最小修复，两条断言我都核了能变红
`EXTRACT_OPTIONS = { markdown: true, useAsync: false }`（`extract.ts:26`），且 `extract.ts:55` 写作 `{ url, ...EXTRACT_OPTIONS }`——**展开在后**，所以 `useAsync: false` 不可能被 `url` 实参覆盖，顺序是对的。

- `expect(EXTRACT_OPTIONS.useAsync).toBe(false)`：**真能变红**。改成 `true` 红；整个删掉该键 → `undefined !== false` 红。这是导入真实值的行为断言，非源码扫描，最结实。
- `expect(source).toContain('.parse()')` / `not.toContain('parseAsync')`：**真能变红，且今天是因正确的理由通过的**。我实读 `extract.ts` 确认：`parseAsync` 在文件里出现两次（`:21`、`:23`），**都在 `/** */` 块注释内**，被测试的 `/\/\*[\s\S]*?\*\//g` 剥掉；`.parse()` 在 `:55` 是真代码。若有人改用 `parseAsync()`，两条断言会同时变红（`.parseAsync()` 不含子串 `.parse()`）。实现者「只加开关不加断言等于把一条偶然为真换成另一条偶然为真」的理由，我认同。

**关于「剥注释后检索源码」这种断言方式本身是否稳健**（协调者点名要我判断）：
- **误红方向是安全的。** 剥注释的正则 `/^\s*\/\/.*$/gm` 只吃整行 `//` 注释，**行尾注释不吃**——所以将来有人写 `const x = 1 // 别用 parseAsync` 会**误红**而不是漏红。同理 `readFileSync('src/injected/extract.ts')` 是 **cwd 相对**路径，换个工作目录运行会 ENOENT 直接失败，也是红。两处都朝失败方向偏，可接受。
- **但它挡不住有意规避。** `'parse' + 'Async'`、`d['parseAsync']()`、或把调用移到另一个文件，都能让断言保持绿。这是所有源码扫描门闩的固有上限；`boundaries.test.ts:5` 自己就诚实写了「属常见模式的辅助防线，不保证发现所有绕法」，而这条新断言的注释却写成「**这条断言就是那句承诺的看守**」，语气强于其实际保证力。真正的看守是 `EXTRACT_OPTIONS.useAsync` 那条值断言；源码扫描只是辅助。见 S8。
- 另一处范围限制：扫描只覆盖 `extract.ts` 一个文件。`defuddle` 目前也确实只被这一个文件引用，但把 `parseAsync` 扫描并入 `boundaries.test.ts`（它扫 `src/**` 全部源文件）会同时消除这个范围限制、并自动继承那份诚实的免责注释。见 S8。

**F2 关闭。**

### F3（`AGENTS.md` 字面矛盾 + 未交付正文滞留磁盘）——两半都修，且第二半修得到位
`AGENTS.md:27` 按我给的措辞改写，`不记录用户正文` 改为 `不记录用户笔记或凭据` 并写明 `pendingCapture` 是唯一例外、交付即删；矛盾消除。隐私残留在**两处面向用户的文档**如实告知：`extension/README.md:50` 与根 `README.md:252`（「你点了采集却没打开确认页时，那篇正文会暂存在扩展的本地存储里，直到下次采集覆盖它或下次打开确认页时清除」）。措辞准确，与 `bridge.ts:24` / `relay.ts:16-18` 的实际行为一致（relay 在**校验之前**就 remove，所以坏数据同样会被清掉）。**F3 关闭。**

### S1（内容脚本条目嵌套键未锁）——已修，门闩现已咬到内层
`manifest.test.ts:247-254` 新增 `Object.keys(manifest.content_scripts[0] ?? {}).sort()` 精确等于 `['js','matches','run_at']`。加 `world: 'MAIN'`、`all_frames`、`exclude_matches`、`match_origin_as_fallback` 现在都会变红。`?? {}` 的兜底使 `content_scripts[0]` 缺失时得到 `[]`，同样红——失败方向安全。**S1 的机械半边完全关闭**；文档里「新增任何键都会让测试失败」的措辞未改，但在顶层白名单 + 条目内层白名单 + `toHaveLength(1)` 三重之后，仅剩 `action` 的内层键未锁（`default_icon` 一类，无 reach 含义），残留过失已小到不值得再提。

### S2（`extract.js` 三处拼写无绑定）——绑定**部分**建立，仍有一处轴向未绑（见 P1）
`bridge.ts:21` 已改用 `EXTRACT_SCRIPT` 常量，`manifest.test.ts:256-272` 新增断言把 `EXTRACT_SCRIPT`/`RELAY_SCRIPT` 与 `vite.injected.config.ts` 的 mode 名绑起来，并用 `expect(bridge).not.toContain("'extract.js'")` 反向堵住回退到字面量。该测试用 `projectFile()`（基于 `import.meta.url`）解析路径，比 `extract.test.ts` 的 cwd 相对路径更稳健。**但绑定只覆盖了「入口名 ↔ 常量」这一轴，没覆盖「输出文件名模板 ↔ 常量」**——详见 P1。

### S3/S4/S5——均已处理，我核过
- S3：`extract.ts:50-54` 如实记录 `parse()` 在克隆前对活文档的两处属性归一化副作用，并在 `extension/README.md:49` 与根 `README.md:252` 向用户说明（措辞「页面内容不会被改动，但极少数情况下可能出现一次图片跳变」与我在 `defuddle.js:53-56` / `:794-797` 读到的实际行为**准确对应**：删除清理都在副本上，只有属性归一化落实页）。
- S4：`extract.ts:68-73` 加了 `.catch(() => undefined)`，注释解释了 popup 失焦关闭的时序且明确「没有数据外流」——判断正确。
- S5：`relay.test.ts:223-235` 现在捕获并断言 `targetOrigin === window.location.origin` 且 `not.toContain('*')`。改成 `'*'` 会变红。**真能咬住。**

### S6——我的推断不成立，撤回；`console.log` 那项观察的定性**恰当**
实现者以 `--mode production` 重建得到完全相同的 707.60 kB、产物内无 `process.env.NODE_ENV` 残留与 `"development"` 字面量。这是实测压过推断，**我撤回 S6**，707 kB 不再复报。

关于它顺带记的「产物内 5 处来自 Defuddle 的 `console.log`，未验证 `debug: false` 下是否可达 —— 观察不作结论」：**这个定性是恰当的，我确认。**它把「看到了什么」与「意味着什么」分开，没有把未验证的东西写成结论，正是应有的写法。我可补一个同样未做结论的旁证：我在 `defuddle.js` 读到的重试日志（`:61`、`:78`、`:84`、`:90`、`:99`、`:108`、`:115`）走的都是 `this._log(...)`，而 `_log` 受 `this.debug`（由 `options.debug || false` 得来，`EXTRACT_OPTIONS` 未设 `debug`）约束；另有一处裸 `console.error` 在 `:659` 的 `fetchAsyncVariables()` 内，属异步路径、不可达。所以「`debug: false` 下不可达」是**可能的**，但我**同样未验证**压缩产物里那 5 处的具体位置，不作结论。即便可达，影响也只是在用户自己那一页的控制台留几行噪声，不构成隐私问题。

### R2 的 F1（带 `#` 网址）——从扩展侧核：`normalizeSourceUrl()` 与 `isSafeSourceUrl()` 正确，且**顺带堵掉了一条真实的凭证外带路径**
- `normalizeSourceUrl`（`extract.ts:38-46`）用 `new URL()` + `url.hash = ''`。按 WHATWG 规范，把 `hash` 设为空串会将 fragment 置为 null，序列化后**不留尾随 `#`**，所以 `.../a#x → .../a`、`.../a?q=1#x → .../a?q=1`、`https://example.com/#/hash/route → https://example.com/` 四条测试用例的期望值我逐条验过**都正确**。不可解析输入走 catch 原样返回，随后必被 `isSafeSourceUrl` 拒，不会抛。
- `isSafeSourceUrl`（`protocol.ts:428-438`）的规则（http(s) 前缀 + 长度 + 禁 `[\s\\#]` + 禁控制字符/DEL + 可解析且有 hostname + 无 username/password）与注释宣称一致。我验了**不会误伤正常采集**：`location.href` 返回的是序列化形式，非 ASCII 路径、空格、IDN 主机都已被百分号编码或转 punycode，正常文章地址一律通过。
- **一个未被记录的正向效果，值得写进 EVIDENCE**：候选一的旧校验只是 `/^https?:\/\//`，会**接受** `https://user:pw@example.com/a`，于是站点的 basic-auth 凭证会被 stash 进 `chrome.storage.local`、经确认页写进后端 `source_url` 落库。新规则的 `!url.username && !url.password` 把这条路堵死了（payload 被判 unusable，`capture.ts` 在 `stash` **之前**就返回，扩展存储里什么都不会留）。这直接加固了 `extension/AGENTS.md:20` 的「不引入任何第三方站点凭证」不变量。R2 的 F1 是按后端 422 的角度提的，**这个安全副产品应当被显式记账**，否则将来有人为了「支持带凭证的内网地址」把它放宽时，不会知道自己拆的是什么。

### 跨目录协议漂移守卫（主 Agent 自主改动）——站得住，误红方向安全；两点建议见 P2/S7
按「无 finding 可对照的自主改动」审：
- **它自己站得住。** 两份手写的信任边界校验函数、无构建耦合、编译器发现不了漂移——这确实属于「测试全绿但东西是坏的」那一族，值得一道门闩。`protocol.test.ts:331-334` 先用 `toContain('export function isCapturePayload')` 钉住镜像文件确实找到了，防止下面几条退化成空断言，这个反恒真守卫是对的。
- **实质咬合力**：`shares the same validation rules verbatim`（`:354-368`）逐字比对两份 `isSafeSourceUrl` 与 `isCapturePayload` 的函数体（折叠空白后全等）。我把两侧函数体对照过，**当前完全一致**，测试今天会通过；任何一侧单独放宽校验都会变红。这是这组断言里最有价值的一条。
- **误红敏感度（协调者点名要我判断）**：中等，但**全部朝失败方向**，没有漏红风险。具体三处：(a) 消息名断言用 ``toContain(`export const ${name} = '${value}'`)``，对引号风格、类型标注、换行敏感——若前端加个 `: string` 标注就误红；(b) 函数体切片用 `indexOf('\n}')` 取第一个列 0 闭合花括号，当前两个函数的 `try/catch` 都是缩进闭合、只有函数本身在列 0，切得准，但将来出现列 0 结尾的嵌套结构会提前截断；(c) 切片**不剥注释**，所以函数体内的行内注释也必须两边逐字相同——而该测试自己的注释写的是「措辞可以不同，规则不能不同」，**这句与实现不符**，实际是措辞也不能不同。以上都是 2 秒可修的红，不会掩盖缺陷。
- **一个应当补记的边界事实**：这道门闩给 extension 引入了**测试期的跨目录依赖**——`frontend/src/features/capture/protocol.ts` 被移动/改名/删除会让扩展测试组变红。`extension/AGENTS.md:54` 写的是「两个顶层目录之间不建立构建耦合」，测试注释也据此辩护（不 import、不共享 `node_modules`、不依赖 frontend 产物），这个辩护**我认为成立**；但「测试期依赖」这个新事实没有写进 §6，将来有人重构前端目录时会被一个来自 `extension/` 的红搞懵。见 P2。

### `AGENTS.md` 后端路径更正——已核实正确
`security/local_access.py` → `infrastructure/security/local_access.py`（`:23` 与 `:36` 两处同步）。我用 Glob 核实实物路径为 `backend/src/studypilot/infrastructure/security/local_access.py`，**更正正确**，模块规则不再指向不存在的文件。

### 数字对账（我范围内的部分）
日志 `extension 7 files`：本轮新增 `shared/protocol.test.ts` 一个测试文件，加上原有 `manifest.test.ts`、`boundaries.test.ts`、`injected/extract.test.ts`、`injected/relay.test.ts`、`popup/capture.test.ts`、`popup/popup.test.ts`，**恰为 7**，与日志一致，也与「本轮只新增一个测试文件」自洽。`78 tests` 我**无法核实**（`it.each` 展开数需实跑），如实标注为未核。frontend 的 17 files / 382 tests 属 R2 范围，我不代核；只指出协调者转达的「实现者原写 18、日志实为 17」与「本轮无新增前端测试文件」一致——本轮前端只改了已有的 `protocol.ts`。

---

## 本轮新增 Findings

### 必须修复（阻断）

**No blocking findings.**

### 可记录后继续

**P1 — S2 的绑定只建立在「入口名」轴上，「输出文件名模板」轴仍未绑，原缺陷模式可在更深一层重演。**
`extension/src/manifest.test.ts:260-268` 断言 `EXTRACT_SCRIPT === 'extract.js'` 且 `vite.injected.config.ts` 含 `extract: {`。但产物实际文件名由该配置的 ``fileName: () => `${mode}.js` `` 决定，**这一行没有被任何断言绑定**。
触发：有人把 `fileName` 改成 `` `${mode}.bundle.js` ``（或加 `[hash]`）。ENTRIES 的键仍是 `extract`/`relay`，常量仍是 `extract.js`/`relay.js`，**全部测试保持绿**，而产出的 `dist/` 里是 `extract.bundle.js`，manifest 的 `js: ['relay.js']` 与 `executeScript({files:['extract.js']})` 双双指向不存在的文件。
影响：与 S2 原述完全相同——测试全绿、只在实机加载时才炸；而本任务的实机验证本就尚未做过。
最小修复：从 `vite.injected.config.ts` 导出 `ENTRIES` 与一个 ``outputName = (mode: string) => `${mode}.js` ``，测试改断言 `outputName('extract') === EXTRACT_SCRIPT`、`outputName('relay') === RELAY_SCRIPT`（`tsconfig.json` 已 include 该文件，导入无障碍）。这样三处拼写才真正收敛到一处。
分类：**可记录后继续**（低优先级；改 `fileName` 的概率很低，且改动者就在 ENTRIES 三行之外，但这正是 S2 想根除的那类「绿着炸」）。

**P2 — 新的跨目录测试依赖未写进 `extension/AGENTS.md` §6。**
`extension/src/shared/protocol.test.ts:324` 以 cwd 相对路径 `../frontend/src/features/capture/protocol.ts` 读前端源码。§6（`extension/AGENTS.md:54`）目前只说「两个顶层目录之间不建立构建耦合」，未提测试期依赖。
触发：前端重构移动 `features/capture/`，或有人从仓库根而非 `extension/` 启动 vitest。
影响：扩展测试组变红，红的原因来自另一个模块，排查成本高；且 §6 的现有措辞会让人误以为不存在任何跨目录关系。
最小修复：§6 补一句「例外：`src/shared/protocol.test.ts` 在**测试期**读取 `frontend/src/features/capture/protocol.ts` 源码文本以守护协议漂移；这不构成构建耦合（不 import、不共享 `node_modules`、不依赖其产物），但移动该前端文件需同步更新此路径。」另建议把该测试里的两处路径改用 `fileURLToPath(new URL(..., import.meta.url))`（与 `manifest.test.ts:9` 的 `projectFile` 同法），摆脱对 `process.cwd()` 的依赖。
分类：**可记录后继续**。

**P3 — `normalizeSourceUrl` 对超长网址静默截断，与同一轮新加的「超长必拒」规则自相矛盾，会存下错误的来源地址。**
`extension/src/injected/extract.ts:42` 返回 `url.href.slice(0, MAX_URL)`。而 `extension/src/shared/protocol.test.ts:386` 本轮新增了 ``['超长', `https://example.com/${'a'.repeat(3000)}`]`` 必须被 `isSafeSourceUrl` 拒绝的用例。
触发：采集一个 URL 超过 2048 字符的页面（长查询串的 SPA 分享链接、地图、OAuth 落地页等）。
影响：`slice` 先把 href 砍到 2048，得到的仍是「以 https:// 开头、无空白/`#`、可解析、有 hostname、无凭据」的字符串，于是**顺利通过 `isSafeSourceUrl`**，被 stash、预填、最终落库。`isSafeSourceUrl` 的长度规则**在这条真实路径上永远不会触发**。结果是资料的 `source_url` 存成一个被截断、点开打不开的地址——溯源信息静默错误。这是数据完整性问题，不是安全问题。
说明：此行为**继承自候选一，不是本轮引入的回归**；但本轮新加的拒绝规则与它同时存在却互不生效，使矛盾变得显性。
最小修复：`normalizeSourceUrl` 不再截断，直接 `return url.href`，把长度裁决交给 `isSafeSourceUrl`；这样超长地址会走 `unusable` 分支（诚实失败）而非静默存错。若希望失败提示更准确，可在 `outcomeText` 为「网址过长」单列一条文案，但那不是必须的。
分类：**可记录后继续**（低优先级：发生率低、影响限于单个字段；但修复成本一行，且能让本轮新增的测试用例真正对应到实际路径）。

### 可选建议

- **S7** `protocol.test.ts:356` 的注释「措辞可以不同，规则不能不同」与实现不符：函数体切片不剥注释，行内注释也必须两边逐字一致。建议把注释改成如实描述（「连函数体内的注释也必须一致——这是有意的，两边任何一处不同步都该红」），或在切片后加一次注释剥离。
- **S8** `extract.test.ts:119-132` 的源码扫描注释写作「**这条断言就是那句承诺的看守**」，语气强于其实际保证力：源码扫描挡不住 `'parse'+'Async'` 一类有意规避，真正的看守是紧邻那条 `EXTRACT_OPTIONS.useAsync` 值断言。建议照 `boundaries.test.ts:5` 的口径补一句「属常见模式的辅助防线，不保证发现所有绕法」；并考虑把 `parseAsync` 扫描并入 `boundaries.test.ts`——它扫 `src/**` 全部源文件，可同时消除「只扫一个文件」的范围限制，并自动继承那份免责注释。
- **S9** `normalizeSourceUrl` 不剥离 URL 中的凭据，靠 `isSafeSourceUrl` 拒收（这是**正确**的安全取舍，不要改成静默剥离）。但此时 popup 会显示「没能从这一页提取出正文。可以打开 StudyPilot 手工粘贴。」——正文其实提取成功了，失败的是网址。若日后 `outcomeText` 扩充，可为「网址不受支持（含凭据/过长/非 http(s)）」单列一条，让用户知道问题不在正文。极低优先级。

---

## 覆盖与缺口

**本轮已看透**：F1/F2/F3 与 S1–S5 的处置是否真正到位、新增五组断言各自能否变红及其误红方向、`normalizeSourceUrl`/`isSafeSourceUrl` 的正确性与对正常采集的无害性、跨目录漂移守卫的实质咬合力与失败模式、`AGENTS.md` 后端路径更正的事实性、扩展侧测试**文件数**与日志的一致性。

**明确缺口（不猜测、不填充）**：

1. **`extension/package-lock.json` 仍未读**，本轮亦无变动（协调者已用 git 核实零变动）。因此我第一轮标注的供应链缺口**范围未变、结论未变**：「228 包、resolved 全指官方 registry、无 `file:`/`git+`、唯一 `hasInstallScript` 为 `fsevents`」**至今仍是实现者自述抽查，无任何独立核实**。若需闭合，应就锁文件单独派一次定向审查。
2. **`78 tests` 未核**（需实跑展开 `it.each`）。我只核了 `7 files` 与实物一致。所有检查结论仍依赖 CHECKS PASS 证据承担。
3. **六项变异验证仍为实现者自述、无第三方复核**——我只能按代码判断断言「能否变红」，无法证明「实际跑过并红过」。
4. **`defuddle/dist/index.full.js` 仍只做定向检索、未逐行审读**；产物内那 5 处 `console.log` 的可达性我未验证（与实现者同）。
5. **`extension/dist/` 产物仍未检视**（未构建）。S6 的产物结论我采信实现者实测并撤回自己的推断，但**未独立复现**。
6. **R2 范围未覆盖**：`/capture` 页与 `CapturePage.tsx`、前端侧信任边界、契约文档 §14、e2e、任务记录叙述、frontend 的 17 files / 382 tests 对账。我只从扩展侧核了 `frontend/src/features/capture/protocol.ts` 的镜像一致性（当前逐字一致）。
7. 明示非目标（图片冻结、Firefox/Safari、A4 契约清单漂移、`validate_governance.py` 第二份清单）未审。

## 剩余风险

1. **采集全流程仍未实机运行过**——这是本任务最大的未验证面，且 P1 描述的正是一类「只在实机加载时才暴露」的风险。
2. **供应链面仍未经独立核实**（缺口 1），且依赖落点仍是能访问 `chrome.storage`/`chrome.runtime` 的内容脚本上下文；控制手段仅锁文件钉死。
3. 协议双份定义现已有测试期门闩守护，但该门闩本身对格式敏感（P2/S7），且依赖 cwd。
4. 未交付正文滞留磁盘的残留仍在（属已知并已向用户告知的设计取舍，非缺陷）。
5. 超长网址会被静默截断存库（P3）。

## 结论

**PASS**（指向新候选 `1399037`）

我第一轮提出的 F1/F2/F3 与 S1–S6 **逐条复核确认已妥善处置**，其中 F2 与 S1 的处置强于我给出的最小修复；S6 被实测推翻，我已撤回。主 Agent 自主新增的跨目录协议漂移守卫**站得住**，误红方向安全，不产生漏红。R2 的 F1 修复在扩展侧正确，并**额外堵掉了一条候选一中真实存在的站点凭证落库路径**，这一点应被显式记入 EVIDENCE。`console.log` 那项「观察不作结论」的定性**恰当**。

本轮新增 P1/P2/P3 三项**可记录后继续**与 S7/S8/S9 三项可选建议，**均不阻断**：无一触及安全底线、必要检查或已确认需求/契约，且都属低发生率、低影响、修复成本一到数行。

覆盖边界：本结论**仅覆盖 R1 问题域**（扩展侧、权限与提取），继承第一轮 R1 的全部其余覆盖，并以上述七条缺口为限——特别是 `package-lock.json` 供应链完整性至今**未经我独立核实**，全部机械检查按 NOT_RUN 计，变异验证无第三方复核。TASK-038 的完整 Review 结论须与 R2 对新候选 `1399037` 的结论合并后方能成立。

# TASK-038 Review · R2 部分增量复核

## 只读身份与权限证据

工具白名单仍只有 `Read`/`Grep`/`Glob`：无 `Write`/`Edit`/`NotebookEdit`、无 `Bash`（无法提交/推送/运行检查）。本轮全部调用均为读取与检索，未写入任何文件。同一 Reviewer 实例，延续第一轮 R2 上下文。

- previous_candidate `8533b87` → **new_candidate `1399037`**（代码修订 `4ed3062`，记录更正 `f274c05`）。
- 增量输入：`T038r2-R2.patch`（388 行 / 7 文件）全文读毕；另直接 Read 工作树 `docs/tasks/TASK-038-extension-capture.md`（TOML、非目标、实现与测试、EVIDENCE 处置段）、`docs/tasks/任务索引.md`、`extension/AGENTS.md` §3/§6。
- 机械证据（`CHECKS PASS`、`files=32`、`f22c17db…`、frontend 17 files/382 tests、extension 7 files/78 tests、十项变异验证）一律按 **NOT_RUN** 处理；主 Agent 转述的日志与 `git log -S` 结果我无法独立复核，下文凡引用均标明来源。

## 继承声明（显式）

**我继承第一轮 R2 对 `b4a3fd0..8533b87` 的全部其余覆盖**，并针对本次 diff 触及的部分重新验证：

- **信任边界（第一轮最高优先级结论：成立）——继承且强度只增不减。** `capturedFrom` 的三道校验（`source === window`、`origin`、信封 type）逐字未动；`isCapturePayload` 的 URL 分支由宽松改严格，是**单调收紧**；新增的"返回校验后副本"消除了原对象复用。第一轮对 iframe / opener / 隔离世界 / 结构化克隆 / 原型污染的推演不受影响，结论不变。
- **"必须用户确认才写入"（第一轮结论：守住）——继承。** `CapturePage.tsx` 本轮只改了半成功分支的渲染，新增的 `<textarea readOnly>` 在 `<div className="resource-error">` 内、**不在任何 form 内**，无 submit 面；`save`、`receive`、两个 `useEffect` 一行未动。写入调用点仍唯一。
- 协议三处一致性、§14 授权面扩大的判定、e2e 边界诚实性、已知限制 ①②③——继承，并按下文更新。

---

## 逐条核验

### F1（阻断项）→ **已实修，且修得比我给的最小修复更彻底；解除阻断**

三处我逐字比对：

1. `extension/src/shared/protocol.ts:247-257` 新增 `isSafeSourceUrl`，`isCapturePayload` 改为调用它；
2. `frontend/src/features/capture/protocol.ts:354-364` 的实现**与扩展那份逐字节相同**（我按行对齐比对过，无任何差异）；
3. 契约 §14.2 的 `url` 行已改写为"须满足 4.1 `source_url` 的**全部**规则"，并明写"采集端在提取时即去掉 fragment"这一取舍及其理由。

与后端 `contracts.py:74-86` 逐条对齐核验：`http(s)` 开头 ✓、`[\s\\#]` ✓、控制字符（`<32` 与 `127`）✓、可解析且有 hostname ✓、无凭据 ✓、长度 ≤2048 ✓。**根因也被堵住**：`extract.ts:71-79` 的 `normalizeSourceUrl` 用 `new URL()` 去 hash，顺带把空白/控制字符百分号编码、反斜杠归一，因此真实采集路径产出的 URL 恒满足新规则——F1 的"预填成功、保存必 422、用户无从修复"死路已不存在。

`protocol.test.ts:190-209` 的断言能变红：`isSafeSourceUrl` 的 7 条拒收用例（`#锚点`、空白、反斜杠、凭据、非 http、空主机、超长）与 3 条接受用例逐条绑定被测输入，删掉任一校验行都会有用例翻红；前端侧另加了 2 条伪造投递用例（`#锚点`、凭据），断言页面停在空态且不出现表单——鉴别力在 form 断言上，与第一轮结论一致。

### F2 / F3 / F5 → 均已实修

- **F2**：`CapturePage.tsx:326-334` 半成功时保留 `readOnly` 正文框，提示语改为"把**下面这段**正文粘贴进去"；`CapturePage.test.tsx:309` 新增 `getByLabelText(/待粘贴的正文/)).toHaveValue(captured.markdown)`，绑定被测输入、可红。✓
- **F3**：已知限制 6 改为并列**两个**半成功状态，第二种（服务端已建、客户端未拿到可解析响应 → 孤儿资料 + 重试重复）如实补记。✓
- **F5**：索引行与 TOML 均为 `IN_REVIEW`。✓（但索引行另有残留，见 N2）

### F4 → **按我的首选处置执行，核实无误**

`risk_reason`（`:8`）**原文一字未动**（我逐字对过第一轮抄录），更正写在 EVIDENCE 区（`:390`），明确"「不改契约」应读作「不改 `/api/v1` 的 HTTP 契约与 openapi 快照」，本任务确实改了中文契约文档"。符合 TASK-037「保留原文 + EVIDENCE 记录更正」的先例。

### 时序一条 → **对实现者不利的事实被如实写下，处理方式可复用**

`git log -S` 的结论（`allowed_paths` 的契约那条首次出现在实现提交 `540027e`，登记提交 `6891166` 不含它，**不存在独立的前置控制面提交**）我无 git 无法自证，采信主 Agent 转述。非目标 `:57` 的处理方式我核实过：**保留了被证伪的原论证并打上「此条初版陈述不实，经 git 证伪」的标记，而非删改**，并明写"本次修订的正当性因此不依赖时序，而依赖②③两条可独立核验的事实"。这正是我第一轮所依据的口径——我当时已声明"即便时序相反，1、2 两条独立成立，结论不变"，故 **§14 授权面扩大成立、不阻断的判定维持不变**。就其"事后追认"风险，我仍认为决定性的是那两条我亲自核过的事实：动因源自先在的 `extension/AGENTS.md:31`，且契约 diff 纯追加、零删除零改写。

### 主 Agent 自主新增的跨目录漂移守卫 → **方向正确、当前有效，但只覆盖一半**（见 N1）

作为当初核过"三处一致"的人，我的判断是：**这条守卫立得住，值得保留**。`protocol.test.ts:173-187` 比对的是两个校验函数的**函数体本身**（whitespace 归一后逐字比较），而不是行为抽样，这比我能想到的写法更强——任何一侧放宽规则都会让它红；`:150-153` 那条"先钉住镜像路径存在"的用例是有效的反空断言措施（路径写错时下面几条会静默变成空断言，它堵住了这一点）；上限比的是数值而非字面量，允许 `1_000_000`/`1000000` 两种写法，不会误红。变异第 9 项自述"放宽前端那份 → 扩展守卫 1 failed / 24 passed"，其中 **24+1=25 与我独立数出的 `protocol.test.ts` 用例数（1+2+3+1+3+7+1+7）完全一致**，口径自洽。

跨目录读取是否违反 `extension/AGENTS.md:54`「两个顶层目录之间不建立构建耦合」：我判**不违反**——`npm run build` 与 `dist/` 完全不依赖 frontend，node_modules 未共享，只有测试期一次 `readFileSync`。但 §6 的字面（含 `:53`「默认禁止…`frontend/**`」）没有为它留出说明，见 N3。

### 数字逐条对日志核（按要求，不只核它说了什么）

- **frontend 382**：382 − 380 = 2，恰为本轮 `CapturePage.test.tsx:289-290` 新增的两条 `it.each` 伪造投递用例（`#锚点`、凭据）；F2 的断言加在既有用例内不增计数。**自洽 ✓**
- **frontend 17 files**：本轮无新增前端测试文件（patch 可证），与第一轮 17 相同。**与更正后的说法一致 ✓**（原写 18 确为编造，已更正）
- **extension 7 files**：6 + `protocol.test.ts` = 7 ✓；**78 tests**：44 + 25（我数出的 protocol.test.ts）= 69，余 9 条须由 R1 侧新增用例解释（`extract.test.ts` 的 `useAsync` 断言、`EXTRACT_SCRIPT` 三处绑定、relay `targetOrigin` 断言等），**这 9 条不在我的覆盖内，请 R1/Acceptance 核**。
- **files=32**（第一轮 31 + `protocol.test.ts`）与 `openapi-v1.json` 零命中：采信主 Agent 的 git 核实，第一轮缺口 2 就此闭合，我自身仍未独立验证。

---

## Findings（增量）

### 必须修复（阻断）

**无。** 第一轮的唯一阻断项 F1 已实修并经我逐条核验。

### 可记录后继续

**N1｜漂移守卫只覆盖一个方向，而契约 §14 的措辞按"双向已被机器守住"来写 — `extension/src/shared/protocol.test.ts` + `docs/contracts/API与数据契约基线.md` §14（patch 第 14 行）**
触发：将来某个任务**只改** `frontend/src/features/capture/protocol.ts`（例如放宽 URL 规则）。影响：按任务记录 `:114` 对 `selected_profiles()` 的描述（按路径前缀选组），此时只会选中 `frontend` 组，**扩展组不运行，守卫不执行**，漂移全绿通过——而前端那份的改动频率远高于扩展那份，这恰是更可能发生的方向。契约里"使两份手写实现的漂移不再只能靠人守"这句写进了**契约基线**，强度高于实物，属本任务链第五次"宣称比实物宽"。
**未核实的前提（如实标注）**：我没有读 `scripts/governance/check_task.py`，profile 选择规则来自任务记录的自述，请 Acceptance 用一条实际选组验证。
最小修复（二选一，不要两者都不做）：① 在 frontend 测试里加一条对称守卫（反向 `readFileSync('../extension/src/shared/protocol.ts')`，约十行，使 §14 那句话成为真话）；② 保留单向守卫，但把 §14 与测试注释改成有条件表述（"该守卫随 extension 检查组运行；仅改前端那一份时不会被触发"）。

**N2｜F4 的同族矛盾在索引行仍在 — `docs/tasks/任务索引.md:24`**
TASK-038 行的末列仍写「不改后端、**契约**与安全门禁」，而本任务确实新增了契约 §14。触发：任何先扫索引再判断范围的读者/后续任务。与 F4 同一缺陷，但**索引本任务行属 EVIDENCE 写回明确允许改动的范围**，修复零成本、无冻结区顾虑。最小修复：随本报告的写回一并把该列改为「不改后端、`/api/v1` HTTP 契约与安全门禁；新增中文契约 §14（非 HTTP）」。

**N3｜`extension/AGENTS.md` §6 未为新出现的跨目录测试读取留出说明 — `extension/AGENTS.md:53-54`**
`:53` 写「默认禁止…`frontend/**`」、`:54` 写「两个顶层目录之间不建立构建耦合」，而 `protocol.test.ts` 现在会读 `../frontend/src/features/capture/protocol.ts`。我判定该读取不构成构建耦合（理由见上），但规则字面没有承认它，下一个人读 §6 会认为这条测试违规、或反过来据此认为"跨目录引用是允许的"。该文件本轮已在改（R1 F3 的处置），加一句成本极低。最小修复：§6 补一句「测试可只读跨目录的协议源用于漂移守卫；这不构成构建耦合，`build` 与 `dist/` 不依赖 `frontend/`」。

### 可选建议

**O7** `isSafeSourceUrl` 声称"与后端逐条对齐"，仍有三处细微不等：`/^https?:\/\/**i**` 大小写不敏感而后端 `startswith` 敏感（`HTTPS://…` 前端放行、后端 422）；`https://@example.com/` 的空 userinfo 前端放行、后端 `username is not None` 拒收；后端另有 `_ = parsed.port` 的端口合法性校验。**真实采集路径已被 `normalizeSourceUrl` 的 `new URL().href` 规整，三者均不可达**，残留只在伪造载荷下表现为一次 422，故不列为 finding；若要让注释里的"逐条对齐"完全为真，去掉 `i` 标志并改判 `url.username !== ''` 即可（注意 `safeWebUrl` 有同样的 `i`，改动需一并考虑既有手工录入路径）。
**O8** `normalizeSourceUrl:75` 对超长 URL 仍是 `slice(0, MAX_URL)`，会**静默存下一个被截断的错网址**（截断后仍通过所有校验）。此为第一轮就存在的行为、非本轮回归。建议超长时直接判不可用，让它像其它不可用情形一样早失败。
**O9** O4 的处置在**效果上**成立（URL 已不可能不安全，那句"无法安全打开"再也不会显示），但代码层面 `CapturePage.tsx` 的 `link` 与那个三元判断**成了不可达分支**——我逐条比对两个谓词确认 `isSafeSourceUrl(v) ⟹ safeWebUrl(v) ≠ null`。建议删掉该三元，或改为真正渲染一个指向原网页的链接（详情页已有先例）。
**O10** 守卫的两处脆弱点，均不影响当前正确性：① 两处 `readFileSync` 用的是**相对 cwd** 的路径，只在 `cd extension && npm run test` 下成立；② 函数体截取靠 `indexOf('\n}')`，依赖闭合大括号在第 0 列（当前两个函数都成立，`try/catch` 的内层缩进不会误伤）；③ 两个工程各自的 prettier 配置若将来分叉（引号/分号风格），逐字比对会**误红**。建议至少把 ①③ 记进测试注释。
**O11** `isCapturePayload` 收紧后，URL 不合规的采集会在 `capture.ts:58` 落到 `unusable` 分支，popup 文案说「没能从这一页提取出正文。可以打开 StudyPilot 手工粘贴。」——诊断不准但**失败在打开确认页之前、无数据残留、且给了可行的下一步**，严格优于修复前。建议将来给"网址不适合保存"单列一个原因码。

---

## 覆盖与缺口

**本轮已覆盖**：增量 patch 全部 7 文件逐行；F1 三处修复与后端规则的逐条对齐；新守卫的有效性、可红性与误红面；F2/F3/F5 的实修与断言绑定；F4 与时序更正的处理方式（含 `risk_reason` 原文未动的逐字核对）；本轮所有前端数字的自洽性；`extension/AGENTS.md` §3 的 `pendingCapture` 例外与残留披露（R1 F3 的处置，从契约侧核：§14.5 已同步告知，我认为披露充分）。

**缺口（未读或未读透，不做推测）**：
1. **我未运行任何检查**；`CHECKS PASS`、382/78、十项变异验证、`f22c17db…` 均为实现者自述且无第三方复核，我只做口径自洽核对，**不构成验证**。
2. **无 git**：`files=32`、`openapi-v1.json` 零命中、`git log -S` 的时序结论均采信主 Agent 转述；候选 `1399037` 的完整文件清单是否全部落在 `allowed_paths` 内我仍无法自证。
3. **未读 `scripts/governance/check_task.py`**：N1 关于"仅改前端不会触发扩展组"的前提是从任务记录自述推得的，**请 Acceptance 实证**。
4. **R1 范围未审**：`extract.ts` 本轮新增的 `EXTRACT_OPTIONS`（`useAsync: false`，我读到并认为是对"扩展不发网络请求"承诺的实质加固）、`sendMessage().catch()`、`extract.test.ts`、manifest/boundaries 门闩、构建配置、78 tests 中余下 9 条的归属——**均不在本报告结论内**。
5. 已知限制 ④⑤（提取质量、707.60 kB 与 5 处 `console.log` 的可达性）未复核，属 R1。
6. 明示非目标（图片冻结、Firefox/Safari、A4 清单漂移、`validate_governance.py` 第二份清单）按要求未审。

## 剩余风险

1. **N1 的单向守卫**：在补齐对称守卫或改写措辞之前，"前端单独改协议"这一最可能的漂移方向仍只能靠人守，而契约的措辞会让人以为不必。
2. 同源框嵌/点击劫持（第一轮已述，全站既有属性、非本任务引入）；第三方扩展可满足 `source === window`——后者本轮已被写进契约 §14.3 新增段，措辞与我第一轮的表述一致，**该残余风险现已在契约里公开**，我认可这一处置。
3. 全流程从未实机跑过（完成条件 14 须由用户实测补记）；`chrome.storage` 中未交付正文的滞留残留（已在 §14.5、`extension/AGENTS.md:25` 与两处 README 如实告知，属可接受的已披露残留）。
4. 创建资料与写快照非事务的两个半成功状态均已如实记录，客户端无法根治。

## 结论

**PASS**（针对新候选 `1399037`，仅覆盖 R2 问题域；显式继承第一轮 R2 对 `b4a3fd0..8533b87` 的全部其余覆盖）。

第一轮唯一阻断项 F1 已实修，且修复范围超出我给的最小修复（根因去 fragment + 三处协议统一 + 契约取舍明示 + 双侧用例），我逐条核验后解除阻断。F2/F3/F5 实修，F4 按我的首选处置且未动冻结区原文，被 git 证伪的时序陈述以"保留原论证 + 据实更正"的方式处理——这个处理方式本身值得沉淀。新增的跨目录守卫方向正确、当前有效，我背书保留。

本轮新增 **3 项可记录后继续（N1–N3）+ 5 项可选建议（O7–O11）**，**无阻断项**。其中 N1 请勿"两者都不做"：要么补对称守卫，要么把契约里那句话改成有条件表述。

本结论**仅覆盖 R2**，须与 R1 对同一候选的结论合并方构成 TASK-038 的完整 Review；R1 若判 CHANGES_REQUIRED 或 BLOCKED，整体从其严。EVIDENCE 写回本报告原文形成的后续提交属机械写回，不构成需再次审查的产品变化。

- 第二轮 findings 的处置（代码修订 SHA **`5574d5d`**）：
  - **N1（最要紧的一条）→ 修，选 R2 给的方案①。** 派发会话用 `check_task.py` 实跑证实了 R2 那个「未核实的前提」：`selected_profiles(['frontend/src/features/capture/protocol.ts'], [])` 只返回 `['frontend']`。**主 Agent 独立复跑，结果一致。** 也就是说只改前端那份协议时扩展组根本不运行，住在扩展侧的守卫不会执行——而前端那份改动更频繁，恰是更可能漂移的方向。契约里「漂移不再只能靠人守」这句**在最需要它为真的方向上是假的**。
    处置：前端补一道对称守卫（`frontend/src/features/capture/protocol.test.ts`）。**两侧机制有意不同**：扩展侧读前端源码做逐字比对（保证「两份一模一样」）；前端侧**不跨目录读文件**，改为把同一套规则逐条钉成行为断言（保证「这一份符合规格」）。之所以前端不用同样的逐字比对：Vite 的 `server.fs.allow` 不允许读项目根之外的文件（实测报 `Denied ID`），而放宽它要改 `frontend/vite.config.ts` —— **该文件不在本任务的 `allowed_paths` 内**，为一道守卫再次扩大授权面是不划算也不正当的。契约 §14 的措辞改成如实描述两侧机制与各自能发现什么。
    **一处过程记录**：改用 Vite 的 `?raw` 导入失败后，我一度以为测试通过了 —— 因为我的 grep 只过滤 `Tests`/`×`，而**整个套件加载失败不会以 `×` 出现**。是显式跑该文件才看到 `Test Files 1 failed`。此后所有复跑都改看 `Test Files` 行。
  - **P3 / O8（R1 与 R2 各自独立发现同一条）→ 修。** `normalizeSourceUrl` 不再 `slice(0, MAX_URL)`。实测确认过矛盾成立：截断到 2048 后的地址仍然「https:// 开头、无空白、可解析、无凭据」，**顺利通过 `isSafeSourceUrl`**，于是同一轮新加的「超长必拒」规则在真实路径上永远不会触发，库里会存下一个点开打不开的截断地址。改为不截断、交给校验诚实失败。
  - **P1 → 修。** 从 `vite.injected.config.ts` 导出 `ENTRIES` 与 `outputName`，`manifest.test.ts` 把**输出文件名模板**也绑上。此前只绑了入口名，把 `fileName` 改成 `` `${mode}.bundle.js` `` 会全绿通过而 manifest 指向不存在的文件——正是 S2 想根除的「绿着炸」。
  - **P2 / N3 → 修。** `extension/AGENTS.md` §6 明示测试期跨目录读取这一新事实（含「移动前端那个文件需同步更新此路径」的警告）；扩展侧守卫的两处路径改用 `import.meta.url`，摆脱对 `process.cwd()` 的依赖。
  - **N2 → 修。** 索引行末列的同族矛盾（「不改……契约」）已改为「不改后端、`/api/v1` HTTP 契约与安全门禁，但新增中文契约 §14」。
  - **O7 → 修。** `isSafeSourceUrl` 与后端逐条对齐：去掉 scheme 正则的 `i` 标志（后端 `startswith` 大小写敏感），并按后端的 `"@" in parsed.netloc` 改为直接拒 authority 段含 `@`（JS 的 `URL` 分不出「没有 userinfo」与「userinfo 为空」，而后端两者都拒）。两份实现同步修改，逐字守卫保证它们不会分叉。
  - **O9 → 修。** 删掉 `CapturePage.tsx` 中已不可达的三元分支与随之无用的 `safeWebUrl` 引用。
  - **O11 / S9 → 修。** 新增 `unusable-url` 原因码：正文提取成功但网址存不了时，popup 说「正文读到了，但这一页的网址存不了（含登录信息、片段标识符或过长）」，而不是误导性的「没能提取出正文」。
  - **S7 / S8 → 修，而且这两条都属「描述比实现更强」。** S7：守卫注释写「措辞可以不同，规则不能不同」，而切片不剥注释、行内注释也必须逐字一致——注释描述错了自己的实现，改成如实描述。S8：源码扫描断言的注释写「**这条断言就是那句承诺的看守**」，而它挡不住 `'parse'+'Async'` 一类有意规避——真正的看守是紧邻那条值断言；改准措辞，并把 `parseAsync` 扫描并入 `boundaries.test.ts`（扫 `src/**` 全部源文件，同时消除「只扫一个文件」的范围限制、继承那份诚实的免责注释）。**这两处出现在我为消除该问题而新写的代码里。**
  - **R1 要求显式记账的安全副产品 → 已记。** 候选一的旧 URL 校验只有 `/^https?:\/\//`，会**接受** `https://user:pw@example.com/a`；于是站点的 basic-auth 凭证会被 stash 进 `chrome.storage.local`、经确认页写进后端 `source_url` **落库**。为修 R2 的 F1 而加的完整规则把这条路堵死了（实测：旧校验对该地址返回 `true`，新校验返回 `false`）。**没有人是冲着凭证去的**——R2 从后端 422 的角度提 F1，主 Agent 从「让规则保持为真」的角度扩到三处，凭证是顺带堵上的。之所以要显式记账：**将来有人为了「支持带凭证的内网地址」把它放宽时，得知道自己拆掉的是什么。** 这条直接加固了 `extension/AGENTS.md` §3 的「不引入任何第三方站点凭证」。
  - **O10 → 部分采纳。** 已把「prettier 配置分叉会误红」与 cwd 依赖记进测试注释；函数体切片靠 `indexOf('\n}')` 这一条保持原样（当前两个函数都成立，且失败方向安全）。
  - **R2 留的 9 条无人认领的测试 → 已结清。** 用 `vitest --reporter=json` 实测逐文件对账，见「实现与测试」段；R2 数出的 25（`protocol.test.ts`）正确，余下的来自 `extract.test.ts`、`manifest.test.ts`、`relay.test.ts` 的新增用例。
- Review（第三轮增量，L3 独立只读，`1399037..0d4b9e7`，R1 / R2 各由同一实例复核并显式声明继承范围）：**整体 PASS**。两位 Reviewer 均按根 `AGENTS.md` §7 建议就此收敛，剩余项在承载报告的同一次写回里处理，不再另开轮次。两份报告原文如下。

# TASK-038 Review · R1 部分第三轮增量复核

## 只读身份与权限证据

`tools` 白名单仍只有 `Read` / `Grep` / `Glob`——**无** `Write`/`Edit`/`NotebookEdit`，**未授予** `Bash`。本轮全部调用均为读取与检索；运行器层面无法写文件、提交、推送或合并。仍独立于实现者（唯一写入者 `coordinator`）。

- previous_candidate = `1399037` → **new_candidate = `0d4b9e7`**（代码修订 `5574d5d`）
- 增量输入：`.../scratchpad/T038r3-R1.patch`（343 行）**逐行读毕**；其中落在我 R1 切片内的是 **12 个文件**（协调者核实的 18 文件增量中，其余 6 个为前端与任务记录文件，属 R2 范围）
- 机械证据按 **NOT_RUN**：`check_task --candidate 5574d5d` CHECKS PASS、`files=33`、`product_fingerprint=a92b486a…`、extension 7 files / 83 tests、frontend 18 files / 407 tests，均由协调者从日志实读转达。**我未运行任何命令**；六项变异验证仍为实现者自述、无第三方复核。

## 继承声明

**我显式继承前两轮 R1 对 `b4a3fd0..8533b87` 与 `8533b87..1399037` 的全部覆盖与结论**：权限最小性与不可再小的判断、`activeTab` 的 MV3 实际语义、内容脚本 matches 不可放宽（`UI_ORIGIN` 字面断言）、白名单门闩顶层 7 键 + 条目内层 3 键的双重咬合、`extension/AGENTS.md` §3 三条底线逐字保留、注入链路的隔离世界执行上下文、`defuddle` 只落 `dist/extract.js` 单一产物且同步 `parse()` 不发网络请求、构建入口与 `build` 脚本一致、F1/F2/F3 与 S1–S5 的关闭结论。**本轮增量未推翻其中任何一条**——我逐个核对了被触及的文件，无一处削弱。

本轮新审 `1399037..0d4b9e7` 及受影响上下文；基线、架构、风险等级均未变，故按 AGENTS.md §6 走增量路径。

## 增量覆盖（R1 切片 12 文件全读）

`extension/AGENTS.md`、`extension/src/boundaries.test.ts`、`extension/src/injected/extract.ts`、`extension/src/injected/extract.test.ts`、`extension/src/manifest.test.ts`、`extension/src/popup/capture.ts`、`extension/src/popup/capture.test.ts`、`extension/src/popup/popup.ts`、`extension/src/popup/popup.test.ts`、`extension/src/shared/protocol.ts`、`extension/src/shared/protocol.test.ts`、`extension/vite.injected.config.ts`。为交叉验证另读实物：`extension/src/manifest.test.ts` 全文、`frontend/src/features/capture/protocol.ts` 全文（镜像同步核对）、`frontend/src/features/resources/api.ts:419-432`（宣称核对）。

---

## 逐项处置复核

### P3（超长网址静默截断）——已修，且「超长必拒」终于对应到真实路径
`extract.ts` 的 `normalizeSourceUrl` 两个 `return` 都去掉了 `slice`，`MAX_URL` 也相应从 import 清单移除（必须移，否则 `noUnusedLocals` 会炸——这一步做对了）。我把真实路径完整走了一遍：3000 字符的 `location.href` → `normalizeSourceUrl` 原样返回 → payload 经 `chrome.runtime` 回传 → `runCapture` 的 `isCapturePayload(raced)` → `isSafeSourceUrl` 的 `value.length > MAX_URL` 命中 → false → 进入新的 `badUrl` 分支（markdown 是非空字符串 ✓、url 不安全 ✓）→ **`unusable-url`**，且 `stash` 与 `openConfirmPage` 都未被调用。

`capture.test.ts` 新增的 `['网址超长', …'a'.repeat(3000), 'unusable-url']` 这一行，正是我上轮指出「`protocol.test.ts` 的超长用例在实际路径上永不触发」的直接闭合——现在它在**编排层**被验证，而不只是在校验器层。**P3 关闭。**

### P1（输出文件名模板轴未绑）——已修，正是我指出的那一轴
`vite.injected.config.ts` 导出 `ENTRIES` 与 ``outputName = (mode) => `${mode}.js` ``，且 `fileName: () => outputName(mode)` 真正消费了它。`manifest.test.ts:85-91` 改为 `expect(ENTRIES).toHaveProperty(mode)` + `expect(outputName(mode)).toBe(script)`。

我验证的变红路径：把 `outputName` 改成 `` `${mode}.bundle.js` `` → `outputName('extract')` 得 `'extract.bundle.js'` ≠ `EXTRACT_SCRIPT` → **红** ✓。这正是我上轮举的那个反例。入口键轴由 `toHaveProperty` 保留 ✓，注入调用轴由 `bridge` 的正反两条字符串断言保留 ✓。**三条轴齐了，P1 关闭。**

附带核过：`manifest.test.ts` 现在 `import … from '../vite.injected.config'`，该模块顶层只调用 `defineConfig(fn)`（Vite 中对函数参数是恒等/仅类型作用，不执行该函数），无副作用；`vite` 是 devDependency、测试环境为 node、`tsconfig.json` 已 include 该文件，导入不会引入新问题。

残留（**不作为 finding**，仅记边界）：若有人绕开 `outputName` 直接写 `fileName: () => 'x.js'`，测试仍绿。但 `outputName` 的 JSDoc 已写明「导出它是为了让测试能把它和 manifest 里的常量绑在一起」，且 `build.lib` 只有 6 行，绕开属明确的有意行为。收益递减，不再要求。

### P2（跨目录测试依赖未记录 + cwd 依赖）——两半都修，路径我逐段验过
`extension/AGENTS.md:9` 在 §6 加了「一处明示例外」，写明测试期只读、不构成构建耦合、以及**移动前端文件需同步更新此路径否则扩展检查组会因另一模块变红**——这正是我担心的那个「被别人的改动搞懵」的场景，写到位了。

路径改用 `import.meta.url`，我逐段解析：`protocol.test.ts` 位于 `extension/src/shared/`，`new URL('../../../frontend/…', import.meta.url)` → `src/shared` →(../) `src` →(../../) `extension` →(../../../) 仓库根 → `<root>/frontend/src/features/capture/protocol.ts` ✓ **正确**；`projectFile('./protocol.ts')` → `extension/src/shared/protocol.ts` ✓ **正确**。该文件无 jsdom pragma、跑在 node 环境，`import.meta.url` 是 file: URL，用法安全。**P2 关闭。**

### S7 / S8（两处「描述强于实现」+ `parseAsync` 扫描并入）——已修，我核了并入后仍能变红且范围确实扩大
- **S7**：`protocol.test.ts` 的注释改为「**连函数体内的注释也必须一致** —— 切片不剥注释，这是有意的」，并主动补了已知脆弱点（两工程 prettier 配置分叉会误红，属 2 秒可修的红）。与实现相符，**准确了**。
- **S8**：`extract.test.ts` 里 `not.toContain('parseAsync')` 删除，改到 `boundaries.test.ts:21-29`，用 `sources().filter(path => /parseAsync/.test(code(path)))`。
  - **仍能变红**：把 `extract.ts:55` 改成 `.parseAsync()` → `code()` 剥注释后仍含 `parseAsync` → offenders 非空 → 红 ✓。同时 `extract.test.ts` 保留的 `toContain('.parse()')` 也会红（`.parseAsync()` 不含子串 `.parse()`），**双重覆盖**。
  - **今天为正确理由通过**：`extract.ts` 里 `parseAsync` 仅出现在 `EXTRACT_OPTIONS` 的 `/** */` JSDoc 内，被 `code()` 的块注释正则剥掉；本轮新增的 `normalizeSourceUrl` 注释是缩进 `//` 行，也被剥掉；其余 7 个源文件均无该词。
  - **范围确实扩大**：从只扫 `extract.ts` 一个文件，扩到 `src/**` 下全部 8 个非测试 `.ts`。`sources()` 排除 `*.test.ts`，而旧断言本来也只看非测试文件，**无覆盖损失**。免责注释已随之继承（明确写了挡不住 `'parse' + 'Async'` 一类有意规避，并指明真正的看守是 `EXTRACT_OPTIONS.useAsync` 值断言）。**S8 关闭，且比我建议的更完整。**

### S9 / O11（`unusable-url` 原因码）——逻辑正确，我对着七行用例逐条走过
`capture.ts:60-71` 的分支：`badUrl = markdown 是非空字符串 && (url 非字符串 || !isSafeSourceUrl(url))`。逐行核对新测试表：结构不对 → markdown 非字符串 → `unusable` ✓；正文空白 → trim 后为 0 → `unusable` ✓；正文超上限（url 合法）→ `unusable` ✓；`javascript:` / 带 `#` / 带凭据 / 超长 → 四条均 `unusable-url` ✓。健壮性：`raced` 为字符串或 `null` 时 `candidate?.markdown` 得 `undefined`，走 `unusable`，不抛 ✓。`popup.ts` 新文案与其余四条互异，`popup.test.ts` 的「每种原因文案都不同」断言由 4 扩到 5 ✓。**处置正确。**

### 凭证路径记账 + 本轮的进一步收紧
上轮我要求显式记账的那条（旧的 `/^https?:\/\//` 会接受 `https://user:pw@…` 从而把站点凭证 stash 并落库）已被记账。**本轮又往前走了一步，且这一步是对的**：`protocol.ts` 新增 `if (/^https?:\/\/[^/?#]*@/.test(value)) return false`。我验了该正则的边界——`https://user:pw@example.com/a` 拒 ✓、`https://@example.com/`（JS 里 `username === ''` 为假值，旧写法会**放行**）拒 ✓、`https://example.com/a@b`（`@` 在路径里）**放行** ✓、`https://example.com?x=a@b` 放行 ✓。既堵上了 `!url.username` 判不出「空用户名」的漏洞，又不误伤路径/查询里的 `@`。这进一步加固了 `extension/AGENTS.md:20` 的「不引入任何第三方站点凭证」。

同轮把 `/^https?:\/\//i` 的 `/i` 去掉，方向是**收紧**（只接受小写 scheme），与后端大小写敏感的 `startswith` 对齐；真实路径经 `new URL().href` 规整后 scheme 恒为小写，**不影响任何合法采集**，注释对此的说明准确。

### 协调者问题 1：N1 的处置有没有削弱扩展侧守卫？——**没有**
`protocol.test.ts` 本轮的 diff 只有三处：导入 `fileURLToPath`、`MIRROR`/`mine` 改用 `import.meta.url` 解析、以及注释改准。`body()` 的**逐字比对逻辑一字未动**，比对目标仍是两份 `isSafeSourceUrl` 与 `isCapturePayload` 的完整函数体（含体内注释）。扩展侧守卫**未被削弱**。

两侧机制有意不同（前端因 Vite `server.fs.allow` 不许读项目根外文件、且 `frontend/vite.config.ts` 不在 allowed_paths，改用行为断言）——我认为这个不对称是**站得住的**：受限方选择了在其约束内可行的等效目标，而不是去扩权改配置。这恰恰是没有为了对称而越界，符合 §5「不越任务 allowed_paths」。

更重要的是，我实读 `frontend/src/features/capture/protocol.ts:31-47` 确认：本轮的两处收紧（去 `/i`、加 `@` 规则）在前端副本上**逐字同步**，连注释都一模一样。所以扩展侧的逐字守卫**当前是绿的，且是因正确理由绿的**。本轮正好是「同时改动两份手写信任边界校验器」这一守卫存在的理由场景，它经受住了第一次真正的考验。

### 协调者问题 2：83 = 5+9+12+11+25+13+8 是否与我能看到的文件自洽？——**完全自洽，七个加数我全部独立推导出来**

| 文件 | 我数出的 `it` 数 | 构成 |
|---|---|---|
| `boundaries.test.ts` | **5** | 后端直连、cookie、**新增 parseAsync**、文档口径、非空扫描守卫 |
| `manifest.test.ts` | **9** | 实读全文：MV3、版本对齐 package.json、popup 存在、七键白名单、三权限、内容脚本源、条目内层键、注入名绑定、extract 不得静态声明 |
| `injected/extract.test.ts` | **12** | 4 基础 + 去 fragment 1 + `it.each` 4 + 不可解析 1 + 钉选项 1 + 空正文 1 |
| `injected/relay.test.ts` | **11** | 2 + `it.each` 5 + `it.each` 4 |
| `shared/protocol.test.ts` | **25** | 1 + 2 + 3 + 1 + 3 + 7 + 1 + 7 |
| `popup/capture.test.ts` | **13** | 1 + `it.each` 7（本轮由 4 扩到 7）+ 4 + 1 |
| `popup/popup.test.ts` | **8** | 1 + 1 + `it.each` 5（本轮由 4 扩到 5）+ 1 |
| **合计** | **83** | ✓ |

七个加数与协调者转达的分解**逐一对上**，总和 83 对上，文件数 7 对上，且两处增量（capture +3、popup +1、boundaries +1）与本轮 diff 精确一致（5 条新增 = 83 − 78 ✓）。**这条对账我给出独立确认。**

### 协调者问题 2 续：过程失误的描述是否如实、洞是否堵住？

**描述的机制我判定为如实**（在机制层面可核，非事后开脱）：Vitest 中模块级导入失败会被记为**收集期失败**，输出形如 `Test Files 1 failed | 6 passed`，并打印 "Failed to load" 块，**不会产生任何逐条 `×` 行**——因为根本没收集到用例。因此只 grep `Tests` 与 `×`，确实会看到其余文件汇总出的 "N passed" 而完全错过这次失败。这与它描述的现象完全吻合，不是编造的托词。但我必须如实标注：**我无法独立复现或审计它的命令历史**，只能确认所述机制成立。

**洞堵住了吗？部分堵住，真正堵住它的不是「改看 `Test Files` 行」这一条。**
- 看 `Test Files` 行确实覆盖了这次的具体失败模式（收集失败会显式计入 failed）✓。
- 但它**单独**不足：文件被改名而不再匹配 `src/**/*.test.ts` 会静默消失，`Test Files 6 passed` 照样是绿的——除非同时钉住**期望的文件数**。`it.skip`/`describe.skip` 同理，只在 `Tests` 行以 skipped 出现，grep "passed" 仍会漏。
- **真正堵住这一类的是它另外做的那件事：用 `--reporter=json` 逐文件对账测试数**。任何文件消失、收集失败或用例减少都会让分解对不上。这个控制比两种 grep 都强，我在上表中独立复算通过。
- 残留：这仍是**流程控制**，依赖操作者每次都做；仓库里没有任何机械断言钉住「7 files / 83 tests」。要机械化就得动 `scripts/governance/**`，而那是本任务的明示非目标，**我不要求本轮处理**，仅作为剩余风险记录。

关于它的自评「这和编造 18 files 是同一类：验证方式本身有洞」——**方向正确、值得肯定，但两者应当区分**：报 18 而日志是 17，是对**可核验证据的事实性错述**（AGENTS.md §2「不得伪造测试结果」直接管辖的那一类）；这次是**核验方法的覆盖缺口**导致的错误信念，是从真实但不完整的观察得出的。它抓住的共同点（检查方法自身有洞）是对的，也是有价值的教训。我要补一句同样重要的：**这两处都是它自己交代的，不是我查出来的**——这在诚信上是正面信号，但也意味着**我没有任何独立手段去界定还有多少同类问题未被自述**。这一点我如实写进剩余风险。

---

## 本轮新增 Findings

### 必须修复（阻断）

**No blocking findings.**

### 可记录后继续

**N-R1 — 本轮收紧了 `isSafeSourceUrl`，却使两份 `protocol.ts` 中「与 `safeWebUrl` 同规则」的宣称由真变假。**
路径：`extension/src/shared/protocol.ts:44`（以及镜像 `frontend/src/features/capture/protocol.ts:29`），两处 JSDoc 均写「规则：http(s) 开头；不含空白、控制字符、反斜杠、`#`；可解析且有主机名；不含凭据。**与 `frontend/src/features/resources/api.ts` 的 `safeWebUrl` 同规则。**」
实物：我读了 `frontend/src/features/resources/api.ts:419-432`，`safeWebUrl` **保留** `/^https?:\/\//i`（大小写不敏感）、**没有** authority 段 `@` 拒绝规则（只有 `!url.username && !url.password`——正是本轮注释亲自论证过的「判不出空用户名」的写法）、**也没有** `MAX_URL` 长度上限。本轮之前两者确实同规则；本轮把 `isSafeSourceUrl` 两处收紧后**只改了两份 protocol.ts，没有同步更正这句宣称**。
触发：任何后续 Agent 依据「同规则」推断改一处即可，或据此认为 `safeWebUrl` 已具备同等严格度。
影响：**不开新洞**——`safeWebUrl` 服务的是手工录入网址的展示防护，与采集路径无关，其宽松度是既有行为、本轮未改变。缺陷是**文档宣称强于实物**，正是本任务链上反复出现的那一类（TASK-036 A3、TASK-037 F1、本任务实现中途、我的 F1，这是第五次）。
最小修复：**只改注释，不要去动 `safeWebUrl`**（改共享的前端校验器属扩大范围，需独立风险判断）。把那句改为如实表述，例如：「规则比 `frontend/src/features/resources/api.ts` 的 `safeWebUrl` **更严**：多了 `MAX_URL` 长度上限、authority 段 `@` 拒绝，且 scheme 大小写敏感。`safeWebUrl` 服务手工录入网址的展示防护，未随本次收紧同步。」两份副本须同改。
分类：**可记录后继续**。

**N-R2 — 镜像守卫不覆盖 JSDoc，所以 N-R1 这类宣称漂移它抓不到。**
路径：`extension/src/shared/protocol.test.ts:59-63`，`body()` 从 `export function ${name}(` 起切片，**函数上方的 JSDoc 不在比对范围内**。
触发：只在一份副本上修改/更正函数上方的 JSDoc（包括修复 N-R1 时只改一边）。
影响：两份协议的**规则说明**可以无声分叉，而守卫全绿。函数体（含体内注释）已被覆盖，所以影响限于文档层，不涉及行为。
最小修复：把切片起点上移到 JSDoc 开头（从 `export function` 位置向前回溯最近的 `/**`），或额外加一条比对两份文件中该 JSDoc 块的断言。约五行。
分类：**可记录后继续**（低优先级；若采纳 N-R1 的修复，本条会让「两边同改」这件事变成机械保证而非人工纪律）。

### 可选建议

- **S10** `extract.test.ts` 现在只剩 `expect(source).toContain('.parse()')` 这一条还在用 cwd 相对的 `readFileSync('src/injected/extract.ts')`（P2 已把 `protocol.test.ts` 的两处改掉，这里因该文件跑在 jsdom 下未改）。既然 `parseAsync` 扫描已迁入 `boundaries.test.ts`，把这条 `.parse()` 正向断言一并迁过去最干净：`boundaries.test.ts` 跑在 node 环境、`sources()` 已经在读文件，迁过去可**消除扩展测试组最后一处 cwd 依赖**，同时让正反两条断言同处一地。顺带说明：注释里「jsdom 环境下 `import.meta.url` 不是 file: URL」这一条我**未独立验证**，迁走之后这个疑问也就不必再回答了。
- **S11** P3 修好了网址的静默截断，但**同一函数里 markdown 仍在 `extract.ts` 静默截断**（`.slice(0, MAX_MARKDOWN)`），于是 `capture.test.ts` 里「回传的正文超出后端上限 → `unusable`」那一行同样不对应真实路径（真实路径下正文已被砍到恰好 1,000,000 而通过）。与网址不同的是，截断正文是**可辩护的取舍**（存下 1MB 正文优于什么都不存，且后端上限就是 1MB），所以我**不建议改成拒收**；建议只做两件小事：在 `normalizeSourceUrl` 旁的注释里写明「正文与网址在此有意采取不同策略」，以及考虑在正文被截断时给用户一句提示。极低优先级。
- **S12** 「7 files / 83 tests」目前只靠人工对账维持，仓库内无机械断言。机械化需动 `scripts/governance/**`（本任务明示非目标），**本轮不要求处理**，仅建议在收尾时把这个期望值记进任务记录，供下一个扩展任务比对。

---

## 覆盖与缺口

**本轮已看透**：P1/P2/P3 与 S7/S8/S9 的处置是否真正到位及其变红路径、`unusable-url` 分支对全部七行用例的逐条正确性、`isSafeSourceUrl` 两处收紧的正确性与边界（含 `@` 正则的四组边界输入）、两份 `protocol.ts` 的实际同步状态（实读比对）、`vite.injected.config.ts` 导出被测试真实消费、`extension/AGENTS.md` §6 例外条款的准确性、83 测试的**全部七个加数**、`safeWebUrl` 宣称与实物的差异。

**明确缺口（不猜测、不填充）**：

1. **`extension/package-lock.json` 至今未读，三轮均零变动**。我第一轮标注的供应链缺口**范围与结论完全未变**：「228 包、resolved 全指官方 registry、无 `file:`/`git+`、唯一 `hasInstallScript` 为 `fsevents`」**仍是实现者自述抽查，无任何独立核实**。这是本任务贯穿三轮唯一始终未闭合的实质缺口；若要闭合需就锁文件单独派审查。
2. **`83 tests` 的实际执行结果未核**——我核的是「83 这个数与文件内容自洽」，不是「它们跑过且全绿」。全部检查结论仍由 CHECKS PASS 证据承担。
3. **六项变异验证仍为实现者自述、无第三方复核**；我只能按代码判断断言「能否变红」。
4. **后端 `contracts.py` 的 `parsed_url` 我未读**，因此「后端 scheme 判定是大小写敏感的 `startswith`」「后端拒 netloc 里的 `@`」两条注释的事实性我**未独立核实**。二者方向均为 fail-closed（扩展比后端更严不会造成漏放），故不作为 finding，但如实标注为未核。
5. **`extension/dist/` 产物仍未检视**（未构建）；P1 的绑定是在源码层验证的，`npm run build` 的实际产物名未经我确认。
6. **实现者所述的过程失误我只能确认机制成立，无法审计其命令历史**；且我无法界定还有多少同类问题未被自述。
7. **R2 范围未覆盖**：`/capture` 页与 `CapturePage.tsx`、前端侧信任边界与 N1 的行为断言、契约文档 §14、e2e、任务记录叙述、frontend 的 18 files / 407 tests 对账（我只注意到前端本轮 17→18 文件，与 N1 新增守卫自洽，但**由 R2 核**）。
8. 明示非目标（图片冻结、Firefox/Safari、A4 契约清单漂移、`validate_governance.py` 第二份清单、`scripts/governance/**`）未审。

## 剩余风险

1. **采集全流程仍未实机运行过**——三轮下来这仍是最大的未验证面。P1 修复的正是「只在实机加载时才炸」那一类，但修复本身也只在源码层被验证。
2. **供应链面三轮未经独立核实**（缺口 1），依赖落点仍是能访问 `chrome.storage`/`chrome.runtime` 的内容脚本上下文；控制手段仅锁文件钉死。
3. **证据可靠性依赖实现者自述**：两处已知的验证方法缺陷均为自报，且现有的逐文件对账是流程控制、无机械强制（S12）。
4. 协议双份定义的守卫已经受住一次真实同步考验，但其覆盖止于函数体，JSDoc 可无声分叉（N-R2），且对两工程 prettier 配置分叉敏感（已在注释中自陈）。
5. 正文超 1MB 时静默截断且不告知用户（S11，属有意取舍）。

## 结论

**PASS**（指向新候选 `0d4b9e7`）

我上一轮提出的 P1/P2/P3 与 S7/S8/S9 **逐条复核确认已妥善处置**，其中 S8 的处置强于我的建议（范围从单文件扩到全部源文件并继承免责口径），P1 三条轴全部绑定。协调者点名的两个问题我给出独立结论：**扩展侧逐字守卫未被削弱**，且两份 `protocol.ts` 本轮实际逐字同步、守卫因正确理由为绿；**83 测试的七个加数我全部独立推导并与分解逐一对上**。本轮新增的 `@`-in-authority 规则是一处正确且有实质价值的收紧，进一步加固了「不引入第三方站点凭证」这条底线。实现者对过程失误的描述在机制层面**如实**，改用逐文件对账确实堵住了那个洞（但堵住它的是对账，不是「改看 `Test Files` 行」）。

本轮新增 N-R1/N-R2 两项**可记录后继续**与 S10–S12 三项可选建议，**均不阻断**：无一触及安全底线、必要检查或已确认需求/契约；N-R1 不开新洞、修复只需改注释，N-R2 属文档层守卫缺口。

覆盖边界：本结论**仅覆盖 R1 问题域**（扩展侧、权限与提取），继承前两轮 R1 的全部其余覆盖，并以上述八条缺口为限——特别是 `package-lock.json` 的供应链完整性**三轮至今未经我独立核实**，全部机械检查按 NOT_RUN 计，变异验证无第三方复核。TASK-038 的完整 Review 结论须与 R2 对 `0d4b9e7` 的结论合并后方能成立。

# TASK-038 Review · R2 部分第三轮增量复核

## 只读身份与权限证据

工具白名单仍只有 `Read`/`Grep`/`Glob`：无 `Write`/`Edit`/`NotebookEdit`、无 `Bash`。本轮全部调用均为读取与检索，未写入任何文件、未提交、未推送。同一 Reviewer 实例，延续前两轮 R2 上下文。

- previous_candidate `1399037` → **new_candidate `0d4b9e7`**（代码修订 `5574d5d`）。
- 增量输入：`T038r3-R2.patch`（252 行 / 6 文件）全文读毕；另 Read 工作树 `docs/tasks/TASK-038-extension-capture.md`（TOML/实现与测试/变异段/EVIDENCE 处置段）与 `docs/tasks/任务索引.md`。
- 机械证据（`CHECKS PASS`、`files=33`、`a92b486a…`、frontend 18 files/407 tests、extension 7 files/83 tests、十三项变异验证、两条 `selected_profiles` 实跑输出）按 **NOT_RUN** 处理，均为转述，我未运行任何命令。

## 继承声明（显式）

**我继承前两轮 R2 对 `b4a3fd0..1399037` 的全部其余覆盖与结论**：postMessage 信任边界成立（iframe/opener/隔离世界/结构化克隆/原型污染逐条推演）、"必须用户确认才写入"守住、协议三处一致、三个后端上限、§14 授权面扩大成立且为纯追加、e2e 边界陈述诚实、六条已知限制、纵深防线（全前端无 HTML/JS 汇聚点）。针对本次 diff 触及处我重新验证：`isSafeSourceUrl` 两侧改动**逐字节相同**且**单调收紧**（新增 `@` 拒收、去掉 `i`），`capturedFrom` 与 `isCapturePayload` 的结构未变；`CapturePage.tsx` 只删除了不可达分支与其唯一 import，**未新增任何写入面**（`save` / `receive` / 两个 `useEffect` 一行未动）。上述继承结论无一被推翻。

---

## 本轮核心：N1 的处置是否真的满足了 N1

**结论：满足，我明确背书。** 判断不是基于它改了措辞，而是基于我对两个方向逐条推演的结果。

### 1. "删掉一条两边都有的规则"（放宽）——会红，且几乎逐条对应

我把前端 9 条拒收用例与 `isSafeSourceUrl` 的每一行做了映射：

| 校验行 | 对应用例 | 删掉后是否红 |
| --- | --- | --- |
| `/^https?:\/\//`（无 `i`） | `javascript:alert(1)`、`HTTPS://example.com/a` | **红**（第二条专门钉住"去掉 `i`"这次修复） |
| `value.length > MAX_URL` | 3000 字符 | **红** |
| `/[\s\\#]/u` | `#anchor`、`a b`、`\a` | **红**（三者删掉该行后都会一路走到 `new URL` 成功返回 true） |
| `/^https?:\/\/[^/?#]*@/` | `user:pw@…`、`https://@example.com/a` | **红**（关键：即便保留旧的 `!url.username`，空 userinfo 那条仍会漏过 → 用例仍红） |
| `new URL` 可解析 / hostname | `https://` | **红** |
| **控制字符行（`<32 || ===127`）** | **无任何用例** | **不红**（见 N5） |

三个上限另有 `describe('limits')` 直接钉死到后端数值。**除控制字符一行外，前端侧"这一份被放宽"的每一条都有机器守着**——而 N1 的原始担忧正是"前端单独被放宽而无人发现"，这个诉求已被满足。

### 2. "前端新增一条扩展没有的规则"（收紧）——**不会红**，这是替代方案的真实残余

行为断言只有 3 条 accept 用例（`https://example.com/a`、`http://example.com/a?q=1`、`https://example.com:8443/a`）。前端若新增一条不影响这三个样本的更严规则（例如"拒绝非标准端口""要求路径非空"），前端组全绿；而能发现它的逐字比对住在扩展侧，**只改前端时扩展组不运行**。此时两份在"前端更严"方向静默漂移，后果是扩展交付的合法载荷被页面静默丢弃、用户只看到空态且无解释——属 F1 那一族的"静默死路"，但明显更轻：不产生错误数据、不越安全边界、且需要有人主动只改一侧并加严。

### 3. 行为钉死 vs 逐字比对：能力差在哪

- 逐字比对能发现**任何**不同步（含收紧、含注释），但只能保证"两份一样"——**两份一起错它发现不了**；
- 行为钉死只能发现"被放宽到穿过某条用例"，但它把规则绑在**后端 `parsed_url` 的真实约束**上（每条拒收用例对应一条后端规则），**能发现"两份一起错"**。

两者互补，组合覆盖优于任一单独。所以我认为这不是"降格的替代"，而是各补对方盲区的组合；实现者不为一道守卫去扩 `frontend/vite.config.ts` 的授权面，这个取舍我**认同**——在它刚因扩大授权面被反复追问之后，为守卫再扩一次的代价确实高于收益。

### 4. 变异 11/12 按代码判断是否成立

- **第 11 项成立**（放宽前端 authority `@` 规则 → 前端 `protocol.test.ts` 红）。而且这个变异点选得准：它是本轮新加的规则，两条用例（`user:pw@`、空 `@`）分别锁住"有凭据"和"空 userinfo"，后者正是 O7 要补的那半条。
- **第 12 项成立**（放宽扩展那份 → 扩展侧逐字守卫红），且是双重的：逐字比对红 + 扩展自身的行为用例红。

### 5. 契约 §14 的新措辞是否与实际能力相符

前两句准确：「前者能发现『两份不一致』」✓、「后者能发现『这一份被放宽』」✓（除控制字符一行）。**最后一句"任一侧单独改动都会让对应的检查组变红"偏强**，见 N4。

---

## 其余处置核验

- **O7（三处细微不等）→ 逐条复核，两处已消除、一处经我重算为等效**：① `i` 标志两侧均已去掉 ✓；② 新增 `/^https?:\/\/[^/?#]*@/` 与后端 `"@" in parsed.netloc` **精确等价**——我验算过 `[^/?#]*` 恰好覆盖 authority 段（`https://example.com/path@name`、`https://example.com?x=@y` 均不误伤，与 `urlsplit` 的 netloc 边界一致）✓；③ 后端 `_ = parsed.port` 未显式复制，但 WHATWG `new URL` 对越界/非法端口本就抛异常并落入 `catch` → **效果等价，无需再改** ✓。两份实现仍逐字节相同（含新增注释），逐字守卫不会因此误红。
- **O9 → 已删** `link` 与那句不可达提示，连同 `safeWebUrl` 的 import 一并移除（无悬空 import）；`来自：{captured.url}` 保留。✓
- **O10① → 已修**：两处 `readFileSync` 改用 `fileURLToPath(new URL(..., import.meta.url))`，摆脱 `process.cwd()` 依赖 ✓；O10③（prettier 分叉误红）已写进测试注释并注明"2 秒可修的红，不会掩盖缺陷"，与我的评估一致 ✓。逐字比对"连注释也必须一致"的性质已在注释中如实说明（R1 的 S7 同一处）✓。
- **N2 → 已修**：索引行改为「不改后端、`/api/v1` HTTP 契约与安全门禁，但新增中文契约 §14（非 HTTP）」，与 F4 的 EVIDENCE 更正口径一致 ✓。
- **N3 → 属 R1，知情**；从 R2 角度只确认它与 §14 的表述不冲突。
- **O8/O11 → 不在我的 patch 内**（`extract.ts`/`capture.ts`/`popup.ts` 本轮未投给我），**未核**，见缺口。

## 数字逐条对账（按前两轮的做法，对着转述的日志核）

- **frontend 407 − 382 = 25**，恰为新 `protocol.test.ts` 的用例数：1(limits) + 3(accepts) + 9(rejects) + 1(copy) + 3(capturedFrom rejects) + 1(accepts payload) + 7(rejects payload) = **25** ✓
- **frontend 18 files** = 17 + 1 ✓，与"本轮只新增一个前端测试文件"自洽；**files=33** = 32 + 1 ✓
- **extension 83 的逐文件对账**：5+9+12+11+**25**+13+8 = 83，算术正确，且其中 25 与我第二轮独立数出的扩展 `protocol.test.ts` 用例数吻合；83 − 78 = 5 落在 R1 侧（O8/O11 的新用例），**不在我的覆盖内**。

## 关于那处自述失误的记录方式

**如实。** 记录 `:677` 写明了：`?raw` 失败后一度误判通过、根因是 grep 只过滤 `Tests`/`×` 而**整套加载失败不以 `×` 出现**、如何发现（显式单跑看到 `Test Files 1 failed`）、以及此后的纠正措施（改看 `Test Files` 行）。这三要素齐全，且承认的是**验证方式本身有洞**而非笼统的"疏忽"，我认为这是本任务链上对过程缺陷记录得最到位的一次。至于"18 files"那处编造，虽未进 `:139` 的自查清单，但**已随两份 Review 报告原文写进 EVIDENCE**（`:479` R1、`:610` 我自己那句"原写 18 确为编造，已更正"），可追溯性成立，**不另列 finding**。

---

## Findings（增量）

### 必须修复（阻断）

**无。**

### 可记录后继续

**N4｜契约 §14 末句仍强于实物 — `docs/contracts/API与数据契约基线.md` §14（patch 第 15 行）**
现文："任一侧单独改动都会让对应的检查组变红。" 按代码：改**扩展**那份 → 逐字比对必红（除非同步改前端）✓；改**前端**那份 → 只有"放宽已钉住的规则"才红，**新增或收紧规则不会红**（见上文第 2 点）。触发：将来有人依据这句话认为前端侧任何改动都受机器保护。影响：轻，但方向是让读者**高估**保护力，且这句写在契约基线里——这是本任务链第七次"描述比实现更强"，前一次恰好也出现在为防这个问题而写的守卫说明里。最小修复（一句话）：改成「扩展侧：两份函数体只要不同步就红；前端侧：**放宽**已钉住的规则会红，**新增或收紧**规则不会——此方向仍靠人守」。

### 可选建议

**O12｜想让两侧完全对称，有一条不需要扩权的路**（这是实现者点名要我给的替代路径）：前端测试改读**本项目内**的 `./protocol.ts` 源文本（同一 project root 内，不触及 `server.fs.allow`，无需动 `frontend/vite.config.ts`），与测试里内嵌的字面期望函数体逐字比对。这样"前端任何改动（含收紧/新增）都会红"，与扩展侧机制对称，约十行。红的语义是"你改了协议，去同步另一份"——正是想要的强制提醒。**我不要求做**：当前组合已满足 N1 的核心诉求，这条留给将来真正发生一次收紧漂移时再补也来得及。

**O13｜"这一份符合规格"里唯一的洞：控制字符行无用例。** 两侧的行为用例都没有一条形如 `'https://example.com/a'` 的拒收用例（`\t\n\r` 被上一行的 `\s` 先拦下，因此不算覆盖）。删掉该行两侧行为用例全绿，只有逐字比对能发现单侧删除，两侧同删则无人发现。真实路径不可达（`new URL().href` 会百分号编码），后端仍会拒 → 影响仅为一次 422。**一行可补**，补上后 N4 的第二句就完全为真。

**O14｜O7 的残余理论差建议就此打住。** 我复算后仅剩两处方向相反的极端差：Python `str.isspace()` 含 U+0085 等而 JS `\s` 不含（前端更宽松）；DEL(0x7F) 前端拒而后端不拒（前端更严）。两者经 `new URL().href` 规整后均不可达，最坏后果是伪造载荷下的一次 422。**继续追平的收益低于代码复杂度成本，我明确不建议再改**，写在这里是为了避免下一轮有人把它当新缺陷重开。

**O15｜两处已成死代码，不影响正确性**：新增 `@` 正则后，`!url.username && !url.password` 被完全覆盖；对 http(s) 而言空 host 会让 `new URL` 抛异常，故 `Boolean(url.hostname)` 亦不可达。保留作为纵深无妨，但注释可点明"下面两条是冗余的纵深，规则实际由上面的正则承担"，免得下一个人以为它们各自承担一条规则。

---

## 覆盖与缺口

**本轮已覆盖**：增量 patch 全部 6 文件逐行；N1 替代方案的能力边界（按"删除规则/新增规则"两个方向逐条推演）；变异 11/12 的代码级成立性；契约 §14 新措辞与实物的逐句比对；O7 与后端 `parsed_url` 的逐条重算（含 `@` 正则与 netloc 边界的等价性验算）；O9/O10① 的实修；前端全部数字的自洽性；索引与记录的准确性；那处过程失误的记录如实性。

**缺口（未读或未读透）**：
1. **我未运行任何检查**；`CHECKS PASS`、407/83、十三项变异、两条 `selected_profiles` 输出均为转述，我只做代码级"能否变红"判断与口径自洽核对，**不构成验证**。
2. **O8/O11 的实修未核**：`extract.ts`（不再截断）、`capture.ts`/`popup.ts`（`unusable-url` 原因码）本轮不在我的 patch 内。按代码逻辑推断：不截断 + 超长必拒 → 超长 URL 现在会落到 `unusable-url` 分支并给出用户可读原因，与 O8/O11 的意图一致，**但我没看到那三个文件的最终形态**，请 R1/Acceptance 核。
3. **`node:fs` 是否真被 Vite `server.fs.allow` 拦未核**（无 Bash）。`readFileSync` 通常是运行时 Node 调用、不经 Vite 模块门禁，实现者的 `Denied ID` 若只发生在 `?raw` 上，则结论不变——因为我给的 O12 路径根本不需要跨目录读。**这一点不影响本轮结论。**
4. extension 83 中新增的 5 条、`extension/AGENTS.md` §6（N3）的最终措辞，属 R1。
5. 明示非目标（图片冻结、Firefox/Safari、A4 清单漂移、`validate_governance.py` 第二份清单）未审。

## 剩余风险

1. **协议漂移的"前端更严"方向仍无机器守卫**（见上文第 2 点与 N4/O12）：影响为扩展交付被静默丢弃、用户见空态无解释；不产生错误数据、不越安全边界。
2. 控制字符规则两侧均无行为用例（O13）。
3. 前两轮既有：同源框嵌/点击劫持（全站既有属性）、第三方扩展可满足 `source === window`（已写进 §14.3）、全流程从未实机跑过（完成条件 14 待用户实测）、未交付正文在扩展存储的滞留（已在 §14.5、`extension/AGENTS.md:25` 与两处 README 披露）、创建与写快照非事务的两个半成功状态（均已记录）。

## 结论

**PASS**（针对新候选 `0d4b9e7`，仅覆盖 R2 问题域；显式继承前两轮 R2 对 `b4a3fd0..1399037` 的全部其余覆盖）。

N1 的处置我判**成立**：它不是"只改措辞"，而是在不扩大授权面的前提下换了一种机制，并且在 N1 真正关心的方向（前端被放宽）上**逐条可红**，同时补上了逐字比对本身的盲区（两份一起错）。O7 已实质达成与后端逐条对齐，O9/O10①、N2 均已实修，那处 `?raw` 过程失误记录如实。

本轮新增 **1 项可记录后继续（N4）+ 4 项可选建议（O12–O15）**，**无阻断项**。

**关于收敛（根 `AGENTS.md` §7）**：这是 R2 的第三轮，本轮所有剩余项都是一句话或一行级、且互不耦合。**我建议 R2 方向就此收敛**——N4 与 O13 可在承载本报告的同一次写回里一并处理，不需要为它们再开一轮独立复核，也不需要我再判一次。若主 Agent 选择不改 N4，请把它记为已知的非阻断记录项，不影响本 PASS。

本结论**仅覆盖 R2**，须与 R1 对同一候选的结论合并方构成 TASK-038 的完整 Review；R1 若判 CHANGES_REQUIRED 或 BLOCKED，整体从其严。EVIDENCE 写回本报告原文形成的后续提交属机械写回，不构成需再次审查的产品变化。

- 第三轮 findings 的处置（代码修订 SHA **`7baf19e`**）：
  - **N-R1（R1）→ 修，只改注释、不动 `safeWebUrl`。** 这一条是**本轮修复自己造成的**：上一轮我收紧 `isSafeSourceUrl`（去掉 scheme 正则的 `/i`、新增 authority 段 `@` 拒绝），却没回头看两份 `protocol.ts` 里「与 `safeWebUrl` 同规则」那句 JSDoc —— **这句在我改之前是真的，是我的收紧让它变假**。主 Agent 独立实读 `api.ts:419-432` 复核，三处差异均属实：`safeWebUrl` 保留 `/i`、无 authority `@` 规则、无长度上限。已改为如实表述「比 `safeWebUrl` 更严，多三处」，并写明 `safeWebUrl` 服务手工录入路径、未随本次收紧同步是有意的。按 R1 的要求**没有去动 `safeWebUrl`** —— 改那个共享校验器属扩大范围。
  - **N-R2（R1）→ 修，而且这一条把 N-R1 那类漂移机械化掉了。** 镜像守卫的切片原本从 `export function` 开始，**JSDoc 不在比对范围内**，所以「改了实现没回头改描述」这类漂移它抓不到，修 N-R1 时只改一边也不会红。切片起点上移到函数上方的 JSDoc。**副作用是两份 `isCapturePayload` 的 JSDoc 必须统一** —— 它们原本各写各的（都准确，只是视角不同）；现在统一为描述共享契约的同一段文字，各自的视角注释挪到 JSDoc 之外（`//` 行不在比对范围内）。变异验证：只改前端那份的规则说明 → 扩展侧守卫变红。
  - **N4（R2）→ 修。** 契约 §14 末句「任一侧单独改动都会让对应的检查组变红」强于实物：前端方向只有「放宽」才红，「新增或收紧」不红。改为逐方向如实分述，并写明两种机制**互补**（逐字比对发现不了「两份一起错」，行为钉死能——因为后者把规则绑在后端 `parsed_url` 的真实约束上）。这个互补关系是 R2 指出的，我和派发会话都没想到。
  - **O13（R2）→ 修。** 控制字符规则此前**两侧都没有任何行为用例**——实测确认：删掉那一行，前端 25 条用例全绿。两侧各补一条。补上后 N4 改写的第二句才完全为真。
  - **O12 / O14 / O15、S10 / S11 / S12 → 不做，理由分列。** O12（前端改为读本项目内源文本做逐字比对以求两侧对称）：R2 明说不要求，当前组合已满足 N1 核心诉求；留待真正发生一次「收紧漂移」时再补。**O14 请后来者注意**：R2 明确写道 O7 的残余理论差只剩两处极端不等且都不可达，「继续追平的收益低于代码复杂度成本，我明确不建议再改，**写在这里是为了避免下一轮有人把它当新缺陷重开**」——这条边界原样保留在上方报告原文里。O15（两处已成死代码的纵深）保留不动。S10（把最后一处 cwd 依赖迁走）、S11（正文截断与网址采取不同策略，属可辩护取舍）、S12（把「7 files / 84 tests」机械化需动 `scripts/governance/**`，本任务明示非目标）均记录不做。
- **本任务链上「描述比实现更强」这一族缺陷的完整清单与可操作教训**（写在这里而不是散在各轮处置里，因为它比任何单条 finding 更有复用价值）：

  **先说一件方法上的事**：此前对话里出现过「第六次」「第七次」这类序数，而**两位 Reviewer 对同一个模式给出的序数并不一致**（R2 说第七次、R1 在 N-R1 里说第五次）——它们各自按自己看见的范围数，都没错，但任何一个单独拿出来都不准。序数天然依赖「全集是什么」，而没有任何单个实例持有全集。**所以这里列清单，不写序数**；下面每条都能在仓库里定位：

  1. TASK-036 A3：资料详情的文案说链接在「上方」，实际在下方。
  2. TASK-036 A3（同任务另一处）：空态文案以 WEB 语境写成，却对 PASTE/FILE 资料同样渲染。
  3. TASK-037 F1（该任务唯一的阻断项）：`README` 宣称 `manifest.test.ts` 会在新增权限时失败，实际只否定三个键。
  4. 本任务实现中途（主 Agent 自查）：三处文档写「顶层键恰好五个」，而实物已是七个。
  5. 本任务（主 Agent 自查）：把「frontend 组报 18 files」写进记录，而检查日志实为 17 —— **这一条与其余不同，它不是描述写宽了，而是对可核证据的事实性错述**，R1 在第三轮明确要求区分这两类。
  6. 本任务：非目标段理由①称授权面修订「发生在任何实现写入之前」，经 `git log -S` 证伪。
  7. 本任务 S8（R1 提出）：源码扫描断言的注释写成「这条断言就是那句承诺的看守」，而它挡不住有意规避，真正的看守是紧邻那条值断言。
  8. 本任务 S7（R1 提出）：镜像守卫注释写「措辞可以不同，规则不能不同」，而切片不剥注释、措辞同样必须一致。
  9. 本任务 N4（R2 提出）：契约 §14 写「任一侧单独改动都会让对应的检查组变红」，而前端方向只有「放宽」才红。
  10. 本任务 N-R1（R1 提出）：`protocol.ts` 的 JSDoc 写「与 `safeWebUrl` 同规则」—— **这句原本是真的，是我自己的收紧让它变假**。

  **第 10 条与前面九条形态不同，这个区别是这份清单里最要紧的发现**：前九条是「写描述时就写宽了」，第 10 条是「描述当初是对的，改了实现却没回头看它」。**同一个根因的两种表现——一种是写歪，一种是写对了之后放着不管。**

  **可操作的动作（下一个任务可直接用）**：

  > 写完任何一句描述保护范围或覆盖能力的话，回头问一句「**它实际检查的是什么**」，然后照那个答案改写。**改实现时，同样回头问一句「有哪些句子在描述我刚改的这个东西」。**
  >
  > 若描述与实现不一致：改的是句子 —— **除非那个保护本来就该有**，那就去改实现，并补一条会因此变红的断言。判据：**把句子降格之后，如果你会觉得「那这道防线还有什么用」，那就说明该改的是实现。**

  后半句的判据来自本任务链的两次实例：TASK-037 F1（门闩宣称挡权限、实为黑名单三键）与本任务 N1（守卫只覆盖单向），**正确处置都是改实现而不是降格描述**；只写「改句子」会把人引向用诚实的措辞把本该修的洞留下来。
  **本轮 N-R2 是第一次把这条教训机械化**：把 JSDoc 纳入镜像比对之后，第 10 条那种形态（改了实现没回头看描述）不再依赖人记得去看。
- **两位 Reviewer 关于「自报」的一句判断，原样留在这里**（R1 第三轮）：主 Agent 的两处失误（编造 18 files、`?raw` 失败被 grep 掩盖）**都是它自己交代的，不是审查查出来的** —— 这在诚信上是正面信号，**但也意味着审查方没有任何独立手段去界定还有多少同类问题未被自述**。这句话应当随本任务一起交给 Acceptance 与用户，而不是被当作对自报行为的表扬收下。
- Acceptance（L3 独立只读，第三批全新实例，独立于唯一写入者与 R1/R2 三轮，无上下文继承）：**PASS**（针对候选 `5cf933ea`），附**三项必须在本次写回中落实的记录准确性要求**——它明写：若把完成条件 14 或条件 1 记为「满足」，或以「不阻断」替代「是否满足」的判定，**本 PASS 即不成立**。三项均已落实，见下。报告原文如下。

# TASK-038 独立只读 Acceptance 报告

## 只读证明与范围

本实例 `tools` 白名单仅 `Read`/`Grep`/`Glob`：**无** `Write`/`Edit`/`NotebookEdit`，**未授予** `Bash`。全程只有读取与检索调用，未写入任何文件、未提交、未推送、**未执行任何命令**。独立于实现者（唯一写入者 `coordinator`）与 R1/R2，无上下文继承。

- base `b4a3fd0` → **验收候选 `5cf933ea`**（代码 `7baf19e`）；工作树 HEAD 即候选。
- 输入：`/private/tmp/.../scratchpad/T038-accept.patch`（32 文件，+ `package-lock.json` = 33）、`docs/tasks/TASK-038-extension-capture.md` 全 1018 行，及定点实读的实物文件。
- **全部机械证据按 NOT_RUN**：CHECKS PASS、`2235caca…`、84/408/525/41/23、十五项变异——我未运行、不声称验证过。

## 14 条完成条件逐条核对

| # | 证据（我实读定位的） | 判定 |
|---|---|---|
| 1 | `extension/src/injected/extract.test.ts:10,41-42` 在人造文章骨架上断言六条噪声串不出现、正文出现；`CapturePage.tsx:47-48,124,151` 预填标题/网址/正文。**但全仓无「具体页面提取前后字符数」记录**（我 grep 全部 `*.md`，`字符数` 只出现在条件本身）；真实网页那一跳未跑 | **部分满足** |
| 2 | `CapturePage.test.tsx:52`「prefills the form but writes nothing until the user confirms」；唯一写入点 `save()` 挂在 `<form onSubmit>` | 满足 |
| 3 | `CapturePage.tsx:79-84` `source_type:'WEB'`、`source_url: captured.url`、`putResourceSnapshot(created.id, markdown)` 与预览同一 state；测试 `:84` | 满足（`source_url` 已去 fragment，取舍在契约 §14.2 明示） |
| 4 | `protocol.ts:75-83` 三道校验 + `CapturePage.test.tsx:63` `it.each` 伪造投递（错 source / 错 origin / 缺字段等），断言停在空态且无表单 | 满足 |
| 5 | `CapturePage.tsx:88-94` `setPartial` 分支、不重试；测试 `:128` | 满足 |
| 6 | `manifest.ts:37-55` 实物恰 7 顶层键、`permissions` 恰三项、内容脚本单条；`boundaries.test.ts:60-83` 机械守卫覆盖**三处宣称含根 README**。逐条用途/替代方案/为何不能更小在 `manifest.ts:12-21`（非「实现与测试」段字面） | 满足（记录位置偏差已注明） |
| 7 | `boundaries.test.ts:31-39` 扫 `src/**` 禁 `127.0.0.1:8000`/`/api/v1` | 满足 |
| 8 | `boundaries.test.ts:41-48` 禁 `chrome.cookies`/`document.cookie`/`cookieStore`/`webRequest` | 满足 |
| 9 | 根 `README.md:240,250`、`extension/AGENTS.md:16,48`、`extension/README.md:7,27` 三处均有 Edge 路径 + 「Edge 已实测/Chrome 未实测」+「只支持 Chrome 与 Edge」 | 满足 |
| 10 | 记录 84>5、408>369、525 不变、e2e 41 | 满足（**证据由实现者单方运行，无任何独立复核**） |
| 11 | 记录多处声明 Playwright 驱动不了扩展；`CapturePage.test.tsx` 全用 `dispatchEvent`，无一处自称 e2e | 满足 |
| 12 | CHECKS PASS + 指纹 + 干净 worktree 路径 | 满足（NOT_RUN） |
| 13 | 六份报告齐备、SHA 链自洽（`8533b87→1399037→0d4b9e7`）；**但最终候选的代码段 `0d4b9e7..7baf19e` 未经任何 Reviewer 审查**（见 F-A1） | **部分满足** |
| 14 | 记录自陈「全流程从未在真实浏览器里跑过」 | **不满足** |

**第 14 条，两个问题分开答**（不用「不阻断」顶替「是否满足」）：
① **是否满足：不满足。** 条件字面要求「交付时当面请用户实测一次采集全流程，其结果据实补记」——该实测尚未发生，条件当前为零覆盖，不是部分满足。
② **是否阻断：不阻断。** 依据：Agent 结构性无法执行；条件设计本就把它指派给用户；TASK-037 同型项由用户实测后关闭的先例；且记录已如实声明而非掩盖。
③ **硬性要求**：写回时必须记为「不满足、待用户实测后据实补记」，并在合并请求中当面说出。若写成「满足」或只写「不阻断」，即触碰 §2 底线。

## 锁文件缺口的闭合（按你的更正口径）

R1 三轮均把 `extension/package-lock.json` 列为唯一始终未闭合的实质缺口。该缺口**由派发会话首先用 Bash 解析整份锁文件闭合，实现者随后独立复跑，两者逐项一致**：228 包 / 227 条 `resolved` 全部指向 `registry.npmjs.org` / 非官方 0 / `file:`+`git+` 0 / **227 条全带 `integrity`，缺失 0** / 唯一 `hasInstallScript` 为 `fsevents`（dev+optional+darwin）。

**准确表述**：实现者的自述抽查**在它覆盖的范围内为真，但范围比它以为的窄**——它未提 `integrity`，也未意识到自己没提，而 `integrity` 正是 R1 三轮单列为「未验证」的那一项。**R1 的缺口标注不是多余的**。

我认为锁文件层面仍未覆盖的面（如实指出，均不阻断）：① 只核了来源与完整性哈希，**未核依赖树语义**（`defuddle` 的 4 个 `optionalDependencies` 进本机 `node_modules`、不进产物，此结论来自 R1 的源码推理而非锁文件解析）；② 未核 `package.json` 版本范围与锁定版本的对应关系（是否存在下次 `npm i` 会漂移的松范围）；③ `integrity` 证明「装到的是锁定时那份」，不证明「那份本身干净」——上游投毒仍只能靠升级时重审。

## 新发现（三方均未记的）

**F-A1｜最终候选含一段无人复审的代码增量。** `0d4b9e7..7baf19e`（N-R1/N-R2/N4/O13 的处置）无任何 Reviewer 结论覆盖：R2 第三轮明确预先授权 N4 与 O13 在同一次写回处理（记录 `:977`），**但 R1 第三轮的结论段没有对 N-R1/N-R2 给出同等的免复核声明**。我据 §4「Integration 核对跨模块与运行证据」在候选实物上独立核了这四处：`extension/src/shared/protocol.ts:36-48` 与 `frontend/src/features/capture/protocol.ts:23-35` 的 JSDoc **逐字一致**（我按行对齐比对）；`protocol.test.ts:69-70` 切片起点确已上移到 JSDoc（`lastIndexOf('/**', declaration)`，两文件的 `//` 视角注释都在切片外，逻辑正确）；两侧各补控制字符用例（`extension/.../protocol.test.ts:95`、`frontend/.../protocol.test.ts:55`）；契约 §14（`docs/contracts/API与数据契约基线.md:712-717`）已改为逐方向如实分述。**四处均正确且互洽，守卫在候选上因正确理由为绿。** 残留：我无 git，**无法排除该区间还含其他未被描述的改动**。处置：记账即可，不要求另开一轮。

**F-A2｜TASK-037 遗留 L2 的重评触发条件已发生，而无人认领。** L2 原文（`TASK-037-extension-baseline.md:737`）的触发条件是「TASK-038 引入真实 chrome API 类型时一并收敛」。本任务确已引入：`extension/tsconfig.json:6` 由 `types:["node"]` 改为 `["node","chrome"]`，`extension/package.json:20` 新增 `@types/chrome`。但本任务只承接了 L8（记录 `:40`），L2 既未收敛、也未说明为何不做、也未重新登记。实际影响轻——我 grep `extension/src` 全目录，`process.env` **零命中**，问题仍为理论态。但这是遗留项台账**唯一的失效模式**（触发条件发生而无人接手），值得单记。处置：本次写回按四要素重新登记（或顺手收敛）。不阻断。

**F-A3｜「描述比实现更强」清单自身的一处分类不准。** 第 5 条（编造 `18 files`）与其余九条的区分**成立且重要**：它是对可核证据的事实性错述，受 §2「不得伪造测试结果」直接管辖，其余是描述宽于实现。**但第 6 条（授权面时序陈述经 `git log -S` 证伪）被归入了「其余九条」，分类不准**——它同样是对可核证据（git 历史）的事实性错述，与第 5 条同族，只是落在正当性论证而非测试数字上。建议改为「两条事实性错述 + 八条描述漂移」。另按你的更正，派发简报里那句「覆盖面比它声称的更完整」也是同一模式的实例（出自派发会话），可一并计入。

## 清单可定位性与其余核对

- **10 条清单全部可在仓库定位**：1、2 → `docs/tasks/TASK-036-content-snapshot.md:344,361,374`（「上方」指错方向；空态 WEB 语境对 PASTE/FILE 同样渲染）；3 → `TASK-037-extension-baseline.md:268`；4 → 本记录 `:141①`；5 → 本记录 `:481`（R1）与 `:612`（R2）；6 → 本记录 `:57`、`:400`；7 → `:518`，现状 `boundaries.test.ts:51-55` 已改准；8 → `:517`，现状 `protocol.test.ts:58-61` 已改准；9 → `:937`，现状契约 `:712-717` 已改准；10 → `:795`，现状 `protocol.ts:44-47` 已改准。
- **33 个文件全部落在 `allowed_paths` 内**（我对 patch 的 32 个 `diff --git` 逐条比对 + 锁文件）。禁止范围确实未动：无 `backend/**`、无 `openapi-v1.json`、无 `local_access.py`、无 `scripts/governance/**`、无 `frontend/vite.config.ts`；manifest 无 `host_permissions`/`<all_urls>`；`package.json` 运行时依赖仅 `defuddle`，无兼容层。TASK-037 已标 `MERGED` ✓，索引与 TOML 状态均为 `IN_ACCEPTANCE` ✓。
- **六份报告逐字原文**：六份齐备、结构完整（只读证明/覆盖/findings/结论）、SHA 链与交叉引用互洽（如 R2 数出的 25 与 R1 表格的 25 吻合）。**但我没有报告原件，无法证明「逐字」**——这一条我只能确认「无删改痕迹、无自相矛盾」，不能确认无压缩。
- **关于「两处失误均系自报」**：R1 的判断我原样认同并加一句——本轮我独立发现的 F-A2 属**未被自述**的一类，说明「自述覆盖率」确实小于 1。这不改变自报的正面性质，但坐实了 R1 那句「审查方没有独立手段界定还有多少同类问题未被自述」不是客套。

## 遗留项/缺口登记合规性

**当前不合规**：EVIDENCE 区 `非阻断遗留项`、`Acceptance`、`最终状态/风险/用户操作` 三项均为「待填」（`:1013-1015`），且最终候选 `5cf933ea` 尚未记入候选段（`:159` 只到第一轮）。按 `docs/governance/风险分级与检查规则.md:29`，须按**影响 / 暂不修理由 / 责任角色 / 重评触发条件**四要素登记，TASK-037 `:736-743` 是可直接照搬的格式先例。至少应登记：完成条件 14 未实测（责任角色=用户）、F-A2（TASK-037 L2）、协议漂移「前端新增或收紧」方向无机器守卫（N4/O12）、第二个半成功状态不提示孤儿资料、未交付正文滞留扩展存储、提取质量仅合成页面验证、图片不冻结（→TASK-039）、`extract.js` 707 kB 与 5 处 `console.log` 可达性未验证、「7 files / 84 tests」无机械断言（S12）、O14/O15/S10/S11 记录不做，以及 TASK-037 L1/L4/L5/L6 的继续挂账。

## 剩余风险与是否阻断

1. 采集全流程从未实机运行（最大未验证面，条件 14）；2. 全部机械证据由实现者单方运行，三个只读实例一律 NOT_RUN；3. 未复审增量（F-A1）我只能核我知道要核的部分；4. 供应链在来源/完整性层面已闭合，语义与上游可信度未闭合；5. 协议「前端收紧」方向仍靠人守。**均不阻断交付**：无一触及安全底线、必要检查或已确认需求/契约。

## 结论

**PASS**（针对候选 `5cf933ea`），附三项**必须在承载本报告的同一次写回中落实的记录准确性要求**（均属 EVIDENCE 区，不形成新候选）：
1. 完成条件 14 记为**不满足、待用户实测后据实补记**，并在合并请求中当面告知；
2. 完成条件 1 记为**部分满足**（缺具体页面的提取前后字符数），补记或如实标注二选一；完成条件 13 记为部分满足并写入 F-A1；
3. `非阻断遗留项` 按四要素补齐（含 F-A2），并补记最终候选 SHA `5cf933ea`。

若把条件 14 或条件 1 记为「满足」，或以「不阻断」替代「是否满足」的判定，本 PASS 即不成立。

- **完成条件核对结果（按 Acceptance 的硬性要求如实记录）：11 条满足、2 条部分满足、1 条不满足。**
  - **条件 14 不满足**（不是部分满足）：条件字面要求「交付时当面请用户实测一次采集全流程，其结果据实补记」——**该实测尚未发生，当前为零覆盖**。是否阻断是另一个问题，Acceptance 判**不阻断**（Agent 结构性无法执行、条件本就指派给用户、TASK-037 有同型先例、记录如实声明而非掩盖）。**这两个问题分开答，不用后者顶替前者。** 待用户实测后据实补记。
  - **条件 1 部分满足**：「五条命令通过」「噪声被剔除、产出 Markdown」有 `extract.test.ts` 在人造文章骨架上的实质断言；但条件还要求「以一个具体页面为例记录提取前后的字符数与实际效果」，**全仓无此记录**，且真实网页那一跳未跑。按 Acceptance 给的二选一，此处选择**如实标注为部分满足**而不是现在补一个合成数字——真实页面的提取效果只有实机才有意义，与条件 14 同一批证据。
  - **条件 13 部分满足**：L3 执行链的角色与独立性完整（R1/R2 各三轮 + 独立 Acceptance，六份报告齐备、SHA 链自洽），但**最终候选的代码段 `0d4b9e7..7baf19e` 未被任何 Reviewer 结论覆盖**（F-A1）——R2 第三轮预先授权了 N4/O13 在同一次写回处理，R1 第三轮**没有**对 N-R1/N-R2 给出同等的免复核声明。Acceptance 已在候选实物上独立核了这四处（JSDoc 两侧逐字一致、切片起点确已上移、两侧控制字符用例、契约逐方向分述），结论是四处正确且互洽；但它无 git，无法排除该区间还含其他未被描述的改动。**该残留由派发会话事后用 git 闭合**：`0d4b9e7..7baf19e` 为 5 文件 43 增 12 删，逐条对应所述四处，无第五处。
- **Acceptance 之后又发生了一次修改，如实记在这里**：派发会话在核 F-A1 时顺带发现 `isCapturePayload` 的 JSDoc 写着「两端规则必须完全一致 —— 这一点由两侧的守卫测试机器强制，不靠人记」，而按 N4 已确立的事实，**只改前端时扩展组不运行、前端侧行为断言只发现「放宽」**，所以「完全一致」并没有被机器完全强制。**要害在于这句写在修 N4 的同一个提交里**——N4 修的正是契约里同型的一句说满，契约那边改成了逐方向分述，JSDoc 这边却新写了一句同样说满的话。已改为逐方向如实说明（提交 `b51cde3`，两份副本同改，**纯注释、无行为变化**：`git diff 5cf933ea..b51cde3` 为 2 文件 10 增 4 删，非注释改动 0 行）。**但 `product_fingerprint` 确实随之改变**（`2235caca…` → `793c1853…`）——指纹按文件内容计算，注释也算内容。「无行为变化」与「指纹不变」是两回事，这里必须分开说：前者为真，后者为假。**这段增量在 Acceptance 之后产生，因此不被其结论覆盖**，主 Agent 已自行核实为注释-only，并已请派发会话交由同一 Acceptance 实例做定向确认；用户合并前应知道这一点。
- 非阻断遗留项（按 `风险分级与检查规则.md:29` 的四要素登记）：
  - **（A）完成条件 14 未实测**：采集全流程从未在真实浏览器里跑过。影响：整条链路只有两端各自的单测，中间那一跳（真实 `chrome.storage` + 真实内容脚本 + 真实 activeTab 授予时机）无任何证据。暂不修理由：**任何 Agent 都无法执行**，条件设计本就指派给用户。**责任角色：用户**。重评触发条件：用户首次实测后据实补记——成功则条件 14 关闭并顺带为条件 1 补上真实页面的效果；失败则按其错误另起修复任务。
  - **（B）TASK-037 遗留 L2 的触发条件已发生而无人接手**（Acceptance F-A2，**本轮唯一「未被自述」的发现**）：L2 的重评触发条件写的是「TASK-038 引入真实 chrome API 类型时一并收敛」，而本任务确已引入（`tsconfig.json` 的 `types` 由 `["node"]` 改为 `["node","chrome"]`、新增 `@types/chrome`），但 L2 既未收敛也未说明。影响：`types` 仍全局生效，popup 运行时代码写 `process.env` 也能通过类型检查却在扩展沙箱中不存在；主 Agent 复核 `extension/src` 全目录 `process.env` **零命中**，问题仍为理论态。暂不修理由：收敛类型作用域会改变整个工程的 typecheck 范围，可能翻出与本任务无关的问题，而本任务已历经三轮审查、两位 Reviewer 均按 §7 建议收敛。**责任角色：coordinator**。**重评触发条件：TASK-039（图片冻结）必然改动 `extension/`，届时一并收敛；或 `extension/src` 首次出现 `process.env`/node-only API 时立即处理。**
  - **（C）协议漂移的「前端新增或收紧」方向仍无机器守卫**：扩展侧逐字比对只在扩展组运行时执行，前端侧行为钉死只发现「放宽」。影响：两份在该方向静默分叉时，扩展交付的合法载荷被页面丢弃、用户见空态无解释；不产生错误数据、不越安全边界。暂不修理由：R2 的 O12 给了一条不需扩权的补法（前端读本项目内源文本与内嵌期望比对），但它明说不要求做、留待真正发生一次收紧漂移时再补。**责任角色：coordinator**。重评触发条件：任一侧协议首次出现「只改一边且方向为收紧」的改动时。
  - **（D）创建资料与写快照的第二个半成功状态不提示孤儿资料**：POST 在服务端成功但客户端未拿到可解析响应时，页面走普通错误分支，不提示可能已产生一份资料，用户重试会得到重复资料。暂不修理由：客户端无法区分「没建成」与「建成了但回执丢了」，根治需后端提供合并操作（新 HTTP 契约）。**责任角色：coordinator**。重评触发条件：下一个触及资料创建路径的任务，或用户真实遇到一次重复资料。
  - **（E）未交付的采集正文滞留扩展存储**：点了采集却不打开确认页时，正文留在扩展 profile 磁盘上直到下次采集覆盖。暂不修理由：属设计取舍（popup 关闭后必须有中转），已在 `extension/AGENTS.md` §3、`extension/README.md`、根 `README.md`、契约 §14.5 四处向用户如实告知。**责任角色：coordinator**。重评触发条件：若将来支持多份待交付内容，须同时设计过期清理。
  - **（F）提取质量只在合成页面上验证过**：`extract.test.ts` 用的是人工构造的文章骨架，真实站点（尤其知乎/CSDN 这类重前端框架页面）未验证。**责任角色：用户（首次实测）+ coordinator（据反馈调整）**。重评触发条件：与 A 同一次实测。
  - **（G）图片不冻结**：正文中的图片引用仍指向原站，原站改版或删图后该部分内容失效。暂不修理由：用户 2026-09-06 明确决定拆分。**责任角色：coordinator**。**重评触发条件：TASK-039。**
  - **（H）`extract.js` 707.60 kB，产物内 5 处 `console.log` 可达性未验证**：R1 补了一条同样不作结论的旁证（那些日志走 `this._log`、受 `debug` 约束，另一处裸 `console.error` 在异步路径不可达），但双方均未验证压缩产物里那 5 处的具体位置。影响：最坏是在用户自己那一页的控制台留几行噪声，不构成隐私问题。**责任角色：coordinator**。重评触发条件：用户实测时若发现控制台有异常输出。
  - **（I）「7 files / 84 tests」只靠人工逐文件对账，无机械断言**（R1 的 S12）：机械化需动 `scripts/governance/**`，属本任务明示非目标。**责任角色：coordinator**。重评触发条件：下一个触及治理脚本的任务。**期望值记在此处供比对：extension 7 files / 84 tests（boundaries 5、manifest 9、extract 12、relay 11、protocol 26、capture 13、popup 8）。**
  - **（J）锁文件的语义层面未闭合**：来源与完整性哈希已由派发会话解析全份闭合、主 Agent 独立复跑一致（228 包 / 227 条 resolved 全指官方 registry / 227 条全带 integrity / 唯一安装脚本 `fsevents`），但 Acceptance 指出三处仍未覆盖：依赖树语义、`package.json` 版本范围与锁定版本的对应关系、以及 `integrity` 只证明「装到的是锁定时那份」而不证明「那份本身干净」。**责任角色：coordinator**。重评触发条件：升级 `defuddle` 或新增运行时依赖时重审。
  - **（K）记录不做的可选建议**：R2 的 **O14**（`isSafeSourceUrl` 与后端仅剩两处方向相反且不可达的极端差）—— **该条原文明确写着「我明确不建议再改，写在这里是为了避免下一轮有人把它当新缺陷重开」，这条边界原样保留**；O15（两处已成死代码的纵深）、O12（见 C）、R1 的 S10（最后一处 cwd 依赖）、S11（正文超 1MB 静默截断，属可辩护取舍：存下 1MB 优于什么都不存）。**责任角色：coordinator**；重评触发条件：各自相关代码下次被改动时。
  - **（L）继承 TASK-037 的挂账**：L1（`validate_governance.py` 第二份检查组清单未同步，方向是误红不是漏绿）、L4（首个 Reviewer 实例提及但无从追回的那处 drift，仍按未澄清挂账）、L5（A4 契约清单漂移 12 项）、L6（`docs/research/` 未纳入 Git）。四条均未在本任务处理，责任角色与重评触发条件沿用 TASK-037 记录。
- **本任务链上「陈述与证据不匹配」这一族缺陷：收敛为三类，每类配一个动手前能问出口的问题。**

  **为什么收敛而不是继续列清单**：这份清单一度列到 12 条，而每被指出一处、我就把标准再抽象一层去容纳它——从「描述比实现更强」到「描述与事实不符」再到「陈述与支撑它的证据不匹配」。每一步都更准，也每一步都更宽，宽到几乎任何错误都能塞进去。**一份能解释一切的清单指导不了任何具体动作——这本身就是一次「说满」**：用周延性换掉了指导力。派发会话给的停止条件是对的：**如果某条记录不能对应到一个具体可执行的检查动作，它就只是复述抽象，不该单列。** 另外不写序数——此前对话里用过「第六次」「第七次」，都是凭印象累加，而**两位 Reviewer 对同一模式给出的序数并不一致**（R2 说第七次、R1 说第五次）；序数依赖「全集是什么」，而没有任何单个实例持有全集。

  **收录标准**：一个**进入交付物或治理记录**的陈述，与**能支撑它的证据**不匹配。判据：这句话会不会被后来者当作事实依据？会就收，不会就是普通口误。不论出自实现者、审查者还是派发者——**这不是一份关于某个角色的清单**。

  **① 说满 —— 描述的保护，宽于它实际检查的东西。**
  问：**「这句话说的保护，实际检查的是什么？」** 照答案改写；**若那保护本来就该有，改的是实现，并补一条会因此变红的断言。** 判据：把句子降格之后，如果你会觉得「那这道防线还有什么用」，那就说明该改实现。
  实例：TASK-036 A3 的两处文案；TASK-037 F1（README 宣称门闩挡新增权限、实为黑名单三键，**该任务唯一的阻断项**）；本任务的「顶层键恰好五个」、S8（源码扫描被称作「那句承诺的看守」）、S7（「措辞可以不同」而实际注释也须一致）、N4（契约「任一侧单独改动都会红」）、N-R1（「与 `safeWebUrl` 同规则」——**这句原本是真的，是我自己的收紧让它变假**）、以及 Acceptance 之后发现的 `isCapturePayload` JSDoc（**写在修 N4 的同一个提交里**）。
  **其中 TASK-037 F1 与本任务 N1 的正确处置都是改实现而非降格描述** —— 只写「改句子」会把人引向用诚实的措辞把本该修的洞留下来。
  **N-R1 与其余不同**：前面几处是写描述时就写宽了，它是**描述当初写对了、改了实现却没回头看它**。同一根因的两种表现。**N-R2 是第一次把这条机械化**：把 JSDoc 纳入两份协议的逐字比对后，这种形态不再依赖人记得去看。

  **② 没量 —— 把未核的数字或事实当已知写出。**
  问：**「这个数是量出来的，还是写出来的？」**
  实例：编造「frontend 18 files」（日志实为 17）；授权面时序陈述「发生在任何实现写入之前」被 `git log -S` 证伪。**按 Acceptance 的 F-A3，这两条同族**——都是对**可核证据**的事实性错述，受 §2「不得伪造测试结果」直接管辖，与①的「描述漂移」不是一类；F-A3 指出我原先把第二条归进了①，分类不准，已按其意见更正。
  **往重里说也属这一类**：我一再说「把未核数字写进了治理记录」，而逐个候选取出原文核实后，四个候选写的都是当时的正确值（17/380、17/382、18/407、18/408）——**那句编造的话从未进入任何提交**，我在提交前自己量了一遍改掉了。**我把自己的过错说重了，这同样是未经核实的断言**，只是方向相反，而且更难被别人纠正，因为它听起来像诚实。为什么会说重：当时它确实进了工作副本，而**「写进工作副本」与「写进记录」在自述时极易混同——这是同一个认知盲区在自我描述上的表现**。
  **一条不可让渡的边界**：「顺手写一个数」和「去量一个数」在当下主观上分不出区别，这**解释了它为什么反复发生，不构成免责**。§2 管辖的是结果，不是动机。**对策有效不等于责任转移。**

  **③ 证不了 —— 用支撑不了结论的方法或断言去支撑结论。**
  问：**「这个方法／这条断言，能证明我要下的结论吗？」**
  实例：我用 `git log -S "18 files"` 去定「有没有进过提交」，而 `-S` 只告诉你某字符串在某次提交里增减过，**分不清主张与引述**——那两个命中其实都合法（第三、四个候选的 frontend 真的是 18 个文件），结论碰巧对了，方法却证不了它；正确的做法是逐个候选取出当时写的原文。同形的另一例是 TASK-037 A 部分指出的：`test_profiles_never_install_or_format_source` 只检查 argv 字面 token、看不见 npm script 的脚本体，却被完成条件称作「证明了不含自动格式化写入」。**一个是审查里的方法错误、一个是代码里的覆盖归因错误，形状相同。**
  **④ 推论假 —— 句子自身为真，但读者会做的那一步推断为假。**
  问：**「读者读完这句，会推出什么？那个推论对不对？」**
  实例：Acceptance 之后那次纯注释更正，记录写的是「纯注释、无行为变化」——**每个字都对**，但读者会据此推出「所以指纹没变」，而 `product_fingerprint` 按文件内容计算、注释也是内容，指纹确实变了（`2235caca…` → `793c1853…`）。已补写「『无行为变化』与『指纹不变』是两回事」。
  **它与前三类的分界**：①②③ 问的都是「我这句话对不对」，④ 问的是「读者会推出什么」。一句话可以自身为真而推论为假，后者同样误导后来者，且**更难被审查发现**——审查者核的是陈述与证据是否匹配，而这里两者匹配。这一条是主 Agent 在写完那四个字之后回头执行①的问句时自己撞见的；**没有任何审查者会来查它**（Acceptance 无 git，核不了指纹）。
  **收录理由（对照本清单自己的停止条件）**：它之所以单列而不是并进①，是因为**它对应的检查动作与前三类不同**；若只是又一个「说满」的变体，按停止条件就不该单列。

- **两条关于这套流程本身的观察，原样留给后来者**：
  1. **判断权与工具权被分开持有。** 只读实例有判断权、无工具，能独立下结论但核不了需要执行才知道的事实；派发会话有工具、不参与判断，能核事实但不为结论背书。**任何一方单独都会漏掉一整类问题**——本轮两边的证据都有：锁文件缺口三轮无人闭合，只有持工具的一方能做；而 N-R1（我的修复让一句注释变假）只有独立读码的一方会去查。此外派发会话两次扣住主 Agent 的私下分析不转给审查者，两次审查者都独立得出了同等或更准的结论——**转过去就等于把工具权与判断权重新合并**，而这条的成效表现为「什么都没发生」。
  2. **自报的覆盖率无法被自报证明。** R1 指出：主 Agent 的两处失误都是它自己交代的，这在诚信上是正面信号，**但也意味着审查方没有任何独立手段去界定还有多少同类问题未被自述**。Acceptance 随后独立发现了 F-A2（TASK-037 L2 的触发条件已发生而无人接手）——**这是本轮唯一一处未被自述的问题**，坐实了那句话不是客套。
- 最终状态/风险/用户操作：status=**ACCEPTED**。L3 执行链完整：Worker → 自动检查（`CHECKS PASS`，`profiles=contracts,extension,frontend`）→ 独立只读 Reviewer 两部分**各三轮**（R1 PASS/PASS/PASS，R2 CHANGES_REQUIRED/PASS/PASS，第一轮唯一阻断项 F1 已实修）→ 独立只读 Acceptance PASS。三个审查实例互不相同，均只有 Read/Grep/Glob、无 Bash 与写工具、无上下文继承。
  **SHA 链**：候选 `8533b87`（代码 `540027e`）→ `1399037`（代码 `4ed3062`，记录更正 `f274c05`）→ `0d4b9e7`（代码 `5574d5d`）→ **Acceptance 验收候选 `5cf933ea`（代码 `7baf19e`，`product_fingerprint=2235caca2596ae7178d8515cbf94c10c01531ebc9ad3cdc925d41804f778708f`）** → 其后 `b51cde3` 为 Acceptance 之后的**纯注释更正**（见上）。最终交付 SHA 为本条写回所在提交，其精确值随合并请求一并告知用户（提交无法引用自身）。分支仅在本地，未推送。
  **须向用户当面说明的四点**：① **完成条件 14 不满足**——采集全流程从未在真实浏览器里跑过，请实测一次（在网页上点扩展图标 → 确认页 → 保存），结果据实补记；成功则顺带为条件 1 补上真实页面的提取效果。② **全部机械证据由实现者单方运行**，三个只读实例一律 NOT_RUN，十五项变异验证无第三方复核；锁文件由派发会话与主 Agent 两方独立核过，是唯一有第二人核实的机械证据。③ **Acceptance 之后有一段纯注释更正未被任何审查覆盖**（`b51cde3`）。④ 遗留 12 项（A–L），其中 **G 明确指向 TASK-039**（图片冻结），**B 与 I 需在下一个触及扩展/治理脚本的任务处理**。
- 非阻断遗留项（仅有真实问题时）：待填
- 日期与决定日志：2026-09-06 用户合并 TASK-037（PR #42，merge `b4a3fd0`）后回答本任务的两项范围问题：浏览器只做 Chrome 与 Edge、其他不扩展；采集正文与图片冻结拆成两个任务。主 Agent 据此把图片冻结移出本任务——理由是它躲不开后端改动（`content_snapshots` 只存 Markdown 且上限 100 万字符，`original_files` 为 `UNIQUE(resource_id)` 且 media_type 白名单不含图片，两者都装不下图片），属独立的 L3 数据模型任务。
<!-- EVIDENCE:END -->
