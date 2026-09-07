/// <reference lib="dom" />
import { expect, test } from '@playwright/test'

/**
 * 走真实后端的采集冻结链路：`/capture` 页面 → 建资料 → 写正文 → 逐张上传图片 →
 * 资产可列出。
 *
 * **它验不到的部分，说清楚**：Playwright 不加载浏览器扩展，所以扩展那一段（提取、
 * 权限请求、service worker 取字节、中转脚本转交）在这里全部由页面内的桩代替 ——
 * 桩既扮演中转脚本交付载荷，也扮演它答复逐张取图。因此本条证明的是「页面收到图片
 * 字节之后，到后端真的存下并能列出」这一段，不证明扩展那一段。扩展侧由 `extension/`
 * 的单测覆盖，两端之间的消息格式由两份平行 protocol 的守卫覆盖。
 */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

test('a captured page freezes its images through the real backend', async ({ page }) => {
  const external: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin !== 'http://127.0.0.1:15173') external.push(url.origin)
  })

  await page.goto('/capture')
  await expect(page.getByText(/还没有收到扩展发来的内容/)).toBeVisible()

  // 桩：扮演中转脚本。收到页面的就绪信号就交付载荷；收到逐张取图请求就答字节。
  await page.evaluate((base64) => {
    const IMAGE = 'https://cdn.example.test/diagram.png'
    window.addEventListener('message', (event) => {
      if (event.source !== window) return
      const data = event.data as { type?: string; url?: string }
      if (data?.type === 'studypilot-capture-ready') {
        window.postMessage(
          {
            type: 'studypilot-capture-payload',
            payload: {
              title: 'e2e 合成 · 带图的一页',
              url: 'https://example.test/e2e-capture',
              markdown: `# 带图的一页\n\n![图](${IMAGE})\n\n正文若干。\n`,
              images: [IMAGE],
            },
          },
          window.location.origin,
        )
      }
      if (data?.type === 'studypilot-capture-image-request') {
        window.postMessage(
          {
            type: 'studypilot-capture-image-result',
            url: data.url,
            result: { ok: true, base64, mediaType: 'image/png' },
          },
          window.location.origin,
        )
      }
    })
    // 页面早已发过就绪信号，这里补发一次让刚装上的桩接到。
    window.postMessage({ type: 'studypilot-capture-ready' }, window.location.origin)
  }, PNG_BASE64)

  await expect(page.locator('input[value="e2e 合成 · 带图的一页"]')).toBeVisible()
  await page.getByRole('button', { name: '保存为资料' }).click()

  // 全部图片都冻上时页面直接跳到资料详情，不停在中间态。
  await expect(page).toHaveURL(/\/resources\/[0-9a-f-]{36}$/)
  const resourceId = new URL(page.url()).pathname.split('/').pop()

  // 资产真的进了后端：用页面自己的令牌读一次列表。
  const listed = await page.evaluate(async (id) => {
    const bootstrap = await fetch('/api/v1/local-session', {
      headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' },
    })
    const token = ((await bootstrap.json()) as { data: { token: string } }).data.token
    const response = await fetch(`/api/v1/resources/${id}/snapshot/assets`, {
      headers: { 'X-StudyPilot-Token': token },
    })
    return (await response.json()) as { data: Array<Record<string, unknown>> }
  }, resourceId)

  expect(listed.data).toHaveLength(1)
  expect(listed.data[0]).toMatchObject({
    source_url: 'https://cdn.example.test/diagram.png',
    media_type: 'image/png',
  })
  // 内部存储键不出现在响应里。
  expect(JSON.stringify(listed.data)).not.toContain('objects/')
  // 整条链路没有向本机以外发出任何请求 —— 图片字节由桩提供，后端不出网。
  expect(external).toEqual([])
})
