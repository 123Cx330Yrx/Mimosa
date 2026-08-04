/** Plays the baseline condition's non-interactive silence reminder. */
export class BaselineNotification {
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
          // The five-second visual notice remains available when audio cannot load.
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
    gain.gain.setValueAtTime(1.15, context.currentTime)
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
