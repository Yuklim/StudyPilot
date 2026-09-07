import { manifest } from '../manifest'

import { chromeBridge } from './bridge'
import { runCapture } from './capture'
import { outcomeText, popupText } from './popup'

const status = document.querySelector('#status')
const hint = document.querySelector('#hint')
const button = document.querySelector('#capture')

if (status) status.textContent = popupText(manifest.version)

if (button instanceof HTMLButtonElement && hint) {
  button.addEventListener('click', () => {
    button.disabled = true
    hint.textContent = '正在读取这一页…'
    runCapture(chromeBridge())
      .then((outcome) => {
        hint.textContent = outcomeText(outcome)
      })
      .catch(() => {
        hint.textContent = '读取这一页时出错了，请再试一次。'
      })
      .finally(() => {
        button.disabled = false
      })
  })
}
