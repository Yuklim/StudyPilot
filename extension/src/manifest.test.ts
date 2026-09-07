import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { BACKGROUND_SCRIPT, EXTRACT_SCRIPT, POPUP_PAGE, RELAY_SCRIPT, manifest } from './manifest'
import { UI_ORIGIN } from './shared/protocol'
import { ENTRIES, outputName } from '../vite.injected.config'

const projectFile = (name: string) => fileURLToPath(new URL(`../${name}`, import.meta.url))

describe('MV3 manifest', () => {
  it('is a Manifest V3 manifest', () => {
    expect(manifest.manifest_version).toBe(3)
  })

  it('keeps its version in step with package.json', () => {
    // Two hand-maintained version strings drift silently; the build ships the
    // manifest one, so an out-of-date package.json would misreport what is loaded.
    const pkg = JSON.parse(readFileSync(projectFile('package.json'), 'utf8')) as {
      version: string
    }
    expect(manifest.version).toBe(pkg.version)
  })

  it('points at a popup page that actually exists', () => {
    expect(existsSync(projectFile(POPUP_PAGE))).toBe(true)
  })

  it('declares exactly these nine keys and nothing else', () => {
    // A whitelist on purpose: naming the dangerous keys instead would miss
    // `optional_permissions`, `optional_host_permissions`, `externally_connectable`,
    // `web_accessible_resources`, `content_security_policy`, `background`,
    // `declarative_net_request` and every key Chrome adds later — all of which grant
    // reach just as effectively. Any new top-level key fails here, which forces the
    // change to be deliberate and reviewed.
    //
    // TASK-040 加了两个键，都是**有意**的授权面变化，各自另有一条专门的断言在下面：
    // `optional_host_permissions`（取图，安装时不授予）与 `background`（唯一会发出
    // 网络请求的地方）。这条断言在那次改动中失败过，正是它该有的行为。
    expect(Object.keys(manifest).sort()).toEqual(
      [
        'action',
        'background',
        'content_scripts',
        'description',
        'manifest_version',
        'name',
        'optional_host_permissions',
        'permissions',
        'version',
      ].sort(),
    )
  })

  it('keeps every site permission optional, so installing grants none of them', () => {
    // 这是本次授权面扩张的核心约束：安装时的 `permissions` 一字未加，取图所需的
    // 站点权限全部落在 optional 里，由用户在采集时点「一并保存」才请求、并可撤销。
    // 若哪天有人把 `<all_urls>` 挪进 `host_permissions`，这条与上面的键白名单一起变红。
    expect(manifest.optional_host_permissions).toEqual(['<all_urls>'])
    expect(manifest).not.toHaveProperty('host_permissions')
    expect(manifest.permissions).not.toContain('<all_urls>')
  })

  it('points the service worker at the file the build actually emits', () => {
    // 与注入脚本同一条轴：入口键、输出文件名模板、manifest 常量三者绑死，
    // 否则 manifest 会指向一个不存在的文件，而所有测试照样绿。
    expect(manifest.background).toEqual({ service_worker: BACKGROUND_SCRIPT })
    expect(ENTRIES).toHaveProperty('background')
    expect(outputName('background')).toBe(BACKGROUND_SCRIPT)
    // 它不是内容脚本：service worker 不注入任何页面。
    expect(manifest.content_scripts.flatMap((entry) => entry.js)).not.toContain(BACKGROUND_SCRIPT)
  })

  it('locks the background entry down to exactly one key', () => {
    // `type: 'module'`、`scripts`、`persistent` 加进条目里都不会让顶层白名单变红。
    expect(Object.keys(manifest.background).sort()).toEqual(['service_worker'])
  })

  it('asks for exactly three permissions, and none that reach every site', () => {
    // activeTab is the whole point: it grants the one tab the user just clicked on,
    // and only after that click. Swapping it for a host permission would turn a
    // per-click grant into a standing one, which is what this assertion prevents.
    expect([...manifest.permissions].sort()).toEqual(['activeTab', 'scripting', 'storage'])
    expect(manifest.permissions).not.toContain('tabs')
    expect(manifest.permissions).not.toContain('cookies')
  })

  it('runs a content script on the local UI origin and nowhere else', () => {
    // The relay exists to hand content to our own page. If this ever matches more
    // than the local UI, the extension has quietly gained the ability to run code
    // on other people's sites.
    expect(manifest.content_scripts).toHaveLength(1)
    expect(manifest.content_scripts[0]?.matches).toEqual([`${UI_ORIGIN}/*`])
    expect(manifest.content_scripts[0]?.js).toEqual([RELAY_SCRIPT])
    expect(UI_ORIGIN).toBe('http://127.0.0.1:5173')
  })

  it('locks the content script entry down to exactly these keys', () => {
    // 顶层白名单管不到嵌套键：`world: 'MAIN'`、`all_frames`、`exclude_matches`、
    // `match_origin_as_fallback` 加进条目里都不会让上面那条变红。门闩宣称的是
    // 「任何新增键都会失败」，严格说只对顶层成立——这一条把它补到条目内层。
    expect(Object.keys(manifest.content_scripts[0] ?? {}).sort()).toEqual(
      ['js', 'matches', 'run_at'].sort(),
    )
  })

  it('keeps the injected script names in step with what the build emits', () => {
    // "extract.js"/"relay.js" 原本在仓库里有三处独立拼写：这两个常量、bridge.ts 的
    // 注入调用、以及构建配置。改了其中一处而漏改别处，会产出指向不存在文件的
    // manifest，而所有测试照样绿，只在实机加载时才炸。
    //
    // 三条轴都要绑：入口键、**输出文件名模板**、以及注入调用用的是常量而非字面量。
    // 只绑前者的话，把 fileName 改成 `${mode}.bundle.js` 依然全绿。
    for (const [mode, script] of [
      ['extract', EXTRACT_SCRIPT],
      ['relay', RELAY_SCRIPT],
    ] as const) {
      expect(ENTRIES, `构建配置没有 ${mode} 入口`).toHaveProperty(mode)
      expect(outputName(mode)).toBe(script)
    }
    const bridge = readFileSync(projectFile('src/popup/bridge.ts'), 'utf8')
    expect(bridge).toContain('EXTRACT_SCRIPT')
    expect(bridge).not.toContain("'extract.js'")
  })

  it('never declares the extract script as a content script', () => {
    // It is injected on demand under activeTab. Declaring it statically would need
    // a broad host permission — exactly the trade this design avoids.
    const declared = manifest.content_scripts.flatMap((entry) => entry.js)
    expect(declared).not.toContain(EXTRACT_SCRIPT)
  })
})
