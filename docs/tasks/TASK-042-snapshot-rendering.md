# TASK-042：渲染正文快照并显示已冻结的图片

```toml
schema_version = 2
id = "TASK-042"
status = "MERGED"
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

`docs/tasks/TASK-040-extension-image-freeze.md` 在 `allowed_paths` 内，用于把用户 2026-09-07 合并 PR #46（merge commit `0106953`）这一事实登记进去，依据根 `AGENTS.md` §5。**实际改动为两行**：TOML 的 `status` 由 `ACCEPTED` 改为 `MERGED`；以及该记录 EVIDENCE 标记区内「最终状态/风险/用户操作」那一行，补上 merge commit 与「按 §5 并入下一个已授权任务的控制面提交」，并保留「交付时为 ACCEPTED」。除这两行外不改该记录一个字。**此处原写「仅用于改 status…除此之外不改一个字」，被独立验收用 `base..candidate` 的实际 diff 证伪**——第二行落在 TASK-040 的 EVIDENCE 标记区内，符合 §5/§6，不合的只是这句自述的宽度，已更正。

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
  - **绝对地址也要规范化（验收后补）**：`toAbsolute` 原本对已 `^https?://` 的 src **早退**，原样返回。而冻结表的键是采集时 `new URL(...).href` 算出来的规范形式，于是正文里写成 `HTTPS://CDN.Example.com/a.png`、带默认端口 `:443`、或含 `..` 点段时，查表落空、那张图**静默走原站**——`failed` 计数不增、界面不提示，而用户为那份本机副本付过一次授权代价。这一条由独立验收指出，属实现者与两位 Reviewer 都没抓到的真实缺陷。现在一律走 `new URL(src, base ?? undefined).href`（对已规范的地址幂等），并补四条参数化用例加一条「规范化不得变成绕过」（`data:` 仍不产 `img`）。**一处行为微扩如实记下**（验收指出）：无 base 时 `https:/host/a.png` 这类单斜杠写法此前被正则拒掉，现在会被 `new URL` 规范成合法 http 地址并按原址加载——方向正确且仍受 `^https?:` 闸门约束，只是「按原址加载」的入口略宽了一点。
  - **相对图片地址的解析（Review 后补）**：冻结表的键是采集时算好的**绝对**地址，而 Defuddle 产出的正文里常留着 `/img/a.png`、`../img/a.png`。首版按精确字符串查表，于是相对写法**既匹配不上冻结表、也渲染不出可用的 `src`**——用户为那一份本机副本付过一次授权代价却看不到它。现在 `renderSnapshot(markdown, frozen, base)` 先 `new URL(src, base).href` 解析再查表；`base` 取 `snapshot.captured_from_url`。**没有做「退回资料 `source_url`」那一层**：那要给 `ContentSnapshot` 加一个属性并改 `ResourceDetail.tsx`，而该文件不在本任务的 `allowed_paths` 里，为一个次要兜底扩大授权范围不值得。`captured_from_url` 为空（手工粘贴的正文）时相对地址**不渲染 `img`**——渲染一个指向本机 UI 自己的 `src` 只会向本机服务发一串必然 404 的请求。代价已记入已知限制 7。
  - **本机副本读不出来时的可见提示（Review 后补，两支）**：用户对「向图床发请求」的知情同意是针对「这张没冻上」给的；本机那一份坏掉时无声改走原站，等于在他以为看的是本机那一份时发了外部请求。两条静默路径都补上了 `role="alert"`：①**单张字节取不到**——`loadFrozenImages` 返回 `failed` 计数，提示有几张改用了原网站地址；②**整份资产清单取不到**（令牌中途失效、瞬时 500）——此前这一支记 `failed: 0`，于是**所有**已冻结图片静默走原站而界面一个字不说，缺口从一张扩大到全部；现在用 `listFailed` 与「一张都没冻」区分开，提示正文里若有图片则这一次一律走原网站。两支各有一条断言。**两条文案都不说界面给不出的操作、也不断言正文里一定有图**：初稿写「重新读取这份资料可以再试一次」，而这一支里并没有重读按钮（`retry()` 也只重读正文、不重取资产），实际有效路径是刷新页面；另一条初稿直接说「这几张改用了原网站的地址显示」，而该资产的 `source_url` 未必出现在正文里。两位 Reviewer 各自独立指出其中一处，属本任务反复出现的「陈述比证据宽」，已改。
  - **投影加固（R1 F10）**：`features/resources/api.ts` 的 `captured_from_url` 由裸 cast 改为 `nullableString`——它现在被当作解析相对图片地址的 base 用，非字符串应当归为 `INVALID_RESPONSE`，与同文件其余字段一致。
  - **契约**：§4.13 新增「渲染语义」与「图片的三条去向」两段（含三条代价的原文登记；Review 后又在后一段里补入相对地址按 `captured_from_url` 解析、以及 `loading="lazy"` 使请求可能被推迟）。**契约只新增段落、未修改任何既有句子**；被更新的是 `ContentSnapshot.tsx` 顶部那段英文注释里的同类说法。此前本条写成「把 TASK-036 那句…更新为指向 4.13」是**被 diff 证伪的自述**，已更正——那句话在 TASK-036 的任务记录里，不在契约里，本任务也不该改写历史任务记录；「两条去向」与「diff 为 +4 行、0 删除」同样是首轮残留，本轮一并更正。**openapi 与 `/api/v1` 一字未改**（16 个文件中无 `docs/contracts/openapi-v1.json`、无 `backend/**`、无 `extension/**`）。
- **新增依赖（完成条件 12）**：`markdown-it`，**生产依赖**——渲染发生在浏览器里，不是构建期。**它带来的不是一个包而是 7 个**：`markdown-it` 加 `argparse@2.0.1`、`linkify-it@5.0.2`、`entities@4.5.0`、`mdurl@2.1.0`、`punycode.js@2.3.1`、`uc.micro@2.1.0`。锁文件核对：这 7 条的 `resolved` 全部指向 `https://registry.npmjs.org/`，无 `file:`/`git+`/非官方源。前端生产依赖树因此由 7 个变为 14 个。**它从此属安全关键面**：本任务的安全性依赖它的 `html:false` 与 `validateLink`，版本更新须同步复核这两处行为。
  - **版本写成精确版本，不用 `^`（Review 后改）**：首版写的是 `"markdown-it": "^14.3.1"` 与 `"@types/markdown-it": "^14.2.0"`，而 `package.json` 里**其余每一条依赖都是精确版本**——本项目的既有做法就是钉死。对一个「安全性依赖其具体行为」的包放开次版本范围，与上面那句「版本更新须同步复核」直接相抵。现已改为 `14.3.1` 与 `14.2.0`，并重跑 `npm install` 同步锁文件（锁文件里 `packages[""]` 的两条声明随之变为精确值，已解析的 `resolved`/`integrity` 未变）。
  - **新增的 3 个 dev 依赖如实登记（Review 后补）**：直接声明的是 `@types/markdown-it@14.2.0`；它又带进 `@types/linkify-it@5.0.0` 与 `@types/mdurl@2.0.0` 两个传递 dev 依赖（不在 `package.json` 里，在锁文件里）。三者都是**仅类型**的包，不进产物、不在运行时执行。
- **命令与真实退出结果**（全部由实现者本人在本机运行，无第三方复核）：
  - `check_task.py --worktree` → **CHECKS PASS**，`profiles=contracts,frontend`，`files=16`，`product_fingerprint=3b235620f06474aacbb9c73942f1daf237c03fec243b64cdcc47204c33f07331`（此前依次为 `files=15`/`c9478a33…`、`files=16`/`ed023c8b…`、`32d93bd2…`、`b2110dcb…`、`de842d88…`）。
  - **frontend 494 passed**（21 文件）。基线**实测**：在 `0106953` 的临时 worktree 上跑出 **440**（19 文件），净增 **54**：首轮 465；Review 后补 23 条（`downloadSnapshotAsset` 的响应校验一组、相对地址解析一组、`alt`/`loading` 各一条、本机副本失败时的可见提示一条）；验收后再补 6 条（绝对地址规范化 4 条、「规范化不得变成绕过」1 条、超长正文 1 条）。
  - **e2e 43 passed**，基线 **42**，净增 1（`e2e/snapshot-rendering.spec.ts`，走真实后端：建资料 → 写正文 → 上传一张资产 → 打开详情页断言冻结那张是 `blob:`、未冻那张是原址且带 `referrerpolicy`）。Review 后又加严了两处，**文件数与用例数不变**：两张图改为分属不同主机（`frozen.example.test` 与 `origin.example.test`）——同主机时「冻结那张也跑去原站取」这种退化会和未冻那张混在一起而看不出来；以及断言冻结那张的 `naturalWidth > 0`——`src` 是 `blob:` 只证明地址对，不证明字节能显示。
  - `npm run typecheck`（`tsc -b`）/ `lint` / `prettier --check` 全绿。
  - **backend 与 extension 未运行**：本任务在这两棵树下零改动、不在 `allowed_paths` 内，检查脚本据变更自动选组因而未选中它们。**这是结构性论据，不是观察到它们仍为绿。**
  - 环境：macOS Darwin 25.5.0；Node 24；Chromium（Playwright）。
- **超长正文的覆盖（验收后补）**：完成条件 11 要求「无快照、空快照、超长正文三种形态各自表现正常且不崩」。前两种有依据（`ResourcePages.test.tsx` 的无快照用例；空快照由 `api.ts` 的投影直接拒收），**超长正文此前既无用例也无实测，且没有登记为已知限制**——由独立验收指出，属自评空档。现补一条：以正文上限 1,000,000 字渲染，断言渲染确实发生（`p` 元素超过 1000 个、`strong` 内容正确）且原始 HTML 守卫在该规模下同样成立，用时约 0.7 秒。**初稿的转义那条是永真断言**：`querySelector('script')` 为 null，而被重复的正文里根本没有 `<script>` —— 转义即使在这个规模下失效它也照样通过，注释却已经写着「守卫同样成立」。R1 在复审里抓到，已把 `<script>alert(1)</script>` 掺进被重复的段落，并同时断言「没有该元素」与「那串字符仍作为文本可见」。**这是本任务第三次同一形态的失误**（另两次：`not.toContain('onmouseover=')` 断错了东西、契约引用了只存在于 TASK-036 记录里的句子），三次都由他人发现。
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

- **最终候选 SHA**：`50910fab5801609376ae541e3b613acbb5ef2b8e`（base `01069535d9910aecc56c6b7380dd17d68985c169`）。候选依次为 `99a545d`（首轮审查对象）→ `1f1fbc0`（处置首轮 findings）→ `b666d93`（处置增量 findings）→ `4e2c3a5`（文案修订）→ `ea2cc93`（处置验收更正出的两处自评漏项）→ `50910fa`（修掉一条永真断言）。每次修订都重新冻结，并交由**同一批**审查实例验证 `previous_candidate..new_candidate`。
- **检查（实现者本人在本机运行，无第三方复核）**：`check_task.py --worktree` → **CHECKS PASS**，`profiles=contracts,frontend`，`files=16`，`product_fingerprint=3b235620f06474aacbb9c73942f1daf237c03fec243b64cdcc47204c33f07331`；frontend **494 passed**（基线在 `0106953` 的临时 worktree 上实测 **440**）；e2e **43 passed**（基线 **42**）；`typecheck` / `lint` / `prettier --check` 全绿。backend 与 extension 未运行——本任务在这两棵树下零改动、不在 `allowed_paths` 内，检查脚本据变更自动选组因而未选中它们；**这是结构性论据，不是观察到它们仍为绿**。
- **Review**：L3，两位独立只读 Reviewer（R1 渲染与安全面、R2 数据通路/契约/测试面），均独立于实现者，运行器只授予 `Read`/`Grep`/`Glob`，无写工具、无 Bash。R1 五轮、R2 四轮，两位对最终候选 `50910fa`／`4e2c3a5` 起的各自最后一轮均给出 **PASS，无阻断项**。
- **Acceptance**：L3，独立只读，独立于实现者与两位 Reviewer，此前未参与本任务。三轮（`4e2c3a5` → `ea2cc93` → `50910fa`），终局 **PASS，无阻断项**，**14 条完成条件全部判定为「满足」**（条件 11 在补上超长正文用例后由「部分满足」升为「满足」）。
- **最终状态/风险/用户操作**：status=**MERGED**（2026-09-07 用户合并 PR #47，merge commit `1e35843`；本行状态登记按根 `AGENTS.md` §5 并入下一个已授权任务 TASK-043 的控制面提交）。交付时为 **ACCEPTED**。本任务交付的是「打开一份资料能看见渲染后的正文，以及 TASK-039/040 冻结下来的图片」——这是那两个任务的成果第一次在界面上可见。**须向用户当面说明的三点**：① 安全性质由「不可信内容压根不进 DOM」变为「按渲染器配置转义」，这是用户在两条路线中主动选甲的结果，三条机器守卫都在，但守的是当前依赖版本的行为；② 打开一份带未冻结图片的资料会向那些图床各发一次请求，三条隐私代价是用户在知情后接受的；③ **本任务的三个真实缺陷全部由他人发现**——两处由 Reviewer、两处由独立验收（含一条我和两位 Reviewer 都漏掉的「非规范绝对地址静默走原站」），且其中三次是同一形态：陈述比证据宽。
- **非阻断遗留项**（按独立验收终局报告的清单原样登记）：
  1. 流中途读失败的异常统一映射为 `NETWORK_ERROR`，无用例钉住（R2 首次增量报告指出）。
  2. 采集时的 pageUrl 与快照 `captured_from_url` 因重定向不一致时，正文里的相对图片地址会匹配不上冻结表而**静默走原站**（`failed` 计数不增、界面不提示）。R1 指出。**验收后的地址规范化关不掉这一支**：它的根因是 base 本身与采集时不同，不是正文写法不规范。
  3. 无 base 时 `https:/host/a.png` 这类单斜杠绝对地址，此前被正则拒掉、现在被 `new URL` 规范成合法 http 地址并按原址加载。方向正确且仍受 `^https?:` 闸门约束，只是「按原址加载」的入口略宽了一点。
  4. 完成条件 11 的超长正文用例作用于 `renderSnapshot` **模块层**，未经 `ContentSnapshot` 的 `useMemo` 与编辑框那条页面路径，也未断言耗时（0.7 秒为实现者观察，验收未复算）。判定「满足」建立在这个范围之上。
  5. 剩余风险四条已在「已知取舍」与「已知限制」中登记，本轮未新增：安全性质由结构性转为配置性、`markdown-it` 的 `validateLink` 变体未穷举、无 CSP、未冻结图片的三条隐私代价。

  验收明确建议**不**进本清单的两条，照其判断不登记：完成条件 9 的「切换资料」回收无用例（与卸载同一段清理分支，已被覆盖）；以及「本任务三次出现同一形态的陈述宽于证据」这一流程性观察（已写在实现说明里，重复登记只会稀释清单）。

## 审查报告原文

以下十三份**逐字照录**，未删改、未择要。按时间顺序排列。

### Reviewer R1 · 首轮（候选 `99a545d`）

## 权限证据

运行器给我的工具白名单只有 `Read`、`Grep`、`Glob` 三项，**无 `Write`/`Edit`/`NotebookEdit`、无 `Bash`**。因此我不能写文件、不能提交/推送/合并、不能执行任何命令（含 `npm test`、`git`、`npm audit`）。本次全部结论来自静态阅读候选工作树与 `node_modules` 源码；**任何机械结果（465/43/CHECKS PASS/指纹）我都无法复算，只能按记录采信**。未试写探测。

候选 `99a545d`，基线 `0106953`，`/tmp/sp-t042/T042.patch` 1210 行已逐行读完，切片内文件对照工作树复核。

## 三条守卫的独立判断（问题 1）

- **配置断言：真的断了配置，不是现象。** `snapshotMarkdown.test.ts` 断 `RENDERER_OPTIONS.html` 与 `createRenderer(() =&gt; null).options.html`；后者是 MarkdownIt 实例真实生效的 options，而 `html_block`/`html_inline` 两条规则的开关正是 `state.md.options.html`（`node_modules/markdown-it/lib/rules_block/html_block.mjs:26`、`rules_inline/html_inline.mjs:19`）。断言链闭合。
- **协议断言：是现象断言**（三个具体输入），记录自己也这么写。守不住"所有伪协议"——见下我的独立复核。
- **转义断言：形态正确**（`querySelector(tag)` 为 null + 文本仍可见），上一版那条断错的 `not.toContain('onmouseover=')` 已改对。

## validateLink 独立复核（问题 2、3）：未找到绕过

顺序核实：所有产生 href/src 的路径——inline link `rules_inline/link.mjs:44-50`、image `rules_inline/image.mjs:39-46`、引用定义 `rules_block/reference.mjs:115-116`、autolink `rules_inline/autolink.mjs:28-29,50-51`、linkify 两处——都是**解析期**先 `normalizeLink` 再 `validateLink`，**确实先于**渲染器规则。伪协议 image 的 href 只可能被置为 `''`（`image.mjs:44`），`resolve('')` 返回 null，该分支不可绕过。

我试过的变体与结论：大小写（`validateLink` 先 `trim().toLowerCase()`，`lib/index.mjs:34-39`，拒）；前后空白（destination 解析跳空白 + trim，拒）；HTML 实体 `javascript&amp;colon;` / `&amp;#106;avascript:`（`parseLinkDestination` 返回前先 `unescapeAll`，实体在校验**之前**解码，拒）；`java&amp;Tab;script:` / `&amp;NewLine;`（控制字符能进字符串，但 `normalizeLink` 末尾 `mdurl.encode` 把非白名单字符一律百分号编码，`mdurl/lib/encode.mjs:12-21,86` → `java%09script:`，含 `%` 不构成合法 scheme，不执行）；裸 `\t`（`parse_link_destination.mjs:49` 直接终止 destination）；`java\0script:`（`rules_core/normalize.mjs:5,14` 把 `\0` 换成 U+FFFD）；属性闭合注入（`renderer.mjs:151-163` 对属性名与值都 `escapeHtml`，空格/控制字符已被编码）。`data:` 只放行 `image/(gif|png|jpeg|webp)`，**`data:image/svg+xml` 被拒**——这条是关键，SVG 是唯一能带脚本的图片型 data URI。

**已知限制 3 的自述准确，且偏保守**：它说的复核我做了 6 类变体，未发现绕过。未覆盖：无浏览器实机点击验证、未审 IDN 同形字（属显示欺骗非执行）。

## Findings（全部非阻断，按重要性）

**F1 · 渲染出的每张 `&lt;img&gt;` 都丢了 alt（P2，建议现在修，成本近零）**
`snapshotMarkdown.ts:34-54` 的自定义 image 规则完整取代了默认规则，而默认规则唯一多做的事就是填 alt：`node_modules/markdown-it/lib/renderer.mjs:77-89` 的 `token.attrs[token.attrIndex('alt')][1] = slf.renderInlineAsText(...)`；token 在解析期以 `[['src',href],['alt','']]` 建成（`rules_inline/image.mjs:125`）。所以输出必然是 `alt=""`。影响：读屏把正文所有图片当装饰性图片跳过；且未冻结图加载失败时（已知限制 5 的场景）连替代文字都没有——**这让已知限制 5 比记录写的更糟**。现有用例只查 src/referrerpolicy，查不到。修正：`renderToken` 前加一行 `token.attrSet('alt', self.renderInlineAsText(token.children ?? [], _options, _env))` + 一条断言。

**F2 · 冻结匹配是"规范化后的 src"对"原样存下的 source_url"精确比较；相对地址必然不命中，且那张图一点都不显示（P2）**
`snapshotMarkdown.ts:76-83` 用 `frozen.get(src)`，`src` 是 `normalizeLink` 之后的值；映射键是后端存的 `asset.source_url`，而它由扩展 `new URL(trimmed, baseUrl).href` 解析成**绝对**地址（`extension/src/injected/extract.ts:67-88`），正文却"一字不动"保留原写法。于是 `![图一](/img/a.png)`（正是扩展自己的用例形状，`extension/src/injected/extract.test.ts:114`）在正文里是相对地址、在资产表里是绝对地址：`frozen.get()` 未命中 → 又不满足 `/^https?:\/\//` → `resolve` 返回 null → **连 `&lt;img&gt;` 都不产生**，只剩一个斜体 span。后果：一张确实冻下来、用户为它付过权限代价的图，页面上什么都没有；完成条件 5/6 在这条路径上静默不成立。e2e 用的是绝对地址，证明不了这一支。修正：查表前用 `snapshot.captured_from_url` 把 src 解析成绝对地址（`new URL(src, base).href`）再匹配；若不修，**必须**把"匹配是精确字符串、相对/非规范写法既匹配不上也不渲染"写进已知限制。

**F3 · 取字节失败的已冻结图静默改走原站，与完成条件 9 不符（P2）**
`ContentSnapshot.tsx:27-33` catch 后不记入映射 → 走 origin 分支；`ContentSnapshot.test.tsx` 那条用例正是断言 src 变回 `FROZEN_URL`。完成条件 9 原文要求"退化为**可见的失败态**"，实现给的是无提示的原址回退。用户对"向图床发请求"的知情同意是针对"这张图没冻上"给的（设计决定 ③ 原文：自动加载只适用于没冻上的）；本机字节损坏/隔离时用户以为看的是本机副本，实际发了外部请求。触发需后端取字节失败，个人本机场景可能性低、影响为一次额外图床请求（同页通常已在请求该 CDN）。修正：加可见说明，或按条件 9 原文改为失败态占位；保留现状则须写进设计决定 ③ 与已知限制。

**F4 · `renderSnapshot` 未 memo，编辑时每次按键重解析全文（P2）**
`ContentSnapshot.tsx:183-185` 在 render 体内直接调用，`snapshotMarkdown.ts:75-84` 每次 `new MarkdownIt` + 全文 parse。快照块的渲染与 `editing` 无关（`:156` 的三元），所以**在上限 100 万字的正文旁边打字，每一次 `setDraft` 都重解析整篇**。完成条件 11 的"超长正文"既无用例也无实测（我 grep 过 `features/resources` 下没有任何超长正文渲染用例，命中的 `repeat(1_000_001)` 都是 PASTE 校验）。修正：`useMemo(..., [snapshot?.content, frozen])`，2-3 行。

**F5 · 安全关键依赖用了 caret，与仓库惯例相反（P3）**
`frontend/package.json:23` `"markdown-it": "^14.3.1"`（`:33` 同）——react/react-dom/react-router-dom 与**全部** devDependencies 都是精确钉版。记录把它登记为"安全关键面、版本更新须复核 `html:false` 与 `validateLink`"，caret 却允许 `npm install` 无人复核地推到任意 14.x（锁文件钉住 14.3.1，`npm ci` 仍确定，故影响有限）。修正：改精确版并同步锁文件。

**F6 · 完成条件 12 的依赖交代少报 2 个 dev 包（P3）**
锁文件实际新增 dev 三条：`@types/markdown-it@14.2.0`、`@types/linkify-it@5.0.0`、`@types/mdurl@2.0.0`；记录只写"另加 dev 依赖 `@types/markdown-it`"。生产 7 条与记录一致，`resolved` 全部 `registry.npmjs.org`、均带 sha512 integrity，无 `file:`/`git+`，**来源核对属实**。

**F7 · `downloadSnapshotAsset` 无单元用例（P3，属 R2 切片但在我这条链上）**
`client.ts` 的四种媒体类型白名单 + `nosniff` 判定只有 e2e 快乐路径经过（grep：该符号只出现在 `client.ts`、`api.ts`、`ContentSnapshot.test.tsx`，`client.test.ts` 未新增）。这条判定是"blob URL 类型只可能是四种图片"的唯一保证，挡的是同源 `blob:` 承载 text/html 的形态，值得一条直接用例。

## 逐条核实通过的部分

- **`dangerouslySetInnerHTML` 无旁路（问题 4）**：全仓仅 `ContentSnapshot.tsx:183` 一处（grep 确认）；唯一入参是 `snapshot.content ?? ''`，而 `content` 在投影层被强校验（`api.ts:319-321`：READY→非空字符串，FAILED→null）。草稿走 `&lt;textarea value&gt;`、错误态走文本节点，都不经过这里。
- **blob 生命周期无泄漏、无过早回收（问题 5）**：创建点只有 `frozenImageUrl`（`api.ts:929-931`）经 `loadFrozenImages`（`ContentSnapshot.tsx:29`）一条路；`release` 遍历 map 全值。我特意去核了"同 `source_url` 覆盖导致漏收"这条——后端 `UNIQUE(snapshot_id, source_url)`（`backend/migrations/versions/0005_snapshot_assets.py:59-61`）排除了它。竞态：`.then` 先赋 `release` 再判 `alive`，与清理里先 `alive=false` 再 `release?.()` 互斥，unmount 早于 resolve 时由 `else loaded.release()` 兜住，既不双重回收也不漏收。失败路径不持有 URL（只可能在创建任何 URL **之前** reject，逐张失败被内层 try 吞）。过早回收被渲染门 `frozen?.key === ${resourceId}:${revision}`（`:175`）挡住，且 React 先提交 DOM（换成"正在取回…"）再跑旧 cleanup。未测到：切换资料、unmount 早于 resolve 两支无用例（结构上同一条清理路径，我不要求补）。
- **降级路径（问题 7）**：资产列表失败→空映射+全走原址（有用例）；单张失败→见 F3；空快照结构上不可能；FAILED 快照渲染空 div，与改动前的空 `&lt;pre&gt;` 同形无回归；超长正文见 F4。
- **依赖安全注意事项（问题 6）**：我无法跑 `npm audit`。据我所知 markdown-it 14.3.1 无公开公告（CVE-2022-21670 影响 &lt;12.3.2，不适用）。与 `html:false` 相关的注意点是：它只关原始 HTML，**不**限制 `data:image/*` 与目标域名——这两点实现方另加了 `/^https?:\/\//` 与 origin/blob 二分，配置面完整。
- **styles.css**：新增块无任何 `url()`/`@import`/外部字体，不产生新的外部请求，与完成条件 8 一致。
- **已知限制 1–6 如实性（问题 8）**：1、2、6 如实；3 如实且偏保守（可据本报告改写为"已定向复核 6 类变体、未发现绕过"）；4 如实（grep 确认前端无任何 CSP）；**5 偏窄**——F1 与 F3 各让它比记录写的更严重。

## 未覆盖 / 剩余风险

不在我切片、未审：`api/client.ts` 正文（仅看了新增段）、`features/resources/api.ts` 除 `frozenImageUrl`/`snapshot` 投影外部分、契约与任务索引文档措辞、e2e 运行行为（仅静态读）、TASK-040 状态登记的合规性。**全部机械证据未复算**（无 Bash）：测试计数、CHECKS PASS、指纹、`npm audit`、浏览器实机行为均按记录采信。

## 结论

**PASS**，指向 `99a545dde0ed676a1f6602c78ae73e3f62b18ca4`。无阻断项：未发现可达的脚本执行路径，`html:false` + `validateLink` 的三条守卫在当前版本上真实成立，blob 生命周期正确。F1–F7 全为非阻断，但 **F1、F2、F3 必须由主 Agent 或修掉、或如实写入已知限制/EVIDENCE**——只写 PASS 而不记录这三条，会让记录比事实宽（尤其 F2 使完成条件 5/6 在一类可能输入上不成立、F3 与完成条件 9 原文不符）。

### Reviewer R2 · 首轮（候选 `99a545d`）

## 权限证据（R2）

运行器给我的工具白名单只有 **`Read` / `Grep` / `Glob`**（外加 TodoWrite 类无副作用工具）。**没有 `Write`/`Edit`/`NotebookEdit`，没有 `Bash`**：我不能写文件、不能提交/推送/合并、不能执行任何命令（因此 465/440/43/42、CHECKS PASS、指纹 `c9478a33…` 我一律**未复算**）。未做试写探测。

审查对象：`/tmp/sp-t042/T042.patch`（逐行读完，15 文件；我按 diff 头逐条枚举确认**无** `openapi-v1.json`、**无** `backend/**`、**无** `extension/**`）+ 工作树实文件。前提：工作树 = 候选 `99a545d`；`efdc5dc → 99a545d` 的 git 关系我无法核（记录里证据仍署 `efdc5dc`，EVIDENCE 待填）。

## Findings（仅我的切片）

**F1（阻断，必须修复｜文档事实）契约把一句它自己从未有过的话当成「4.13 原先」的原文引用，记录又声称改了契约里的那句——两处都与 diff 不符。**
- `docs/contracts/API与数据契约基线.md:395`：「这与 **4.13 原先**「Markdown 让不可信内容退化为惰性文本」的性质不完全相同」。我全仓检索：`惰性文本` 只出现在这一行与 TASK-042 记录的 `risk_reason`；`阅读器范畴` 只在 `docs/tasks/TASK-036-content-snapshot.md:62,124` 与 `docs/research/…:290`。**契约 §4.13 从来没有这两句**。
- `docs/tasks/TASK-042-snapshot-rendering.md:153`：「并把 TASK-036 那句「渲染属阅读器范畴，不在本任务」更新为指向 4.13」。契约的 diff 只有一个 hunk `@@ -392,6 +392,10 @@`，**+4 行、0 删除、0 修改**——没有任何既有句子被更新。真正被改掉的那句在 `frontend/src/features/resources/ContentSnapshot.tsx:28`（英文注释），但记录把它写在「**契约**：」条目下，而完成条件 13 又明写「中文契约 §4.13 的…按实际情况更新」，读者只会理解为契约文件被改。
- 触发/影响：契约是本仓「业务事实来源」，后续任务会照读；一处不可核对的自引用 + 一条被 diff 证伪的自述，正是 TASK-039 被 Acceptance 拦下的同一形态。最小修正：把 395 行该分句改为引用 **TASK-036 任务记录**（而非「4.13 原先」），并把记录 153 行改成「契约仅新增两段、未修改既有句子；被更新的是 `ContentSnapshot.tsx` 的注释」。纯文本改动，可与 R1 的要求合并成一个新候选。（TASK-036 记录不在 `allowed_paths`、也不该改写历史记录——不改它是对的。）

**F2（非阻断 P2｜覆盖缺口）`downloadSnapshotAsset` 零单测，且「与 `downloadOriginal` 同形」不准确。**
`client.test.ts` 在本次 diff 中**一行未改**（净增 25 = `snapshotMarkdown.test.ts` 18 + `ContentSnapshot.test.tsx` 7，逐条数过，全部落在两个新文件）。而同一文件里 `uploadSnapshotAsset`（`client.test.ts:596-644`）有完整的路径/`If-Match`/负例覆盖——同一任务加的取字节兄弟方法一条都没有：`client.ts:556-561` 的四种 media type 白名单、`nosniff`、`status!==200`、`fileIdPattern` 前置校验，**删掉任意一条都不会有测试变红**。完成条件 5「须有用例证明请求打到 `/snapshot/assets/{id}/bytes`」只由 e2e 的 `blob:` 间接兑现，无任何用例断言那条路径字符串。
另：`client.ts:562` 用 `response.arrayBuffer()`，**无 content-length 上界、无流式尺寸校验、不要求 `Content-Disposition`**，而 `fileBody()`（`client.ts:407-437`）三者俱全；记录称「同形」属过述。实际风险有限（我读了后端 `api/snapshot_assets.py:266-279`：`Content-Type` 取 DB CHECK 约束过的 `row.media_type`、带 `nosniff` 与 `attachment`，字节由 `storage.read(key,size,digest)` 在服务端验尺寸与摘要），所以前端这几条属纵深防御，不是主边界。建议补 4 条廉价用例并把「同形」改为如实描述。

**F3（非阻断 P2｜与记录自述的控制相矛盾）新依赖是 `package.json` 里唯一的两条 caret 范围。**
`frontend/package.json:23` `"markdown-it": "^14.3.1"`、`:33` `"@types/markdown-it": "^14.2.0"`；其余 20 个依赖**全部精确锁定**（`react: 19.2.8`、`eslint: 10.9.1` …）。记录明写它「从此属安全关键面…版本更新须同步复核 `html:false` 与 `validateLink`」，而 caret 允许一次 `npm install` 静默拉进 14.x 新版。`npm ci` 走锁文件所以今天是确定的；最小修正是去掉两个 `^`。

**F4（非阻断 P2｜断言强度低于宣称）e2e 那条「外部请求只能来自那一个已知源」守不住它自称守的东西。**
`e2e/snapshot-rendering.spec.ts:13-14` 冻结图与未冻图**共用 `https://cdn.example.test`**，而 87-89 行按 **origin** 整体放行该源。于是「冻结的那张也被从原址请求了一次」——正是完成条件 6 要防的回归——这条断言**发现不了**；而 `toHaveAttribute('src', /^blob:/)` 是可重试的，先渲染原址再换 blob 的实现回归也会被它放过（当前实现用 `frozen.key` 闸门挡住了，所以现在不是缺陷，是测试盲区）。此外 90 行是即时快照，无 network-idle 等待，加上 `snapshotMarkdown.ts:1120` 给每张图都设了 `loading="lazy"`，外部请求可能根本还没发出，断言便"绿"了。最小加强：冻结图改用独立 origin（如 `cdn-frozen.example.test`）并断言它**从未**出现在 `external`。
（时序假绿的另一面我判断**不成立**：Playwright 的 `expect` 全部自动重试，图片没加载完不会让 `toHaveCount(2)`/`toHaveAttribute` 提前假绿；`baseURL` 与硬编码的 `http://127.0.0.1:15173` 一致，写错端口只会全红不会假绿。）

**F5（非阻断 P2｜目标 3 的最后一步无机器证据）全套用例只证明 `src` 是 `blob:`，没有一条证明那张图真的解码显示了。**
blob URL 指向一堆解不开的字节，本候选的所有测试仍会通过。任务目标 3 是「让用户第一次能在界面上看见冻结下来的东西」，而 TASK-040 的教训恰是「三个缺陷全部由用户实测发现、测试套件一个没拦住」。一行即可：`expect(await images.nth(0).evaluate((i) =&gt; i.naturalWidth)).toBeGreaterThan(0)`。

**F6（非阻断 P3｜依赖登记）7 个生产包、全官方源、7→14 我逐条核对**属实**：新增非 dev 条目为 `markdown-it@14.3.1`、`argparse@2.0.1`、`linkify-it@5.0.2`、`markdown-it/node_modules/entities@4.5.0`、`mdurl@2.1.0`、`punycode.js@2.3.1`、`uc.micro@2.1.0`，`resolved` 全为 `https://registry.npmjs.org/`，无 `file:`/`git+`；基线 7 个（react、react-dom、scheduler、react-router-dom、react-router、cookie、set-cookie-parser）→ 14 ✓。**漏报**：dev 侧还进了两个传递依赖 `@types/linkify-it@5.0.0`、`@types/mdurl@2.0.0`（记录只写了 `@types/markdown-it`），均官方源。

**F7（非阻断 P3｜契约与实现的小出入）`loading="lazy"` 在契约与记录里一处未提。**
契约 397 行「打开一份资料会向每个未冻结图片的图床**各发一次请求**」在懒加载下并不精确（可能推迟、甚至不发）。方向是把代价说重了，不是安全问题，但属实现事实未登记。

**F8（非阻断 P3｜未登记的第三条去向）契约只写了「图片的两条去向」，实际有三条。**
`snapshotMarkdown.ts:1152-1159`（`renderSnapshot` 的 `resolve`）对非 `http(s)` 的图片地址——包括 markdown-it 的 `validateLink` **会放行**的 `data:image/png;…` 与相对地址——返回 `null`，于是不产生 `img`，只留 `&lt;span class="snapshot-image-refused"&gt;` 替代文本。安全方向正确（比契约更严），但这是用户可见行为，契约「两条去向」与已知限制 1–6 均未登记。

## 逐条回答你点名要核的

1. **有没有顺带放宽别处**：没有。`request()` 的 `['method','body','ifMatchVersion','deletionToken']` 白名单与 `versionedDeleteTarget`/`resourceDeleteTarget` **一字未动**（client.ts 只有一个新增 hunk）；`fileIdPattern` 是全锚定 UUID，对 `resourceId`/`assetId` 各校验一次后才拼路径，不经 `localPath()` 与 `downloadOriginal`/`uploadSnapshotAsset` 的既有先例一致；`checked(response, usedToken)` 在状态/头校验**之前**调用，与两个先例同序，403 `LOCAL_TOKEN_*` 清缓存令牌的语义保留。响应校验够不够：够，且**没有把后端没保证的东西当保证**（四种类型来自后端按魔数判定 + DB CHECK，`nosniff` 后端确实发，摘要/尺寸后端已验）；缺的只有尺寸上界，见 F2。
2. **既有断言是更强还是更弱**：更强，无删除。`resource-pages.spec.ts:236-241` 用渲染视图 + 源码视图两面覆盖了原来单一 `pre` 覆盖的东西（正文 `# 冻结正文 …` 是标题，渲染后原断言必失效，改动是必需的）；`:251` 刷新后只断言渲染视图，丢掉的是"刷新后**源码**仍在"这一层，但内容从 content 派生，实质强度不减。**唯一提醒**：新断言全部依赖 `.snapshot-rendered` 这个 class 名，class 一改测试就静默失效——可接受。
3. **新增 e2e 的边界**：见 F4/F5。
4. **契约 §4.13 与实现逐条**：`html:false` ✓（`RENDERER_OPTIONS`）、`target="_blank" rel="noreferrer noopener"` ✓（`link_open` 规则）、伪协议由渲染器拒 ✓、blob URL 与「`&lt;img src&gt;` 打不到该端点」✓（与后端 4.14 及门禁一致）、`referrerpolicy="no-referrer"` ✓、「正文一字不改写」✓（只改 token 属性）。三条代价与代码事实一致（代价一因 lazy 略有出入，见 F7）。**`/api/v1` 与 openapi 一字未改**：15 个 diff 条目我逐条枚举，成立。**不成立的是那句自引用与记录的契约自述，见 F1。**
5. **计数与基线**：证据形态达标，且**没有混入首个候选的数字**——465−440=25，与本 diff 里新增用例数**精确吻合**（`snapshotMarkdown.test.ts` 2+6+4+3+1+2=18，`ContentSnapshot.test.tsx` 7），文件数 19+2=21 吻合，e2e 42+1=43 吻合（新 spec 恰好 1 个 `test(`，`resource-pages` 只加断言不加 test）。我未执行任何命令，这是**内部一致性核对**，不是复跑。
6. **依赖登记**：见 F6（生产侧属实，dev 侧漏 2 个）。
7. **投影与回收**：`snapshotAsset`（`api.ts:363-376`）7 个字段与后端 `asset_store.FIELDS` **逐项对应**，`storage_key` 仍不外露；该函数本次未改动。`frozenImageUrl` 的回收责任**在 JSDoc 之外有一条机器保证**——`ContentSnapshot.test.tsx` 的 `revoked` 等于 `created`（卸载路径），但只覆盖卸载 + 单张 + 成功路径；「切换资料/revision 变化」与「多张部分失败」的回收无用例（构造上由 effect 依赖数组 `[resourceId, revision]` 保证）。竞态我逐条走过：加载中卸载时 `release` 尚未赋值，但 `.then` 的 `else loaded.release()` 兜住了，StrictMode 双调用亦然；`UNIQUE(snapshot_id, source_url)`（0005 迁移）排除了同址覆盖导致的漏收。`frozenImageUrl` 本身对未来的第二个调用方无任何机器约束（可选建议）。
8. **已知限制 1–6 与「写错的断言」那段**：如实。限制 4「没有 CSP」我全仓检索确认无 `Content-Security-Policy`；限制 3、5、6 与代码一致；`snapshotMarkdown.test.ts:985-986` 确有 `querySelector('[onmouseover]')` 为 null + 「它仍然看得见」，自陈属实。**缺的**是 F8、F7、F2 三项未进限制清单。

## 我没有覆盖的

`ContentSnapshot.tsx` 的 React 分支/状态语义与 `ContentSnapshot.test.tsx`、`snapshotMarkdown.ts` / `.test.ts` 的完整评审（R1 切片，我只读到与我切片相交处）；`styles.css`；`README.md`/索引措辞；`markdown-it@14.3.1` 上游源码与 `validateLink` 实现（记录已列为已知限制 3）；npm integrity 与上游产物的对应关系；任何命令的实际执行结果（CHECKS PASS、指纹、465/440/43/42 全部 NOT_RUN 于我）；`efdc5dc` 与 `99a545d` 的提交关系。

## 结论

**CHANGES_REQUIRED**，指向 `99a545d`。唯一阻断项为 **F1**（契约中不存在的自引用 + 记录被 diff 证伪的契约自述，纯文本修正，建议与 R1 的要求合并为一个新候选）。F2–F8 为非阻断，建议由主 Agent 逐条登记处置；其中 F4、F5 是我最建议顺手做掉的两处（各一行到数行，直接对着 TASK-040「测试套件一个没拦住」的教训）。安全实现本身我没有发现缺陷：`request()` 白名单未放宽，取字节路径的校验与后端实际保证对得上，冻结/未冻结两条去向的实现与用户决定一致。

### Reviewer R1 · 增量复审（`99a545d..1f1fbc0`）

## 只读证明与范围

- 运行器只授予 Read/Grep/Glob，无 Write/Edit/Bash；未修改、未提交任何文件。
- 候选：`<repo>/.git/refs/heads/agent/coordinator/TASK-042-snapshot-rendering` = `1f1fbc0d1830dfc97879ac85bd7b8f71a04999f8`，`.git/HEAD` 指向该分支，工作树即候选。无 Bash 故未跑 `git diff`，改为按你给的 11 文件清单逐个读最终态并与首轮记忆比对。
- 继承首轮（99a545d）覆盖：渲染器配置/转义/协议三组守卫、blob 回收、写请求为零、e2e 主干、契约 §4.13 未删既有句子。本轮复审 F2/F3/F5/F6 处置点及其受影响上下文（client.ts 全文、ContentSnapshot.tsx、snapshotMarkdown.ts、四个测试文件、契约 §4.13、package.json/lock）。

## 1. 处置是否成立（看实现，不看自述）

- **F5 成立**：`frontend/package.json` 为 `"markdown-it": "14.3.1"`、`"@types/markdown-it": "14.2.0"`；`package-lock.json` `packages[""]` 两处同为精确值，`resolved` 均为 registry.npmjs.org。
- **F6 成立**：锁文件确有 `@types/linkify-it@5.0.0`、`@types/mdurl@2.0.0`（dev、仅类型），与记录一致。
- **F2 部分成立，处置可接受**：`renderSnapshot(md, frozen, base)` → `toAbsolute` → 查表 → 最后 `^https?:` 闸门，顺序正确。不做 `source_url` 兜底的理由（`ResourceDetail.tsx` 不在 allowed_paths）属实，已知限制 7 与契约 §4.13「第三条去向」写法诚实，且契约明说这比其余规定更严。
- **F3 只覆盖了一半**，见 F7。
- **断言绑定正确、非永真**：`snapshotMarkdown.test.ts:110-117` 断 `src === blob URL`——解析若坏掉则连 `img` 都不产生，用例必失败；`ContentSnapshot.test.tsx:165-182` 同理，且 `:184-192` 先 `findByText('正文一段。')` 确认已渲染再断 `img` 为 0，不是空断言。`client.test.ts:656` 用真实 `new Response(bytes)`（真 ReadableStream），`:667-671` 断 `blob.size === 6`，证明 `boundedBlob` 真被走通，长度那 5 条不是靠 `response.body` 缺失假通过。e2e 双主机分离 + `naturalWidth > 0` 是有效加严。
  - 弱形式两处（不算缺陷）：`snapshotMarkdown.test.ts:57` 与 `:18` 都是 `not.*` 形式，无 `<a>` 时亦为真；由 `:151-158` 的正例配平。

## 2. 本轮是否引入新缺陷

- **useMemo 无误**：`result` 是 `useResourceQuery` 的 state，identity 稳定 → `snapshot`/`frozen`/`base` 在编辑框打字时不变，缓存真的生效；`base` 由 `snapshot` 派生属冗余依赖，无害。effect 依赖 `[resourceId, revision]` 与 `frozen.key` 一致；promise 后到时 `alive===false` 分支调用 `loaded.release()`，两支都回收。
- **base 边界安全**：非 http base、opaque base（`javascript:`）使 `new URL` 抛错 → catch 回落原串 → 被 `^https?:` 闸门拦下；`data:image/*` 一律不产 `img`。解析后的绝对地址仍要过该闸门，没有绕过 `validateLink`。
- **`downloadOriginal` 行为未变**：`fileBody` 仍先做 `expected > MAX_FILE_BYTES` 前置检查，`boundedBlob` 的 `limit` 只是冗余第二道；既有 5 条长度/一致性用例（`client.test.ts:165-169`）未删未弱化。唯一可能的差别是流中途读失败的错误码经 `catch → NETWORK_ERROR` 归一，两侧均无用例覆盖，属文案级、非阻断。

## Findings

**F7（必须处置，二选一：3 行代码或如实登记）** `ContentSnapshot.tsx:106-111`——`listSnapshotAssets` 整体失败时 `failed: 0`，**所有**已冻结图片静默改走原站，界面无任何提示；`ContentSnapshot.test.tsx:143-151` 还把「无提示地全走 cdn.example.com」钉死为期望行为。这与 F3 是同一类知情同意缺口（用户的同意只针对「这张没冻上」），只是从一张扩大到全部。触发窗口真实但窄：快照 GET 成功而资产 GET 失败（令牌中途失效、瞬时 500）。**更关键的是记录 154 行的自述**「现在 `loadFrozenImages` 返回 `failed` 计数，快照区显示一条 `role="alert"`」读起来像该缺口已闭合，实际留了这一支——自述宽于证据。

**F8（必须处置，记录准确性）** 记录 155 行说契约新增的是「图片的**两条**去向」，而 `docs/contracts/API与数据契约基线.md:397` 实为「图片的**三条**去向」；同句「**15 个文件**中无 openapi-v1.json」与 148/160 行的 16 个文件不一致（15 是首轮残留）。openapi 本身确未在 allowed_paths 内、确未改，结论不受影响，但两处数字须更正。

**F9（可选建议）** 提示文案「这几张改用了原网站的地址显示」在「该资产 `source_url` 不出现在正文」或「相对地址无 base 因而根本不渲染」时不成立，略宽于事实；且该提示只在渲染视图出现，切到源码视图即消失。

**F10（可选建议）** `features/resources/api.ts:330` 对 `captured_from_url` 用裸 cast 而非 `nullableString`，而这个值现在被当作 URL base 使用。无安全后果（最终 `^https?:` 闸门兜住），只是与同文件其余字段的校验风格不一致。

## 剩余风险

- 采集时的 pageUrl 与 `captured_from_url` 因重定向不一致时，相对地址会匹配不上冻结表而静默走原站（与 F7 同源，记录未提）。
- 首轮已登记的残留仍在：无 CSP、`validateLink` 变体未穷举、依赖升级无自动提醒、原址图片失败态不可见。
- 测试计数（frontend 488 / e2e 43）与 `check_task.py` 结果为实现者本人机械证据，我未重跑；上述定向核对未发现与之矛盾之处。

## 结论

**PASS（覆盖新最终候选 `1f1fbc0`）——无阻断项**：F2/F3/F5/F6 的处置在实现与用例上真实成立，本轮未引入代码缺陷，F2 的取舍与限制写得诚实。附 **F7、F8 两项必须处置**的非阻断项，处置方式限于「补 3 行提示+1 条断言」或「在已知限制中如实登记」及更正记录中的两处数字；两者都不需要我重新审代码，主 Agent 择一后可进入验收。

### Reviewer R2 · 增量复审（`99a545d..1f1fbc0`）

## 独立只读复审报告 — TASK-042 · Reviewer R2（增量）

**只读证明**：本 Agent 工具白名单仅 `Read`/`Grep`/`Glob`，无 `Write`/`Edit`/`Bash`，运行器层面无法写入、提交或推送。
**范围**：候选 `1f1fbc0`（基线 `0106953`，前一候选 `99a545d`）。本轮逐行复读了受影响文件的最终状态：`frontend/src/api/client.ts`、`client.test.ts`、`frontend/e2e/snapshot-rendering.spec.ts`、`frontend/e2e/resource-pages.spec.ts`、`features/resources/{snapshotMarkdown.ts,snapshotMarkdown.test.ts,ContentSnapshot.tsx,ContentSnapshot.test.tsx,api.ts:401-409}`、`frontend/package.json`、`package-lock.json`、`docs/contracts/API与数据契约基线.md §4.13`、任务记录。**继承首轮**（`0106953..99a545d`）对本轮未触及部分的覆盖：`styles.css`、`ResourcePages.test.tsx`、`api.test.ts` 其余部分、README、任务索引、TASK-040 状态登记、契约其余章节。无越 `allowed_paths` 的文件。

### 1. 五条处置是否成立（看实现，不看自述）

- **F2 成立**。`client.ts:424-452` 的 `boundedBlob` 双界限（`received > expected || received > limit` 早断 + 收尾 `received !== expected`）为真；`downloadSnapshotAsset`（:582-597）补齐 attachment、`^[1-9]\d*$` 长度、`expected > MAX_ASSET_BYTES`。新用例中**真正有咬合力**的是六条：`inline` 非 attachment、无 `content-length`、`content-length: 0`、`>10 MiB`、声明 7>实际 6、声明 5<实际 6 —— 旧实现只查状态/类型/nosniff 后直接 `arrayBuffer()`，这六条处置前必失败。`text/html` 与 `image/svg+xml` 两条旧实现的类型白名单本就挡得住，属补齐、非新咬合（记录未夸大，但也未区分，可忽略）。已核后端 `api/snapshot_assets.py:271-278` 确实发 `attachment; filename="snapshot-asset"` + `nosniff`，Content-Length 由 Starlette 按 bytes 自动补，故本轮收紧不会把真实响应挡在门外；e2e 的 `blob:` + `naturalWidth` 正是这条的端到端守卫。
- **`boundedBlob` 抽取未改 `downloadOriginal` 行为、未弱化任何断言**。`fileBody`（:454-471）仍在**读体之前**做全部头部校验并调用 `attachmentName`；`client.test.ts:159-177` 的 11 条（含 `content-length` `'9'`/`'7'` 两个方向）全部保留。新增的 `!response.body` 判空把原本可能的 TypeError 变成 `ApiError('INVALID_RESPONSE')`，属收紧。唯一语义微调：流中途的非 ApiError 异常统一映射为 `NETWORK_ERROR`，无用例钉住（缺口，非阻断）。
- **F3 成立**：`package.json:23,33` 与 lock `packages[""]:11,21` 均为 `14.3.1` / `14.2.0`；7 个生产包 `resolved` 全部 `registry.npmjs.org`（已逐条核对）。
- **F4 成立**：`FROZEN_HOST`/`ORIGIN_HOST` 分属两主机，末尾 `unexpected` 过滤只放行 `origin.example.test`，冻结主机一旦出现即失败。
- **F5 成立且有咬合**：字节坏、媒体类型丢失、blob URL 提前回收这三种退化下 `src` 仍是 `blob:` 而 `naturalWidth` 为 0，poll 会超时失败。
- **F6 成立**：lock `1212-1235` 三个 `@types` 齐备且均 `dev: true`。

### 2. 本轮新缺陷 / 陈述宽于证据

无新的安全或功能缺陷。三处**记录与实物不一致**（均非阻断）：

1. 记录 `TASK-042:155` 写「§4.13 新增…**图片的两条去向**」，而契约 `:397` 实际标题与内容是「**图片的三条去向**」（第三条 = 解析后非 http(s) 者不产 `img`）。记录落后于本轮契约文本。
2. 已知限制 7（`:175`）称相对地址无 base 时「**不出现任何元素**…只在源码视图里看得到…界面不给解释」，与实现不符：`snapshotMarkdown.ts:41` 会产出 `<span class="snapshot-image-refused">替代文本</span>`，`styles.css:2150-2154` 还专门为它加了样式并注明「不静默消失」，契约也写的是「只留可读的替代文本」。方向是**低估**而非夸大，但两处文档互相矛盾。`ContentSnapshot.test.tsx:187` 的注释同此。
3. 计数/指纹（frontend 488、e2e 43、`files=16`、`ed023c8b…`）我无执行工具、无法复算，按 §6 复用实现者机械证据；可核对的部分自洽：测试文件 21 个 ✓、e2e spec 13 个 ✓、「Review 后 +23」与代码可重建（`downloadSnapshotAsset` 14 + 相对地址 5 + alt/loading 2 + ContentSnapshot 相对地址 2 = 23，本机副本失败那条是在既有用例上加断言而非新增）✓。已知限制 8 与契约 `loading="lazy"` 表述一致 ✓。

**可选建议**：e2e 的 `naturalWidth` poll 依赖冻结图落在首屏（`loading="lazy"`），若详情页上方内容变长把它推出视口，这条会退化为超时失败；`scrollIntoViewIfNeeded()` 后再 poll 可去掉这个不稳定源。

### 3. 结论

**PASS（覆盖新最终候选 `1f1fbc0`）**，无必须修复项。
- **必须修复**：无。
- **可记录后继续**：上述记录/契约表述不一致 1、2（改动记录会强制再冻结一轮候选，收益不抵成本，建议并入下一次任何再冻结时更正）；流中途异常映射为 `NETWORK_ERROR` 无用例。
- **可选建议**：e2e `naturalWidth` 前显式滚动。
- **剩余风险**（沿用记录，未新增）：安全性质由结构性变配置性、`validateLink` 未穷举、无 CSP、未冻结图片的三条隐私代价。

### Reviewer R1 · 增量确认（`1f1fbc0..b666d93`）

## 覆盖 `b666d93` 的确认

只读（无写工具/无 Bash）；`.git/refs/heads/agent/coordinator/TASK-042-snapshot-rendering` = `b666d936dbc1a8ea79c48b7fb7133791b9a11135`，工作树即新候选。继承对 `1f1fbc0` 的全部审查结论，本轮只核 6 处改动点及其上下文。

**处置成立**（逐条看实现，不看自述）：

- **F7 已关闭**：`ContentSnapshot.tsx:87/104/121` 的 `listFailed` 与 `failed` 分开；`:216-228` 两支互斥（`listFailed` 为真时 `failed` 恒为 0，不丢信息），各自 `role="alert"`。`ContentSnapshot.test.tsx:154` 新增断言「已冻结图片的清单没有读出来」，原来那条把「无提示全走原站」钉死的用例已转为反向守卫，`:166` 单张那支的断言保留未弱化。记录 154 行改写成两支各自陈述，不再宽于证据。
- **F8 已更正**：记录 155 行为「图片的三条去向」（与契约 §4.13:397 一致）、「16 个文件」（与 148 行一致），「+4 行、0 删除」已删。
- **F10 已采纳**：`api.ts:332` 改为 `nullableString(item.captured_from_url ?? null)`；字段缺失仍归一为 null，非字符串改为 `INVALID_RESPONSE`——比原先严格，与同文件 `extractor` 等字段一致，符合契约「string/可空」。
- **R2 两项**：e2e `:85` 的 `scrollIntoViewIfNeeded()` 只加稳不减断言；已知限制 7 改写为「留下替代文字（`span.snapshot-image-refused`）」，与 `snapshotMarkdown.ts:41` 相符，并由两条新断言（`snapshotMarkdown.test.ts:134`、`ContentSnapshot.test.tsx:197`）绑定 `textContent` 为 `一张图`/`图`——span 若被去掉即失败，不是永真断言。

**未引入新问题**：两支 alert 互斥不会同时出现或互相遮蔽；`findByRole('alert')` 在各自用例中唯一；渲染分支的三元/`&&` 结构无 falsy 渲染问题；`listFailed` 未进 `useMemo` 依赖也无需进（不影响 `rendered`）；blob 回收、effect 依赖、`base` 解析路径均未被触碰。

**仅剩一条可选建议**（不必处理）：清单失败提示里「重新读取这份资料可以再试一次」——该分支内并无重读按钮，`retry()` 也只重读正文不重取资产，实际有效路径是刷新页面；措辞略宽于界面提供的操作。原 F9（单张提示文案在「该资产不出现在正文里」时略宽）依旧成立，同为可选。

**结论：PASS，覆盖最终候选 `b666d93`，无阻断项，无待处置项。** 我此前提出的 F7/F8/F10 均已实质关闭；剩余风险与 `1f1fbc0` 报告一致（无 CSP、`validateLink` 变体未穷举、依赖升级无自动提醒、原址图片失败态不可见、重定向致 `captured_from_url` 与采集时 pageUrl 不一致时相对地址匹配不上冻结表）。测试计数与 `check_task.py` 结果为实现者机械证据，我未重跑；定向核对未见与之矛盾处。

### Reviewer R2 · 增量确认（`1f1fbc0..b666d93`）

## 增量确认 — TASK-042 · Reviewer R2 · `1f1fbc0..b666d93`

只读依旧（工具仅 `Read`/`Grep`/`Glob`）。逐条核对了 6 处改动的最终状态。

**处置成立**

- **第 1 点**：`TASK-042:155` 已改为「图片的**三条**去向」并补记本轮契约增补内容，`:148`/`:155` 的「16 个文件」一致，「+4 行、0 删除」已删除。与契约 `§4.13:397` 实际文本一致。
- **第 2 点**：`:175` 已如实写为「留下 `span.snapshot-image-refused` 替代文字、与伪协议图片同一条降级路径」，与 `snapshotMarkdown.ts:41`、`styles.css:2150` 对齐；两条新断言有咬合力——`snapshotMarkdown.test.ts:134` 与 `ContentSnapshot.test.tsx:197` 断言 `.snapshot-image-refused` 的 `textContent` 恰为 alt 文本，若哪天改成静默丢弃或改回渲染 `img` 都会失败；两处注释同步更正。
- **可选建议**：`snapshot-rendering.spec.ts:85` 的 `scrollIntoViewIfNeeded()` 在 poll 之前，位置正确。
- **F7（listFailed）成立，分支逻辑与断言均有咬合力**：`ContentSnapshot.tsx:116-122` 仅在 `.catch` 支置 `listFailed: true`（该支 `failed` 恒为 0，与 `:216-228` 的三元互斥，不会两条提示同时出现）；正常返回支恒为 `false`，故「一张都没冻」不会误报。`ContentSnapshot.test.tsx:154` 的 `findByRole('alert')` + 文本「已冻结图片的清单没有读出来」在处置前必失败（旧实现该支无任何 alert），且该用例保留了「正文照常渲染、两张图都走原址」的原有断言，属加严不是替换。另确认提示挂在 `snapshot ?` 分支内，所以「本来就没有快照」时不会弹出无意义告警。
- **F10 成立且是收紧**：`api.ts:332` 由裸 cast 改为 `nullableString(...)`，非字符串即 `INVALID_RESPONSE`；`?? null` 只让缺字段退化为 null，与同函数 `failure_code` 一致，未弱化任何既有校验。

**新问题**：无阻断项。两处很小的非阻断记录/措辞：① 记录 `实现与测试` 未提 `nullableString` 这处投影加固（代码内注释已说明）；② 快照里一张图都没有时若清单取不到，仍会显示「图片全部改用原网站地址」——文案略过强，无功能影响。计数与指纹（488/43/`files=16`/`32d93bd2…`）我无执行工具，按 §6 复用；可核对部分自洽：本轮未新增 `it()`，只在既有用例上加断言，与「488 与上一候选同数」相符。

**结论：PASS，覆盖新最终候选 `b666d93`**。继承此前对 `0106953..1f1fbc0` 的全部审查范围（本轮未触及部分不变），先前列出的非阻断项已全部关闭。剩余风险仍为记录中已登记的四条（配置性安全性质、`validateLink` 未穷举、无 CSP、未冻结图片的三条隐私代价）。

### Reviewer R1 · 确认（`b666d93..4e2c3a5`）

**确认：`4e2c3a5` 通过，无阻断项、无待处置项。**

只读；`.git/refs/heads/agent/coordinator/TASK-042-snapshot-rendering` = `4e2c3a53fc332045b2aec0e21b5e74ea92f42183`，工作树即最终候选。继承 `b666d93` 的全部结论，本轮只核三处文案与记录。

- **文案与实现相符**：`ContentSnapshot.tsx:218-219` 与 `:224-225` 两条提示现在都只陈述代码真正知道的事——清单失败那支只知道「这一次一律按原网站地址显示」（条件句「正文里若有图片」正确，因为该分支对正文内容一无所知）；单张那支只知道 `failed` 张资产的本机字节取不到，「它们若出现在正文里」如实反映了 `frozen` 表与正文可能不相交。我原先指出的两处过宽表述（断言正文必有该图、以及不存在的「重新读取」入口）均已消除；「刷新页面可以再试一次」与实现相符——effect 依赖 `[resourceId, revision]`，`retry()` 确实不重取资产，只有重新挂载才会。
- **断言仍有咬合力**：`ContentSnapshot.test.tsx:154` 与 `:166-168` 仍绑在各自提示的实质区分点上（「清单没有读出来」对「N 张已冻结的图片，本机那一份读不出来」，含计数 1），两支互换或退回静默都会失败；`:147-150`、`:162-163` 的行为断言未删未弱化。
- 记录 155 行已补 `nullableString` 投影加固一条，与 `api.ts:332` 相符。

无逻辑改动，先前认定的安全形态、blob 回收、`base` 解析与契约一致性不受影响。剩余风险同前一份报告（无 CSP、`validateLink` 变体未穷举、依赖升级无自动提醒、原址图片失败态不可见、重定向致 `captured_from_url` 与采集 pageUrl 不一致时匹配不上冻结表），均已在记录中登记。测试计数与 `check_task.py` 为实现者机械证据，我未重跑，定向核对未见矛盾。

### Reviewer R2 · 确认（`b666d93..4e2c3a5`）

确认：`b666d93..4e2c3a5` 的三处改动与实现相符，断言咬合力未减。

- 两条提示文案（`ContentSnapshot.tsx:216-228`）已改为条件式表述，不再断言正文里一定有那些图片；「刷新页面可以再试一次」与该分支确实没有重读按钮的事实相符（重读入口只在读快照失败那一支）。`listFailed` 三元互斥、`failed` 计数与两条分支的对应关系一字未动，属纯文案。
- 断言仍咬合：`ContentSnapshot.test.tsx:154` 仍钉「已冻结图片的清单没有读出来」，`:166-168` 改为「1 张已冻结的图片，本机那一份读不出来」——**仍含变量 `{failed}` 渲染出的计数**，不是只匹配固定前缀，去掉计数或退回静默都会失败；两条断言分别命中两个互斥分支，未合并、未放宽。
- 记录 `:155` 已补 `nullableString` 那处投影加固，与 `api.ts:330-332` 的实现和注释一致。

**结论：PASS，覆盖最终候选 `4e2c3a5`**。继承 `0106953..b666d93` 的全部审查范围；此前列出的阻断项为零，非阻断项全部关闭。剩余风险仍是记录中已登记的四条（安全性质由结构性转配置性、`validateLink` 未穷举、无 CSP、未冻结图片的三条隐私代价）。计数与指纹（488 / 43 / `files=16` / `b2110dcb…`）我无执行工具，按 §6 复用实现者的机械证据；本轮改动为纯文案与文档，与「用例数不变」自洽。

### Acceptance · 首轮（候选 `4e2c3a5`）

## 结论：**PASS**（无阻断项）

**只读证明**：运行器只授予 `Read`/`Grep`/`Glob`，无写工具、无 Bash。**因此以下项目未复算，按 §6 复用实现者机械证据**：frontend 488/基线 440、e2e 43/42、`CHECKS PASS`、指纹、`git diff` 层面的文件清单与 `4e2c3a5..754f5f3` 的逐行 diff。候选链经 `.git/logs/HEAD:419-427` 核实：`0106953 → 2965083 → b143af5 → efdc5dc → 99a545d → 1f1fbc0 → b666d93 → 4e2c3a5 → 754f5f3`（HEAD）。

### 完成条件逐条

| # | 判定 | 依据 |
|---|---|---|
|1 渲染生效 + 源码入口|满足|`ContentSnapshot.tsx:202-213`；`snapshotMarkdown.test.ts:164-171`（h1/li/strong/code）、`:154-160`（链接）；`ContentSnapshot.test.tsx:113-121`|
|2 原始 HTML 不进 DOM|满足|`snapshotMarkdown.test.ts:22-46`，5 类标签 `querySelector` 为 null + 文本仍可见；`[onmouseover]` 断言形态正确|
|3 危险协议|满足|`:49-65`（三种协议 + 伪协议图片不产 `img`）|
|4 配置守卫|满足|`:9-14` 断 `createRenderer(...).options.html`，是实例真实生效值|
|5 冻结走本机 + 打到 bytes 端点|满足|`client.test.ts:672-674` 断言路径字符串；`ContentSnapshot.test.tsx:105-106`|
|6 两类图片各自形态|满足|`ContentSnapshot.test.tsx:96-111`、`snapshotMarkdown.test.ts:73-99`|
|7 `referrerpolicy`|满足|`snapshotMarkdown.ts:54`；`:90`、`ContentSnapshot.test.tsx:110`|
|8 外部请求只来自未冻结图片|满足|`snapshot-rendering.spec.ts:22-25,102-103`；`styles.css` 全文无 `url()`/`@import`（已核）。首屏局限已记入已知限制 8|
|9 blob 回收 + 失败降级|满足|`ContentSnapshot.test.tsx:123-141`、`:157-169`。「切换资料」一支无用例（结构同路径，未登记，可选）|
|10 正文未被改写|满足|`:202-211`|
|11 无快照/空快照/超长正文|**部分满足**|无快照：`ResourcePages.test.tsx:617-622`；空快照：`api.ts:320` 投影拒绝（结构性）；**超长正文既无用例也无实测，且未登记为已知限制**|
|12 依赖交代|满足|`package.json:23,33` 精确版；记录 157-159 行 7 生产 + 3 dev、来源核对、安全关键面|
|13 契约同步|满足|契约 `:395`「渲染语义」、`:397`「图片的三条去向」；R2 首轮 F1 的伪引用已改为指向 TASK-036 任务记录。openapi 未出现在任何证据中|
|14 计数只增不减 + 新 e2e|满足（计数未复算）|`e2e/snapshot-rendering.spec.ts` 双主机 + `naturalWidth>0`；`resource-pages.spec.ts:234-241` 净加严|

### 对自述的核对

- **「16 个文件全部在 allowed_paths 内」**：未用 git 复算。但按证据重建的 16 项（`package.json`/`package-lock.json`/`ContentSnapshot.{tsx,test.tsx}`/`snapshotMarkdown.{ts,test.ts}`/`resources/api.ts`/`api/client.{ts,test.ts}`/`styles.css`/两个 e2e/契约/TASK-040/TASK-042/任务索引）恰为 16 且全部在白名单内，`README.md`、`api.test.ts`、`ResourcePages.test.tsx` 虽在白名单但未改。**`ResourceDetail.tsx` 确未被改**，缩小范围的取舍在记录 153 行与已知限制 7 如实登记，且与 `snapshotMarkdown.ts:41`、`snapshotMarkdown.test.ts:127-135`、`ContentSnapshot.test.tsx:190-200` 对得上。
- **「backend/extension 零改动」**：全仓（排除 `node_modules`）检索 `TASK-042|markdown-it|snapshotMarkdown` 只命中 12 个文件，无 `backend/**`、`extension/**`、`openapi-v1.json`。属支持性证据，非 git 级证明。
- **「openapi 与 `/api/v1` 一字未改」**：同上，未被证伪。
- **§6 写回边界**：未复算 diff。间接核对成立——`754f5f3` 写入的两份最终报告引用「记录 155 行已补 `nullableString`」，当前 155 行正是该条；148/156 行的「16 个文件」也与 `b666d93` 轮报告的行号引用对齐，说明标记区外**无行的增删**。纯就地单行改动（除 status 外）无法排除。
- **用户决定**：(a) 甲路线——`RENDERER_OPTIONS.html:false`，`package.json` 依赖中无任何消毒器 ✓；(b) 未冻结图片自动加载 ✓，三条代价在设计决定 ③、已知取舍 2、契约 `:397` 三处原文登记，`loading="lazy"` 会推迟请求这一点也照实写出（未淡化）。

### Findings

**必须修复**：无。

**可记录后继续**

1. **完成条件 11 的「超长正文」是自评遗漏的空档**：无用例、无实测，且未进「已知限制」。R1 首轮 F4 提出后只处置了 `useMemo` 性能面，覆盖缺口本身从未登记。建议在 EVIDENCE 非阻断遗留项补一条。
2. **`snapshotMarkdown.ts:104` 的早返回让非规范写法的绝对地址匹配不上冻结表**：`toAbsolute` 对已 `^https?://` 的 src 原样返回，不经 `new URL()` 规范化；而冻结表的键是扩展存的 `new URL().href`（已规范化）。且 `mdurl.parse` 不小写 protocol/hostname（`mdurl/lib/parse.mjs:132-136`），故正文里写成 `HTTPS://CDN.example.com/a.png`、`https://host:443/a.png` 或含 `..` 点段时，`frozen.get()` 落空 → **静默走原站**，`failed` 计数不增、界面无任何提示。与已登记的「重定向致 `captured_from_url` 不一致」同类但触发条件不同，未登记。修复是一行（`new URL(src, base ?? src).href`）+ 一条用例，但要再冻结一轮；建议登记而非现在改。（协议相对地址 `//host/a.png` 走 `new URL` 分支，不受影响。）
3. **TASK-040 记录的改动多于自述**：TASK-042 记录 69 行称「仅用于把它的 `status` 登记为 MERGED，除此之外不改该记录一个字」，但 `TASK-040-extension-image-freeze.md:264`（「最终状态/风险/用户操作」）也被改写以记入 PR #46 / merge `0106953` / 「并入 TASK-042 控制面提交」——该行引用的事实在 TASK-040 自身最终提交时尚不存在，故必在 `base..candidate` 内。改动落在 TASK-040 的 EVIDENCE 标记区（`:224-614`）内，符合 §5/§6；不合的只是本记录的自述宽度。两位 Reviewer 均把「TASK-040 状态登记的合规性」列为未覆盖切片。

**可选建议**：完成条件 9 的「切换资料」回收无用例（仅卸载有），结构上同一条清理路径，可不补但宜登记。

### 剩余风险

记录已登记的四条（安全性质由结构性转配置性、`validateLink` 变体未穷举、无 CSP、未冻结图片三条隐私代价）+ 原址图片失败态不可见 + 重定向致匹配落空，均属实且未被淡化；新增上述第 2 条（非规范绝对地址静默走原站）与第 1 条（超长正文无覆盖）两处未登记项。

### Reviewer R1 · 确认（`4e2c3a5..ea2cc93`）

**确认：`ea2cc93` 通过。** `.git/refs/heads/agent/coordinator/TASK-042-snapshot-rendering` = `ea2cc93ed57e82c2df0895066e774d333c6a605b`；只读，无写工具/Bash。缺陷属实且处置正确——这处是我漏掉的，验收抓得对。

**规范化不会放过任何此前被拦住的地址，顺序正确。** 三道闸门的次序是：① markdown-it 在**解析期**对原始 src 跑 `normalizeLink` + `validateLink`，被拒时 `href` 置空，到我们的规则里 `!src` → 走 refused span（这就是 `![图](javascript:…)` 不产 `img` 的原因）；② `toAbsolute` 规范化；③ `^https?:` 闸门。关键点：`new URL(src, base)` 对**带 scheme 的绝对地址会忽略 base**，因此规范化只能改大小写/默认端口/点段/百分号编码，**改不了 scheme**——`data:`/`mailto:`/`ftp:` 规范化后仍不是 http(s)，仍被第③道拦下（`snapshotMarkdown.test.ts:156-161` 正是这条，且非空断言：闸门若失效就会产出 `img`）。相对地址在 `base` 为 null 时 `new URL` 抛错 → 回落原串 → 被闸门拒，与旧的 `if (!base) return src` 等价，`:127-135` 仍守着。

**无新的匹配歧义。** 我核了另一侧：`extension/src/injected/extract.ts:74` 的键正是 `new URL(trimmed, baseUrl).href`，与前端现在用的是同一套规范化，且 `.href` 幂等——所以此前能命中的键必然已是规范形式，规范化只会新增正确命中，不会丢失既有命中；两种写法折叠到同一资产是同一张图，属正确行为而非歧义。

**超长正文用例不是空断言，但有一条子断言写空了。** `:176-177` 的 `p` 数 > 1000 与 `strong` 文本是真绑定，确实证明 100 万字下渲染出了内容，不是「没抛异常」式。但 `:178` 的 `expect(host.querySelector('script')).toBeNull()` **永远为真**——被重复的段落里根本没有 `<script>`，转义即使失效它也通过，而 `:175` 的注释却说「原始 HTML 那条守卫在这个规模下同样成立」，属注释宽于断言。**可选建议**（非阻断）：把 `<script>alert(1)</script>` 掺进被重复的段落，再同时断言元素为 null 且文本可见即可；`html:false` 本身与正文长度无关，已有直接配置断言与 5 条转义用例覆盖，故不影响结论。

剩余风险（并入原有清单，无需处置）：markdown-it 的 `normalizeLink`（mdurl 编码/punycode）与扩展侧 `new URL().href` 在极少数编码写法上仍可能算出不同串，那时退化为「静默走原站」的老形态——范围已比修复前窄得多，失败面与已登记的第 5 条同类。

**结论：PASS，覆盖最终候选 `ea2cc93`，无阻断项。** 继承我对 `4e2c3a5` 及更早候选的全部审查范围；本轮只复核 `toAbsolute` 及其调用链、新增 6 条用例与记录改动。

### Acceptance · 第二轮（候选 `ea2cc93`）

## 覆盖 `ea2cc93` 的验收结论：**PASS**（无阻断项）

只读依旧（仅 `Read`/`Grep`/`Glob`，无 Bash）。`494` / `CHECKS PASS` / 指纹 / 4 个文件的 git 级清单**未复算**；`494 = 488 + 6`（规范化 4 + 「不得变成绕过」1 + 超长正文 1）与新增用例数精确吻合，属内部一致性核对。

**1. 规范化处置成立，未引入新的匹配或安全问题。**
`snapshotMarkdown.ts:112-117` 现为 `new URL(src, base ?? undefined).href`，早退分支已删除。我按四条路径核过：

- **不构成绕过**：`validateLink` 仍在解析期先行，伪协议图片的 href 被置空 → `if (!src) return null`，进不到 `toAbsolute`。`new URL` 不改变绝对地址的 scheme；相对地址只能继承 base 的 scheme。**最后一道 `^https?://` 闸门（`:97`）一字未动**，仍是唯一出口，`file:`/`data:`/`blob:` 一律落到 `null` → `span.snapshot-image-refused`。用例 `:156-161` 绑住了这一点。
- **base 恶意/畸形不放大**：`captured_from_url` 为 `javascript:`/`data:`/`blob:` 等不透明 base 时 `new URL` 抛错 → catch 原样返回 → 被闸门拦下；为 `file:///a` 时结果 `file:///x` 同样被拦。与 R1 对上一版的判断一致。
- **无 base 的相对地址行为未变**：`new URL('/img/b.png', undefined)` 抛错 → 原样返回 → 不产 `img`、留替代文字。已知限制 7 与 `:127-135` 的用例都仍然成立且未被弱化。
- **匹配面只收敛不发散**：查表键与冻结表键现在同为 `URL` 规范形式，假匹配需要两个不同地址规范化到同一 href（即 URL 等价），不构成风险。`:145-154` 四条（大写协议+主机、`:443`、`..` 点段、幂等）各自命中 blob，缺任一处规范化都会红。

一处**非阻断的行为微扩**值得登记一句：无 base 时，`https:/host/a.png` 这类单斜杠写法此前被拒（正则不匹配），现在被 `new URL` 规范成合法 http 地址并按原址加载。方向正确（它确是 http 地址）且仍受闸门约束，只是「按原址加载」的入口略宽了一点。另：`toAbsolute` 的返回类型 `string | null` 现在已不可能返回 null，属陈旧签名，纯外观。

**2. 超长正文那条不是空断言。**
`:167-179` 先 `expect(markdown).toHaveLength(1_000_000)` 钉住输入规模，再断 `p` 元素 > 1000、`strong` 文本为 `粗体`、`script` 为 null。若 `renderSnapshot` 返回空串、抛错或在该规模下退化，前两条必失败——它咬的是「确实渲染出来了」，不是「没抛异常」，并顺带把转义守卫在该规模上再钉一次。

**3. 完成条件 11：现在判「满足」。** 无快照有用例、空快照由 `api.ts:320-321` 投影直接拒收（结构性）、超长正文有上述用例。两点如实说明，不影响判定：该用例作用于 `renderSnapshot` 模块层，未经 `ContentSnapshot` 的 `useMemo`/编辑框那条页面路径；也未断言耗时（0.7 秒是实现者的观察，我未复算）。

**4. 第 3 条（自述宽度）已更正。** 记录 `:69` 现写明「实际改动为两行」并点出第二行落在 TASK-040 的 EVIDENCE 标记区内、符合 §5/§6；`:153`、`:163`、`:168` 三处也把「由独立验收指出、属自评空档」如实写出，未淡化。这些改动都在 EVIDENCE 标记区**外**——因为本轮是产品修订后重新冻结，不是证据写回，符合 §6。

**5. 关于「切换资料」的回收用例：建议不登记为遗留项。** effect 依赖 `[resourceId, revision]`，切换资料触发的是与卸载**完全相同**的清理分支（`ContentSnapshot.tsx:124-127`），已被 `ContentSnapshot.test.tsx:123-141` 覆盖同一段代码；R1 也明确表示不要求补。把它写进非阻断遗留清单只会稀释真实条目，作可选建议留在报告里即可。

**剩余风险**：记录已登记的四条不变；我上一轮提出的两条已由代码关闭，不再是剩余风险。新增仅上述「单斜杠绝对地址现按原址加载」一处微扩，可并入下一次任何再冻结时顺手记一句，不值得为它单独再冻结一轮。

### Reviewer R1 · 最后确认（`ea2cc93..50910fa`）

**确认：`50910fa` 通过——这是我这轮的最后一句。** `.git/refs/heads/...TASK-042-snapshot-rendering` = `50910fab5801609376ae541e3b613acbb5ef2b8e`；只读。

**断言现在真有咬合力，两个方向都咬。** `<script>alert(1)</script>` 已在被 `repeat` 的段落里（`snapshotMarkdown.test.ts:172`），`:174` 仍钉住正文恰为 1,000,000 字，因此输入里确实存在原始 HTML。`html: false` 下 `<` 被转义，`innerHTML` 里是 `&lt;script&gt;…`，于是 `:182` 无 script 元素、`:183` 的 `textContent` 含那串字面字符；一旦转义在该规模下失效，jsdom 会把它解析成真的 `<script>` 元素——`:182` 立刻失败，且 `textContent` 不再含该字面串，`:183` 同时失败。不再是「输入里根本没有 HTML」的空转，注释也拆成两句、各自只罩自己那条。`:179-180` 的规模断言未受影响（段落变长后 `p` 数仍远超 1000）。

`toAbsolute` 收窄为 `string` 与 `renderSnapshot` 里的 `if (!absolute)` 兼容，无行为变化；记录补记的单斜杠 `https:/host/a.png` 微扩属 `new URL` 的既有规范化语义，落在已登记的「按原址加载」那一类，不新增形态。

**结论：PASS，覆盖最终候选 `50910fa`，无阻断项、无待处置项。** 继承此前对 `1f1fbc0`/`b666d93`/`4e2c3a5`/`ea2cc93` 的全部审查范围，本轮只复核该用例、`toAbsolute` 签名与记录三处。剩余风险同前，均已在任务记录中登记。

### Acceptance · 终局（候选 `50910fa`）

## 覆盖 `50910fa` 的终局验收结论：**PASS**（无阻断项）

只读依旧（仅 `Read`/`Grep`/`Glob`，无 Bash）。`CHECKS PASS` / `files=16` / 指纹 `3b23562…` / frontend 494 / e2e 43 **未复算**，按 §6 复用；本轮为纯测试与文档，与「用例数不变（494）」自洽。继承我对 `ea2cc93` 的全部结论。

**三处处置逐条成立（看实现，不看自述）**

1. **永真断言已修好，且改法正确。** `snapshotMarkdown.test.ts:172` 把 `<script>alert(1)</script>` 掺进**被重复的** `paragraph` 里（约 7000 次完整出现，`slice` 截断不影响），`:182` 断元素为 null、`:183` 断 `textContent` 仍含那串字符。两条现在都有咬合：转义在该规模下失效则 `:182` 红，被静默吞掉则 `:183` 红。R1 抓的正是「注释宣称的守卫强于断言实际守的东西」，已闭合。
2. **`toAbsolute` 返回类型收为 `string`**（`:112`），签名与实现一致。`renderSnapshot:92` 的 `if (!absolute)` 因此成为冗余分支——`src` 非空已由 `:85` 保证，`new URL().href` 与 catch 分支都不会返回空串。无害、不改行为，不再提。
3. **单斜杠那处行为微扩已如实记入**记录 153 行末，措辞与我的判断一致（方向正确、仍受 `^https?:` 闸门约束、只是入口略宽），未淡化。

**14 条完成条件最终判定：仅一项变化。**
**条件 11 由「部分满足」升为「满足」**——依据：无快照有用例（`ResourcePages.test.tsx:617-622`）、空快照由 `api.ts:320-321` 投影直接拒收（结构性）、超长正文有 `snapshotMarkdown.test.ts:164-184`（1,000,000 字，断言渲染确实发生 + 转义守卫在该规模成立，非空断言）。其余 13 条与我上一轮表格一致，无变化。

**建议原样登记的 EVIDENCE 非阻断遗留项（5 条）**

1. 流中途读失败的异常统一映射为 `NETWORK_ERROR`，无用例钉住（R2 首次增量报告指出）。
2. 采集时的 pageUrl 与快照 `captured_from_url` 因重定向不一致时，正文里的相对图片地址会匹配不上冻结表而**静默走原站**（`failed` 计数不增、界面不提示）。R1 指出。**验收后的地址规范化关不掉这一支**：它的根因是 base 本身与采集时不同，不是正文写法不规范。
3. 无 base 时 `https:/host/a.png` 这类单斜杠绝对地址，此前被正则拒掉、现在被 `new URL` 规范成合法 http 地址并按原址加载。方向正确且仍受 `^https?:` 闸门约束，只是「按原址加载」的入口略宽了一点（验收指出，已记入实现说明 153 行）。
4. 完成条件 11 的超长正文用例作用于 `renderSnapshot` **模块层**，未经 `ContentSnapshot` 的 `useMemo` 与编辑框那条页面路径，也未断言耗时（0.7 秒为实现者观察，验收未复算）。判定「满足」建立在这个范围之上。
5. 剩余风险四条已在「已知取舍」与「已知限制」中登记，本轮未新增：安全性质由结构性转为配置性、`markdown-it` 的 `validateLink` 变体未穷举、无 CSP、未冻结图片的三条隐私代价。

**明确建议不进遗留项的两条**：完成条件 9 的「切换资料」回收无用例（与卸载同一段清理分支 `ContentSnapshot.tsx:124-127`，已被 `ContentSnapshot.test.tsx:123-141` 覆盖，R1 亦不要求补）；以及「本任务三次出现同一形态的陈述宽于证据」这一流程性观察——它已如实写在记录 168 行，重复进遗留项只会稀释清单。

- 日期与决定日志：2026-09-07 用户合并 PR #46 后指示做完整渲染，并主动问「消毒器是什么」。主 Agent 解释后给出两条路线（甲：关掉原始 HTML、不需消毒器；乙：允许 HTML + 消毒器），并出示对用户库中 7 份快照的实测（无 `<script>`/`on*`/`javascript:`，唯一的 `<` 命中来自 C++ 代码块），说明甲方案在当前语料上的还原度代价接近于零。用户选甲。主 Agent 据此另定两项：选 `markdown-it`（`html` 默认为 false，安全是默认值而非需要主动开启的选项），以及未冻结图片起初定为不自动加载。用户随后追问自动加载的安全隐患并在听完后明确选择**直接自动加载**，主 Agent 按其决定改为自动加载，三条代价逐条写入设计决定 ③ 与已知取舍，并采纳 `referrerpolicy="no-referrer"` 作为唯一缓解。
<!-- EVIDENCE:END -->
