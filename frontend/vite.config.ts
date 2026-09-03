import react from '@vitejs/plugin-react'
import { randomBytes } from 'node:crypto'
import type { ViteDevServer } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'studypilot-canonical-ui-host',
      configureServer(server: ViteDevServer) {
        // Vite always permits localhost/IP aliases by default. Check before Host
        // rewriting so an alternate UI origin cannot bootstrap without Origin.
        const authority = `127.0.0.1:${server.config.server.port}`
        server.middlewares.use((request, response, next) => {
          const hosts = request.rawHeaders.filter(
            (value, index) => index % 2 === 0 && value.toLowerCase() === 'host',
          )
          if (hosts.length === 1 && request.headers.host === authority) return next()
          const requestId = 'req_' + randomBytes(16).toString('hex')
          response.writeHead(403, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'X-Request-Id': requestId,
          })
          response.end(
            JSON.stringify({
              error: {
                code: 'HOST_FORBIDDEN',
                message: '请使用规范的本机页面地址。',
                details: {},
                request_id: requestId,
              },
            }),
          )
        })
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Forward API preflights to the backend security gate, not Vite's default CORS.
    cors: false,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        xfwd: false,
      },
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
})
