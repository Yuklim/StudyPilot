import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// The explicit `.ts` extension keeps Vite's native config loader happy; without
// it the build prints a forward-compatibility warning on every run.
import { execFileSync } from 'node:child_process'

import { buildVersion, buildVersionName, manifest, POPUP_PAGE } from './src/manifest.ts'

/** 仓库的提交数，作为 `version` 的构建号。拿不到就退回去掉第四段的版本。 */
function commitCount(): string {
  try {
    return execFileSync('git', ['rev-list', '--count', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function headCommit(): string {
  try {
    // `--dirty` 让「工作区有未提交改动」也能看出来：否则改了代码没提交就构建，
    // 版本名指向的是 HEAD 那个 commit，与「我装的是哪一版」的目的正好相反。
    // stderr 丢掉：没有 git 或不在仓库里时它会打一行 fatal:，那不是构建的错。
    return execFileSync('git', ['describe', '--always', '--dirty', '--abbrev=7'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    // 没有 git（源码包、浅克隆）时不算失败：版本名退化成 `+dev`，构建照常。
    return ''
  }
}

// Emitting the manifest from `src/manifest.ts` keeps one source of truth: the
// tests assert against the same module the build ships.
const emitManifest: Plugin = {
  name: 'studypilot-emit-manifest',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'manifest.json',
      // 构建时把当前 commit 的短 SHA 写进 version_name：装进 Chrome 之后，扩展详情页
      // 上就能一眼看出装的是哪一版。拿不到 git 时 buildVersionName 退化为 `+dev`。
      source:
        JSON.stringify(
          {
            ...manifest,
            // 每次提交都会让这个数变，点「更新」就能看出换版了——不依赖浏览器显不显示
            // version_name（Edge 的扩展页是自家 UI，用户 2026-09-21 实测它没显示）。
            version: buildVersion(commitCount()),
            version_name: buildVersionName(headCommit(), commitCount()),
          },
          null,
          2,
        ) + '\n',
    })
  },
}

export default defineConfig({
  plugins: [emitManifest],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: { input: { popup: POPUP_PAGE } },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
