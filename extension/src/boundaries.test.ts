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

  it('keeps the docs naming every reach the manifest actually asks for', () => {
    // 这类缺陷已经连着出现三次（TASK-036 A3、TASK-037 F1，以及本任务实现中途）：
    // manifest 变了，而三处宣称还停在旧口径。人眼守不住，让它自己报警。
    const docs = ['README.md', 'AGENTS.md'].map((name) => ({
      name,
      text: readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8'),
    }))
    const declared = [
      ...manifest.permissions,
      ...manifest.content_scripts.flatMap((entry) => entry.matches),
    ]
    for (const { name, text } of docs) {
      for (const item of declared) {
        expect(text, `${name} 没有提到已申请的 ${item}`).toContain(item)
      }
    }
  })

  it('scans a non-empty set of files', () => {
    // 防止上面两条因为扫描器写坏而变成恒真。
    expect(sources().length).toBeGreaterThanOrEqual(6)
  })
})
