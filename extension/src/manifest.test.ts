import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  BACKGROUND_SCRIPT,
  EXTRACT_SCRIPT,
  POPUP_PAGE,
  RELAY_SCRIPT,
  manifest,
  buildVersion,
  buildVersionName,
} from './manifest'
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

  it('moves the version itself on every commit, so a reload visibly changes it', () => {
    // 用户 2026-09-21 在 Edge 里更新扩展后仍看到 0.2.0——`version_name` 按 Chrome 文档
    // 「有则替代 version 显示」，但 Edge 的扩展页是自家 UI，没有这个保证。`version` 是每个
    // 浏览器都显示的那一个，所以让它本身随提交数走。
    expect(buildVersion('629')).toBe('0.2.0.629')
    expect(buildVersion('1')).toBe('0.2.0.1')
    // Chrome/Edge 要求每段 0–65535；越界、非数字、空值一律退回三段，不生成一个装不上的版本。
    for (const bad of ['', '   ', undefined, '65536', '70000', 'abc', '-1', '1.2', '0123']) {
      expect(buildVersion(bad)).toBe('0.2.0')
    }
    expect(buildVersion('65535')).toBe('0.2.0.65535')
    expect(buildVersion('0')).toBe('0.2.0.0')
    // 源码里的 manifest 不带构建号（构建时才注入），所以与 package.json 仍然对得上。
    expect(manifest.version).toBe(buildVersion())
  })

  it('stamps the build with the commit, and says "dev" instead of guessing', () => {
    // 「我装的是哪一版」在这之前无法回答：version 是手写常量，改十次代码也不动。
    expect(buildVersionName('327d2d6')).toBe('0.2.0+327d2d6')
    // 带上构建号时两者合起来：既看得出变没变，也答得出是哪一个提交。
    expect(buildVersionName('327d2d6', '629')).toBe('0.2.0.629+327d2d6')
    // 工作区脏时带 -dirty：装的那一版并不等于那个 commit（第一轮 Review F3）。
    expect(buildVersionName('327d2d6-dirty')).toBe('0.2.0+327d2d6-dirty')
    expect(buildVersionName('327d2d68df130c2ff281141f0c1c8425ca7601f9')).toMatch(
      /^0\.2\.0\+327d2d6/,
    )
    // 拿不到 git、或拿到的不像 SHA 时退化，不留空也不瞎填。
    for (const bad of ['', '   ', undefined, 'HEAD', 'not-a-sha', '12345']) {
      expect(buildVersionName(bad)).toBe('0.2.0+dev')
    }
    // 与 version 同源：改了 version 而忘了这里，前缀对不上就会红。
    expect(buildVersionName('327d2d6').startsWith(manifest.version + '+')).toBe(true)
  })

  it('points at a popup page that actually exists', () => {
    expect(existsSync(projectFile(POPUP_PAGE))).toBe(true)
  })

  it('declares exactly these ten keys and nothing else', () => {
    // A whitelist on purpose: naming the dangerous keys instead would miss
    // `optional_permissions`, `optional_host_permissions`, `externally_connectable`,
    // `web_accessible_resources`, `content_security_policy`, `background`,
    // `declarative_net_request` and every key Chrome adds later — all of which grant
    // reach just as effectively. Any new top-level key fails here, which forces the
    // change to be deliberate and reviewed.
    //
    // TASK-079 加了第十个键 `version_name`：它**不扩大任何授权面**（只是人看的版本标识），
    // 但照样必须在这里显式登记——白名单的价值正在于「新键一律先变红」，不区分危险与否。
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
        'version_name',
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

  it('asks for exactly four permissions, and none that reach every site', () => {
    // activeTab is the whole point: it grants the one tab the user just clicked on,
    // and only after that click. Swapping it for a host permission would turn a
    // per-click grant into a standing one, which is what this assertion prevents.
    //
    // TASK-080 加了第四个 `unlimitedStorage`：采集文献时要暂存 PDF 的字节，而
    // storage.local 默认只有 10 MB。**它不触及任何站点**——下面三条断言正是用来
    // 保证「多加的这一个没有把触角伸到站点上」的。
    expect([...manifest.permissions].sort()).toEqual([
      'activeTab',
      'scripting',
      'storage',
      'unlimitedStorage',
    ])
    expect(manifest.permissions).not.toContain('tabs')
    expect(manifest.permissions).not.toContain('cookies')
    // 站点访问权只能留在 optional_host_permissions 里，一条都不许挪进来。
    expect(manifest.permissions.some((name) => name.includes('://') || name === '<all_urls>')).toBe(
      false,
    )
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
