import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MimosaScene } from './MimosaScene'

describe('MimosaScene visual structure', () => {
  it('keeps plant positioning separate from animated growth layers', () => {
    const markup = renderToStaticMarkup(
      <MimosaScene
        environments={[]}
        plant="growing"
        active
        alive
        locale="en"
      />,
    )

    expect(markup).toContain('class="seedling-position" transform="translate(173 205)"')
    expect(markup).toContain('class="bloom-position" transform="translate(159 50)"')
    expect(markup).toContain('<g class="bloom growth-bloom"')
    expect(markup).not.toContain('class="bloom growth-bloom" transform=')
  })
})
