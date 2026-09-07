import type { CaptureOutcome } from './capture'

// popup 的文案。保持与 DOM 解耦，便于测试。

export function popupText(version: string): string {
  return `StudyPilot 采集 v${version}`
}

/**
 * 第二步的提示。**先说清楚要请求什么权限、以及拒绝会怎样**，再让用户选。
 *
 * 数字是真实张数，不四舍五入、不说「一些图片」—— 用户是据它决定要不要授权的。
 */
export function imagePrompt(count: number): string {
  return `这一页的正文里有 ${count} 张图片。一并保存需要浏览器授予「读取网站数据」的权限，用来把图片下载到本机。不授权也能保存正文，图片会继续指向原网站。`
}

/** 交付后的回执：说清到底带走了几张，而不是笼统说「已保存」。 */
export function deliveryText(images: number): string {
  if (images === 0) {
    return '已把正文交给 StudyPilot，请在打开的页面里确认后保存。图片保留原网站地址。'
  }
  return `已把正文和 ${images} 张图片交给 StudyPilot，请在打开的页面里确认后保存。图片会在保存正文之后逐张下载。`
}

/** 采集失败时给出**具体**原因与下一步，不用一句「失败了」打发。 */
export function outcomeText(outcome: CaptureOutcome): string {
  if (outcome.ok) return '已把正文交给 StudyPilot，请在打开的页面里确认后保存。'
  switch (outcome.reason) {
    case 'no-tab':
      return '没有找到当前标签页，请在要采集的网页上再点一次。'
    case 'inject-failed':
      return '这个页面不允许扩展读取（浏览器设置页、扩展商店、本地文件等）。请在普通网页上使用。'
    case 'timeout':
      return '页面读取超时，可能内容还没加载完。等页面稳定后再点一次。'
    case 'unusable':
      return '没能从这一页提取出正文。可以打开 StudyPilot 手工粘贴。'
    case 'unusable-url':
      return '正文读到了，但这一页的网址存不了（含登录信息、片段标识符或过长）。可以打开 StudyPilot 手工粘贴。'
  }
}
