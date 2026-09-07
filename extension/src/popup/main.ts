import { manifest } from '../manifest'

import { chromeBridge } from './bridge'
import { deliverCapture, runCapture, type CaptureOutcome } from './capture'
import { deliveryText, imagePrompt, outcomeText, popupText } from './popup'

// 采集分两步，**这不是设计偏好而是浏览器约束**：`chrome.permissions.request` 必须在
// 用户手势里调用，而提取是异步的、`await` 会消耗掉第一次点击的手势。所以第一次点击
// 只提取，发现图片后再由第二次点击去请求权限。
//
// 副作用是它顺带变得更合理了：用户是在看到「有几张图」之后才被要求授权。

const status = document.querySelector('#status')
const hint = document.querySelector('#hint')
const button = document.querySelector('#capture')
const choices = document.querySelector('#choices')
const withImages = document.querySelector('#with-images')
const textOnly = document.querySelector('#text-only')

if (status) status.textContent = popupText(manifest.version)

function show(element: Element | null, visible: boolean) {
  if (element instanceof HTMLElement) element.hidden = !visible
}

if (
  button instanceof HTMLButtonElement &&
  withImages instanceof HTMLButtonElement &&
  textOnly instanceof HTMLButtonElement &&
  hint
) {
  const bridge = chromeBridge()
  // 收进常量：`hint` 的窄化在异步函数体里会丢失，而它在这个分支里已确定非空。
  const note = hint

  async function deliver(outcome: Extract<CaptureOutcome, { ok: true }>, images: boolean) {
    show(choices, false)
    note.textContent = '正在交给 StudyPilot…'
    try {
      const { images: count } = await deliverCapture(bridge, outcome.payload, images)
      note.textContent = deliveryText(count)
    } catch {
      note.textContent = '交给 StudyPilot 时出错了，请再试一次。'
      show(button, true)
    }
  }

  button.addEventListener('click', () => {
    button.disabled = true
    hint.textContent = '正在读取这一页…'
    runCapture(bridge)
      .then(async (outcome) => {
        if (!outcome.ok) {
          hint.textContent = outcomeText(outcome)
          return
        }
        // 没有图片就没有要问的：直接交付，保持一次点击的旧手感。
        if (outcome.payload.images.length === 0) {
          await deliver(outcome, false)
          return
        }
        hint.textContent = imagePrompt(outcome.payload.images.length)
        show(button, false)
        show(choices, true)
        withImages.onclick = () => void deliver(outcome, true)
        textOnly.onclick = () => void deliver(outcome, false)
      })
      .catch(() => {
        hint.textContent = '读取这一页时出错了，请再试一次。'
      })
      .finally(() => {
        button.disabled = false
      })
  })
}
