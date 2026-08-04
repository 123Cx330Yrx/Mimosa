import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { BaselineNotice } from './BaselineNotice'

describe('BaselineNotice', () => {
  it('renders the neutral Chinese reminder without actions', () => {
    const markup = renderToStaticMarkup(<BaselineNotice locale="zh" />)
    expect(markup).toContain('讨论暂时安静下来了')
    expect(markup).toContain('可以继续思考，也可以一起决定接下来怎么推进。')
    expect(markup).not.toContain('<button')
  })

  it('renders native English copy and the exit state', () => {
    const markup = renderToStaticMarkup(<BaselineNotice locale="en" leaving />)
    expect(markup).toContain('The conversation has gone quiet for a moment.')
    expect(markup).toContain('class="baseline-notice is-leaving"')
  })
})
