import { describe, expect, it } from 'vitest'
import { getEnvironmentScene, getEnvironmentSceneCopy } from './environmentScene'

describe('environment scene composition', () => {
  it('maps single responses to a single ecological scene', () => {
    expect(getEnvironmentScene(['sunlight'])).toBe('sunlight')
    expect(getEnvironmentScene(['watering'])).toBe('watering')
    expect(getEnvironmentScene(['cloudy'])).toBe('cloudy')
  })

  it('composes multiple anonymous responses instead of stacking labels', () => {
    expect(getEnvironmentScene(['sunlight', 'watering'])).toBe('sunshower')
    expect(getEnvironmentScene(['sunlight', 'cloudy'])).toBe('filtered-light')
    expect(getEnvironmentScene(['watering', 'cloudy'])).toBe('overcast-rain')
    expect(getEnvironmentScene(['sunlight', 'watering', 'cloudy'])).toBe('clearing')
    expect(getEnvironmentSceneCopy(['sunlight', 'watering', 'cloudy']).label).toBe('云隙新生')
  })

  it('provides complete English scene copy for the bilingual interface', () => {
    expect(getEnvironmentSceneCopy([], 'en')).toEqual({
      label: 'Quiet garden',
      caption: 'The leaves are open, leaving room for a response',
    })
    expect(getEnvironmentSceneCopy(['sunlight', 'watering', 'cloudy'], 'en')).toEqual({
      label: 'A clearing sky',
      caption: 'The cloud drifts on and warm light reaches the damp soil',
    })
  })
})
