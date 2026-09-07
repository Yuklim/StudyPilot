# TASK-042：渲染正文快照并显示已冻结的图片

```toml
schema_version = 2
id = "TASK-042"
status = "IN_PROGRESS"
risk = "L3"
risk_reason = "本任务把「不可信内容退化为惰性文本」这条自 TASK-036 起就成立的结构性安全性质，换成「由渲染器的配置来保证」。TASK-036 明写选 Markdown 而非 HTML 的理由是「抓自开放网络的 HTML 属不可信输入，需永久维护消毒器；Markdown 让不可信内容退化为惰性文本」——一旦开始渲染，这道门就重新打开，此后安全性依赖渲染器选项、链接协议校验与依赖版本，而不再依赖「压根不进 DOM」。被攻破的后果也比一般 XSS 重：本机 UI 源是后端门禁**唯一信任**的源，页面内存里握着本次会话的访问令牌，且扩展的中转脚本也跑在这个源上；那里跑起一段外来脚本等于拿到整个资料库的读写删权限。第二处实质风险：首次引入 Markdown 渲染这一**生产依赖**（前端此前生产依赖只有 React 三件套），它从此是安全关键面。第三处：改变「打开一份资料会不会向外部站点发请求」这一可观察行为。不改后端一行、不改 `/api/v1` 契约、不改本机访问门禁、不改扩展。"
risk_flags = ["security", "architecture", "business"]
owner = "coordinator"
base = "01069535d9910aecc56c6b7380dd17d68985c169"
allowed_paths = [
  "frontend/package.json",
  "frontend/package-lock.json",
  "frontend/src/features/resources/ContentSnapshot.tsx",
  "frontend/src/features/resources/ContentSnapshot.test.tsx",
  "frontend/src/features/resources/snapshotMarkdown.ts",
  "frontend/src/features/resources/snapshotMarkdown.test.ts",
  "frontend/src/features/resources/api.ts",
  "frontend/src/features/resources/api.test.ts",
  "frontend/src/features/resources/ResourcePages.test.tsx",
  "frontend/src/api/client.ts",
  "frontend/src/api/client.test.ts",
  "frontend/src/styles.css",
  "frontend/e2e/**",
  "docs/contracts/API与数据契约基线.md",
  "README.md",
  "docs/tasks/TASK-040-extension-image-freeze.md",
  "docs/tasks/TASK-042-snapshot-rendering.md",
  "docs/tasks/任务索引.md",
]
checks = []
```

## 需求与范围

### 用户授权

2026-09-07 用户合并 PR #46（TASK-040，merge `0106953`）后指示「接下来做完整渲染」，并在听取两条路线的解释后明确选择**甲：渲染 Markdown，但关掉原始 HTML**（不引入消毒器）。用户此前已就本方向作答：TASK-040 阶段选「只采集不渲染」，本任务是那次后置的兑现。

### 目标

1. 资料详情页把正文快照**渲染**出来（当前是 `<pre>` 显示 Markdown 源码）。
2. 正文里的图片，凡已冻结的，显示**本机那一份**；未冻结的按设计决定 ③ 处理。
3. 让用户第一次能在界面上看见 TASK-039/040 冻结下来的东西。

### 非目标（明示不做）

- **不引入消毒器，也不允许原始 HTML**（用户决定，见设计决定 ①）。
- **不改后端一行**、不改 `/api/v1` 契约与 openapi、不改本机访问门禁、**不改 `extension/`**。
- 不做阅读器的其余能力：不做标注、不做目录、不做阅读进度、不做多版本快照对比。
- 不改采集侧的任何行为；不改快照的写入语义。
- 不为渲染而修改已存快照的内容——**正文一字不动**，渲染只发生在显示时。

### 禁止范围

所有未列入 `allowed_paths` 的路径；额外禁止：`backend/**`、`extension/**`、`docs/contracts/openapi-v1.json`、`frontend/src/features/capture/**`、`scripts/governance/**`、`AGENTS.md`、`docs/governance/**`。

### 依赖/前置条件

基线 `0106953`（main，TASK-040 已合并）。依赖 TASK-039 的 `listSnapshotAssets` 与取字节端点（已在 main 上；`listSnapshotAssets` 此前无调用方，本任务即 TASK-040 遗留 F 的重评触发条件）。

### 并行

否。唯一写入者 `coordinator`。

### 顺带完成的状态登记

`docs/tasks/TASK-040-extension-image-freeze.md` 在 `allowed_paths` 内，**仅用于把它的 `status` 由 `ACCEPTED` 登记为 `MERGED`**（用户 2026-09-07 合并 PR #46，merge commit `0106953`），依据根 `AGENTS.md` §5。**除此之外不改该记录一个字。**

## 关键设计决定

### ① 关掉原始 HTML，因此不需要消毒器——但这是一次真实的性质变化，必须说清

用户选甲。渲染器以 **`html: false`** 运行：正文里的 `<script>`、`<img onerror=…>`、`<iframe>` 等会被当作**字面文本**显示，压根不进 DOM。

**这不等于「和以前一样安全」。** TASK-036 的性质是「不可信内容根本不渲染」，属结构性；现在的性质是「不可信内容按配置被转义」，依赖三件事同时成立：渲染器的 `html` 选项、链接协议校验、以及该依赖此后的版本。三者任一失守，后果是本机 UI 源上的任意脚本执行，而那个源握着访问令牌、且是门禁唯一信任的源。**因此本任务把这三条各配一条机器守卫**（完成条件 2、3、4）。

**当前语料的实测**（登记时对用户库中 7 份快照扫描）：`<script>` 0 处、`on*` 事件属性 0 处、`javascript:` 0 处；唯一命中 `<` 的是 `<endl`/`<len`/`<self`，来自 C++ 代码块（`cout << endl`、`vector<len>`），不是 HTML。**这说明甲方案在当前语料上的还原度代价接近于零，但它不能证明将来采集的页面也如此**——这正是守卫必须是机器的而非人工抽查的理由。

### ② 选 `markdown-it`，因为它的默认就是我们要的那个默认

`markdown-it` 的 `html` 选项**默认为 false**，且内置 `validateLink` 默认拒 `javascript:`/`vbscript:`/`file:` 与除图片外的 `data:`。选它意味着**「安全」是默认值、要出事得主动去改**，而不是反过来。

对比：`marked` 曾有的 `sanitize` 选项已废弃并移除，官方指引是「自己接消毒器」——那正是用户不选的乙方案。

它是前端的**第一个非 React 生产依赖**，因此本任务须一并交代：为什么必须是生产依赖（渲染发生在浏览器里）、锁文件的来源核对、以及它从此属安全关键面。

### ③ 未冻结的图片**按原址自动加载**（用户明确决定，代价如实登记）

主 Agent 起初定为「不自动加载、只给占位」，理由是打开资料会向原站发请求。用户 2026-09-07 追问「直接告诉我有什么安全隐患，不要拐弯抹角」，主 Agent 逐条说明后，用户明确答复「**直接自动加载**」。**按用户决定执行，以下代价照实记录，不再复议：**

- **不是代码执行漏洞**：`<img>` 不能执行 JS，`html: false` 下正文里也生不出别的元素。这条路**不会**让外来脚本在本机 UI 源上运行。
- **代价一：原站知道你何时读了这篇。** 每次打开这份资料，浏览器向每个未冻结图片的图床各发一次请求，带上 IP、时间、User-Agent。文章里本就常有 1×1 追踪像素。
- **代价二：`SameSite=None` 的 cookie 会跟着出去**——那恰好是追踪类 cookie 的那一类。于是对方不只知道「有人在读」，而是能和它那边的账号身份对上。
- **代价三：它在显示这条路上撤销了采集侧刚做的决定。** TASK-040 的扩展取图明确用 `credentials: 'omit'`（理由是「凭证始终由浏览器持有，本系统不接触」）；自动加载意味着同一个站点，采集时不带凭证、阅读时带。
- **两条不作为反对理由的**：图片解码器的内存安全 CVE 存在，但**不构成两条路的差别**（冻结下来的图片同样过同一个解码器）；内网探测的请求确实会发出，但无脚本即无法回传结果，**算不上实际风险**，不拿它凑数。
- **未采纳的缓解**：`crossorigin="anonymous"` 能去掉 cookie，但会把请求变成 CORS 模式，**不发 CORS 头的图床会直接加载失败**——而图床大多不发。它会把本想显示的图片弄没，因此不用。
- **采纳的缓解**：加 `referrerpolicy="no-referrer"`。默认策略下发出去的 Referer 是 `http://127.0.0.1:5173/` 这个本机源，对图床的防盗链判定本就不通过，**去掉它没有任何功能代价**，却少泄露一位信息。

**已冻结的图片仍优先走本机那一份**——自动加载只适用于「这张图没冻上」。完成条件 6 为此配守卫，免得因为「反正都会加载」而懒得做匹配。

### ④ 已冻结的图片经 `fetch` → blob URL 显示，且必须回收

门禁要求每个 `/api/v1/*` 请求带进程令牌与 `sec-fetch-dest: empty`，而 `<img src>` 两样都不满足（TASK-039 设计决定 ④，已有测试钉死）。所以流程是：`listSnapshotAssets` 拿到 `source_url → asset id` 映射 → 逐张 `fetch` 取字节 → `URL.createObjectURL` → 塞进 `<img>`。

**blob URL 必须显式 `revokeObjectURL`**：不回收会在这一次页面会话里持续占用内存，切换资料越多占得越狠。回收时机与失败降级写进完成条件 8。

### ⑤ 正文一字不动

渲染只发生在显示时，`content_snapshots.content` 不因渲染而改写一个字符（TASK-039 设计决定 ② 的延续：原站地址是溯源信息）。图片替换发生在**渲染管线内**，不回写数据库。

## 完成条件

1. **渲染生效**：资料详情页的快照区显示渲染后的正文（标题、列表、粗体、链接、代码块），不再是 `<pre>` 源码。旧的「查看源码」能力保留或有等价入口（用户此前只能看到源码，不应因本任务失去它）。
2. **原始 HTML 不进 DOM**：正文含 `<script>alert(1)</script>`、`<img src=x onerror=alert(1)>`、`<iframe>` 时，页面上出现的是**这些字符本身**，DOM 里不存在对应元素。须有用例逐条断言（查 `container.querySelector('script')` 等为 null）。
3. **危险协议的链接被拒**：`[x](javascript:alert(1))`、`[x](vbscript:…)`、`[x](data:text/html,…)` 渲染后不产生可点击的该协议链接。须有用例。
4. **渲染器配置有机器守卫**：有一条用例直接断言渲染器以 `html: false` 构造（而不仅仅断言「某个样例没被渲染成 HTML」）——**按 TASK-040 决定日志立下的检查动作**：默认依赖/配置必须有一条直接看那个配置的用例。
5. **已冻结图片显示本机那一份**：正文里 `source_url` 与某个资产匹配时，`<img>` 的 `src` 是 blob URL，且字节经取字节端点获得。须有用例证明请求打到 `/snapshot/assets/{id}/bytes`。
6. **已冻结的优先走本机，未冻结的才走原址**：正文里能匹配到资产的图片，`src` 必须是 blob URL 而非原站地址——**不得因为「反正未冻结的也会加载」就跳过匹配**。须有用例逐条断言两类图片各自的 `src` 形态。
7. **未冻结的图片按原址加载，且带 `referrerpolicy="no-referrer"`**（用户 2026-09-07 决定）。须有用例断言该属性存在——它是本任务对代价一/二的唯一缓解，漏掉就静默失效。
8. **除未冻结图片外，打开详情页不向外部发任何请求**：不得有链接预取、字体、渲染器 CDN 等其它外部请求。须有整页级别的用例——**这条守的是「外部请求只能来自用户已知的那一类」**，而不是「没有外部请求」。
9. **blob URL 被回收**：组件卸载或切换资料时对每个创建过的 blob URL 调用 `revokeObjectURL`；取字节失败时该图退化为可见的失败态且不影响其余。须有用例。
10. **正文未被改写**：渲染前后 `content` 不变；无任何写请求（PUT/PATCH/POST）因渲染而发出。
11. **无快照、空快照、超长正文**三种形态各自表现正常且不崩。
12. **新增依赖如实交代**：`package.json` 与锁文件同步；记录写明版本、为何是生产依赖、锁文件核对方式，以及它从此属安全关键面。
13. **契约同步**：中文契约 §4.13 的「渲染属阅读器范畴，不在本任务」按实际情况更新，并写明当前渲染的安全形态（`html: false`、无消毒器、未冻结图片按原址自动加载及其代价）。**openapi 与 `/api/v1` 一字不改。**
14. **三组测试计数只增不减**，既有断言无删除、无弱化；`extension` 组计数与基线**完全一致**（本任务不碰它）；新增至少一条走真实后端的 e2e（含图片资料：渲染 + 已冻结图片显示本机那一份）。

## 上下文包

- 规则：`AGENTS.md`、`frontend/AGENTS.md`、`docs/governance/风险分级与检查规则.md`。
- 必读源文件：`frontend/src/features/resources/ContentSnapshot.tsx`（当前的 `<pre>` 展示与增删改）、`features/resources/api.ts`（`listSnapshotAssets`、`snapshotAsset` 投影）、`src/api/client.ts`（门禁头与 `request()` 的白名单）。
- 契约：§4.13（快照与「渲染属阅读器范畴」那句）、§4.14（资产语义、`<img src>` 为何不可用）、§7（门禁）。
- 依据文档：`docs/research/阅读器与标注能力调研.md`（TASK-041 入库）第 1.4 节说明本方向此前的进展。
- 检查：`backend/.venv/bin/python scripts/governance/check_task.py --task docs/tasks/TASK-042-snapshot-rendering.md --worktree`（预期选中 `frontend`、`contracts`）。

## 已知取舍（登记时即知）

1. **安全性质从结构性变为配置性**（设计决定 ①）。这是用户在听取两条路线后作出的选择，代价已当面说明。
2. **打开一份资料会向未冻结图片的图床各发一次请求**（设计决定 ③，用户明确决定）。三条代价已在该决定里逐条登记：暴露阅读时间与 IP、带出 `SameSite=None` cookie、在显示路径上撤销采集侧的 `credentials: 'omit'`。缓解只有 `referrerpolicy="no-referrer"` 一项。
3. **新增一个生产依赖**，且它属安全关键面，需随版本更新跟进。
4. **不支持内嵌 HTML 的排版**：极少数依赖 HTML 的表格、折叠块会显示为源码。当前语料实测代价接近于零。
5. **本任务仍不做标注、目录、复习等阅读器能力**。

## 实现与测试

- **实现 SHA**：首轮 `efdc5dc`；Review 后的修订见本节各条（base `0106953`，16 个文件，全部在 `allowed_paths` 内）。
  - **新模块 `snapshotMarkdown.ts`**：导出 `RENDERER_OPTIONS`（`html:false`/`linkify:false`/`breaks:false`）、`createRenderer(resolve)` 与 `renderSnapshot(markdown, frozen)`。图片与链接是本模块仅有的两处「把正文里的字符串放进属性」的地方，两处都只接受 markdown-it 的 `validateLink` 放行过的地址；伪协议图片**不产生 `img` 元素**，只留可读的替代文本。
  - **`api/client.ts`** 新增 `downloadSnapshotAsset`。**首版说它「与 `downloadOriginal` 同形」是过宽的自述**：当时它只查了状态、类型白名单与 `nosniff`，既不要求 `attachment`、也**没有任何长度上限**（直接 `arrayBuffer()`）。已把两者共用的界限抽成 `boundedBlob(response, mediaType, expected, limit)`（声明长度 + 硬上限的边读边计数、读完核对 `received === expected`），`downloadOriginal` 与 `downloadSnapshotAsset` 都走它；资产的上限是 `MAX_ASSET_BYTES = 10 MiB`，与后端 `modules/resources/assets.py` 一致。现在「同形」这句话有对应实现和用例撑着：类型白名单是后端按魔数认出的四种图片（SVG 不在内），返回值是 Blob 而非 `FileDownload`，其余校验逐条相同。**`request()` 的白名单一字未动。**
  - **`features/resources/api.ts`** 新增 `frozenImageUrl`（`createObjectURL`，并在 JSDoc 里写明调用方必须负责回收）。
  - **`ContentSnapshot.tsx`**：`useEffect` 里逐张取回资产 → 映射 → 渲染；清理函数里 `revokeObjectURL`；新增「看 Markdown 源码 / 看渲染后的正文」切换。**唯一的 `dangerouslySetInnerHTML` 在这里**，其安全性完全依赖 `html:false`，注释已点明。渲染结果用 `useMemo` 缓存（正文上限 100 万字，不缓存则相邻编辑框每敲一个字都重解析整篇）。
  - **相对图片地址的解析（Review 后补）**：冻结表的键是采集时算好的**绝对**地址，而 Defuddle 产出的正文里常留着 `/img/a.png`、`../img/a.png`。首版按精确字符串查表，于是相对写法**既匹配不上冻结表、也渲染不出可用的 `src`**——用户为那一份本机副本付过一次授权代价却看不到它。现在 `renderSnapshot(markdown, frozen, base)` 先 `new URL(src, base).href` 解析再查表；`base` 取 `snapshot.captured_from_url`。**没有做「退回资料 `source_url`」那一层**：那要给 `ContentSnapshot` 加一个属性并改 `ResourceDetail.tsx`，而该文件不在本任务的 `allowed_paths` 里，为一个次要兜底扩大授权范围不值得。`captured_from_url` 为空（手工粘贴的正文）时相对地址**不渲染 `img`**——渲染一个指向本机 UI 自己的 `src` 只会向本机服务发一串必然 404 的请求。代价已记入已知限制 7。
  - **本机副本读不出来时的可见提示（Review 后补，两支）**：用户对「向图床发请求」的知情同意是针对「这张没冻上」给的；本机那一份坏掉时无声改走原站，等于在他以为看的是本机那一份时发了外部请求。两条静默路径都补上了 `role="alert"`：①**单张字节取不到**——`loadFrozenImages` 返回 `failed` 计数，提示有几张改用了原网站地址；②**整份资产清单取不到**（令牌中途失效、瞬时 500）——此前这一支记 `failed: 0`，于是**所有**已冻结图片静默走原站而界面一个字不说，缺口从一张扩大到全部；现在用 `listFailed` 与「一张都没冻」区分开，提示正文里若有图片则这一次一律走原网站。两支各有一条断言。**两条文案都不说界面给不出的操作、也不断言正文里一定有图**：初稿写「重新读取这份资料可以再试一次」，而这一支里并没有重读按钮（`retry()` 也只重读正文、不重取资产），实际有效路径是刷新页面；另一条初稿直接说「这几张改用了原网站的地址显示」，而该资产的 `source_url` 未必出现在正文里。两位 Reviewer 各自独立指出其中一处，属本任务反复出现的「陈述比证据宽」，已改。
  - **投影加固（R1 F10）**：`features/resources/api.ts` 的 `captured_from_url` 由裸 cast 改为 `nullableString`——它现在被当作解析相对图片地址的 base 用，非字符串应当归为 `INVALID_RESPONSE`，与同文件其余字段一致。
  - **契约**：§4.13 新增「渲染语义」与「图片的三条去向」两段（含三条代价的原文登记；Review 后又在后一段里补入相对地址按 `captured_from_url` 解析、以及 `loading="lazy"` 使请求可能被推迟）。**契约只新增段落、未修改任何既有句子**；被更新的是 `ContentSnapshot.tsx` 顶部那段英文注释里的同类说法。此前本条写成「把 TASK-036 那句…更新为指向 4.13」是**被 diff 证伪的自述**，已更正——那句话在 TASK-036 的任务记录里，不在契约里，本任务也不该改写历史任务记录；「两条去向」与「diff 为 +4 行、0 删除」同样是首轮残留，本轮一并更正。**openapi 与 `/api/v1` 一字未改**（16 个文件中无 `docs/contracts/openapi-v1.json`、无 `backend/**`、无 `extension/**`）。
- **新增依赖（完成条件 12）**：`markdown-it`，**生产依赖**——渲染发生在浏览器里，不是构建期。**它带来的不是一个包而是 7 个**：`markdown-it` 加 `argparse@2.0.1`、`linkify-it@5.0.2`、`entities@4.5.0`、`mdurl@2.1.0`、`punycode.js@2.3.1`、`uc.micro@2.1.0`。锁文件核对：这 7 条的 `resolved` 全部指向 `https://registry.npmjs.org/`，无 `file:`/`git+`/非官方源。前端生产依赖树因此由 7 个变为 14 个。**它从此属安全关键面**：本任务的安全性依赖它的 `html:false` 与 `validateLink`，版本更新须同步复核这两处行为。
  - **版本写成精确版本，不用 `^`（Review 后改）**：首版写的是 `"markdown-it": "^14.3.1"` 与 `"@types/markdown-it": "^14.2.0"`，而 `package.json` 里**其余每一条依赖都是精确版本**——本项目的既有做法就是钉死。对一个「安全性依赖其具体行为」的包放开次版本范围，与上面那句「版本更新须同步复核」直接相抵。现已改为 `14.3.1` 与 `14.2.0`，并重跑 `npm install` 同步锁文件（锁文件里 `packages[""]` 的两条声明随之变为精确值，已解析的 `resolved`/`integrity` 未变）。
  - **新增的 3 个 dev 依赖如实登记（Review 后补）**：直接声明的是 `@types/markdown-it@14.2.0`；它又带进 `@types/linkify-it@5.0.0` 与 `@types/mdurl@2.0.0` 两个传递 dev 依赖（不在 `package.json` 里，在锁文件里）。三者都是**仅类型**的包，不进产物、不在运行时执行。
- **命令与真实退出结果**（全部由实现者本人在本机运行，无第三方复核）：
  - `check_task.py --worktree` → **CHECKS PASS**，`profiles=contracts,frontend`，`files=16`，`product_fingerprint=b2110dcbb5ff8faa601ccc8fea311bc600b08cffe063f5b8bd700134f44ce2ef`（首轮 `files=15`/`c9478a33…`；第二轮 `files=16`/`ed023c8b…`；第三轮 `32d93bd2…`）。
  - **frontend 488 passed**（21 文件）。基线**实测**：在 `0106953` 的临时 worktree 上跑出 **440**（19 文件），净增 **48**（首轮 465，Review 后又补 23 条：`downloadSnapshotAsset` 的响应校验一组、相对地址解析一组、`alt`/`loading` 各一条、本机副本失败时的可见提示一条）。
  - **e2e 43 passed**，基线 **42**，净增 1（`e2e/snapshot-rendering.spec.ts`，走真实后端：建资料 → 写正文 → 上传一张资产 → 打开详情页断言冻结那张是 `blob:`、未冻那张是原址且带 `referrerpolicy`）。Review 后又加严了两处，**文件数与用例数不变**：两张图改为分属不同主机（`frozen.example.test` 与 `origin.example.test`）——同主机时「冻结那张也跑去原站取」这种退化会和未冻那张混在一起而看不出来；以及断言冻结那张的 `naturalWidth > 0`——`src` 是 `blob:` 只证明地址对，不证明字节能显示。
  - `npm run typecheck`（`tsc -b`）/ `lint` / `prettier --check` 全绿。
  - **backend 与 extension 未运行**：本任务在这两棵树下零改动、不在 `allowed_paths` 内，检查脚本据变更自动选组因而未选中它们。**这是结构性论据，不是观察到它们仍为绿。**
  - 环境：macOS Darwin 25.5.0；Node 24；Chromium（Playwright）。
- **既有断言的改动（无删除、无弱化，仅因行为变化而更新）**：`e2e/resource-pages.spec.ts` 两处原本断言 `section.locator('pre')` 含正文——默认视图改为渲染后，那个 `pre` 会命中代码块。改为断言**渲染视图**含该文字，**并新增**「切到源码视图后 `pre.snapshot-body` 仍含原始 Markdown、再切回渲染视图」三条，比原断言更强。
- **一处我自己写错的断言，记下来**：`snapshotMarkdown.test.ts` 里原本写 `expect(host.innerHTML).not.toContain('onmouseover=')`。这断错了东西——`<b onmouseover=…>` 被转义之后，那串字符**本来就会**作为普通文本出现在 HTML 里。要守的是「没有元素带上这个属性」，已改为 `querySelector('[onmouseover]')` 为 null，并补一条「它仍然看得见」。
- **已知限制/未完成项**：
  1. **安全性质从结构性变为配置性**（设计决定 ①）。三条守卫（配置断言、协议断言、转义断言）都在，但它们守的是**当前版本**的行为；依赖升级时须重新确认，无自动机制提醒。
  2. **未冻结的图片按原址加载**（设计决定 ③，用户决定）。三条代价（暴露阅读时间与 IP、带出 `SameSite=None` cookie、在显示路径撤销 `credentials:'omit'`）**已发生且不可由本任务缓解**，`referrerpolicy="no-referrer"` 只挡掉 Referer 一项。
  3. **`markdown-it` 的 `validateLink` 行为未被独立复核**：我依赖它默认拒 `javascript:`/`vbscript:`/非图片 `data:`，并写了针对这三种的用例；但**没有穷举**它的实现（例如大小写、空白、HTML 实体编码的变体）。用例证明的是那三个具体输入被拒，不是「所有伪协议都被拒」。
  4. **没有 CSP**：本任务未引入内容安全策略。有 CSP 的话，即使渲染器某天失守也还有一层；当前没有这一层。
  5. **图片按原址加载的失败态不可见**：`<img>` 加载失败（原站删图、防盗链）时浏览器显示破图，页面不给任何解释。冻结那条路有降级说明，这条没有。
  6. **渲染/源码的切换不持久**：刷新回到渲染视图。这是有意的（默认展示可读的那一面），但用户若长期偏好源码会每次都要点一次。
  7. **快照没有 `captured_from_url` 时，相对图片地址不产生 `img`**：手工粘贴的正文里若写着 `/img/a.png` 这类相对地址，页面上留下的是它的替代文字（`span.snapshot-image-refused`，与伪协议图片同一条降级路径），不是图片、也没有说明为什么。退回资料 `source_url` 能覆盖「WEB 资料 + 手工粘贴正文」这一种，但需改 `allowed_paths` 之外的 `ResourceDetail.tsx`，本任务不做。
  8. **`loading="lazy"` 让外部请求的时机变成滚动才发**：未冻结的图片不在打开页面的一瞬间全部请求出去，而是滚到才发。这不改变设计决定 ③ 的三条代价（原站照样知道你读了、cookie 照样带出去），只是把时间点摊开；e2e 那条「外部请求只来自已知的那一类」的断言因此覆盖的是首屏，不是整篇。

<!-- EVIDENCE:BEGIN -->
## 状态与最终证据

- 候选 SHA：待填
- Review：L3，两位独立只读 Reviewer，待填
- Acceptance：L3，独立只读，待填
- 最终状态/风险/用户操作：待填
- 非阻断遗留项（仅有真实问题时）：待填
- 日期与决定日志：2026-09-07 用户合并 PR #46 后指示做完整渲染，并主动问「消毒器是什么」。主 Agent 解释后给出两条路线（甲：关掉原始 HTML、不需消毒器；乙：允许 HTML + 消毒器），并出示对用户库中 7 份快照的实测（无 `<script>`/`on*`/`javascript:`，唯一的 `<` 命中来自 C++ 代码块），说明甲方案在当前语料上的还原度代价接近于零。用户选甲。主 Agent 据此另定两项：选 `markdown-it`（`html` 默认为 false，安全是默认值而非需要主动开启的选项），以及未冻结图片起初定为不自动加载。用户随后追问自动加载的安全隐患并在听完后明确选择**直接自动加载**，主 Agent 按其决定改为自动加载，三条代价逐条写入设计决定 ③ 与已知取舍，并采纳 `referrerpolicy="no-referrer"` 作为唯一缓解。
<!-- EVIDENCE:END -->
