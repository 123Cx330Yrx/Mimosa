import type {
  SpeechActivitySample,
  SpeechActivitySensor,
  SpeechSignalSample,
  SpeechSensorStatus,
} from './SpeechActivitySensor'

const SAMPLE_INTERVAL_MS = 80
const SPEAKING_HEARTBEAT_MS = 1_200
const SIGNAL_UPDATE_MS = 240

export class AdaptiveVoiceActivityDetector {
  private noiseFloor = 0.004
  private speaking = false
  private aboveFrames = 0
  private belowFrames = 0

  update(rms: number) {
    const startThreshold = Math.max(0.009, this.noiseFloor * 2.35 + 0.0015)
    const stopThreshold = Math.max(0.006, this.noiseFloor * 1.55 + 0.0008)

    if (!this.speaking && rms < startThreshold) {
      this.noiseFloor = this.noiseFloor * 0.97 + rms * 0.03
    }

    if (rms >= (this.speaking ? stopThreshold : startThreshold)) {
      this.aboveFrames += 1
      this.belowFrames = 0
    } else {
      this.belowFrames += 1
      this.aboveFrames = 0
    }

    if (!this.speaking && this.aboveFrames >= 3) {
      this.speaking = true
      this.belowFrames = 0
    } else if (this.speaking && this.belowFrames >= 8) {
      this.speaking = false
      this.aboveFrames = 0
    }

    return this.speaking
  }
}

export class WebAudioSpeechActivitySensor implements SpeechActivitySensor {
  private status: SpeechSensorStatus = 'idle'
  private activityListeners = new Set<(sample: SpeechActivitySample) => void>()
  private signalListeners = new Set<(sample: SpeechSignalSample) => void>()
  private statusListeners = new Set<(status: SpeechSensorStatus, message?: string) => void>()
  private stream: MediaStream | null = null
  private context: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private timer: number | null = null
  private lastSpeaking = false
  private lastEmissionAt = 0
  private lastSignalAt = 0
  private detector = new AdaptiveVoiceActivityDetector()

  getStatus() {
    return this.status
  }

  onActivity(listener: (sample: SpeechActivitySample) => void) {
    this.activityListeners.add(listener)
    return () => this.activityListeners.delete(listener)
  }

  onSignal(listener: (sample: SpeechSignalSample) => void) {
    this.signalListeners.add(listener)
    return () => this.signalListeners.delete(listener)
  }

  onStatus(listener: (status: SpeechSensorStatus, message?: string) => void) {
    this.statusListeners.add(listener)
    listener(this.status)
    return () => this.statusListeners.delete(listener)
  }

  async start() {
    if (this.status === 'listening' || this.status === 'requesting') return
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      this.setStatus('unavailable', '当前浏览器不支持本地语音活动检测。')
      return
    }

    this.setStatus('requesting')
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
      this.context = new AudioContext()
      await this.context.resume()
      if (this.context.state !== 'running') {
        throw new Error(`AudioContext is ${this.context.state}`)
      }
      this.source = this.context.createMediaStreamSource(this.stream)
      this.analyser = this.context.createAnalyser()
      this.analyser.fftSize = 1024
      this.analyser.smoothingTimeConstant = 0.25
      this.source.connect(this.analyser)
      this.detector = new AdaptiveVoiceActivityDetector()
      this.setStatus('listening')
      this.timer = window.setInterval(() => this.sample(), SAMPLE_INTERVAL_MS)
    } catch (error) {
      const denied = error instanceof DOMException &&
        (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      this.setStatus(denied ? 'denied' : 'error', denied
        ? '麦克风权限未开启，仍可使用手动模拟进行实验。'
        : '麦克风活动检测未能启动，请刷新后重新授权，或使用手动模拟。')
      this.stopTracks()
    }
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer)
    this.timer = null
    this.stopTracks()
    this.source?.disconnect()
    this.source = null
    this.analyser = null
    if (this.context) void this.context.close()
    this.context = null
    this.lastSpeaking = false
    this.lastEmissionAt = 0
    this.lastSignalAt = 0
    this.setStatus('idle')
  }

  private sample() {
    if (!this.analyser) return
    const samples = new Float32Array(this.analyser.fftSize)
    this.analyser.getFloatTimeDomainData(samples)
    let energy = 0
    for (const sample of samples) energy += sample * sample
    const rms = Math.sqrt(energy / samples.length)
    const speaking = this.detector.update(rms)
    const now = Date.now()
    if (now - this.lastSignalAt >= SIGNAL_UPDATE_MS) {
      this.lastSignalAt = now
      const signal = { speaking, observedAt: now, rms }
      for (const listener of this.signalListeners) listener(signal)
    }
    const changed = speaking !== this.lastSpeaking
    const heartbeatDue = speaking && now - this.lastEmissionAt >= SPEAKING_HEARTBEAT_MS
    if (!changed && !heartbeatDue) return
    this.lastSpeaking = speaking
    this.lastEmissionAt = now
    const payload = { speaking, observedAt: now, rms }
    for (const listener of this.activityListeners) listener(payload)
  }

  private stopTracks() {
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    this.stream = null
  }

  private setStatus(status: SpeechSensorStatus, message?: string) {
    this.status = status
    for (const listener of this.statusListeners) listener(status, message)
  }
}
