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

  it('declares no permissions and no host permissions', () => {
    // The baseline can read nothing. Granting a permission is a security decision
    // that belongs in a reviewed task, so this assertion is meant to fail — loudly
    // — the first time capture work adds one, forcing the change to be deliberate.
    const declared = manifest as Record<string, unknown>
    expect(declared.permissions).toBeUndefined()
    expect(declared.host_permissions).toBeUndefined()
    expect(declared.content_scripts).toBeUndefined()
  })
})
