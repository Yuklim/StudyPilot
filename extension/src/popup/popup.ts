import type { CapturePayload, PdfProblem } from '../shared/protocol'

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

/**
 * 这一次要不要停下来问「PDF 没拿到，怎么办」（TASK-085）。
 *
 * 判据是**「是文献」且「试过但没拿到」**：`pdf_problem` 只在认出文献且这一页声明了
 * `citation_pdf_url` 时才非空，写成双重判据是让意图显式，也挡住将来别处误设该字段。
 *
 * 为什么必须停在 popup 里：`deliverCapture` 一旦打开确认页标签页，popup 就被浏览器关掉，
 * 之后往它上面写什么都看不见——TASK-080 加的 PDF 回执正是这么消失的。
 */
export function needsPdfDecision(payload: CapturePayload): boolean {
  return Boolean(payload.citation && payload.pdf_problem)
}

/** PDF 没拿到时，在 popup 上把原因说成人话。与确认页那套同源，但更短。 */
export function pdfFailureText(problem: PdfProblem): string {
  switch (problem) {
    case 'cross-origin':
      return 'PDF 放在另一个域名下，扩展没有那个域名的权限，所以没能取下来。'
    case 'too-large':
      return 'PDF 超过 25 MiB 上限，存不进来。'
    case 'not-pdf':
      return '那个地址取回来的不是 PDF，多半是登录页或付费墙。'
    case 'slow':
      return 'PDF 20 秒内没下完（文件大或网络慢）。稍后再采集一次多半能成。'
    case 'failed':
      return 'PDF 没能取下来——多数出版社要求先登录才给，而扩展从不带你的账号信息。'
  }
}

/**
 * 这一次要不要问「连图片一并保存」（TASK-080 首轮 Review F1）。
 *
 * **抓到了 PDF 就不问。** 确认页在 PDF 分支里根本不碰图片，照问只会让用户为一件不会
 * 发生的事授出 `<all_urls>`——实测 PLOS ONE 那一页正是 5 张图 + PDF 抓取成功。
 * （TASK-084 把确认页上「改存网页正文」的勾选框删掉了，所以这条路上不会再有「用户取消勾选」
 * 那一步——原注释里那句已随之失效，TASK-085 订正。）
 * 抓不到 PDF 时的去向改由 popup 自己问，见 `needsPdfDecision`。
 */
export function shouldAskAboutImages(payload: CapturePayload): boolean {
  return payload.images.length > 0 && !payload.pdf
}

/**
 * 交付后的回执：说清到底带走了什么，而不是笼统说「已保存」。
 *
 * `refused` 区分「本来就没图 / 用户选了只存正文」与「要了图但授权没落地」——
 * 后者用户需要知道**为什么**没带走，否则只会在确认页看到六张全失败。
 * `pdf` 则区分「这次存的是 PDF 原件」——那条路上正文与图片都不参与。
 */
export function deliveryText(images: number, refused = false, pdf = false): string {
  if (pdf) {
    // 存的是 PDF 原件，不是正文——回执不能照抄正文那一套（同上 F1：原文案说
    // 「图片会在保存正文之后逐张下载」，而这条路上那件事不会发生）。
    return '已把这篇文献的 PDF 交给 StudyPilot，请在打开的页面里确认后保存。保存后可直接在 StudyPilot 里阅读。'
  }
  if (refused) {
    return '已把正文交给 StudyPilot。但浏览器没有授予访问图片所在网站的权限，图片这次没有保存，仍指向原网站。想保存图片的话，重新点一次采集并在弹出的授权框里选允许。'
  }
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
