import { describe, expect, it } from 'vitest'

import { popupText } from './popup'

describe('popupText', () => {
  it('names the version and says the capture feature is not implemented', () => {
    const text = popupText('0.1.0')
    expect(text).toContain('0.1.0')
    expect(text).toContain('尚未实现')
  })
})
