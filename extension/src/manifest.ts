import { RELAY_MATCH } from './shared/protocol.ts'

// MV3 manifest 的唯一来源。`vite.config.ts` 在构建时把它写成 `dist/manifest.json`，
// 仓库里没有第二份副本可漂移。
//
// **每一项 reach 都是一次安全决定，必须经任务与独立审查。** `manifest.test.ts` 断言
// 顶层键的确切集合，因此**任何**新增键都会让它失败 —— 不只是 `permissions` 和
// `host_permissions`，也包括 `optional_permissions`、`externally_connectable`、
// `web_accessible_resources`、CSP 覆写等。用白名单而非逐个点名危险键，是因为点名
// 必然漏掉下一个。
//
// TASK-038 首次授予 reach，逐条理由：
//   - activeTab：**只在用户点击扩展图标之后**授予当前那一个标签页的访问权，用完即失效。
//     替代方案 `host_permissions: ["<all_urls>"]` 会给出对所有站点的长期访问权，
//     而本扩展只需要用户主动指定的那一页，故不采用。
//   - scripting：把提取脚本注入上述标签页。没有它就只能靠常驻 content script，
//     那反过来又需要 `<all_urls>`，范围更大。
//   - storage：popup 在打开新标签页后就被关闭，内容必须先落到扩展存储里，
//     再由中转脚本取走。仅存一份待交付内容，交付后立即删除。
//   - content_scripts：**只匹配本机 UI 源这一个地址**，用于把内容交给 `/capture` 页面。
//     扩展不能直连后端（本机访问门禁只信任 UI 源），所以必须经页面转交。
//
// TASK-040 新增两个顶层键，同样逐条给理由：
//   - optional_host_permissions: ["<all_urls>"]：取回正文里图片的字节。**安装时不授予
//     任何站点权限**，只有用户在 popup 里看到「发现 N 张图片」并点「一并保存」时才
//     经 `chrome.permissions.request` 请求；可在扩展设置页随时撤销，拒绝或撤销后
//     采集照常完成、图片保留原站地址。
//     替代方案 `host_permissions: ["<all_urls>"]` 覆盖面**完全相同**，只是安装即长期
//     持有且不再询问，故不采用 —— 这次没有以覆盖面换取安全性。
//     为什么必须是 <all_urls> 而不是具体域名：图片挂在哪个图床由页面决定，采集前
//     无法预知，而按站点逐个请求会在一次采集里弹出多个授权框。
//   - background：service worker，扩展**唯一**主动发网络请求的地方。MV3 下内容脚本的
//     跨源请求受 CORS 管，图床普遍不发 CORS 头，只有持权限的 service worker 取得到。
//     它只注册一个消息监听（取图），见 src/background/worker.ts。

export type Manifest = {
  manifest_version: 3
  name: string
  version: string
  description: string
  permissions: string[]
  optional_host_permissions: string[]
  background: { service_worker: string }
  content_scripts: { matches: string[]; js: string[]; run_at: string }[]
  action: { default_popup: string; default_title: string }
}

export const POPUP_PAGE = 'popup.html'
export const RELAY_SCRIPT = 'relay.js'
export const EXTRACT_SCRIPT = 'extract.js'
export const BACKGROUND_SCRIPT = 'background.js'

export const manifest: Manifest = {
  manifest_version: 3,
  name: 'StudyPilot 采集',
  version: '0.2.0',
  description:
    '把你正在看的网页正文保存到本机 StudyPilot。只读取已显示的内容，不接触任何网站账号。正文里的图片可在你确认后一并保存。',
  permissions: ['activeTab', 'scripting', 'storage'],
  // 安装时不授予；采集到带图页面且用户点「一并保存」时才请求。
  optional_host_permissions: ['<all_urls>'],
  background: { service_worker: BACKGROUND_SCRIPT },
  content_scripts: [
    {
      matches: [RELAY_MATCH],
      js: [RELAY_SCRIPT],
      run_at: 'document_idle',
    },
  ],
  action: {
    default_popup: POPUP_PAGE,
    default_title: 'StudyPilot 采集',
  },
}
