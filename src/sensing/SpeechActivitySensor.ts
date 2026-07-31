export type SpeechSensorStatus = 'idle' | 'requesting' | 'listening' | 'denied' | 'unavailable' | 'error'

export interface SpeechActivitySample {
  speaking: boolean
  observedAt: number
  rms: number
}

export interface SpeechSignalSample {
  speaking: boolean
  observedAt: number
  rms: number
}

export interface SpeechActivitySensor {
  start(): Promise<void>
  stop(): void
  getStatus(): SpeechSensorStatus
  onActivity(listener: (sample: SpeechActivitySample) => void): () => void
  onSignal(listener: (sample: SpeechSignalSample) => void): () => void
  onStatus(listener: (status: SpeechSensorStatus, message?: string) => void): () => void
}
