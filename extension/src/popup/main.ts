import { manifest } from '../manifest'

import { chromeBridge } from './bridge'
import { deliverCapture, runCapture, type CaptureOutcome } from './capture'
import {
  deliveryText,
  imagePrompt,
  needsPdfDecision,
  outcomeText,
  pdfFailureText,
  popupText,
  shouldAskAboutImages,
} from './popup'

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
const pdfFailed = document.querySelector('#pdf-failed')
const pdfReason = document.querySelector('#pdf-reason')
const saveText = document.querySelector('#save-text')
const giveUp = document.querySelector('#give-up')

// **版本要取浏览器实际装着的那一份**（TASK-085 范围修订 1）：源码里的 `manifest.version`
// 是 `buildVersion()` 的无参调用，运行时拿不到构建号，于是 popup 一直显示 `0.2.0`，
// 而扩展管理页显示 `0.2.0.638+…`——用户早先抱怨过这个不一致，TASK-079 只修好了管理页那边。
const installed =
  typeof chrome !== 'undefined' ? chrome.runtime?.getManifest?.()?.version : undefined
if (status) status.textContent = popupText(installed || manifest.version)

function show(element: Element | null, visible: boolean) {
  if (element instanceof HTMLElement) element.hidden = !visible
}

if (
  button instanceof HTMLButtonElement &&
  withImages instanceof HTMLButtonElement &&
  textOnly instanceof HTMLButtonElement &&
  saveText instanceof HTMLButtonElement &&
  giveUp instanceof HTMLButtonElement &&
  pdfReason instanceof HTMLElement &&
  hint
) {
  const bridge = chromeBridge()
  // 收进常量：窄化在（提升的）函数声明体里会丢失，而它们在这个分支里已确定非空。
  const note = hint
  const imagesButton = withImages
  const textButton = textOnly

  async function deliver(outcome: Extract<CaptureOutcome, { ok: true }>, images: boolean) {
    show(choices, false)
    note.textContent = '正在交给 StudyPilot…'
    try {
      const { images: count, refused } = await deliverCapture(bridge, outcome.payload, images)
      note.textContent = deliveryText(count, refused, Boolean(outcome.payload.pdf))
    } catch {
      note.textContent = '交给 StudyPilot 时出错了，请再试一次。'
      show(button, true)
    }
  }

  button.addEventListener('click', () => {
    button.disabled = true
    // 这一步现在可能还包含「下载这篇文献的 PDF」，几 MB 要等一会儿——
    // 光说「正在读取这一页」会让用户以为卡住了（第四轮 Review F2）。
    hint.textContent = '正在读取这一页…（是文献的话还要下载它的 PDF，可能要等一会儿）'
    runCapture(bridge)
      .then(async (outcome) => {
        if (!outcome.ok) {
          hint.textContent = outcomeText(outcome)
          return
        }
        // 是文献、试过但没拿到 PDF：**停在这里**把原因说清，让用户决定（TASK-085，
        // 用户 2026-09-21 选的方案 A）。一旦往下走打开确认页，popup 就没了。
        const problem = outcome.payload.pdf_problem
        if (needsPdfDecision(outcome.payload) && problem) {
          hint.textContent = ''
          pdfReason.textContent = `⚠ ${pdfFailureText(problem)}`
          show(button, false)
          show(pdfFailed, true)
          saveText.onclick = () => {
            show(pdfFailed, false)
            void askImagesThenDeliver(outcome)
          }
          giveUp.onclick = () => {
            show(pdfFailed, false)
            // 把采集按钮放回来：否则这一次 popup 里再也点不了第二次（独立 Review 非阻断②）。
            show(button, true)
            note.textContent = '这次什么都没保存。想改主意就再点一次。'
          }
          return
        }
        await askImagesThenDeliver(outcome)
      })
      .catch(() => {
        hint.textContent = '读取这一页时出错了，请再试一次。'
      })
      .finally(() => {
        button.disabled = false
      })
  })

  /** 有图就先问一次权限，没图就直接交付。两条路都由这里收口。 */
  async function askImagesThenDeliver(outcome: Extract<CaptureOutcome, { ok: true }>) {
    if (!shouldAskAboutImages(outcome.payload)) {
      await deliver(outcome, false)
      return
    }
    note.textContent = imagePrompt(outcome.payload.images.length)
    show(button, false)
    show(choices, true)
    imagesButton.onclick = () => void deliver(outcome, true)
    textButton.onclick = () => void deliver(outcome, false)
  }
}
