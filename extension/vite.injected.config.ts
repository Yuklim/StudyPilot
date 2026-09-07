import { defineConfig } from 'vite'

// 内容脚本与注入脚本必须是**经典脚本**（浏览器不给它们 ESM 加载器），而 Rollup 只在
// es/system 格式下支持多入口，所以这两个产物各构建一次，用 --mode 选入口。
// 它们跟在 popup 构建之后跑，因此 emptyOutDir 关掉，不能清掉先产出的 dist。
export const ENTRIES = {
  extract: { file: 'src/injected/extract.ts', name: 'StudyPilotExtract' },
  relay: { file: 'src/injected/relay.ts', name: 'StudyPilotRelay' },
} as const

/**
 * 产物文件名。**导出它是为了让测试能把它和 manifest 里的常量绑在一起** ——
 * 否则改这一行（比如加个 `.bundle` 或 `[hash]`）不会让任何测试变红，而产出的
 * `dist/` 里的文件名会与 manifest 引用的对不上，只在实机加载时才炸。
 */
export const outputName = (mode: string) => `${mode}.js`

export default defineConfig(({ mode }) => {
  const entry = ENTRIES[mode as keyof typeof ENTRIES]
  if (!entry) {
    throw new Error(`unknown injected entry: ${mode} (expected one of ${Object.keys(ENTRIES)})`)
  }
  return {
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: entry.file,
        formats: ['iife'],
        name: entry.name,
        fileName: () => outputName(mode),
      },
    },
  }
})
