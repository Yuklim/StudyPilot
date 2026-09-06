import { manifest } from '../manifest'
import { popupText } from './popup'

const target = document.querySelector('#status')
if (target) target.textContent = popupText(manifest.version)
