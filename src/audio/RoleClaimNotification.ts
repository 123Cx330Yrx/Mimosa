/**
 * A short, non-repeating notification used when somebody formally claims an
 * unanswered question. The AudioContext is unlocked from the join gesture so
 * the cue can still play when the meeting tab is in the background.
 */
export class RoleClaimNotification {
  private context: AudioContext | null = null

  async unlock() {
    if (!this.context) {
      const AudioContextConstructor = window.AudioContext
      this.context = new AudioContextConstructor()
    }

    if (this.context.state === 'suspended') {
      await this.context.resume()
    }
  }

  play() {
    const context = this.context
    if (!context || context.state !== 'running') return false

    const startedAt = context.currentTime + 0.015
    const master = context.createGain()
    master.gain.setValueAtTime(0.0001, startedAt)
    master.gain.exponentialRampToValueAtTime(0.048, startedAt + 0.025)
    master.gain.setValueAtTime(0.048, startedAt + 0.55)
    master.gain.exponentialRampToValueAtTime(0.0001, startedAt + 0.88)
    master.connect(context.destination)

    const chirps = [
      { offset: 0, duration: 0.16, from: 1480, peak: 2380, to: 1940, level: 0.72 },
      { offset: 0.18, duration: 0.13, from: 1740, peak: 2780, to: 2210, level: 0.55 },
      { offset: 0.43, duration: 0.22, from: 1390, peak: 2520, to: 1810, level: 0.68 },
    ]

    for (const chirp of chirps) {
      const oscillator = context.createOscillator()
      const chirpGain = context.createGain()
      const chirpStart = startedAt + chirp.offset
      const chirpPeak = chirpStart + chirp.duration * 0.42
      const chirpEnd = chirpStart + chirp.duration

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(chirp.from, chirpStart)
      oscillator.frequency.exponentialRampToValueAtTime(chirp.peak, chirpPeak)
      oscillator.frequency.exponentialRampToValueAtTime(chirp.to, chirpEnd)
      chirpGain.gain.setValueAtTime(0.0001, chirpStart)
      chirpGain.gain.exponentialRampToValueAtTime(chirp.level, chirpStart + 0.018)
      chirpGain.gain.setValueAtTime(chirp.level * 0.72, chirpPeak)
      chirpGain.gain.exponentialRampToValueAtTime(0.0001, chirpEnd)
      oscillator.connect(chirpGain)
      chirpGain.connect(master)
      oscillator.start(chirpStart)
      oscillator.stop(chirpEnd + 0.02)

      // A very quiet upper partial keeps the cue organic rather than turning
      // it into a clean notification beep.
      const overtone = context.createOscillator()
      const overtoneGain = context.createGain()
      overtone.type = 'triangle'
      overtone.frequency.setValueAtTime(chirp.from * 1.52, chirpStart)
      overtone.frequency.exponentialRampToValueAtTime(chirp.peak * 1.36, chirpPeak)
      overtone.frequency.exponentialRampToValueAtTime(chirp.to * 1.45, chirpEnd)
      overtoneGain.gain.setValueAtTime(0.0001, chirpStart)
      overtoneGain.gain.exponentialRampToValueAtTime(chirp.level * 0.09, chirpStart + 0.022)
      overtoneGain.gain.exponentialRampToValueAtTime(0.0001, chirpEnd)
      overtone.connect(overtoneGain)
      overtoneGain.connect(master)
      overtone.start(chirpStart)
      overtone.stop(chirpEnd + 0.02)
    }

    return true
  }

  dispose() {
    const context = this.context
    this.context = null
    if (context && context.state !== 'closed') void context.close()
  }
}
