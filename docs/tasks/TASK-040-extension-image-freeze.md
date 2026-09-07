# TASK-040：扩展冻结正文图片（采集侧）

```toml
schema_version = 2
id = "TASK-040"
status = "MERGED"
risk = "L3"
risk_reason = "本任务把扩展从「只读当前页已渲染的 DOM、不发任何网络请求」变成「可代表用户向任意站点取字节」。这是一次实质的授权面扩张，也是本扩展第一次真正联网。虽然采用可选权限（安装时不要、采集时才请求、可撤销），但一旦授予即长期有效，用户不会重新审视，所以这次授予的边界就是它此后的边界。第二处实质风险：新增 background service worker —— 扩展从此有了一个不依附于用户点击的常驻执行上下文，它能做什么必须一次定清。第三处：取回的字节来自不可信的第三方站点，经消息通道穿过本机 UI 页面写入受控目录，这条新的数据流全程要有边界。另有跨模块面：同时改 `extension/` 与 `frontend/`，并关闭 TASK-039 遗留 G（删除预览少报图片张数，属用户可见的数据陈述错误）。不改后端一行、不改 `/api/v1` 契约、不改本机访问门禁。"
risk_flags = ["security", "architecture", "public-api", "business"]
owner = "coordinator"
base = "4066c022111aafc9c919ff903f4e4256eecaecc6"
allowed_paths = [
  "extension/**",
  "frontend/src/features/capture/**",
  "frontend/src/features/resources/api.ts",
  "frontend/src/features/resources/api.test.ts",
  "frontend/src/features/resources/ResourceDeletion.tsx",
  "frontend/src/features/resources/ResourceDeletion.test.tsx",
  "frontend/src/api/client.ts",
  "frontend/src/api/client.test.ts",
  "frontend/e2e/**",
  "docs/contracts/API与数据契约基线.md",
  "README.md",
  "docs/tasks/TASK-039-snapshot-assets.md",
  "docs/tasks/TASK-041-reading-research-doc.md",
  "docs/tasks/TASK-040-extension-image-freeze.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

### 用户授权

2026-09-07 用户合并 PR #44（TASK-039）与 PR #45（TASK-041）后指示「开 task040」，并就两个范围问题作答：

1. **权限**：「重要的是要把功能做好、做全，权限的事情都可以商量。」
   据此选**可选权限 + 采集时按需请求**（`optional_host_permissions: ["<all_urls>"]`），而非永久 `host_permissions`。**理由是这两条的覆盖面完全相同**（都能取任意图床的字节），可选权限只多出「安装时不要权限、授权后可随时撤销」两项，没有以覆盖面换安全性；用户那句话要的是「做全」，而这条选择不牺牲任何覆盖面。**若用户日后要求「一次都不弹框」，改为永久权限即可，属重评触发条件。**
2. **渲染**：用户选「只采集不渲染」。资料详情页仍只展示 Markdown 源码，**本任务交付后用户仍然看不到图片本身**，但图片已被冻结、可列出、可取字节。

### 目标

1. 采集时把正文引用的图片字节取回并存进本机（经 TASK-039 的四个端点），使「冻结」真正完整。
2. **关闭 TASK-039 遗留 G**（硬性前置）：删除预览必须把图片张数算进去。
3. 顺带关闭已到触发条件的三项遗留：TASK-039 遗留 A（实跑 `frontend`/`extension` 两组检查）、TASK-038 遗留 B（`tsconfig` 的 `types` 作用域收敛）、TASK-038 遗留 A2（确认页每次新开标签页）。

### 非目标（明示不做）

- **不改后端一行**。TASK-039 的表、端点与契约已就位，本任务只做调用方。`backend/**` 不在 `allowed_paths` 内。
- **不渲染 Markdown、不显示图片**（用户明确决定）。因此本任务交付后，冻结的图片在界面上不可见，只能经端点列出与取字节。
- **不引入任何第三方站点凭证**。取图片走 `credentials: 'omit'`：需要登录才能看的图片取不到，退化为保留原链接。这与 TASK-036 建立的「凭证始终由浏览器持有」一致。
- **不做跨快照去重、不压缩、不转格式、不清洗 EXIF**（TASK-039 已登记的取舍，本任务不改变）。
- **不扩展到 Firefox/Safari**（用户 2026-09-06 决定只做 Chrome 与 Edge）。
- **不改本机访问门禁**，不改 `/api/v1` 的 HTTP 契约。中文契约只新增扩展侧的消息与权限说明。

### 禁止范围

所有未列入 `allowed_paths` 的路径；额外禁止：`backend/**`、`frontend/src/infrastructure/**` 以外的前端目录（除已列出的四个文件）、`scripts/governance/**`、`AGENTS.md`、`docs/governance/**`。

### 依赖/前置条件

基线 `4066c02`（main，TASK-039 与 TASK-041 均已合并）。依赖 TASK-039 的四个资产端点，它们已在 main 上。

### 并行

否。唯一写入者 `coordinator`。

### 顺带完成的状态登记

`docs/tasks/TASK-039-snapshot-assets.md` 与 `docs/tasks/TASK-041-reading-research-doc.md` 在 `allowed_paths` 内，**仅用于把 TASK-041 的 `status` 由 `ACCEPTED` 登记为 `MERGED`**（用户 2026-09-07 合并 PR #45，merge commit `4066c02`），以及在 TASK-039 的 EVIDENCE 区把遗留 A/B/G 标注为「已由 TASK-040 承接」。依据是根 `AGENTS.md` §5。**除此之外不改这两份记录一个字**。（TASK-039 自身的 `status` 已在 TASK-041 的控制面提交中登记为 MERGED。）

## 关键设计决定

### ① 可选权限，且在用户看得见图片张数之后才请求

`optional_host_permissions: ["<all_urls>"]`，安装时授权面**与今天完全相同**（`activeTab` / `scripting` / `storage`）。

`chrome.permissions.request()` 必须在用户手势中调用，而手势会被 `await` 消耗 —— 提取是异步的，所以**不能**在 popup 打开时自动请求。因此 popup 的流程由「打开即采集、随即关闭」改为两步：

1. 打开 popup → 自动提取正文（与今天相同）；
2. 若正文里有图片，显示「发现 N 张图片，一并保存？」两个按钮。点「一并保存」是一次**新的用户手势**，在其中调 `permissions.request`；点「只存正文」或直接关闭 popup 则走今天的路径。

**这既是技术约束的结果，也是更好的形态**：用户在看到「N 张图片」之后才被要求授权，而不是在不知道要干什么的时候。**代价如实登记**：带图页面的采集从一次点击变成两次。

拒绝授权、或某张图取不到，一律**不阻断采集**：正文照存，那些图片保留原站地址（退化回 TASK-039 之前的行为）。

### ② 字节由 service worker 取，因为只有它能绕开 CORS

MV3 下内容脚本的跨源请求受 CORS 管，而正文图片大多在与文章不同源的图床上，绝大多数图床不发 CORS 头。持有 host 权限的 **service worker** 不受此限，这正是「只有浏览器扩展做得到」那句话的具体含义（TASK-036 记录、契约 §4.13 均已写明）。

因此本任务**首次引入 background service worker**。它的职责被限死为一件事：**收到 popup 的取图请求 → 用已授予的权限 fetch → 回传字节**。它不注册任何其他监听、不常驻状态、不主动发起任何请求。`manifest.test.ts` 的顶层键白名单会因新增 `background` 与 `optional_host_permissions` 而失败 —— 这是该守卫**按设计工作**，本任务显式更新它并逐条说明新增键的理由。

fetch 的形态是安全面的一部分，逐条定死：`credentials: 'omit'`（不带任何站点凭证）、`redirect: 'follow'` 但只接受 http(s) 最终地址、单张响应体超过 10 MiB 即中止、总耗时上限、并发上限。

### ③ 字节以 base64 逐张穿过既有的中转通道，不落 `chrome.storage`

扩展消息通道会把载荷 JSON 序列化，`ArrayBuffer` 无法原样通过，所以字节以 base64 传输。**不经 `chrome.storage.local`**：它有 10 MB 配额，而 N 张 10 MiB 的图片必然撑爆，且会把第三方站点的字节留在扩展存储里（TASK-038 已登记过「未交付正文滞留扩展存储」这类问题）。

**逐张按需传输**：`/capture` 页面处理完第 i 张才要第 i+1 张。峰值内存因此只与单张图相关，与图片数量无关；任何一张传输失败只影响那一张。

### ④ 页面上传，且必须在正文写入成功之后

上传资产要带 `If-Match` 为**当前快照版本**，所以顺序固定为：建资料 → 写正文（拿到快照版本）→ 逐张上传图片。图片失败不回滚前两步 —— 「资料 + 正文已存、部分图片没存下」是**可接受的降级**，而「因为一张图没取到就丢掉整篇正文」不是。

页面必须如实告诉用户结果：**成功冻结几张、失败几张、失败的那些仍指向原站**。不许把部分成功显示成完全成功 —— 这正是 TASK-038 遗留里「第二个半成功状态不提示孤儿资料」那条的同类问题。

### ⑤ 遗留 G 是硬性前置，必须在同一个 PR 里关闭

TASK-039 的删除预览已返回 `snapshot_asset_count`，但前端**两份**各自固定六键的解析器与**一份**标签表都忽略它。本任务一旦让扩展开始写资产，带图资料的删除预览就会**少报将被删除的图片**——用户据以决定是否删除的数字是错的。

四处（由 TASK-039 的 Acceptance 定位）：`frontend/src/api/client.ts` 的 `DeletionImpact` 接口与键表、`frontend/src/features/resources/api.ts` 的键表、`ResourceDeletion.tsx` 的标签表。

### ⑥ 标签页复用：零新增权限

`bridge.ts` 现在无条件 `chrome.tabs.create`。改为把上次打开的标签页 id 存入 `chrome.storage.local`，下次先试 `chrome.tabs.update(id, {url, active: true})`，抛错（标签页已关闭）即回落到新开。**`chrome.tabs.update` 对已知 id 不需要 `tabs` 权限**（只有读取 url/title 才需要），因此 manifest 的授权面不因这条增加一个字。

## 完成条件

1. **安装时授权面不变**：`manifest.test.ts` 断言 `permissions` 仍恰好是 `['activeTab','scripting','storage']`；新增的 `optional_host_permissions` 与 `background` 两个顶层键被显式断言，且白名单仍是精确集合相等。
2. **未授权时行为与今天完全一致**：不请求权限、不发任何网络请求、正文照常保存，且有用例证明。
3. **两步 popup**：无图片时不出现第二步；有图片时显示准确张数；点「只存正文」不触发权限请求。
4. **权限被拒不阻断**：拒绝后正文照常保存，页面明确告知图片未冻结、仍指向原站。
5. **service worker 的职责边界有机器守卫**：有用例断言它只注册所约定的那一个消息监听，且 fetch 使用 `credentials: 'omit'`。
6. **单张上限与总量**：超过 10 MiB 的响应在读取中途即中止，不完整读入内存；并发与总耗时有上限且可配置为测试可控值。
7. **只取 http(s)**：`data:`/`blob:`/`file:`/相对地址一律不取（相对地址在提取端已解析为绝对地址）。
8. **逐张传输**：有用例证明第 i+1 张的请求发生在第 i 张处理完之后，且失败一张不影响其余。
9. **上传顺序**：图片上传发生在 `putResourceSnapshot` 成功之后，且带正确的 `If-Match` 快照版本。
10. **部分成功如实告知**：页面显示成功与失败张数；失败原因可读；不自动重试。
11. **遗留 G 关闭**：四处全部更新，删除预览显示图片张数；`client.test.ts` 与 `ResourceDeletion.test.tsx` 有对应断言。
12. **标签页复用**：第二次采集不新开标签页；标签页已关闭时回落到新开；manifest 授权面不变。
13. **TASK-038 遗留 B 关闭**：`tsconfig` 的 `types` 作用域收敛，`extension/src` 下写 `process.env` 不再能通过 typecheck。
14. **TASK-039 遗留 A 关闭**：`frontend` 与 `extension` 两组检查**实跑**并记录计数，不再只有结构性论据。
15. **契约同步**：中文契约 §14 增补扩展侧的图片取回流程、权限边界与降级语义；说明后端契约与端点一字未改。
16. **三组测试计数只增不减**，既有断言无删除、无弱化；新增至少一条走真实后端的 e2e（正文 + 至少一张图片，断言资产可列出）。

## 上下文包

- 规则：`AGENTS.md`、`extension/AGENTS.md`、`frontend/AGENTS.md`、`docs/governance/风险分级与检查规则.md`。
- 必读源文件：`extension/src/manifest.ts`（授权面的唯一来源与其白名单守卫）、`popup/capture.ts` 与 `popup/bridge.ts`（采集编排与 chrome API 接线）、`injected/extract.ts`（Defuddle 与 `useAsync:false` 那条承诺）、`injected/relay.ts`（握手与用后即删）、`shared/protocol.ts`（消息契约，与前端平行实现）、`frontend/src/features/capture/CapturePage.tsx`（两步写入与半成功状态）、`frontend/src/api/client.ts` 与 `features/resources/api.ts`（两份 `deletionImpact` 解析器）。
- 契约：`docs/contracts/API与数据契约基线.md` §4.14（资产语义与上限）、§14（扩展消息契约）、§7（门禁为何使扩展不能直连后端）。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-040-extension-image-freeze.md --worktree`（预期自动选中 `extension`、`frontend`、`contracts` 三组）。

## 已知取舍（登记时即知）

1. **带图页面的采集从一次点击变成两次**。这是 `permissions.request` 必须在用户手势中调用所强制的，不是可选设计。
2. **可选权限一旦授予即长期有效**，用户不会被再次询问；撤销要去扩展设置页。已在 popup 文案与 README 中说明。
3. **登录墙后的图片取不到**（`credentials: 'omit'`），退化为保留原链接。这是「不引入第三方站点凭证」的直接后果，不是缺陷。
4. **交付后用户仍看不到图片**（用户选「只采集不渲染」）。冻结完整性靠端点与用例证明，不靠肉眼。
5. **base64 传输有 33% 体积放大**，逐张传输把峰值控制在单张量级，但一张接近 10 MiB 的图仍会产生约 13 MB 的瞬时消息。

## 实现与测试

- **实现 SHA**：`4b53256`（base `4066c02`，43 个文件，全部在 `allowed_paths` 内）。
  - **扩展**：新增 `src/background/worker.ts`（唯一发网络请求处：`credentials: 'omit'`、`redirect: 'follow'` 但复核落地地址、逐块读取超限即中止、超时）；`manifest.ts` 新增 `optional_host_permissions` 与 `background` 两个顶层键；`extract.ts` 新增 `collectImages`；`relay.ts` 新增按需取图并只服务本次载荷里的地址；`capture.ts` 拆成 `runCapture`（只提取）与 `deliverCapture`（请求权限 + 交付）；`bridge.ts` 复用确认页标签页；popup 改为两步。
  - **前端**：`api/client.ts` 新增 `uploadSnapshotAsset`（带 `If-Match` 的专用 POST 路径，不去放宽 `request()` 那份只允许 DELETE 带版本头的白名单）与三个新错误码；`features/capture/freeze.ts` 新增逐张取回与上传；`CapturePage.tsx` 在写完正文后按快照版本逐张冻结，并如实显示冻结/失败张数。
  - **遗留 G（四处）**：`client.ts` 的 `DeletionImpact` 接口与键表、`features/resources/api.ts` 的键表、`ResourceDeletion.tsx` 的标签表。
  - **遗留 B**：`tsconfig.json` 的 `types` 由 `["node","chrome"]` 收窄为 `["chrome"]`，测试与构建配置移入新的 `tsconfig.tools.json`，`npm run typecheck` 两份都跑。
  - **契约**：中文契约 §14.2 消息表三行与 `CapturePayload` 新增 `images` 一行、§14.4 权限边界重写、§14.5 边界更新为「已由 TASK-039/040 关闭」、新增 §14.6（消息流、信任边界、降级语义）。**`/api/v1` 的 HTTP 契约与 openapi 一字未改** —— 本任务只做 TASK-039 已冻结契约的调用方。
- **命令与真实退出结果**（全部由实现者本人在本机运行，无第三方复核）：
  - `check_task.py --worktree` → **CHECKS PASS**，`profiles=contracts,extension,frontend`，`files=43`，`product_fingerprint=6bed63307e788dddef2449a95f75c7a75f048facb60f3599f5a5db2817e1bd15`。
  - **extension**：`132 passed`（8 文件）。**基线为实测而非引用**：在 `4066c02` 的临时 worktree 上跑出 `84 passed`（7 文件），净增 **48**。
  - **frontend**：`427 passed`（19 文件）。同样实测基线：`4066c02` 上为 `408 passed`（18 文件），净增 **19**。（TASK-038 记录里写的 407 不准，此处以实测为准。）
  - **e2e**：`42 passed`，基线 41，净增 1（`e2e/capture-images.spec.ts`，走真实后端）。
  - `npm run typecheck` / `lint` / `prettier --check` 两个工程均通过。
  - **backend 未运行**：本任务在 `backend/**` 下零改动（不在 `allowed_paths` 内），检查脚本据变更自动选组因而未选中它。**这是结构性论据，不是观察到的 550 仍然为绿。**
  - 环境：macOS Darwin 25.5.0；Node 24；Chromium（Playwright）。
- **遗留 B 的关闭经变异验证**：在 `src/popup/popup.ts` 临时加一行 `process.env.HOME`，收窄后的 `tsc -p tsconfig.json` 报 `TS2591: Cannot find name 'process'`；删掉即恢复通过。收窄前这行会静默通过。
- **既有断言无删除、无弱化**：改动的既有断言只有 `manifest.test.ts` 的顶层键白名单（七键 → 九键，仍是精确集合相等，另新增两条专门断言钉住「站点权限必须留在 optional」与 background 条目的键集），以及各测试的载荷/影响字典 fixture 补字段（仍为精确相等）。
- **用户实测暴露的三个缺陷，与它们各自为什么没被测试拦住**（2026-09-07，用户在三个真实网站上试用）：
  1. **点「连图片一并保存」没有任何反应，且正文一并丢失。** 原因：权限请求在暂存之前，而浏览器在弹授权框时会关掉 popup，上下文当场消失。已改为**先暂存再请求**。测试没拦住是因为假 bridge 里两步都是立即返回的 Promise，顺序对结果毫无影响 —— **用例断言了「两步都发生」，没断言「谁先谁后」**，现已补上顺序断言。
  2. **六张图全失败，而界面只说「没能保存」。** 这不是实现缺陷而是**设计缺陷**：worker 内部本就区分四种原因，我却在页面上把它们合并成一句话，结果一次真实故障完全无法归因，用户和实现者都只能猜。已按原因分行显示，并把「问不到 worker」与「worker 说取不到」拆开。
  3. **`{ fetch: globalThis.fetch }` 丢掉 receiver，浏览器里每一次取图必抛 `Illegal invocation`。** 这是本任务真正的功能性 bug，**图片一张也存不下**。没被拦住有两层原因，都属测试设计问题：① worker 的全部单测都注入假 fetch，**默认依赖那条路一次都没被执行**；② 我此前「拿真实网络验证取图成功」是在 **Node** 里跑的，而 Node 的 `fetch` 没有 receiver 约束 —— 那条看起来很硬的证据**根本没覆盖它唯一运行的环境**。回归用例现在把全局 `fetch` 换成同样挑剔 receiver 的实现，让浏览器专属的失败在 Node 里也能发生。
- **用户实机确认（2026-09-07）**：修复后用户在自己的浏览器上复测，原话是「**这次应该下载成功了**」。**按原话记录，不上调**：这句带「应该」，且未给出具体张数、界面是否无失败提示、资产列表是否可见等细节，因此它确认的是「用户侧观察到图片这次下来了」，**不等于完成条件 16 所要求的全流程逐项核对**。此前三次失败的实机报告则是明确的（见上一条），本次成功报告的确定性弱于那三次。
- **真实浏览器端到端验证（Playwright 加载扩展，独立于 `frontend/e2e`）**：用 `chromium.launchPersistentContext` + `--load-extension` 拉起真实 Chromium，在**隔离的**后端(18000)与前端(15173)加一个本地合成文章页上跑完整链路。观察到：真实 `chrome.scripting` 注入 → 提取出 2 张图 → `chrome.storage` 暂存 → 中转脚本交付 → 页面逐张向 service worker 取字节 → `PUT /snapshot` 201 → **两次 `POST /snapshot/assets` 各 201** → 页面无失败提示并跳转详情 → `GET /snapshot/assets` 返回两条，`media_type=image/png`、`size_bytes` 为 99860 与 77817（与直接下载这两张图的真实字节数一致）。
  - **这个验证不是提交进仓库的自动化测试**，是一次诊断性运行，脚本与临时环境已清理；**因此它不构成可复跑的证据**，只证明「在那一次运行中链路成立」。之所以不入库：`launchPersistentContext` 需要有头浏览器、要改扩展的 `UI_ORIGIN` 常量才能指向 e2e 端口、且用户点击扩展图标授予 `activeTab` 这一步自动化无法真实触发（诊断中用 host 权限替代）。**登记为遗留项，不假装它已被 CI 覆盖。**
  - 未验证的仍有：真实的授权框交互（自动化下 `permissions.request` 直接返回 granted、不弹框）、popup 被浏览器关闭的行为、以及点击扩展图标授予 `activeTab` 的那条路径。

- **第一轮 Review 处置（两位独立 Reviewer 各自判 CHANGES_REQUIRED；阻断项属同一类）**：
  - **F1（两位都提，R2 的定位更要命）—— 面向用户的文案仍宣称「本版本不冻结图片」。** R2 指出的 `CapturePage.tsx:198` 就渲染在用户点「保存为资料」的那张表单上：用户在授权后、按下确认的那一刻，屏幕上写着「不会去第三方站点取字节」。R1 指出的根 `README.md:242` 同一句，且与我在同一节改过的 250 行**自相矛盾**。**更严重的是 R1 发现我重写那段时删掉了基线上两句既有安全承诺**（manifest 白名单守卫、扩展不直连后端），已恢复。另按两位定位补齐 `extension/AGENTS.md:25`（仍写「七个键」）与 `extension/README.md` 的一步式用法。
  - **R1 F2（已修）—— 默认 `fetch` 那条路修完后仍然一次都没被执行。** 回归用例传的是**手写的正确写法副本**与**手写的错误写法副本**，把 `worker.ts` 的默认值改回出 bug 的写法，全部单测照样绿。已补一行**不传第二个实参**的断言，真正走默认依赖。
  - **R1 F3（已修）—— 标签页 id 存进 `chrome.storage.local` 会跨浏览器重启持久，而 tab id 只在单次会话内唯一。** 重启后首次采集可能把一个恰好占用同一 id 的**无关标签页**导航到确认页，用户在那里未保存的输入丢失；`catch` 只挡「id 无效」，挡不住「id 有效但不是我的」。改用 `chrome.storage.session`（既有权限，关闭浏览器即清空）。
  - **R1 F4（已修）—— `URL.origin` 在非默认端口时带端口，而 match pattern 的 host 段不接受端口号**，会让整批权限请求被拒。popup 与 worker 两处统一改为 `protocol + hostname`，且两处必须一致，否则「请求的模式」与「查询的模式」不同，授了权也查不到。
  - **R2 N1（已修）—— 兜底文案臆断了它并不知道的原因。** 上传失败时 reason 是后端错误码（`VERSION_CONFLICT`/`STORAGE_PATH_UNAVAILABLE`…），却一律显示「扩展未响应、网络不通或已超时」，把人指向 `chrome://extensions`。而 `STORAGE_PATH_UNAVAILABLE` 恰好会让**所有**图片同时失败——正是「六张全失败」那次故障的形态。已改为已知后端码交给 `failureText`、认不出的只说没保存并附原始码，并加断言禁止兜底出现「扩展未响应」。
  - **R2 N3（已修）—— 平行 protocol 的守卫没跟上本次新增**，而记录称「两端消息格式由平行 protocol 的守卫覆盖」。已把 `isSafeImageUrl`/`isImageList`、两条图片消息名、`MAX_IMAGES`/`MAX_IMAGE_BYTES` 纳入逐字比对，并经变异验证（改镜像里的 `MAX_IMAGES` 立刻变红）。
  - **R2 N4（已修）—— 唯一接收字节的信任边界 `imageResultFrom` 无直接单测。** 已补拒绝表（跨窗口、跨源、类型不符、base64 形状不合、reason 非字符串），并钉住 `bad-bytes` 为 fail-closed、站点错误细节不透传。
  - **R2 N5（已修）—— 图片部分失败后表单仍可再次提交**，会静默新建第二份资料与快照并重下全部图片。已改为该状态下不渲染表单（与同页 `partial` 分支一致）。
- **两位 Reviewer 指出我三处自述比事实宽，均已更正**：
  1. 「三处文案已按实际授权面重写」——被重写的只是每份文件里的**一段**，同文件其它段落停在旧口径（R1 F1、R2 F1）。
  2. 「回归用例让浏览器专属失败在 Node 里也能发生」——桩确实解决了 receiver 那一半，但「默认依赖从未被执行」在修复后**依然成立**（R1 F2）。
  3. 「权限请求、标签页复用、service worker 唤醒三件事被抽象成 bridge 接口后以假实现测试」——对权限请求成立，对**标签页复用不成立**：那段逻辑整体住在无任何测试的 `bridge.ts` 里，完成条件 12 的前两句此前零机器证据（R1 F3）。
- **按 Reviewer 判定更正的完成条件**（R1 F5、R2 N2）：
  - **条件 5 部分满足**：`credentials:'omit'` 有双重守卫（用例 + 源码扫描）；但「只注册那一个监听」无机器证据——模块顶层的 `addListener` 在 node 环境下 `chrome` 未定义、从不执行，也没有用例去数注册了几个。
  - **条件 6 部分满足**：单张有 20s（worker）与 30s（页面）上限、并发由顺序循环结构性满足；但**没有总预算**，60 张最坏可让确认页停在「正在下载图片」约 20 分钟。
  - **已知限制 5 原文比事实宽**（R2 N2）：超过 60 张的图片在 `collectImages` 就被 `slice` 掉，**根本不进载荷**，因此既不计入 `frozen` 也不计入 `failed`——用户**完全无从得知有图被跳过**，而非原文所说的「混在没能保存的计数里」。现状比原登记更弱。

- **第二轮 Review 处置（两位均 PASS，另各给出非阻断新发现，全部已修）**：
  - **R1#1 / R2 N6 —— 我上一轮的兜底文案在认不出的原因上一个字都没说。** `failureText` 对未知码返回**空串**，界面渲染成「1 张：（upload-failed）」；而我新加的断言只查「不含『扩展未响应』且含原始码」，空串两条都满足，**正好绕过**。已补 `|| '没能保存到本机。'`，并把断言改为要求出现人话。
  - **R2 N7 —— `new ApiError(reason as never)` 是拿 postMessage 带来的任意字符串去查 `messages`。** `reason === 'constructor'` 会取到 `Object` 构造函数并把它的源码显示到界面上；`（${reason}）` 又把不可信文本原样回显且不限长。已加 `isBackendCode` 白名单正则，认不出的既不解释也不回显，并有断言钉住。
  - **R2 N8 —— 页面超时那条路丢了「扩展没答话」这个含义。** `askExtensionForImage` 超时 resolve 时无 reason，落进 `failed` 桶，而我把 `failed` 的文案改成了「网络不通、站点无响应」——**旧兜底恰好覆盖到的那层含义被我改没了**。已给超时专属 reason `no-answer` 与指向 `chrome://extensions` 的文案。
  - **R2 N9 —— 镜像上限比对的正则没有右锚**：镜像写成 `60 + 1` 只捕获 `60 `，算出 60 == 60 照样绿。放宽到「右侧可以是算式」之后这个洞更难被人眼发现。已加行尾锚。
  - **R1#2 / R2 N10 —— F4 的「两处必须一致」没有任何机器守卫**，两个手写表达式分居两个文件、全靠注释叮嘱。已抽成两份 protocol 共用的 `matchPatternFor`（并纳入平行副本的逐字比对），popup 与 worker 两侧各补一条断言直接看那个模式串。**这与本任务已被咬过两次的形态（顺序断言、默认 fetch）同源：靠注释维持的不变量迟早会散。**
  - **R1#3 —— 我把一条未验证的浏览器行为写成了事实。** 「match pattern 的 host 段不接受端口号」R1 上轮明确标注过无法实机验证，我却当结论写。已在 `matchPatternFor` 的注释里改为「依 Chrome match pattern 文档判断，**未实机验证**」。
  - **R1#4 / R2 可选 —— `extension/README.md` 把用户原话上调了**：写成「用户也报告修复后图片能下载」，而原话是「这次**应该**下载成功了」。同一份记录别处坚持「按原话记录、不上调」，这里却没做到。已改回原话并注明保留语气。
  - **R1#5 —— 新 README 与刚更正的已知限制 5 相抵**：README 说「确认页会如实告诉你有几张没保存」，而超过 60 张被截断的那些用户完全无从得知。两份 README 各补一句例外说明。
- **第二轮之后仍然开着的非阻断项**（两位共同确认，按四要素登记）：
  - **（A）`bridge.ts` 零测试**：标签页复用、权限请求复核、确认页打开全住在这个无任何测试的适配器里。暂不修理由：这三件事的真实行为只有实机能证，假实现测不出有价值的东西。**责任角色：coordinator。重评触发条件：`bridge.ts` 再次改动，或出现与标签页/权限相关的用户报告。**
  - **（B）完成条件 5 部分满足**：「只注册那一个监听」无机器证据——模块顶层的 `addListener` 在 node 环境下 `chrome` 未定义、从不执行。暂不修理由：要真证需在扩展环境里数监听数。**责任角色：coordinator。重评触发条件：service worker 新增任何监听。**
  - **（C）完成条件 6 部分满足**：单张有 20s/30s 上限、并发由顺序循环结构性满足，但**无总预算**。最坏情况是 60 × **30 秒**（页面侧等答复的超时）≈ **30 分钟**——不是 20 分钟：20 秒是 worker 自己的超时，只有 worker 应答时才成立（R2 第三轮更正）。**责任角色：coordinator。重评触发条件：用户报告确认页长时间停在「正在下载图片」。**
  - **（D）超过 60 张的图片被静默跳过**：既不计 frozen 也不计 failed，用户无从得知（两份 README 已补例外说明，但界面仍不提）。**责任角色：coordinator。重评触发条件：出现 60 张以上的真实采集，或用户问起「为什么少了几张」。**
  - **（E）`boundaries.test.ts` 的两条扫描有已知盲区**（R1）：凭证扫描只读 `background/worker.ts` 一个文件，网络扫描又整目录排除 `/background/`——新增一个 `background/other.ts` 发带凭证的请求可全绿通过。**责任角色：coordinator。重评触发条件：`background/` 下新增任何文件。**
  - **（F）`listSnapshotAssets` 无调用方、无用例**（R2 上轮可选建议）：为 TASK-041 之后的显示任务预留。**责任角色：显示任务的写入者。重评触发条件：该函数首次被调用时补用例。**

- **第三轮 Review 处置（两位均 PASS，仅剩注释级与记录准确性）**：R2 逐个比对了 `client.ts` 的 38 个错误码键，确认 `isBackendCode` 未把任何真实后端码挡在外面、原型链查找的口子已关死；R1 确认 `matchPatternFor` 抽取无行为变化、新断言确实可红、镜像右锚有效且不误伤。三条处置：① **`upload-failed` 找回可诊断性** —— 它是我们自己产生的内部标记、可安全回显，上一轮为挡不可信字符串时把它一起赔进去了（小写故落 else 分支，渲染得与注入垃圾一模一样），现给它专属文案；② `isBackendCode` 移到 JSDoc 之前，那段「一次真实故障的直接产物」的注释归回 `imageFailureText`；③ `ImageResult.reason` 的取值表已过时（`failed` 仍写着「扩展没答话」，而那层含义本轮已拆给 `no-answer`，且缺 `no-worker`/`bad-bytes`），按实际取值重写，并在 `matchPatternFor` 的共用 JSDoc 里点明「前端侧无调用方，存在理由是平行副本守卫」，免得被当死代码删掉。

- **已知限制/未完成项**：
  1. **仓库里的 e2e 验不到扩展那一段**（真实浏览器验证见上，但那是一次性诊断运行，未入库）。Playwright 不加载扩展，所以提取、权限请求、service worker 取字节、中转脚本转交在 e2e 里全部由页面内的桩代替。它证明的是「页面拿到字节之后到后端存下并能列出」这一段。扩展侧由 `extension/` 单测覆盖，两端消息格式由两份平行 protocol 的守卫覆盖 —— **但三者之间没有任何一条端到端证据**，与 TASK-038 的同一处缺口性质相同，只能由用户实机确认。
  2. **权限请求、`chrome.tabs.update` 复用、service worker 唤醒这三件事无法在单测里真跑**：它们都被抽象成 bridge 接口后以假实现测试。真实的 chrome API 行为（尤其「`tabs.update` 对已知 id 不需要 `tabs` 权限」这一条）**只有实机能证**。
  3. **`collectImages` 不认引用式 Markdown 图片**（已在代码注释与契约 §14.6 说明）。用那种写法的页面，其图片保留原站地址。
  4. **base64 传输有 33% 放大**：一张接近 10 MiB 的图会产生约 13 MB 的瞬时消息。逐张传输把峰值控制在单张量级，但单张仍可能触及扩展消息通道的体积上限 —— 触及时该张记为失败，退化为保留原链接。**该上限的具体数值未经实测。**
  5. **一次采集最多 60 张**是扩展侧的自定上限（后端不设张数上限）。超出的图片保留原站地址，但**页面当前不会专门说明「有几张因为超过 60 张而未尝试」** —— 它们混在「没能保存」的计数里。
  6. **文档守卫的覆盖面比它看起来窄**：`boundaries.test.ts` 只断言三处文档**包含** manifest 声明的每个字符串。本次改动前，`<all_urls>` 早已作为「不采用的替代方案」出现在文档里，因此那条断言在语义完全相反时也会通过。三处文案已按实际授权面重写，但**这条守卫本身仍只证明字符串在场，不证明描述正确**。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- **候选 SHA 与审查链**：首轮冻结候选 `50240f6306307162c53a77276ba9945d593ac2cc`（两位 Reviewer 均判 **CHANGES_REQUIRED**）→ `1ab823f7bf76a6cb2578c435b5ee0c703eae6212`（均 PASS）→ `61c8153cd7dba0788db117105c3cd844b821d004`（均 PASS）→ **最终候选 `0948f86e84862db3fbb1d9fe0bcd215f36eaf5f9`**。执行链为「首轮完整审查 + 三次增量复核」，每轮增量都由**同一位** Reviewer 复核并显式声明其继承的上轮覆盖范围（§6 对修订审查的要求）。

- **最终候选的检查证据（全部由实现者本人在本机运行，三个只读实例一律未复跑）**：
  - `check_task.py --task docs/tasks/TASK-040-extension-image-freeze.md --worktree` → **CHECKS PASS**，`profiles=contracts,extension,frontend`，`files=43`，`product_fingerprint=2222b5bfb7b618e11a006a638d2ae99aa34e2b027314e2cf463bd36f6f4ea0ac`。
  - **extension 145 passed**（8 文件）／**frontend 440 passed**（19 文件）／**e2e 42 passed**。基线为**实测**而非引用：在 `4066c02` 的临时 worktree 上跑出 extension **84**（7 文件）、frontend **408**（18 文件）、e2e **41**。净增 61／32／1。
  - **backend 未运行**：本任务在 `backend/**` 零改动、不在 `allowed_paths` 内，检查脚本据变更自动选组因而未选中它。**这是结构性论据，不是观察到 550 仍为绿。**
  - 环境：macOS Darwin 25.5.0；Node 24；Chromium（Playwright）。
  - **对「实现与测试」段的澄清（按 Acceptance 硬要求 ②）**：该段记的 `实现 SHA 4b53256`、`product_fingerprint=6bed633…`、`132/427/42` 属**首个候选**，三轮修订后未更新——因为 §6 禁止审查后改动标记区外的实现与测试记录。**最终候选的计数与指纹以本区上面两行为准**；不得拿首个候选的 PASS 代表最终候选。

- **完成条件判定（以独立 Acceptance 的判定为准，非实现者自评）**：**满足 12 条，部分满足 4 条（3、5、6、12），不满足 0 条。**
  - 实现者自评把 **5、6** 标为部分满足，Acceptance 复核为**准确**。
  - **Acceptance 更正了实现者漏标的两条**：
    - **条件 3 部分满足**：「准确张数」与「只存正文不触发权限」有用例；但**「无图时不出现第二步」「有图时出现第二步」「两个按钮各自接到 `deliverCapture` 的哪个实参」全部住在 `popup/main.ts`，该文件零测试**（全仓无任何文件引用 `#choices`/`#with-images`/`main.ts`）。
    - **条件 12 部分满足**：第三句「授权面不变」有断言；**前两句「第二次不新开」「已关闭时回落新开」至今零机器证据**，逻辑全在无测试的 `bridge.ts`。记录正文第 191 行写「完成条件 12 的前两句**此前**零机器证据」——**「此前」不成立，现在仍然是零**，这本身是一处「陈述比证据宽」，在此更正。
  - 条件 14（TASK-039 遗留 A 的关闭条件）**形态达标**：自动选组 + 三组实跑计数 + 基线在临时 worktree 上实测，正是遗留 A 要的「不再只有结构性论据」；其满足以本区记录最终候选计数为前提。
  - 条件 16 由**入库的** `frontend/e2e/capture-images.spec.ts` 承担。**真实浏览器诊断运行（Playwright 加载扩展）没有承担任何完成条件**——Acceptance 独立确认了这一点；该运行自述不可复跑、脚本已清理，并列出三处仍未验证（授权框交互、popup 被关闭、点图标授予 `activeTab`）。

- **Review（L3，两位独立只读 Reviewer，各三轮，互不通信、无上下文继承）**：首轮 **CHANGES_REQUIRED + CHANGES_REQUIRED**（阻断项同类）→ 第二、三轮 **PASS + PASS**。
  - **权限证据（两位各自自述，均未试写探测）**：工具白名单只有 `Read`/`Grep`/`Glob`；**无**写工具、**未授予** `Bash`。因此两位**都无法复跑**任何机械证据。
  - **首轮阻断项**：面向用户的文案仍宣称「本版本不冻结图片」。R2 定位的 `CapturePage.tsx` 那句**就渲染在用户点「保存为资料」的表单上**——用户在授权后、按下确认的那一刻，屏幕上写着「不会去第三方站点取字节」；R1 另发现实现者重写根 README 那段时**删掉了基线上两句既有安全承诺**（manifest 白名单守卫、扩展不直连后端）。
  - 六份报告原文见下。

- **Acceptance（L3 独立只读，第三个全新实例，独立于唯一写入者与两位 Reviewer，无上下文继承）**：**PASS，附两条硬要求**——① 把条件 3、12 记为部分满足并扩充遗留 A（含 `popup/main.ts`）；② 写入最终候选的实跑计数与指纹，并澄清正文第 154–167 行属首个候选。**两条均已落实，见上。** 其权限证据与两位 Reviewer 相同（只读三工具、无 Bash、未复跑任何检查）。报告原文见下。

- **非阻断遗留项（按 `风险分级与检查规则.md:29` 四要素登记；清单以独立 Acceptance 给出的为准，实现者按其增删落实）**：
  - **（A）`popup/bridge.ts` 与 `popup/main.ts` 零测试**（Acceptance 扩充：实现者原本只登记了 `bridge.ts`，**漏了 `main.ts`**，而两步 popup 的全部分支逻辑住在后者，条件 3 正是靠它）。直接后果：**条件 3 的界面分支子句与条件 12 的前两句无机器证据**。暂不修理由：标签页复用、权限请求复核、service worker 唤醒的真实行为只有实机能证，假实现测不出有价值的东西。**责任角色：coordinator。重评触发条件：这两个文件再次改动，或出现与两步弹窗/标签页/权限相关的用户报告。**
  - **（B）条件 5 的「只注册那一个监听」无机器证据**：模块顶层的 `addListener` 在 node 环境下 `chrome` 未定义、从不执行，也无用例去数监听数。暂不修理由：要真证需在扩展环境里数监听。**责任角色：coordinator。重评触发条件：service worker 新增任何监听。**
  - **（C）条件 6 无总耗时预算**：单张有 20s（worker）与 30s（页面）上限、并发由顺序循环结构性为 1，但最坏是 60 × **30 秒** ≈ **30 分钟**（页面侧超时才是决定项；20 秒只在 worker 应答时成立——R2 第三轮更正了实现者原先写的 20 分钟）。**责任角色：coordinator。重评触发条件：用户报告确认页长时间停在「正在下载图片」。**
  - **（D）超过 60 张的图片被静默跳过**：在 `collectImages` 的 `slice` 处就被截断，既不计 `frozen` 也不计 `failed`，**界面完全不提**（两份 README 已补例外说明）。**责任角色：coordinator。重评触发条件：出现 60 张以上的真实采集，或用户问起「为什么少了几张」。**
  - **（E）`boundaries.test.ts` 两条扫描有已知盲区**：凭证扫描只读 `background/worker.ts` 一个文件，网络扫描又整目录排除 `/background/`——新增一个 `background/other.ts` 发带凭证的请求可全绿通过。**责任角色：coordinator。重评触发条件：`background/` 下新增任何文件。**
  - **（F）`listSnapshotAssets` 无调用方、无用例**：为后续「显示图片」任务预留。**责任角色：该任务的写入者。重评触发条件：该函数首次被调用时补用例。**
  - **（G）`shared/protocol.ts` 的 `CONFIRM_TAB_KEY` 注释仍写 `chrome.storage.local`**（Acceptance 新增），而 R1 F3 之后实现已改用 `storage.session`。影响：文档级误导，**可能诱导后续改回 `local`，复活「跨浏览器重启把无关标签页导航走、带走用户未保存输入」那条风险**。暂不修理由：改它会形成新候选、需再走一轮复核，而两位 Reviewer 与 Acceptance 均将其列为可登记项而非必修。**责任角色：coordinator。重评触发条件：下次改动 `bridge.ts` 或 `CONFIRM_TAB_KEY` 时必须一并修正。**
  - **（H1）base64 消息通道的体积上限未实测**（Acceptance 要求补四要素）：一张接近 10 MiB 的图会产生约 13 MB 的瞬时消息，触及上限时该张记为失败、退化为保留原链接。**责任角色：coordinator。重评触发条件：出现接近 10 MiB 的真实图片失败。**
  - **（H2）文档守卫只证字符串在场、不证描述正确**（Acceptance 要求补四要素）：本任务已实际吃过这个亏——`<all_urls>` 早以「不采用的替代方案」出现在文档里，守卫因此在语义完全相反时也全绿。**责任角色：coordinator。重评触发条件：下次改动三处面向用户的权限文案。**
  - **（I）三条未实机验证的浏览器行为**（Acceptance 新增，合并登记）：① match pattern 的 host 段不接受端口号（依 Chrome 文档判断）；② `chrome.tabs.update` 对已知 id 不需要 `tabs` 权限；③ popup 是否会被授权框关闭。三者均已在代码注释中标注为未验证。**责任角色：coordinator。重评触发条件：用户报告「授权了但图片仍全部 no-permission」，或标签页复用异常。**
  - **（J）剩余风险，不作为遗留项但如实记下**（Acceptance）：`isSafeImageUrl` 允许 `http://127.0.0.1:*` 一类本机/内网地址，恶意页面可诱使扩展代取——但凭证已 `omit`、目标源会出现在授权框里、后端按魔数拒非图片、且字节只流向本机 UI 页面无外发通道，故影响有限。如需收紧可在后续任务加内网例外。

- **最终状态/风险/用户操作**：status=**MERGED**（2026-09-07 用户合并 PR #46，merge commit `0106953`；本行状态登记按根 `AGENTS.md` §5 并入下一个已授权任务 TASK-042 的控制面提交）。交付时为 **ACCEPTED**。L3 执行链完整：Worker → 自动检查（CHECKS PASS）→ 两位独立只读 Reviewer **各三轮** → 独立只读 Acceptance（PASS + 两条硬要求，均已落实）。四个审查实例互不相同，均只有 `Read`/`Grep`/`Glob`、无 `Bash` 与写工具、无上下文继承。
  - **须向用户当面说明的六点**：
    1. **完成条件 16 条中 4 条只是部分满足**（3、5、6、12），**其中 3 与 12 是 Acceptance 更正出我自评的遗漏**——两步 popup 的界面分支与标签页复用至今零机器证据。没有一条不满足。
    2. **全部机械证据由实现者单方运行**：CHECKS PASS、145/440/42、指纹、变异验证、真实浏览器诊断运行一律 NOT_RUN 于四个只读实例（遗留见下）。
    3. **本任务的三个缺陷全部由用户实测发现，测试套件一个都没拦住**，且其中两个的根因是**测试设计**而非实现。详见决定日志。
    4. **图片冻结成功，但界面上看不到图片**——用户选的「只采集不渲染」，显示属后续任务。
    5. **遗留 A 是最实的一条**：两步 popup 与标签页复用的分支逻辑无任何测试，只有用户实机能证。
    6. **遗留 G 是一条已知的、留着的文档误导**：`protocol.ts` 的注释仍写 `storage.local`，可能诱导后人改回去、复活「重启后把无关标签页导航走」的风险。之所以不当场修，是为避免为一行注释再走一轮完整复核；下次动那个文件必须一并修。
  - **需要用户操作**：审阅后决定是否合并。合并后可开「显示已冻结图片」的后续任务（用户尚未在「完整渲染」与「轻量列出」之间作选择）。

- **日期与决定日志**：2026-09-07 用户合并 PR #44/#45 后指示开 TASK-040，并就权限与渲染两项作答（「重要的是要把功能做好、做全，权限的事情都可以商量」→ 选可选权限而非永久权限，理由是两者覆盖面相同、可选权限不牺牲任何覆盖面；「只采集不渲染」）。首个候选交付后**用户在三个真实网站上试用，暴露三个缺陷，测试套件一个都没拦住**：正文丢失（权限请求排在暂存之前，浏览器弹框时关掉 popup）、六张图全失败而界面只说「没能保存」（四种原因被我合并成一句，故障无法归因）、以及真正的功能 bug —— `{ fetch: globalThis.fetch }` 丢掉 receiver，浏览器里**每一次取图必抛 `Illegal invocation`**。第三个由主 Agent 用 Playwright 加载真实 Chromium 定位：worker 里裸 `fetch` 返回 200 而 `fetchImage` 返回 failed，`{ fetch: globalThis.fetch }.fetch(url)` 直接复现该 TypeError。

  **过程结论（经独立 Acceptance 确认成立，并给出可执行动作）**：三个缺陷里有两个的根因是**测试设计**而非实现——假 bridge 让步骤顺序对结果毫无影响（用例断言了「两步都发生」，没断言「谁先谁后」）；worker 的全部单测都注入假 fetch，**默认依赖那条路一次都没被执行**，而此前那次「拿真实网络验证取图成功」是在 Node 里跑的，Node 的 `fetch` 没有 receiver 约束，**那条看起来很硬的证据根本没覆盖它唯一运行的环境**。同一形态在第二轮又以第三种面目出现：两处手写的 match pattern 分居两个文件、靠注释叮嘱「两处必须一致」。据此立下一条可执行的检查动作：

  > **凡是被测代码存在「默认依赖/默认参数」或「多步骤先后顺序」的地方，任务的完成条件里必须各有一条对应用例：默认依赖要有一条「不传该实参」的用例，编排要有一条「断言顺序而非断言两步都发生」的用例；靠注释维持的跨文件不变量一律抽成共享实现并纳入平行副本比对。**

  三轮 Review 中，两位 Reviewer 共指出实现者**至少八处「陈述比证据宽」**：三处文案只改了每份文件的一段、默认 fetch 路径修复后仍未被执行、标签页复用不是「以假实现测试」而是零覆盖、把未实机验证的浏览器行为当结论写、把用户原话「这次**应该**下载成功了」上调为「用户报告图片能下载」、兜底文案承诺「说人话」实际输出空串、平行 protocol 守卫未覆盖本次新增却称已覆盖、以及「完成条件 12 前两句**此前**零机器证据」中的「此前」。Acceptance 又独立扫出四处，其中两处（条件 3/12 漏标、遗留 A 范围写窄）已按其硬要求更正。**这一模式在本任务链里出现的频次高于任何单个技术缺陷。**

  用户在修复后复测，原话为「这次**应该**下载成功了」——按原话记录、不上调；Acceptance 独立确认它**没有被用来关闭任何完成条件**。


---

### Review R1 · 第一轮原文（扩展侧与授权面切片，结论 CHANGES_REQUIRED）

> ## 1. 权限证据（运行器层）
>
> 本 Agent 的工具白名单只有 `Read`、`Grep`、`Glob` 三项只读工具。**没有** `Write`/`Edit`/`NotebookEdit`，**没有** `Bash`（因此无法执行任何 git 命令、无法提交/推送/合并、无法运行测试或脚本）。这不是承诺而是运行器层面的能力边界：任何写入尝试都不存在对应工具。我未以试写仓库文件的方式探测权限。
>
> **代价须如实登记**：因为没有 Bash，我**无法复跑**记录里的 `132 passed` / `check_task.py CHECKS PASS` / 变异验证（`process.env` 报 TS2591）/ 真实浏览器诊断运行。以下结论全部基于 `/tmp/sp-t040/T040.patch`（3121 行逐行读完）与工作树源码的静态核对。
>
> - base `4066c02` → candidate `50240f6`；工作树内容与 patch 一致（抽查 `manifest.test.ts`、`boundaries.test.ts`、`relay.ts`、`bridge.ts`、`main.ts`、`README.md` 均逐字相符）。
>
> ## 2. Findings
>
> ### F1（阻断）根 `README.md:242` 现在是一句假陈述，且同一次改动删掉了两句既有安全承诺
>
> - **证据**：`README.md:242` 仍写「用法：…**不点确认就什么都不会保存。** 图片仍指向原站，**本版本不冻结图片**。」而 `README.md:252`（本次重写的段落）说的是相反的事。同一段落还**删除**了基线上存在的两句：「`extension/src/manifest.test.ts` 以白名单断言锁住 manifest 的顶层键集合与权限清单…」与「扩展不直接调用后端 API，内容一律经本机 UI 页面转交…」（对照 patch:9 旧行 / patch:10 新行）。另 242 行的用法说明仍是一步式，与实际两步 popup（「连图片一并保存」/「只保存正文」）不符；`extension/README.md:5` 同样只写一步。
> - **为什么必须修**：这是本任务唯一的命题——授权面扩张必须被如实告知——的直接反面。触发条件是「任何人读 README」，必然发生；一个只读 242 行的用户会认为扩展不会为图片联网。`boundaries.test.ts:60-86` 的文档守卫**结构上无法**发现它（只断言字符串在场）。最小修正：改 242 行那一句、补一句两步流程、恢复被删的两句，约 3–4 行纯文档，无代码风险。
> - 记录中「三处文案已按实际授权面重写」这句**比事实宽**：被重写的是三份文件里各一段，同一份文件的其它段落没跟上。
>
> ### F2（非阻断，建议顺手修，3 行）`fetch` 默认依赖那条路**仍然**一次都没被执行
>
> - **证据**：`extension/src/background/worker.ts:42-54` 的默认参数 `deps = { fetch: (input, init) => fetch(input, init) }` 只在**完全省略第二个实参**时生效。而 `worker.test.ts` 里 12 处 `fetchImage(...)` 调用**全部**传入了 `deps`（含 `fetch`），包括那条新增的回归用例：它传的是 `fetch: (input, init) => globalThis.fetch(input, init)`（worker.test.ts:169）和 `fetch: { fetch: globalThis.fetch }.fetch`（:175）——即**手写的正确写法副本**与**手写的错误写法副本**，不是被测代码里的默认值。
> - **后果**：把 worker.ts 的默认值改回 `fetch: globalThis.fetch`（正是用户实测那个「每张图必抛 Illegal invocation」的 bug），全部扩展单测**照样绿**。
> - **对记录自述的判断**：记录第 173 行给的两条根因中，②（Node 无 receiver 约束）确实被那个 strict 桩解决了；但①「默认依赖那条路一次都没被执行」在修复后**依然成立**，而记录的行文让人以为该缺口已闭合——这条自述**比事实宽**。
> - **最小修正**：在 strict 桩生效期间加一行 `await expect(fetchImage('https://cdn.example.com/a.png')).resolves.toMatchObject({ ok: true })`（单实参，走默认 deps；node 下 `chrome` 未定义故 `granted()` 返回 true）。否则请把记录改为「回归用例钉住的是默认值应有的写法，默认值本身仍未被执行」。
>
> ### F3（非阻断）确认页标签页复用：跨浏览器重启的 id 复用会把**无关标签页**导航走
>
> - **证据**：`extension/src/popup/bridge.ts:33-46` 把上次的 tab id 存进 `chrome.storage.local`（**跨浏览器重启持久**），下次无条件 `chrome.tabs.update(previous, {url, active:true})`。Chrome 的 tab id 仅在**单次浏览器会话内**唯一，重启后从低位重新分配。因此重启后第一次采集可能把一个**恰好占用同一 id 的其它标签页**导航到 `/capture`，用户在那个标签页里的未保存输入丢失。`catch` 只覆盖「id 无效」，覆盖不了「id 有效但不是我的」。
> - **场景与可能性**：本机个人使用、每天关一次浏览器 → 每次重启后的首次采集都在这条路径上；命中与否取决于低位 id 是否被占用，属可实际发生而非理论。
> - **最小修正**：该键改用 `chrome.storage.session`（属既有 `storage` 权限，浏览器关闭即清空，popup 是 trusted context），一行改动，零新增权限、零新增读 url 需求。
> - **附带**：该复用逻辑**完全没有任何测试**（无 `bridge.test.ts`；`capture.test.ts` 的假 bridge 里 `openConfirmPage` 是空实现）。记录已知限制 2 说这三件事「被抽象成 bridge 接口后以假实现测试」——对权限请求成立（`deliverCapture` 确有假实现测试），对标签页复用**不成立**：这段逻辑整体住在未被测试的适配器里，一条用例都没有。完成条件 12 的前两句目前无任何机器证据。此处自述**比事实宽**。
>
> ### F4（非阻断）权限匹配模式带端口时可能整批请求失败
>
> - **证据**：`extension/src/popup/capture.ts:127` 用 `new URL(image).origin + '/*'`，`worker.ts:65` 用 `new URL(url).origin + '/' + '*'`。`URL.origin` 在非默认端口时含端口（`https://cdn.x:8443`），而扩展 match pattern 的 host 段不接受端口号；此时 `chrome.permissions.request` 抛错 → 冒泡到 `main.ts:42` 的 catch → 显示「交给 StudyPilot 时出错了」，确认页不打开（正文因先暂存而不丢）。
> - **可能性低**（公网图床极少用非默认端口），**我无法实机验证 Chrome 的确切拒绝行为**，故列为可记录项。最小修正：改用 `url.protocol + '//' + url.hostname + '/*'`——match pattern 本就是端口无关的，去掉端口不损失任何覆盖面。
>
> ### F5（非阻断）完成条件 5 与 6 各有半边没有机器绑定
>
> - **条件 5「有用例断言它只注册所约定的那一个消息监听」**：`worker.test.ts` 只测 `imageHandler` 的行为；模块顶层的 `chrome.runtime.onMessage.addListener(...)`（worker.ts:152）在 vitest node 环境下 `chrome` 未定义、**从不执行**，也没有任何用例数一数注册了几个监听。`credentials:'omit'` 那半边有双重守卫（用例 + `boundaries.test.ts:97-104`），成立。
> - **条件 6「总耗时有上限」**：只有**单张** 20 s（`IMAGE_TIMEOUT_MS`）与页面侧单张 30 s（`freeze.ts` `askExtensionForImage`）。`freezeImages` 是无总预算的顺序循环，60 张最坏可让确认页停在「正在下载图片」约 20 分钟。并发上限由顺序循环结构性满足。
> - 建议：按实际情况在 EVIDENCE 里把 5、6 记为**部分满足**，而不是满足。
>
> ### F6（非阻断）`extension/AGENTS.md:25` 的顶层键清单仍停在「七个」
>
> 同一文件 24 行已按新授权面重写，25 行却仍写「（当前为 `manifest_version`/…/`action` 七个）」。这正是该文件自己说「已经连着出现四次」的那类漂移，且文档守卫按设计发现不了。一行修正。
>
> ## 3. 逐条回答点名的核查项
>
> 1. **授权面只在运行时扩张**：成立，且断言**不是**形式合规。`permissions` 仍恰好 `['activeTab','scripting','storage']`（manifest.test.ts:84）。把 `<all_urls>` 挪进 `host_permissions` 会同时触发**三条**独立失败：顶层九键精确集合（:41）、`not.toHaveProperty('host_permissions')`（:61）、`optional_host_permissions` 精确等于 `['<all_urls>']`（:60）。`background` 条目另有内层键锁（:77），堵住 `type:'module'`/`persistent` 之类的悄悄扩张。关键绑定已核实：`vite.config.ts:10-19` 的 `manifest.json` 由测试所导入的**同一个模块**生成，仓库无第二份副本——断言与实际产物同源。
> 2. **service worker 职责边界**：只注册一个 `onMessage`，无常驻状态、不写存储、不主动发请求（源码核实 + `boundaries.test.ts:88-95` 扫描 popup/injected 无 fetch/XHR/sendBeacon）。跨扩展消息走 `onMessageExternal`（未注册），因此**其它扩展打不到它**。`credentials:'omit'` 的可绕过面：`boundaries` 的凭证扫描只读 `background/worker.ts` 这**一个**文件，网络扫描又整目录排除 `/background/`——新增一个 `background/other.ts` 发带凭证的请求可全绿通过；另外把 `'include'` 写成变量也能绕开字面量断言。属守卫的已知边界（该文件自称「常见模式的辅助防线」），不构成本次阻断，但值得记为剩余风险。
> 3. **`{ fetch: globalThis.fetch }` 同类写法**：全仓（`**/*.ts,tsx`）检索「把内置方法当值取出/解构/直接作回调传递」的模式，**未发现第二处**；`frontend/src/api/client.ts:231` 是直接 `await fetch(...)`，`relay.ts:30` 是包装调用 `chrome.runtime.sendMessage(...)`。修复本身彻底；**回归用例不彻底**，见 F2。
> 4. **中转脚本信任边界**：`relay.ts:53-74` 只服务 `allowed`（= 本次载荷 `images`，且每条已过 `isCapturePayload`→`isSafeImageUrl`）。逐条核过点名的绕过路径：交付前 `allowed` 为空集（有用例）；重复交付时储存已空、`isCapturePayload` 失败即 return，不会扩张 `allowed`；比较是精确字符串 `Set.has`，大小写/尾斜杠差异**失败关闭**而非放行；worker 侧再独立校验一次（含重定向落地地址，worker.ts:70）。唯一残留：同源脚本可对**已提供的那几个地址**重复索取（放大面限于用户自己那几张图，字节只回到本机 UI 页面，攻击者页面读不到），以及 `allowed` 在本次交付后不清空直到导航。均属可接受。补充观察：`isSafeImageUrl` 不排除 loopback/内网地址，恶意页面能诱导扩展去取 `http://127.0.0.1:*` 的字节——但那些字节只流向本机 UI 页面，**无外发通道**，且 StudyPilot 后端本身有 Origin/令牌门禁挡住；不作为 finding。
> 5. **`collectImages`**：宣称与实现一致。行内式（含 `"title"`）、尖括号式、残留带引号的 `<img src>` 三种都由 `extract.ts:940-945` 的两条正则覆盖；`srcset=`/`data-src=` 不会误配（`\ssrc\s*=` 的锚定）；`[链接](url)` 不进（有用例）；相对地址按页面地址解析、`data:`/`blob:`/`file:`/带凭据一律丢弃、去重、截断 60 张、且从**截断后**的正文里认。唯一超收路径：代码块里书写的 `![x](http://…)` 会被当图片（Markdown 上下文无感知）——结果是多取一个 http 地址、后端魔数校验多半拒收并计入失败，影响轻微，不值得为它引入 Markdown 解析。
> 6. **两步 popup 的顺序**：真的钉住了顺序，不只是「两步都发生」。`capture.test.ts` 的 `stashes before asking` 用 `calls.indexOf('stash') < calls.findIndex(startsWith('permission'))`，且 permission 缺席时 `findIndex` 为 -1 会让断言失败；另有 `expect(calls).toEqual(['stash','open'])` 的精确序列。`deliverCapture`（capture.ts:576+）实现与之一致，被拒后再清空重存也有断言。
> 7. **`tsconfig` 收窄**：真实生效。`tsconfig.json` `types:["chrome"]` + `include:["src"]` + `exclude:["src/**/*.test.ts"]`，因此 `src` 下任何非测试文件写 `process.env` 都会在 `tsc -p tsconfig.json` 报错；`tsconfig.tools.json` 虽含 node 类型，但它只是**追加**一次宽松检查，`npm run typecheck` 以 `&&` 串起两份、严格那份先跑，收窄不会漏回去；`build` 也改为先跑 `npm run typecheck`。（记录的变异验证我无法复跑，但结构上与其结论自洽。）
> 8. **权限文案守卫**：记录的自述「只证明字符串在场，不证明描述正确」**准确**，而且这一次它的后果**已经实际发生**——见 F1 与 F6：三份文档里各有段落与实际授权面矛盾，守卫全绿。所以「三处文案现在与实际授权面相符」这句：`extension/README.md:40`、`extension/AGENTS.md:24`、`README.md:252` 三段**相符**；同一批文件的其它段落（`README.md:242`、`extension/AGENTS.md:25`、`extension/README.md:5`、`:25`）**不相符**。
>
> ## 4. 我没有覆盖到的
>
> - 任何**执行**证据：`132 passed`/`427 passed`/`42 passed`、`CHECKS PASS`、`product_fingerprint`、遗留 B 的变异验证、真实浏览器诊断运行——一律未复跑（无 Bash），只做了静态自洽核对。
> - 前端切片（`freeze.ts`/`CapturePage.tsx`/`client.ts`/遗留 G 四处/e2e）我只顺读一遍以理解跨端语义，**未按 Reviewer 深度审查**，留给 R2。
> - `chrome.permissions.request` 手势语义、`tabs.update` 无需 `tabs` 权限、match pattern 是否接受端口、扩展消息通道体积上限——均为浏览器实机行为，静态审查不可判定。
> - 后端 `backend/**` 零改动，未看。
>
> ## 5. 结论
>
> **CHANGES_REQUIRED**（指向 candidate `50240f6`）。唯一阻断项是 **F1**（根 README 的假陈述与被删的两句安全承诺，纯文档、约 3–4 行）。F2–F6 均为非阻断：建议顺手做掉 F2（3 行）与 F3（一词改动 `storage.local`→`storage.session`），F4–F6 至少要在 EVIDENCE 里按四要素登记，并按本报告更正三处**比事实宽**的自述（默认 fetch 路径仍未执行；标签页复用并非「以假实现测试」而是零覆盖；完成条件 5、6 为部分满足）。修完后我只需复核 `previous_candidate..new_candidate`。

### Review R2 · 第一轮原文（前端、契约与测试绑定切片，结论 CHANGES_REQUIRED）

> ## 权限证据
>
> 运行器给我的工具白名单只有 `Read` / `Grep` / `Glob`（本 Agent 定义仅授予读工具）。我**没有** `Write`/`Edit`/`NotebookEdit`，也**没有** `Bash`，因此无法写文件、无法 commit/push/merge、无法执行任何命令。我未以试写仓库文件的方式探测权限。本轮所有结论均来自读取 `/tmp/sp-t040/T040.patch`（43 文件）与工作树文件。
>
> ## 覆盖范围
>
> 已逐行读：契约 §14.2/§14.4/§14.5/§14.6 全部改动；`frontend/src/api/client.{ts,test.ts}`（含 `request()` 全文，非 diff）；`features/capture/{protocol,freeze,CapturePage}.{ts,tsx}` 及三份测试；`features/resources/{api,ResourceDeletion}.{ts,tsx}` 及测试；`e2e/capture-images.spec.ts`；为核对平行实现与 reason 取值，另读了 `extension/src/shared/protocol.{ts,test.ts}`、`background/worker.ts`、`injected/relay.ts`、`injected/extract.ts`、`popup/{capture,main}.ts`；为核对投影读了 `backend/.../asset_store.py`、`modules/resources/assets.py`、`api/snapshot_assets.py`。
>
> ## 必须修复（阻断）
>
> **F1 —— 两处面向用户的文案仍宣称「本版本不冻结图片」，与本次交付的行为相反。**
> - `frontend/src/features/capture/CapturePage.tsx:198`：`这是保存当时的副本，不随原文更新。图片仍指向原站，本版本不冻结图片。` 这句话就渲染在用户点「保存为资料」的那张表单里；而当用户在 popup 选了「连图片一并保存」时，点下这个按钮恰恰会逐张把第三方站点的字节取回并写入本机受控目录。
> - `README.md:242`：同一句 + 旧的一步式流程描述（「点扩展图标 →『保存这一页的正文』→ 打开确认页」），与本次已重写的 `README.md:250` 段落（讲两步、讲 `optional_host_permissions`、讲 `credentials: 'omit'`）**在同一节里自相矛盾**。README 在 `allowed_paths` 内且本次已改另一段，属遗漏而非越界。
>
> 触发条件/证据：任意带图页面 + 用户选「连图片一并保存」，即 100% 命中，代码事实如上。影响与发生可能：这是本任务唯一一处仍在对用户陈述「不会去第三方站点取字节」的位置，且出现在授权后的确认动作处；本任务的 L3 风险理由通篇是「这次授予的边界就是它此后的边界」，用户对数据流的理解正依赖这几句话。设计决定 ④ 与契约 §14.5 均已把该边界声明为关闭。最小修正：改这两句（各一行），并顺带把 README 的用法段改成两步流程；成本近零，无回归面。
>
> ## 非阻断（建议记录后继续）
>
> **N1 —— `imageFailureText` 的兜底会把「本机侧失败」误归因给扩展/网络。** `freeze.ts:52-53` 把上传异常的 `ApiError.code` 原样存为 reason，但 `freeze.ts:100-121` 只为 `ASSET_TYPE_UNSUPPORTED`/`ASSET_TOO_LARGE` 备了文案。`VERSION_CONFLICT`、`SNAPSHOT_NOT_FOUND`、`STORAGE_PATH_UNAVAILABLE`、`NETWORK_ERROR`、`INVALID_RESPONSE`、`REQUEST_FAILED`（后端 `MALFORMED_REQUEST` 不在 `client.ts` 的 `serverCodes` 里，会落成它）以及 `upload-failed`，全部落到 default 文案「没能取到（**扩展未响应、网络不通或已超时**）」——括号里断言了一个它并不知道的原因。`STORAGE_PATH_UNAVAILABLE` 恰好会让**所有**图片同时失败，正是记录里「六张全失败无法归因」那次故障的形态，而界面会把人指向 `chrome://extensions`。来自 relay/worker/protocol 的九个 reason（`unsafe-url`/`no-permission`/`http-error`/`too-large`/`failed`/`not-offered`/`no-worker`/`bad-bytes`/undefined→`failed`）则**全部覆盖无遗漏**，`failed` 落兜底是正确的。最小修正：default 分支去掉臆断的括号，并对已知后端码复用 `resources/api.ts` 的 `failureText`（约 5 行）。
>
> **N2 —— 记录里「已知限制 5」的自述比事实更宽。** 它写「超过 60 张的图片……混在『没能保存』的计数里」。事实是 `extract.ts:collectImages` 在**载荷生成前**就 `slice(0, MAX_IMAGES)`，超出的地址根本不进 `payload.images`；popup 的「发现 N 张」显示的也是截断后的 N。因此它们既不计入 `frozen` 也不计入 `failed`，用户**完全无从得知有图被跳过**。建议按事实改写该遗留登记（现状比登记更弱）。
>
> **N3 —— 平行 protocol 的机械守卫没有跟上本次新增。** `extension/src/shared/protocol.test.ts:40-80` 只逐字比对 `isSafeSourceUrl`/`isCapturePayload` 两个函数体，只比对 `CAPTURE_READY`/`CAPTURE_PAYLOAD` 两个消息名与三个上限。本次新增的 `isSafeImageUrl`（决定扩展会向哪些地址真的发请求）、`isImageList`、`MAX_IMAGES`/`MAX_IMAGE_BYTES`、`CAPTURE_IMAGE_REQUEST`/`CAPTURE_IMAGE_RESULT` **都不在守卫内**。我逐字比对了两份副本的这些新增块，当前**确实一致**；但记录（与 e2e 文件注释）称「两端消息格式由两份平行 protocol 的守卫覆盖」，对新增的图片消息而言这句话比事实宽。最小修正：往那两个 `it.each` 各加两三行。
>
> **N4 —— 新的信任边界函数 `imageResultFrom` 无直接单测。** `frontend/src/features/capture/protocol.ts:149-166` 是本次唯一接收**字节**的 postMessage 校验点，但 `protocol.test.ts` 本次只改了两处 fixture，没有为它补 `capturedFrom` 那样的拒绝表；`bad-bytes` 分支（base64 形状不合）全仓无任何用例命中。就安全性本身我核过：`event.source !== win`、`event.origin !== win.location.origin`、`url` 必须为 string 都在；base64 形状检查 `/^[A-Za-z0-9+/]+={0,2}$/` 不校验长度整除 4，但 `atob` 抛出发生在 `freeze.ts` 的 try 内，会被记为一次失败而非崩页，属 fail-closed；`reason` 只用作 `switch` 的键与 React 的 `key`，**站点错误细节没有任何渲染路径**（未知 reason 一律走兜底文案，不回显原文）。故这是覆盖缺口而非缺陷。
>
> **N5 —— 部分失败后表单仍可再次提交，会静默生成第二份资料。** `CapturePage.tsx:151-166` 的失败摘要与 `:193` 的表单同时渲染，`finally` 已把 `pending` 置回 false，按钮重新可用；而同页的 `partial` 分支（`:168`）是**替换掉**表单以避免同一问题。用户看到「2 张里 1 张没保存」后再点一次「保存为资料」，会新建一份资料 + 新快照并重下全部图片。可由删除资料恢复，且需显式二次点击，故不阻断；建议在该分支禁用表单或明说「不要重复保存」。
>
> ## 可选建议（不要求处理）
>
> - `features/resources/api.ts:402-408` 的 `listSnapshotAssets` 无任何调用方、无任何用例；`snapshotAsset` 投影只在 CapturePage 用例里被 happy path 间接经过，`size_bytes<1`/`invalid()` 分支未验证。
> - 同文件 `:363-374` 的投影用 `string(row.id)` 而非同文件既有的 `id()`（uuid 校验），`sha256` 未做 hex 校验，比兄弟投影松；当前无消费者，故无实际影响。
> - `client.ts:335-351` 的 `assetUpload` 不检查 `file.size`（`uploadSnapshot` 检查 1..25 MiB），10 MiB 上限完全依赖 worker 与后端。
> - `frontend` 侧 `MAX_IMAGE_BYTES` 导出后未被使用。
>
> ## 已核实为「无问题」的几点
>
> 1. **专用路径没有顺带放宽别处**：`client.ts` 的 diff 只有 `DeletionImpact`、`messages`、`deletionImpact` 键表、`serverCodes`、新增 `assetUpload`、新增 `uploadSnapshotAsset` 六处；`request()` 的 `ifMatchVersion` 仍是 `method !== 'DELETE'` 即拒（`client.ts:570-578`），`versionedDeleteTarget` 一字未动。`assetUpload` 的白名单我按 FormData 语义逐条推过：字段名超集拒、重复名拒、`file` 非 `File` 拒、`source_url` 非 string 拒、两者缺一拒；文件名固定为 `'image'`（`api.ts:395`），不把站点字符串带进 multipart 头。未发现绕过路径。
> 2. **遗留 G 只有四处，没有第五处**：全仓 grep `original_file_count|snapshot_asset_count` 后，前端仅 `client.ts`（接口+键表）、`resources/api.ts`（键表）、`ResourceDeletion.tsx`（标签表）三个源文件与三份 fixture；`ImpactSummary` 是唯一渲染点，e2e 与其他组件均无固定六项的断言。三份 fixture 补字段后仍是精确断言（`client.test.ts:288-292` 的 `toMatchObject` 会因少键而红）。
> 3. **投影与后端逐项对应**：`asset_store.FIELDS` = id/snapshot_id/source_url/media_type/size_bytes/sha256/created_at，与 `SnapshotAsset` 接口一一对应，`storage_key` 正确不出现；`size_bytes < 1` 的拒收成立（后端按魔数识别，空文件不可能通过）。
> 4. **契约三方一致**：§14.2 三条消息行与 `relay.ts`/`worker.ts`/两份 `protocol.ts` 的类型与方向一致；`CapturePayload.images` 的六项约束逐条落在 `isSafeImageUrl`/`isImageList` 上（「已去重」由 `collectImages` 保证，校验端不查重，属生产者不变量，与契约措辞相符）；§14.6 的四步流程与 `CapturePage.tsx:93-117`、`relay.ts` 的 `allowed` 集合、`freeze.ts` 的逐张循环一致。**`/api/v1` 契约未改我独立核实**：43 个 diff 条目里没有 `docs/contracts/openapi-v1.json`、没有 `backend/**`，中文契约的全部 hunk 落在第 767 行之后的 §14。43 个文件全部落在 `allowed_paths` 内。
> 5. **e2e 的自述准确**：`capture-images.spec.ts` 的注释与记录「已知限制 1」对「验不到扩展那一段」的说明与代码事实相符，没有把桩说成真实链路；它确实走真实后端完成了 建资料→PUT 正文→带 `If-Match` 的 POST 资产→`GET assets` 断言 `media_type` 由后端按魔数判定，满足完成条件 16 对 e2e 的字面要求。
> 6. **「用户实机确认」的处理恰当**：按原话保留「应该」、明确不上调为完成条件 16 的全流程核对、并说明其确定性弱于此前三次失败报告——这是我认为正确且不宜再压缩的处理方式。相对地，「真实浏览器端到端验证」那一节的具体观察（两次 201、99860/77817 字节）**任何 Reviewer 都无法复核**（脚本已清理），记录自己也这么说了；建议主 Agent 不让它承担任何完成条件。
>
> ## 我没有覆盖的
>
> - 扩展侧测试质量、`bridge.ts` 标签页复用、`manifest.ts` 授权面白名单、tsconfig 收敛与变异验证——属 R1 切片，我只读了对应**源文件**用于核对 reason 取值与消息契约。
> - 任何命令我都没跑：`CHECKS PASS`、`product_fingerprint`、132/427/42 三组计数与净增数、typecheck/lint/prettier 结果，全部未经我验证。
> - `docs/tasks/任务索引.md`、`TASK-041`、`extension/AGENTS.md`、`extension/README.md`、`package.json`、`popup.html` 的 diff 我只粗读，未逐条核。
> - 真实 chrome API 行为（`permissions.request` 弹框、`tabs.update` 免权限、service worker 唤醒）无法验证。
>
> ## 结论
>
> **CHANGES_REQUIRED**，指向 candidate `50240f6`。唯一阻断项是 F1（`frontend/src/features/capture/CapturePage.tsx:198` 与 `README.md:242` 两句已失真的用户可见陈述，各一行可改）。N1–N5 建议由主 Agent 按四要素登记为非阻断遗留；F1 修好后重新冻结即可，我可只复核 `previous_candidate..new_candidate` 的文案 diff，其余覆盖沿用本轮结论。

### Review R1 · 第二轮增量复核原文（`50240f6` → `1ab823f`，结论 PASS）

> ## 权限证据（本轮不变）
>
> 工具白名单仍只有 `Read`/`Grep`/`Glob`；无写工具、无 Bash，因此**无法**复跑 `132/427/42 passed`、`check_task.py`、变异验证。以下全部是对 `/tmp/sp-t040/T040r2.patch`（387 行 / 13 文件，逐行读完）与工作树的静态核对。
>
> ## 增量范围核对
>
> 13 个文件与描述的处置**一一对应，没有第七处未描述的改动**；全部落在 `allowed_paths` 内：`README.md`(F1) · `extension/AGENTS.md`(F6) · `extension/README.md`(F1+实机状态) · `CapturePage.tsx`(F1 文案 + N5) · `worker.test.ts`(F2) · `bridge.ts`(F3) · `worker.ts`+`capture.ts`(F4) · `freeze.ts`+`CapturePage.test.tsx`(N1) · `extension/src/shared/protocol.test.ts`(N3) · `frontend/.../protocol.test.ts`(N4) · 任务记录（登记）。生产代码只动了 4 个文件，均在描述内。
>
> ## 逐条核对结果
>
> - **F1 已实修，且比我要求的更全**：`README.md:242` 假陈述已改为两步流程、`:252` 恢复了被删的两句（manifest 白名单守卫 + 不直连后端，且新增一句 optional 门闩），`CapturePage.tsx:201`（R2 定位的那句，就在提交表单上）与 `extension/README.md:5`、`extension/AGENTS.md:25`（七→九键，并补上 optional/background/permissions 三条断言的描述）全部与实际授权面相符。**阻断项解除。**
> - **F2 真的红得起来**：`worker.test.ts` 新增的 `await expect(fetchImage('https://cdn.example.com/a.png')).resolves.toMatchObject({ok:true})` 只传一个实参，才会触发 `worker.ts:42-54` 的默认参数；把默认值改回 `fetch: globalThis.fetch` 时，`deps.fetch(...)` 的 receiver 变成 `deps` 对象，strict 桩抛 TypeError → 被 `catch` 收成 `{ok:false,reason:'failed'}` → 该断言失败。node 下 `chrome` 未定义使 `granted()` 返回 true，不干扰。✔ 缺口真正闭合。
> - **F3 正确**：`bridge.ts:33/48` 已换 `chrome.storage.session`（属既有 `storage` 权限，popup 是 trusted context，无需新权限）。把「完成条件 12 前两句零机器证据」记进记录**如实**——`bridge.ts` 至今无任何测试，这不是「以假实现测试」。
> - **F4 两处确实一致**：`capture.ts:127` 与 `worker.ts:65` 都是 `` `${protocol}//${hostname}/` + '*' ``，构造完全相同；默认端口下与旧 `origin` 写法同值，`capture.test.ts` 里 `permission:https://cdn.a.test/*,…` 那条断言不受影响。
> - **N1/N3/N4/N5 核过**：N3 的数值比对放宽到算式（`([0-9_ *]+)` + `split('*')` 连乘）比的仍是数值、不是写法，未削弱；`isSafeImageUrl`/`isImageList` 已纳入逐字体比对（两侧函数体我核对过是逐字相同）。N4 的拒绝表钉住了 fail-closed 与「站点细节不透传」。N5 的 `) : images ? null : (` 与同页 `partial` 分支一致，注释在表达式位置合法。
>
> ## 本轮新发现（均非阻断）
>
> 1. **`freeze.ts:126` 的兜底在认不出的原因上会输出一句空话。** 注释承诺「认不出的只说『没保存』外加原始码」，实现是 `failureText(new ApiError(reason as never))`：未知码时 `messages[code]` 为 `undefined` → `Error` 的 `message` 为 `''` → `failureText` 走到最后 `return error.message` 也是 `''`，界面渲染成「1 张：（upload-failed）」。`'upload-failed'` 是可达的（`freezeImages` catch 到非 ApiError 异常时就用它）。新用例只断言「不含『扩展未响应』且含原始码」，空串两条都满足，**测不出**。最小修正：`${failureText(...) || '没能保存'}`（约 10 字符），顺带让断言加一条 `.toContain('没保存')`。
> 2. **F4 的「两处必须一致」没有任何机器守卫**——两个手写表达式分居两个文件，将来只改一处就会「授了权却查不到」。建议抽成 `shared/protocol.ts` 的一个 `matchPatternFor(url)` 供 popup 与 worker 共用（约 6 行）。
> 3. **记录把一条未验证的浏览器行为写成了事实**：「match pattern 的 host 段不接受端口号」我在上轮明确标注为**无法实机验证**。请按 TASK-038 处理 `tabs.query` 的同类先例加一句「依 Chrome match pattern 文档判断，未实机验证」。（无论真伪，去掉端口都是安全方向：match pattern 端口无关，覆盖面不减。）
> 4. **两处措辞仍略宽/略含糊**：① `extension/README.md:25` 写「用户也报告修复后图片能下载」，而原话是「这次**应该**下载成功了」，同一份记录别处坚持「按原话记录、不上调」；建议引原话。② 更正清单第 2 条「在修复后依然成立」易被读成描述**当前**候选，建议补「（本轮已补不传实参的断言，现已不成立）」。
> 5. **新 README 与刚更正的已知限制 5 相抵一处**：README/extension README 说「确认页会如实告诉你有几张没保存、分别是什么原因」，而超过 60 张被 `collectImages` `slice` 掉的那些既不计 `frozen` 也不计 `failed`、用户完全无从得知。仅在 61 张以上的文章成立，加一个短句即可。
> 6. 观察（不需动作）：`已知限制 2` 原文仍逐字留在下方，与更正 3 并存；按 AGENTS §6「标记区外不得借证据写回」的约束，追加更正而不就地改写是合规做法，但请 Acceptance 知悉记录内部存在这处并置。
>
> ## 继承与未覆盖
>
> - **继承上轮范围**：`4066c02..50240f6` 的完整 diff（扩展侧与授权面全部切片：manifest 与其守卫、worker、relay 信任边界、collectImages、两步 popup、tsconfig 收窄、三处权限文案）已在上轮逐行审过，本轮只在受影响处复核，结论继承。
> - **本轮未覆盖**：任何执行证据（测试计数、CHECKS PASS、指纹、N3 的变异验证）——无 Bash；前端 `freeze.ts`/`CapturePage.tsx`/`client.ts`/遗留 G 四处/e2e 的深度审查仍归 R2；浏览器实机行为（手势语义、`tabs.update` 与 `tabs` 权限、match pattern 端口、`storage.session` 清空时机、消息体积上限）静态不可判定。
> - **仍然开着的非阻断项（上轮结论继续有效）**：完成条件 5、6 部分满足；`bridge.ts` 零测试；`boundaries.test.ts` 的凭证扫描只读 `worker.ts`、网络扫描整目录排除 `/background/`（新增 `background/other.ts` 可绕过）；`freezeImages` 无总耗时预算。
>
> ## 结论
>
> **PASS**，覆盖 candidate `1ab823f7bf76a6cb2578c435b5ee0c703eae6212`。上轮唯一阻断项 F1 已实修，F2–F4、F6 修复正确且未引入回归。本轮 6 项均非阻断；建议至少顺手做掉第 1 项（10 字符）与第 3、4、5 项的措辞（纯文档），第 2 项可记录后继续。

### Review R2 · 第二轮增量复核原文（`50240f6` → `1ab823f`，结论 PASS）

> **权限**：本轮仍只有 `Read`/`Grep`/`Glob`；无写工具、无 Bash，未运行任何命令。
>
> **范围**：`/tmp/sp-t040/T040r2.patch` 13 文件全部逐行读完。全部落在 `allowed_paths` 内。**没有第七处未被描述的改动**：除列出的 6 项外，另有的 4 个扩展文件改动（R1 的 F2/F3/F4）与两份 README/AGENTS 恢复，均已写进记录新增的「第一轮 Review 处置」块。
>
> ## 已核实修好
>
> - **F1 阻断关闭**：全仓已无「本版本不冻结图片」的现行陈述（契约 §808 是带删除线的历史留档，标注正确）。`CapturePage.tsx:200` 新文案与实际行为（选了「一并保存」才下载、未授权则保留原链接）一致；README:242 用法段与 250 段互不矛盾；R1 指出被删的两句安全承诺已回到 README:19。`extension/AGENTS.md` 的「九个键」我对着 `manifest.ts:53-74` 与 `manifest.test.ts:30-102` 逐项核过：键集、`permissions` 三项、`optional_host_permissions` 恰为 `["<all_urls>"]` 且无 `host_permissions`、`background` 单键、内容脚本唯一匹配源——**四条断言都真实存在**，文档没有夸大守卫。
> - **N3**：`isSafeImageUrl`/`isImageList` 已进逐字比对（两份副本我在上轮已核为等价），两条图片消息名与两个上限已进比对。放宽为 `([0-9_ *]+)` + 连乘求值是 **fail-closed** 的（`Number('')→0` 会红），没有让真实不一致漏掉——**除一处残留**见 N9。
> - **N4**：拒绝表覆盖跨窗口/跨源/类型/形状/reason 非字符串；`detail: '403 from cdn'` 那条精确地钉住了「站点错误细节不透传」。
> - **N5**：`images ? null :` 后表单确实不再渲染，用户**没有被困住**——正文此时已落库，alert 里有「打开这份资料」，与 `partial` 分支必须保留 textarea 的理由（那份文本是唯一副本）区别正确。
> - **N2 登记如实**：与 `extract.ts:collectImages` 的 `slice(0, MAX_IMAGES)` 位置一致，「根本不进载荷、用户完全无从得知」属实。
>
> ## 本轮新增非阻断项
>
> **N6 —— N1 的兜底对「认不出的码」实际一个字都没说，比描述窄。** `freeze.ts:126` = `${count} 张：${failureText(new ApiError(reason as never))}（${reason}）`。`failureText`（`resources/api.ts:492-507`）对未知 code 走到最后一行 `return error.message`，而 `new ApiError('upload-failed')` 的 `messages[code]` 是 `undefined` → `Error(undefined)` → **message 为空串**。于是渲染成 `1 张：（upload-failed）`——没有「没保存」也没有任何人话。`'upload-failed'` 是可达的（`upload` 抛非 ApiError，或 `base64ToBlob` 的 `atob` 抛出）。新测试只断言「不含扩展未响应」「含原始码」，正好绕过了这个空串。最小修正：`${text || '没能保存到本机。'}`。
>
> **N7 —— `new ApiError(reason as never)` 是对 `messages` 的无守卫属性查找，而 `reason` 可以来自 postMessage。** `imageResultFrom` 原样透传任意字符串 reason；`reason === 'constructor'` 时 `messages['constructor']` 取到 `Object` 构造函数，`Error(fn)` 会把 `function Object() { [native code] }` 变成 message 显示到界面上（`'__proto__'` 同理给 `[object Object]`）。同时 `（${reason}）` 现在把这串不可信文本**原样回显且不限长**，而上一版的兜底是吞掉它的。无 XSS（React 转义）、需同源脚本（它本就控制该页），故不阻断；一行修掉两个问题：`const text = /^[A-Z_]{3,40}$/.test(reason) ? failureText(new ApiError(reason as never)) : ''`，回显同样按此正则夹一下。
>
> **N8 —— `failed` 这一桶现在只认网络/站点，丢掉了「扩展没应答」。** `askExtensionForImage` 的 30 s 超时 resolve 的是 `{url, ok:false}`（**无 reason**）→ `freeze.ts:56` 兜成 `'failed'` → 新文案「网络不通、站点无响应或已超时」。可这条路的真实含义是中转脚本/worker 一直没答话（扩展被停用或重载）——旧兜底里的「扩展未响应」恰好覆盖它，改完反而没了。修正：超时时给一个专属 reason（如 `'no-answer'`）并配一句指向 `chrome://extensions` 的文案，约 3 行。
>
> **N9 —— 镜像上限比对的正则没有右锚。** `export const ${name} = ([0-9_ *]+)` 遇到镜像写成 `60 + 1` 只捕获 `60 `，算出 60 == 60 **照样绿**。这是上一版就有的洞（本次只加了 `*`），但现在「右侧可以是算式」成了预期，人眼更不会去看。加个行尾锚（`([0-9_ *]+)\s*$` 配 `m` 标志）即可闭合。
>
> **N10 —— 七项修复里有三项没有机器绑定**：F3（`storage.session`，`bridge.ts` 整体无测试）、F4（去端口的 match pattern，**两侧都无**：`originsOf` 全仓无用例，`worker.test.ts:176-186` 一律注入 `hasPermission: async () => true`，没有任何断言看那个模式串）、N5（未断言失败态下表单不渲染）。F4 值得补：它的失败形态是「非默认端口图床的整批授权静默被拒」，现有测试一条都看不见，而代码注释自己说「两处必须一致」——两侧各两行断言即可。这与本任务已两次被咬的模式（顺序断言、默认 fetch）同源。
>
> **可选**：`extension/README.md:83` 的「用户也报告修复后图片能下载」把用户原话「这次**应该**下载成功了」的保留语气去掉了；任务记录里保留得很好，面向用户的 README 顺手加半句更一致。
>
> ## 结论
>
> **PASS**，指向 candidate `1ab823f7bf76a6cb2578c435b5ee0c703eae6212`。上轮 F1 阻断解除，N1/N3/N4/N5 的修复方向与实现均正确；新增 N6–N10 全部非阻断，建议按四要素登记（N6、N7 两条可用同一处一行修改顺手闭合，成本低于登记）。
>
> **继承**：上一轮对 `4066c02..50240f6` 的全部结论继续有效（专用上传路径未放宽 `request()` 的 If-Match 白名单、`assetUpload` 白名单无绕过、遗留 G 四处齐全且无第五处、`snapshotAsset` 与 `asset_store.FIELDS` 逐项对应、契约 §14.2/§14.4/§14.6 与两份 protocol 一致、`/api/v1` 与 openapi 一字未改、e2e 覆盖边界自述属实、既有断言无删除无弱化），以及上轮的可选建议。
>
> **本轮未覆盖**：任何命令与计数；扩展侧测试质量仍属 R1 切片；`bridge.ts` 的 `storage.session` 在真实 Chrome 的行为只有实机可证；两轮 diff 均无 `backend/**` 与 `openapi-v1.json`。

### Review R1 · 第三轮增量复核原文（`1ab823f` → `61c8153`，结论 PASS）

> ## 权限证据（不变）
>
> 工具白名单仍只有 `Read`/`Grep`/`Glob`；无写工具、无 Bash，未复跑任何测试。以下为对 `/tmp/sp-t040/T040r3.patch`（355 行 / 13 文件，逐行读完）与工作树的静态核对。
>
> ## 增量范围
>
> 13 个文件全部对应描述的处置，**没有第七处**；均在 `allowed_paths` 内。生产代码只动 4 个文件。
>
> ## 逐条核对
>
> - **`matchPatternFor` 抽取无行为变化**：新函数体 `` `${url.protocol}//${url.hostname}/` + '*' `` 与上一轮两处手写表达式**逐字相同**；默认端口下 `protocol+hostname` 与更早的 `URL.origin` 同值，所以 `capture.test.ts` 里既有的 `permission:https://cdn.a.test/*,…` 断言不受影响。两处调用点都保持 `new URL(...)` 在 try 内，抛错语义不变（并新增了「无法解析不带崩整批」的用例）。签名收 `URL` 而非 `string`，非法串进不来。
> - **新断言真能红**：`worker.test.ts` 的 `fetchImage('https://cdn.example.com:8443/a.png', {hasPermission})` 断言 `asked === ['https://cdn.example.com/*']`——退回 `URL.origin` 会得到 `…:8443/*` → 红；`originsOf(['https://cdn.a.test:8443/x.png'])` 同理 → 红。两条看的是**同一个** `matchPatternFor` 的两端，加上镜像逐字比对（名单已含 `matchPatternFor`，两份实现我核对过是逐字相同），#2 的守卫闭合。
> - **N9 右锚有效且不误伤**：镜像里五处上限都写在行尾无尾随注释，`([0-9_ *]+)\s*$` 多行匹配全部命中；`60 + 1` 这类写法现在会因右锚失配而报「镜像里没有 MAX_IMAGES」→ 红。
> - **#1/N7/N8 正确**：`isBackendCode = /^[A-Z][A-Z_]{2,39}$/` 挡住 `'constructor'` 与 `'upload-failed'`（两者都不再进 `messages` 查表、也不回显），`|| '没能保存到本机。'` 补住 `failureText` 对未知码返回空串那条路；新断言改为要求出现人话，比原来的「不含 X 且含原始码」实测得多。`no-answer` 与 `failed` 分开，`askExtensionForImage` 超时给专属 reason，`freeze.test.ts` 已钉住。残留仅：匹配该正则但不在 `messages` 里的码（如未来新码）会回显一个 ≤40 字符的大写串——同源脚本才产得出，无实际风险。
> - **#3/#4/#5 文案核过**：`matchPatternFor` 注释已写「依 Chrome match pattern 文档判断，**未实机验证**」（两份一致）；`extension/README.md` 已改回原话「这次**应该**下载成功了」并注明保留语气、未给张数与界面细节；两份 README 各补的 60 张例外句与代码一致。
> - **登记项 (E) 如实**：与 `boundaries.test.ts:97-104`（凭证扫描只读 `background/worker.ts`）和 `:88-95`（网络扫描 `!path.includes('/background/')`）逐字相符，触发条件「`background/` 下新增任何文件」选得准。A–F 六条我逐条比对了代码现状，均无夸大或缩小。
>
> ## 本轮新发现（3 条，全部 P3 注释级，零运行时影响）
>
> 1. `freeze.ts:94-102`：`imageFailureText` 的那段 JSDoc（「一次真实故障的直接产物…」）现在被夹在新插入的 `isBackendCode` 之前，文档归属错位，`imageFailureText` 自身没了 doc。把 `isBackendCode` 移到该 JSDoc 之上即可。
> 2. `frontend/.../protocol.ts:148-151` 的 `ImageResult.reason` 取值表已过时：`failed` 仍标注为「取不到/**扩展没答话**」，而「扩展没答话」本轮已拆给 `no-answer`；表里缺 `no-answer`/`bad-bytes`/`no-worker`；末句「未知值一律按『取不到』处理」也不再成立。3 行修正。（该 JSDoc 不在镜像逐字比对范围内，守卫发现不了。）
> 3. `frontend/.../protocol.ts` 新增的 `matchPatternFor` 在前端**没有调用方**，只为让镜像逐字比对成立而存在——与已登记的 (F) `listSnapshotAssets` 同类。若认可这个取舍，建议在注释里点明「前端侧无调用方，存在的理由是平行副本守卫」，免得下一个人当死代码删掉后守卫变红。
>
> 以上三条我**不要求**为它们再冻一次候选；可在本任务顺手改，或按非阻断项登记后由下一个任务带走。
>
> ## 继承与未覆盖
>
> - **继承**：`4066c02..50240f6` 的完整首轮审查与 `50240f6..1ab823f` 的增量结论，本轮均未被新改动推翻——本轮只触及权限模式的抽取、失败文案与文档，没有改变授权面、消息流、信任边界或上传顺序。
> - **未覆盖**：一切执行证据（三组测试计数、`check_task.py`、N9/镜像的变异验证）——无 Bash；浏览器实机行为；R2 切片的前端深度审查。
> - **仍开着的非阻断项**：记录里 A–F 六条，加上本轮三条 P3。均不触碰安全底线、已确认需求或必要检查。
>
> ## 结论
>
> **PASS**，覆盖 candidate `61c8153cd7dba0788db117105c3cd844b821d004`。上轮六条已全部实修且修法正确，未引入行为变化或回归；新增守卫（两端模式串断言 + 镜像右锚 + 人话兜底）确实可红。剩余仅注释级瑕疵，不构成阻断，也不需要再开一轮完整复审。

### Review R2 · 第三轮增量复核原文（`1ab823f` → `61c8153`，结论 PASS）

> **权限**：仍只有 `Read`/`Grep`/`Glob`，无写工具、无 Bash，未跑任何命令。
>
> **范围**：`T040r3.patch` 13 文件逐行读完，全部在 `allowed_paths` 内。**只含所列改动，没有第七处**。
>
> **点名要核的四项**
>
> 1. **`isBackendCode` 正则边界 —— 通过。** 我对 `client.ts:69-108` 的 38 个 `messages` 键逐个比对：全部只含 `A-Z` 与 `_`、首字符为字母、无数字无小写；最长是 `REQUEST_ORIGIN_FORBIDDEN`/`SNAPSHOT_ASSET_NOT_FOUND`/`INVALID_STATE_TRANSITION`/`STORAGE_PATH_UNAVAILABLE`（各 24 字符），距上限 40 有余量；最短 `TAG_NOT_FOUND` 远超下限 3。**没有真实后端码被挡在外面。** 且 `Object.prototype` 上不存在全大写属性，N7 的原型查找口子彻底关死；回显也同时被字符集与 40 长度封顶。
> 2. **`no-answer` 分流干净。** 页面 30 s 超时 → `no-answer`（专属文案指向 `chrome://extensions`）；worker 的 `failed` 只剩网络失败与 20 s abort，新文案「网络不通、站点无响应，或站点拒绝了下载」对这两者都读得通；relay 的 `no-worker` 仍独立。**唯一仍会落错桶的窄路径**：relay 回了 `ok:false` 但 `reason` 不是字符串时 `imageResultFrom` 给 `undefined`，`freeze.ts` 兜成 `failed`，被说成网络问题——属畸形答复，非本轮引入，可不动。
> 3. **两份 `matchPatternFor` 逐字一致**：8 行 JSDoc + 单行 `return` 两侧完全相同；已进逐字比对清单，`body()` 的切片对它成立（单行函数体无嵌套花括号）。抽取本身消除了双写。
> 4. **新断言确实钉住了东西**：worker 侧用 `:8443` 输入断言 `asked === ['https://cdn.example.com/*']`，popup 侧 `originsOf` 三条（去重、去端口、坏地址不带崩），两端锁的是同一个模式串；`imageFailureText('constructor', 1)` 用 `toBe` 精确等值，同时钉死「不解释」与「不回显」。N9 的行尾锚 + `m` 已闭合 `60 + 1` 那个洞。
>
> **本轮新发现（均非阻断）**
>
> - **R-1（记录准确性）**：遗留 (C) 写「60 张最坏约 20 分钟」偏窄。20 s 是 worker 的超时，只有 worker 应答时才成立；页面侧 `askExtensionForImage` 默认 30 s，**最坏是 60 × 30 s = 30 分钟**。建议记录改成 30 分钟。
> - **R-2（可选）**：`upload-failed` 是小写，现在走 else 分支，渲染结果与注入垃圾**完全相同**（`1 张：没能保存到本机。`），原始码不再出现。它是我们自己产生的内部标记、可安全回显，建议在 `switch` 里给它一个 case（一行），把本地上传异常的可诊断性拿回来。
> - **R-3（可选，纯观感）**：`freeze.ts:94-102` 把 `isBackendCode` 插在了 `imageFailureText` 的 JSDoc 与函数之间，那段「一次真实故障的直接产物」注释现在挂在 `isBackendCode` 头上。把 `isBackendCode` 移到该 JSDoc 之前即可。
>
> **结论：PASS**，指向 candidate `61c8153cd7dba0788db117105c3cd844b821d004`。N6/N7/N8/N9 全部真正修好；N10 的主要缺口（F4 两端无绑定）已闭合，F3/N5 无测试属如实登记的遗留。R-1 建议顺手改进记录，R-2/R-3 可不处理。
>
> **继承**：`4066c02..1ab823f` 的全部结论继续有效。
>
> **未覆盖**：任何命令与计数我一概未跑；`worker.test.ts` 新用例依赖既有 `respondWith`/`PNG` 两个 helper，其签名我未逐个确认；遗留 (A)、(B)、(E) 属 R1 切片，我只核了四要素登记齐全，未复核其技术判断；三轮 diff 均无 `backend/**` 与 `openapi-v1.json`。

### Acceptance · 原文（独立只读，第三个全新实例，结论 PASS + 两条硬要求）

> ## 0. 权限证据（运行器实际给我的）
>
> 工具白名单只有 `Read`、`Grep`、`Glob`。**没有** `Write`/`Edit`/`NotebookEdit`，**没有** `Bash`。因此我不能写文件、不能提交/推送/合并、不能执行任何命令。我没有试写探测。
>
> **我核实的**：43 个改动文件全部落在 `allowed_paths` 内；工作树内容与最终候选自洽（`T040r4.patch` 的三处增量在工作树里都在）；以及下面逐条列出的源码/用例/契约事实。
> **我只能采信**：`CHECKS PASS`、`files=43`、`product_fingerprint`、145/440/42 与 84/408/41 三组计数、遗留 B 的变异验证、真实浏览器诊断运行、用户实机复测。这些我无法复跑，也未复跑。
>
> ## 1. 完成条件逐条判定
>
> | # | 判定 | 证据 |
> |---|---|---|
> | 1 | **满足** | `manifest.test.ts:30-54` 九键精确集合相等；`:56-63` 站点权限必须留 optional 且无 `host_permissions`；`:75-78` background 条目键集；`:80-87` 权限恰好三项 |
> | 2 | **满足**（一处附注） | `capture.test.ts:136-141`、`:172-183`；`CapturePage.test.tsx:273-296`（无图时零 `CAPTURE_IMAGE_REQUEST`、零 upload）；`boundaries.test.ts:88-95` 网络只在 worker。附注：「无图页面仍是一次点击」这条手感由 `main.ts:58` 承担，无测试 |
> | 3 | **部分满足（记录自评为满足，我不同意）** | 「准确张数」有 `popup.test.ts:38-46`；「只存正文不触发权限」有 `capture.test.ts:172-183`。但**「无图时不出现第二步」「有图时出现第二步」「两个按钮接到 deliverCapture 的哪个实参」全部住在 `popup/main.ts:36-74`，该文件零测试**（全仓无任何文件引用 `#choices`/`#with-images`/`main.ts`）。这与遗留 A 同族，而遗留 A 只登记了 `bridge.ts` |
> | 4 | **满足** | `capture.test.ts:196-212`；`popup.test.ts:56-63`；确认页 `CapturePage.tsx:201` |
> | 5 | **部分满足（记录自评一致，判断准确）** | `credentials:'omit'` 双守卫：`worker.test.ts:16-27` + `boundaries.test.ts:97-104`。「只注册那一个监听」确无机器证据：`worker.ts:151` 在 node 下 `chrome` 未定义、从不执行 |
> | 6 | **部分满足（记录自评一致，判断准确）** | 中途中止：`worker.test.ts:53-71`、`:73-89`；`timeoutMs` 可配；并发由顺序 `for` 结构性为 1。**无总预算**属实；遗留 C 的 60×30s≈30 分钟算法与代码一致 |
> | 7 | **满足** | `isSafeImageUrl` 只放行 http(s)；`worker.test.ts:39-51` 拒 data:/file:/相对/带凭据且**不发请求**；`protocol.test.ts:163-179` 另覆盖 `blob:` |
> | 8 | **满足** | `freeze.test.ts:11-26` 顺序数组；`:40-49` 失败一张不影响其余 |
> | 9 | **满足** | `CapturePage.test.tsx:214-245`（`calls` 恰为 `['create','snapshot']` 后才 upload，版本 `[4,4]`）；`client.test.ts:605-619` `If-Match: "4"` 且不自设 Content-Type |
> | 10 | **满足** | `CapturePage.tsx:151-166` 分行显示原因；`CapturePage.test.tsx:247-271`；`freeze.test.ts:128-156`；代码无重试路径 |
> | 11 | **满足（遗留 G 确已关闭，我逐处核过）** | 四处：`client.ts:15`+`:148`、`features/resources/api.ts:122`、`ResourceDeletion.tsx:15`。断言绑定有效：`api.test.ts:38` 用 `toEqual` 整体相等、`client.test.ts:288-292` `toMatchObject` 含该键、`ResourceDeletion.test.tsx:66` 断言「已冻结的图片」在场。唯一窄处：三处 fixture 张数都是 0，值本身没被非零断言过 |
> | 12 | **部分满足（记录自评为满足，我不同意）** | 第三句「授权面不变」有断言。**前两句「第二次不新开」「已关闭时回落新开」至今零机器证据**：逻辑全在 `bridge.ts:27-53`，该文件零测试。记录第 191 行写「完成条件 12 的前两句**此前**零机器证据」——「此前」不成立，现在仍然是零 |
> | 13 | **满足** | `tsconfig.json:6` `types:["chrome"]` 且 `exclude` 测试；`tsconfig.tools.json` 存在；`package.json:14` 两份都跑。变异验证我采信 |
> | 14 | **形态达标，但当前记录对最终候选无计数** | 形态正确：自动选组 + 三组实跑计数 + 基线在 `4066c02` 临时 worktree 上实测，这正是遗留 A 要的。**问题**：记录第 154–167 行的 `实现 SHA 4b53256`、`fingerprint 6bed633…`、`132/427/42` 是**首个候选**的，三轮修订从未更新。最终候选的 `145/440/42` 与 `2222b5b…` 仓库中无处记载。EVIDENCE 补上即为**满足**；不补则为**部分满足**（§6：不能拿旧 SHA 的 PASS 充数） |
> | 15 | **满足**（一处附注） | 契约 §14.2/§14.4/§14.5/§14.6 齐备。附注：「后端契约与端点一字未改」这句在契约里没有对应句子，实际由任务记录承担 |
> | 16 | **满足**（计数同 14 的依赖） | `capture-images.spec.ts` 走真实后端：正文 + 1 张图 → `GET /snapshot/assets` 断言 1 条、`media_type`、内部存储键不外泄、全程无外网请求。既有断言无删除/弱化我抽查了三份，其余采信三轮 Review |
>
> **要害小结**：记录把条件 5、6 标为部分满足是**准确的**；但它漏标了 **条件 3 与条件 12**——这两条的「界面分支」「标签页复用」子句同样零机器证据。这不是「不阻断」的问题，按 TASK-038 立下的口径，它们就是部分满足。
>
> ## 2. 真实浏览器诊断运行是否承担了完成条件
>
> **没有。** 条件 16 由入库的 `capture-images.spec.ts` 承担；诊断运行只出现在观察记录里，且自述「不构成可复跑的证据/未入库/已清理」，并列出三处仍未验证。处理正确。唯一可再收紧一句：`extension/README.md:25` 对普通读者只说「做过一次真实浏览器诊断运行」，没说脚本已清理、不可复跑——建议补半句，属可选建议。
>
> ## 3. 用户实机确认（带「应该」）
>
> 按原话记录、不上调是**恰当的**，且记录明说它「不等于条件 16 的全流程逐项核对」。它实际支撑的只有两处：实现与测试段的「修复后用户侧观察到图片下来了」，和 `extension/README.md:25`。**它没有被用来关闭任何完成条件**，也没有被用来关闭已知限制 1。这一处没有问题。
>
> ## 4. 另外问的四件事
>
> **（1）EVIDENCE 区要写什么才算符合 §6**：最终候选 + 三个前序候选与各自结论；**两位 Reviewer 六份报告的原文**（逐字，不做摘要转述），每份注明针对哪个候选 SHA、结论、findings 与显式继承的旧覆盖范围；**本 Acceptance 报告原文**；**最终候选的检查证据**（命令、CHECKS PASS、profiles、files、指纹、三组计数与实测基线、环境、以及「由实现者本人运行、无第三方复核」的限定），并**明写**记录第 154–167 行属首个候选；**完成条件判定表**（其中 3、5、6、12 为部分满足；若不接受我对 3、12 的判定，须写明分歧与理由，不能静默保留「满足」）；非阻断遗留清单；状态与用户操作；决定日志追加一行。
>
> **（2）必须登记的非阻断遗留清单**：**A（改写）** `popup/bridge.ts` **与 `popup/main.ts`** 零测试 → 直接后果是**完成条件 3 的界面分支子句与条件 12 的前两句无机器证据**。责任：coordinator。触发：这两个文件再次改动，或出现与两步弹窗/标签页/权限相关的用户报告。**B、C、D、E、F** 维持原文（我逐条核过与代码一致）。**新增 G**：`shared/protocol.ts:21` 的注释仍写「`chrome.storage.local` 中记住…标签页 id」，而 R1 F3 之后用的是 `storage.session`；影响是文档级误导，可能诱导后续改回 `local`、复活「跨重启把无关标签页导航走」的风险。**新增 H**：已知限制 4（base64 体积上限未实测）与已知限制 6（文档守卫只证字符串在场）目前没有按四要素登记责任角色与重评触发条件。**新增 I**：三条「未实机验证的浏览器行为」建议合并成一条登记。
>
> **（3）独立再扫「陈述比证据宽」——我找到四处新的**：① 记录第 191 行「完成条件 12 的前两句**此前**零机器证据」——「此前」暗示已解决，**至今仍是零**，且更正止步于叙述、没落到条件判定上。② 遗留 A 只写 `bridge.ts`，**漏了 `popup/main.ts`**——两步 popup 的全部分支逻辑在那里，而条件 3 靠它；范围陈述比事实窄，导致条件 3 的自评偏宽。③ 记录第 154–167 行以「实现与测试」的口吻给出计数/指纹/实现 SHA，读起来像本次交付的证据，实际属首个候选。④ `protocol.ts:21` 的 `storage.local` 注释。另有两处更轻：条件 15 的「后端契约一字未改」在契约里没有落点；`extension/README.md:25` 未说明诊断脚本已清理。**对转述 Reviewer 结论的核查**：「三轮均 PASS、第三轮仅剩注释级与记录准确性」与记录自述一致，我在代码里能对上第三轮的三条处置，未发现转述放大。
>
> **（4）过程本身值得记一笔吗**：**成立。** 三个用户实测缺陷里，两个（顺序缺陷、默认 fetch 从未执行）的根因是测试设计而非实现，且两者在第二轮又以「两处手写模式串靠注释保持一致」的形态第三次出现。可执行的检查动作建议写成一句：
>
> > **凡是被测代码存在「默认依赖/默认参数」或「多步骤先后顺序」的地方，任务的完成条件里必须各有一条对应用例：默认依赖要有一条「不传该实参」的用例，编排要有一条「断言顺序而非断言两步都发生」的用例；靠注释维持的跨文件不变量一律抽成共享实现并纳入平行副本比对。**
>
> 这条能对应到具体动作（写用例时的三个固定检查点），不是泛泛的「加强测试」。
>
> ## 5. 我未覆盖的部分
>
> - 未复跑任何检查：`CHECKS PASS`、指纹、145/440/42 与基线、遗留 B 的变异验证、镜像右锚变异、真实浏览器诊断运行——全部采信。
> - 未验证任何 SHA（本环境未识别为 git 仓库，我无 Bash）；「工作树 == `0948f86`」是我用 `T040r4.patch` 的三处增量在工作树中在场推出的**间接**结论，不是核实。
> - 未逐行重审 base..candidate 的 43 文件完整 diff（按 §4 Acceptance 不重审代码）；只定向读了与 16 条完成条件绑定的源文件与用例。
> - 未审 backend（本任务零改动）、未审 `client.ts` 的 38 个错误码键（采信 R2 第三轮）。
> - 剩余风险一句（非新阻断）：`isSafeImageUrl` 允许 `http://127.0.0.1:*` 一类本机/内网地址，恶意页面可诱使扩展代取——凭证已 omit、源会出现在授权框里、后端按魔数拒非图片，故影响有限。
>
> ## 结论：**PASS**
>
> 交付物与承诺基本对得上：遗留 G 四处确已关闭并有绑定断言，权限面、service worker 边界、逐张传输、上传顺序、部分成功告知、契约同步都有可定位的机器证据。**但 PASS 的前提是 EVIDENCE 区按第（1）条写入**，其中两项是硬要求：**① 把条件 3、12 记为部分满足并扩充遗留 A（含 `popup/main.ts`）；② 写入最终候选 `0948f86` 的实跑计数与指纹，并澄清正文第 154–167 行属首个候选。** 若这两项不落实（尤其是把 3、12 仍写成「满足」），我的结论不成立，应退回重判。

<!-- EVIDENCE:END -->
