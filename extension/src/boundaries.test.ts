import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { manifest } from './manifest'

// 两条模块底线（extension/AGENTS.md §3）靠人读代码守不住，这里让它们能自己报警。
// 扫的是源码文本，属常见模式的辅助防线，不保证发现所有绕法。

const SRC = fileURLToPath(new URL('.', import.meta.url))

function sources(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sources(path)
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return []
    return [path]
  })
}

/** 去掉注释与文档字符串：这些文件里大量注释在**讨论**这些禁令。 */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('extension boundaries', () => {
  it('never talks to the StudyPilot backend directly', () => {
    // 本机访问门禁只信任 UI 源；扩展直连必然被拒，而「试着直连」通常意味着
    // 有人打算去放宽那道门禁。内容一律经 UI 页面转交。
    const offenders = sources().filter((path) => {
      const text = code(path)
      return /127\.0\.0\.1:8000|localhost:8000|\/api\/v1/.test(text)
    })
    expect(offenders).toEqual([])
  })

  it('never touches cookies or any site credential API', () => {
    // 用户在知乎/CSDN 等站点的登录态由浏览器自己持有，StudyPilot 永不接触。
    const offenders = sources().filter((path) => {
      const text = code(path)
      return /chrome\.cookies|document\.cookie|\bcookieStore\b|webRequest/.test(text)
    })
    expect(offenders).toEqual([])
  })

  it('never reaches the async extraction path', () => {
    // 「扩展不发网络请求」的**辅助**防线：Defuddle 的 fetch 调用点只经 parseAsync 到达。
    // 真正的看守是 extract.test.ts 里那条 EXTRACT_OPTIONS.useAsync 值断言；这一条是
    // 源码扫描，和上面两条一样属常见模式的辅助防线，挡不住 'parse' + 'Async' 一类
    // 有意规避。放在这里而不是只扫 extract.ts，是为了覆盖 src 下**全部**源文件——
    // 将来 defuddle 被别处引用时不必记得再加一条。
    const offenders = sources().filter((path) => /parseAsync/.test(code(path)))
    expect(offenders).toEqual([])
  })

  it('keeps the docs naming every reach the manifest actually asks for', () => {
    // 这类缺陷已经连着出现四次（TASK-036 A3、TASK-037 F1、本任务实现中途，以及
    // R1 指出的「门闩本身漏了根 README」）：
    // manifest 变了，而三处宣称还停在旧口径。人眼守不住，让它自己报警。
    // 三处宣称：extension 的两份 + 仓库根 README。**根 README 是普通用户最先读到的
    // 权限承诺**，上一版把它漏在门闩外，等于最要紧的一处没人守。
    const docs = [
      { name: 'extension/README.md', path: '../README.md' },
      { name: 'extension/AGENTS.md', path: '../AGENTS.md' },
      { name: 'README.md', path: '../../README.md' },
    ].map(({ name, path }) => ({
      name,
      text: readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'),
    }))
    // 可选权限同样是 reach：它安装时不生效，但一旦用户授予就长期有效，
    // 因此三处宣称必须一样点名它。漏掉 optional 那一半，等于门闩只守了一半。
    const declared = [
      ...manifest.permissions,
      ...manifest.optional_host_permissions,
      ...manifest.content_scripts.flatMap((entry) => entry.matches),
    ]
    for (const { name, text } of docs) {
      for (const item of declared) {
        expect(text, `${name} 没有提到已申请的 ${item}`).toContain(item)
      }
    }
  })

  it('keeps the network reach confined to the service worker', () => {
    // 「扩展只有一个地方会主动发请求」这句承诺的机器守卫。popup、注入脚本与中转
    // 脚本都不许出现 fetch/XMLHttpRequest —— 它们要字节时应当经消息问 worker。
    const offenders = sources()
      .filter((path) => !path.includes('/background/'))
      .filter((path) => /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/.test(code(path)))
    expect(offenders).toEqual([])
  })

  it('never lets the service worker carry site credentials', () => {
    // 取图必须 credentials: 'omit'。登录墙后的图片因此取不到，那是设计而非缺陷；
    // 反过来，任何一处 'include' 都会把用户在该站的登录态带出去。
    const worker = code(fileURLToPath(new URL('./background/worker.ts', import.meta.url)))
    expect(worker).toContain("credentials: 'omit'")
    expect(worker).not.toContain("credentials: 'include'")
    expect(worker).not.toContain("credentials: 'same-origin'")
  })

  it('does not let a stray comment opener blind the scanners', () => {
    // `code()` 是朴素正则剥离器：源码里出现 `/*`（哪怕是在字符串或正则里）会让它把
    // 之后的一切当注释吃掉，于是上面几条扫描对该文件变成空扫、**静默通过**。
    // 这条断言让那种情况响一声：剥离后至少要保留一半的非空行。
    for (const path of sources()) {
      const raw = readFileSync(path, 'utf8')
      const rawLines = raw.split('\n').filter((line) => line.trim()).length
      const keptLines = code(path)
        .split('\n')
        .filter((line) => line.trim()).length
      expect(keptLines, `${path} 的注释剥离吃掉了过多内容`).toBeGreaterThan(rawLines * 0.3)
    }
  })

  it('scans a non-empty set of files', () => {
    // 防止上面两条因为扫描器写坏而变成恒真。
    expect(sources().length).toBeGreaterThanOrEqual(6)
  })
})
