import type { MimosaEnvelope } from '../domain/protocol'

export interface MeetingParticipant {
  id: string
  displayName: string
}

export interface MeetingTransport {
  connect(): Promise<void>
  disconnect(): void
  getLocalParticipantId(): string | null
  getParticipants(): readonly MeetingParticipant[]
  sendTo(participantId: string, message: MimosaEnvelope): void
  broadcast(message: MimosaEnvelope): void
  onMessage(listener: (message: MimosaEnvelope, senderId: string) => void): () => void
  onParticipantsChanged(listener: (participants: readonly MeetingParticipant[]) => void): () => void
  onDominantSpeakerChanged(listener: (participantId: string) => void): () => void
  onLocalAudioMuteChanged(listener: (muted: boolean) => void): () => void
  getLocalAudioMuted(): Promise<boolean>
}
