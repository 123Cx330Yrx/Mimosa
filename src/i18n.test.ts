import { describe, expect, it } from 'vitest'
import { translate } from './i18n'

describe('bilingual interface copy', () => {
  it('uses polished Chinese copy for the private role check-in', () => {
    expect(translate('zh', '私密确认 · 暂不推断角色')).toBe('仅你可见')
    expect(translate('zh', '选择最接近你此刻需要的位置')).toBe('此刻，你更接近哪种情况？')
  })

  it('uses natural English copy for the same interaction', () => {
    expect(translate('en', '私密确认 · 暂不推断角色')).toBe('Only visible to you')
    expect(translate('en', '选择最接近你此刻需要的位置')).toBe('Which of these feels closest right now?')
  })
})
