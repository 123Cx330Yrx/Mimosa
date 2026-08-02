/**
 * Plays the same cricket cue used by Jitsi's silence reaction. The audio is
 * decoded while the participant joins, allowing it to play later when the
 * meeting tab is in the background.
 *
 * Source and license are documented in THIRD_PARTY_NOTICES.md and alongside
 * the bundled file under public/sounds/.
 */
export class RoleClaimNotification {
  private buffer: AudioBuffer | null = null
  private context: AudioContext | null = null
  private loading: Promise<void> | null = null

  async unlock() {
    if (!this.context) this.context = new AudioContext()
    if (this.context.state === 'suspended') await this.context.resume()

    if (!this.loading) {
      const assetUrl = `${import.meta.env.BASE_URL}sounds/reactions-crickets.mp3`
      this.loading = fetch(assetUrl)
        .then((response) => {
          if (!response.ok) throw new Error(`Unable to load notification sound: ${response.status}`)
          return response.arrayBuffer()
        })
        .then((data) => this.context?.decodeAudioData(data))
        .then((buffer) => {
          if (buffer) this.buffer = buffer
        })
        .catch(() => {
          // The visual role prompt remains the fallback when audio cannot load.
        })
    }

    await this.loading
  }

  play() {
    const context = this.context
    const buffer = this.buffer
    if (!context || context.state !== 'running' || !buffer) return false

    const source = context.createBufferSource()
    const gain = context.createGain()
    source.buffer = buffer
    // Jitsi's source file is deliberately gentle. Raising it here makes the
    // cue noticeable from a background tab without reaching alarm-like levels.
    gain.gain.setValueAtTime(1.35, context.currentTime)
    source.connect(gain)
    gain.connect(context.destination)
    source.start()
    return true
  }

  dispose() {
    const context = this.context
    this.context = null
    this.buffer = null
    this.loading = null
    if (context && context.state !== 'closed') void context.close()
  }
}
