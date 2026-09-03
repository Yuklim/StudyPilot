import { mergeConfig } from 'vite'

import baseConfig from '../vite.config.ts'

export default mergeConfig(baseConfig, {
  server: {
    host: '127.0.0.1',
    port: 15173,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:18000', changeOrigin: false } },
  },
})
