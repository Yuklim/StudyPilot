import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { manifest, POPUP_PAGE } from './manifest'

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

  it('declares exactly these five keys and nothing else', () => {
    // The baseline can read nothing, and granting it any reach is a security
    // decision that belongs in a reviewed task. This is a whitelist on purpose:
    // naming the dangerous keys instead would miss `optional_permissions`,
    // `optional_host_permissions`, `externally_connectable`,
    // `web_accessible_resources`, `content_security_policy`, `background`,
    // `declarative_net_request` and every key Chrome adds later — all of which
    // grant reach just as effectively. Any new top-level key fails here, which
    // forces the change to be deliberate and reviewed.
    expect(Object.keys(manifest).sort()).toEqual(
      ['action', 'description', 'manifest_version', 'name', 'version'].sort(),
    )
  })
})
