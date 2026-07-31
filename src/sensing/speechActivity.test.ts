import { describe, expect, it } from 'vitest'
import { AdaptiveVoiceActivityDetector } from './WebAudioSpeechActivitySensor'

describe('AdaptiveVoiceActivityDetector', () => {
  it('requires several loud frames before speech begins', () => {
    const detector = new AdaptiveVoiceActivityDetector()
    expect(detector.update(0.05)).toBe(false)
    expect(detector.update(0.05)).toBe(false)
    expect(detector.update(0.05)).toBe(true)
  })

  it('uses a longer release window to avoid flickering', () => {
    const detector = new AdaptiveVoiceActivityDetector()
    detector.update(0.05)
    detector.update(0.05)
    detector.update(0.05)
    for (let index = 0; index < 7; index += 1) expect(detector.update(0.001)).toBe(true)
    expect(detector.update(0.001)).toBe(false)
  })

  it('detects quieter laptop microphone speech after calibration', () => {
    const detector = new AdaptiveVoiceActivityDetector()
    for (let index = 0; index < 12; index += 1) detector.update(0.002)
    expect(detector.update(0.014)).toBe(false)
    expect(detector.update(0.014)).toBe(false)
    expect(detector.update(0.014)).toBe(true)
  })
})
