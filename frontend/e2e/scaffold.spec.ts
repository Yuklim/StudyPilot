import { expect, test } from '@playwright/test'

test('real browser loads the scaffold and reaches the backend through the proxy', async ({
  page,
}) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: '工程框架已运行，业务功能尚未实现' }),
  ).toBeVisible()
  await expect(page.getByRole('button')).toHaveCount(0)

  // This is a real browser fetch through Vite to the real FastAPI middleware.
  // Never mock an unfinished business endpoint to make the smoke test pass.
  const denied = await page.evaluate(async () => {
    const response = await fetch('/api/v1/unknown', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'synthetic test input',
    })
    return { status: response.status, body: await response.json() }
  })
  expect(denied).toEqual({ status: 403, body: { detail: 'Forbidden' } })
})
