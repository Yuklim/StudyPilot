import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { EXTRACT_SCRIPT, POPUP_PAGE, RELAY_SCRIPT, manifest } from './manifest'
import { UI_ORIGIN } from './shared/protocol'

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

  it('declares exactly these seven keys and nothing else', () => {
    // A whitelist on purpose: naming the dangerous keys instead would miss
    // `optional_permissions`, `optional_host_permissions`, `externally_connectable`,
    // `web_accessible_resources`, `content_security_policy`, `background`,
    // `declarative_net_request` and every key Chrome adds later — all of which grant
    // reach just as effectively. Any new top-level key fails here, which forces the
    // change to be deliberate and reviewed.
    expect(Object.keys(manifest).sort()).toEqual(
      [
        'action',
        'content_scripts',
        'description',
        'manifest_version',
        'name',
        'permissions',
        'version',
      ].sort(),
    )
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

  it('never declares the extract script as a content script', () => {
    // It is injected on demand under activeTab. Declaring it statically would need
    // a broad host permission — exactly the trade this design avoids.
    const declared = manifest.content_scripts.flatMap((entry) => entry.js)
    expect(declared).not.toContain(EXTRACT_SCRIPT)
  })
})
