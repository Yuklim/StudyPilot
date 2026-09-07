/// <reference lib="dom" />
import { expect, test } from '@playwright/test'

/**
 * 走真实后端：正文里的图片，冻结过的显示**本机那一份**，没冻的按原址加载。
 *
 * 已冻结那张必须是 `blob:` —— 这条守的是「不得因为『反正未冻结的也会加载』就跳过
 * 匹配」，否则冻结白做。未冻结那张必须带 `referrerpolicy="no-referrer"`，那是用户
 * 在知情后接受自动加载时的唯一缓解，漏掉会静默失效。
 */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
// **两张图必须分属不同的主机。** 同主机时，「冻结那张也跑去原站取」这种回退
// 在网络断言里和未冻结那张混在一起，一个真实的退化看不出来。分开之后，
// `frozen.example.test` 一旦出现在请求里就说明本机那一份没被用上。
const FROZEN_HOST = 'https://frozen.example.test'
const ORIGIN_HOST = 'https://origin.example.test'
const FROZEN = `${FROZEN_HOST}/frozen.png`
const NOT_FROZEN = `${ORIGIN_HOST}/never-frozen.png`

test('a rendered snapshot shows the local copy of a frozen image', async ({ page }) => {
  const external: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.origin !== 'http://127.0.0.1:15173') external.push(url.origin)
  })

  await page.goto('/resources')
  const created = await page.evaluate(
    async ([frozen, notFrozen, base64]) => {
      const bootstrap = await fetch('/api/v1/local-session', {
        headers: { 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' },
      })
      const token = ((await bootstrap.json()) as { data: { token: string } }).data.token
      const head = { 'X-StudyPilot-Token': token, 'Content-Type': 'application/json' }
      const resource = await (
        await fetch('/api/v1/resources', {
          method: 'POST',
          headers: head,
          body: JSON.stringify({
            source_type: 'WEB',
            title: 'e2e 渲染 · 带图快照',
            source_url: 'https://example.test/rendered',
          }),
        })
      ).json()
      const id = (resource as { data: { id: string } }).data.id
      const snapshot = await (
        await fetch(`/api/v1/resources/${id}/snapshot`, {
          method: 'PUT',
          headers: head,
          body: JSON.stringify({
            content: `# 渲染标题\n\n正文一段。\n\n![冻结过](${frozen})\n\n![没冻过](${notFrozen})\n`,
          }),
        })
      ).json()
      const version = (snapshot as { data: { version: number } }).data.version
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const form = new FormData()
      form.append('file', new File([bytes], 'image'))
      form.append('source_url', frozen)
      const upload = await fetch(`/api/v1/resources/${id}/snapshot/assets`, {
        method: 'POST',
        headers: { 'X-StudyPilot-Token': token, 'If-Match': `"${version}"` },
        body: form,
      })
      return { id, uploaded: upload.status }
    },
    [FROZEN, NOT_FROZEN, PNG_BASE64] as const,
  )
  expect(created.uploaded).toBe(201)

  await page.goto(`/resources/${created.id}`)
  const section = page.getByRole('region', { name: '正文快照' })
  await expect(section.getByRole('heading', { name: '渲染标题' })).toBeVisible()

  const images = section.locator('img')
  await expect(images).toHaveCount(2)
  // 冻结过的那张走本机：src 是 blob URL，不是原站地址。
  await expect(images.nth(0)).toHaveAttribute('src', /^blob:/)
  // 而且**真的解码出来了**：`blob:` 这个 src 只证明地址对，不证明字节能显示。
  // 上传的字节坏掉、媒体类型丢失、blob URL 提前回收，src 都还是 blob: 而画面是空的。
  await expect
    .poll(async () => images.nth(0).evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0)
  // 没冻过的那张按原址加载，且撤掉 referrer。
  await expect(images.nth(1)).toHaveAttribute('src', NOT_FROZEN)
  await expect(images.nth(1)).toHaveAttribute('referrerpolicy', 'no-referrer')

  // 源码视图仍在：加了渲染不该让用户失去看源码的能力。
  await section.getByRole('button', { name: '看 Markdown 源码' }).click()
  await expect(section.locator('pre.snapshot-body')).toContainText(`![冻结过](${FROZEN})`)

  // 本页向外部发出的请求**只可能来自那张未冻结的图片**——不得有别的（字体、
  // 渲染器 CDN、链接预取等），**尤其不得有冻结那张所在的主机**：它出现就等于
  // 本机副本没被用上，而用户为那一份付过一次授权代价。
  // 这条守的是「外部请求只能来自用户已知的那一类」，而不是「没有外部请求」——
  // 后者在用户选择自动加载之后就不成立了。
  const unexpected = [...new Set(external)].filter((origin) => origin !== ORIGIN_HOST)
  expect(unexpected).toEqual([])
})
