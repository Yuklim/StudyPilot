// The single source of truth for the MV3 manifest. `vite.config.ts` emits it as
// `dist/manifest.json` at build time, so there is no second copy to drift.
//
// This baseline deliberately declares no reach of any kind. Reading a page's
// content or fetching its images requires it, and adding it is a security
// decision that must go through a task and an independent review — never a
// silent edit. `manifest.test.ts` asserts the exact set of top-level keys, so
// **any** added key fails it — not just `permissions` and `host_permissions`,
// but `optional_permissions`, `externally_connectable`,
// `web_accessible_resources`, a CSP override and so on. That breadth is the
// point: a blacklist of the obvious names would have let the others through.

export type Manifest = {
  manifest_version: 3
  name: string
  version: string
  description: string
  action: { default_popup: string; default_title: string }
}

export const POPUP_PAGE = 'popup.html'

export const manifest: Manifest = {
  manifest_version: 3,
  name: 'StudyPilot 采集',
  version: '0.1.0',
  description: '把当前网页的正文保存到本机 StudyPilot。当前版本只有工程骨架，采集功能尚未实现。',
  action: {
    default_popup: POPUP_PAGE,
    default_title: 'StudyPilot 采集',
  },
}
