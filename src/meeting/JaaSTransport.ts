import { parseEnvelope, type MimosaEnvelope } from '../domain/protocol'
import type { MeetingParticipant, MeetingTransport } from './MeetingTransport'

interface JitsiApi {
  addListener(event: string, listener: (event: unknown) => void): void
  executeCommand(command: string, ...args: unknown[]): void
  getRoomsInfo(): Promise<{ rooms?: Array<{ isMainRoom?: boolean; participants?: MeetingParticipant[] }> }>
  isAudioMuted?(): Promise<boolean>
  dispose(): void
}

interface JitsiConstructor {
  new(domain: string, options: Record<string, unknown>): JitsiApi
}

declare global {
  interface Window {
    JitsiMeetExternalAPI?: JitsiConstructor
  }
}

export interface JaaSConfig {
  appId: string
  roomName: string
  displayName: string
  parentNode: HTMLElement
  jwt?: string
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function unwrapEndpointMessage(event: unknown) {
  const root = asRecord(event)
  const wrapped = asRecord(root.data ?? root.detail ?? root)
  const eventData = asRecord(root.eventData ?? wrapped.eventData ?? wrapped)
  const senderInfo = asRecord(root.senderInfo ?? wrapped.senderInfo ?? eventData.senderInfo)
  const textValue = eventData.text ?? root.text ?? wrapped.text ?? wrapped.message
  const text = readString(textValue) ?? readString(asRecord(textValue).text)
  const senderId = readString(senderInfo.id) ?? readString(wrapped.senderId)
  return { text, senderId }
}

export function upsertParticipantByEndpoint(
  participants: Map<string, MeetingParticipant>,
  participant: MeetingParticipant,
) {
  participants.set(participant.id, participant)
}

async function loadExternalApi(appId: string) {
  if (window.JitsiMeetExternalAPI) return
  const source = `https://8x8.vc/${encodeURIComponent(appId)}/external_api.js`
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = source
    script.async = true
    script.dataset.jitsiExternalApi = 'true'
    script.addEventListener('load', () => resolve(), { once: true })
    script.addEventListener('error', () => reject(new Error('JaaS 会议接口加载失败')), { once: true })
    document.head.append(script)
  })
}

export class JaaSTransport implements MeetingTransport {
  private readonly config: JaaSConfig
  private api: JitsiApi | null = null
  private localId: string | null = null
  private participants = new Map<string, MeetingParticipant>()
  private messageListeners = new Set<(message: MimosaEnvelope, senderId: string) => void>()
  private participantListeners = new Set<(participants: readonly MeetingParticipant[]) => void>()
  private dominantSpeakerListeners = new Set<(participantId: string) => void>()
  private localAudioMuteListeners = new Set<(muted: boolean) => void>()
  private participantRefreshTimers = new Set<number>()

  constructor(config: JaaSConfig) {
    this.config = config
  }

  async connect() {
    await loadExternalApi(this.config.appId)
    const Constructor = window.JitsiMeetExternalAPI
    if (!Constructor) throw new Error('JaaS 会议接口不可用')

    const roomName = `${this.config.appId}/${this.config.roomName}`
    const options: Record<string, unknown> = {
      roomName,
      parentNode: this.config.parentNode,
      width: '100%',
      height: '100%',
      userInfo: { displayName: this.config.displayName },
      configOverwrite: {
        prejoinConfig: { enabled: false },
        startWithAudioMuted: true,
        startWithVideoMuted: true,
      },
      interfaceConfigOverwrite: {
        MOBILE_APP_PROMO: false,
        SHOW_JITSI_WATERMARK: false,
      },
    }
    if (this.config.jwt) options.jwt = this.config.jwt

    this.config.parentNode.replaceChildren()
    this.api = new Constructor('8x8.vc', options)
    this.attachEvents()

    await new Promise<void>((resolve, reject) => {
      let settled = false
      const finish = (localId: string) => {
        if (settled) return
        settled = true
        this.localId = localId
        window.clearTimeout(timeout)
        window.clearInterval(poll)
        void this.refreshParticipants()
        resolve()
      }
      const timeout = window.setTimeout(() => {
        if (settled) return
        settled = true
        window.clearInterval(poll)
        reject(new Error('加入会议超时，请检查网络或 App ID'))
      }, 20_000)
      this.api?.addListener('videoConferenceJoined', (rawEvent) => {
        const id = readString(asRecord(rawEvent).id)
        if (id) finish(id)
      })
      // JaaS can render the room before the wrapper receives videoConferenceJoined.
      // Room polling is a narrow fallback for that event-order race, not a second source of state.
      const poll = window.setInterval(async () => {
        if (!this.api || settled) return
        try {
          const info = await this.api.getRoomsInfo()
          const room = info.rooms?.find((candidate) => candidate.isMainRoom) ?? info.rooms?.[0]
          const matchingParticipants = room?.participants?.filter((participant) => participant.displayName === this.config.displayName) ?? []
          // A duplicated display name is not a safe identity signal. Wait for the
          // authoritative videoConferenceJoined event instead of guessing.
          if (matchingParticipants.length === 1 && matchingParticipants[0].id) finish(matchingParticipants[0].id)
        } catch {
          // The room may not be queryable while its media connection is still starting.
        }
      }, 350)
    })
  }

  disconnect() {
    for (const timer of this.participantRefreshTimers) window.clearTimeout(timer)
    this.participantRefreshTimers.clear()
    this.api?.dispose()
    this.api = null
    this.localId = null
    this.participants.clear()
    this.emitParticipants()
  }

  getLocalParticipantId() { return this.localId }
  getParticipants() { return [...this.participants.values()] }

  sendTo(participantId: string, message: MimosaEnvelope) {
    this.api?.executeCommand('sendEndpointTextMessage', participantId, JSON.stringify(message))
  }

  broadcast(message: MimosaEnvelope) {
    for (const participant of this.participants.values()) {
      if (participant.id !== this.localId) this.sendTo(participant.id, message)
    }
  }

  onMessage(listener: (message: MimosaEnvelope, senderId: string) => void) {
    this.messageListeners.add(listener)
    return () => this.messageListeners.delete(listener)
  }

  onParticipantsChanged(listener: (participants: readonly MeetingParticipant[]) => void) {
    this.participantListeners.add(listener)
    listener(this.getParticipants())
    return () => this.participantListeners.delete(listener)
  }

  onDominantSpeakerChanged(listener: (participantId: string) => void) {
    this.dominantSpeakerListeners.add(listener)
    return () => this.dominantSpeakerListeners.delete(listener)
  }

  onLocalAudioMuteChanged(listener: (muted: boolean) => void) {
    this.localAudioMuteListeners.add(listener)
    return () => this.localAudioMuteListeners.delete(listener)
  }

  async getLocalAudioMuted() {
    try {
      return await this.api?.isAudioMuted?.() ?? true
    } catch {
      return true
    }
  }

  private attachEvents() {
    this.api?.addListener('participantJoined', (rawEvent) => {
      const event = asRecord(rawEvent)
      const id = readString(event.id)
      const displayName = readString(event.displayName)?.trim()
      if (!id || !displayName) return
      this.upsertParticipant({ id, displayName })
      this.emitParticipants()
      this.scheduleParticipantRefresh()
    })
    this.api?.addListener('participantLeft', (rawEvent) => {
      const id = readString(asRecord(rawEvent).id)
      if (id) this.participants.delete(id)
      this.emitParticipants()
      this.scheduleParticipantRefresh()
    })
    this.api?.addListener('dataChannelOpened', () => void this.refreshParticipants())
    this.api?.addListener('displayNameChange', (rawEvent) => {
      const event = asRecord(rawEvent)
      const id = readString(event.id)
      const displayName = (readString(event.displayname) ?? readString(event.displayName))?.trim()
      if (!id || !displayName) return
      this.upsertParticipant({ id, displayName })
      this.emitParticipants()
      this.scheduleParticipantRefresh()
    })
    this.api?.addListener('dominantSpeakerChanged', (rawEvent) => {
      const id = readString(asRecord(rawEvent).id)
      if (!id) return
      for (const listener of this.dominantSpeakerListeners) listener(id)
    })
    this.api?.addListener('audioMuteStatusChanged', (rawEvent) => {
      const muted = asRecord(rawEvent).muted
      if (typeof muted !== 'boolean') return
      for (const listener of this.localAudioMuteListeners) listener(muted)
    })
    this.api?.addListener('endpointTextMessageReceived', (event) => {
      const { text, senderId } = unwrapEndpointMessage(event)
      if (!text || !senderId) return
      const message = parseEnvelope(text)
      if (!message) return
      for (const listener of this.messageListeners) listener(message, senderId)
    })
  }

  private async refreshParticipants() {
    if (!this.api) return
    try {
      const roomInfo = await this.api.getRoomsInfo()
      const room = roomInfo.rooms?.find((candidate) => candidate.isMainRoom) ?? roomInfo.rooms?.[0]
      this.participants.clear()
      for (const participant of room?.participants ?? []) {
        const displayName = readString(participant.displayName)?.trim()
        if (participant.id && displayName) this.upsertParticipant({ id: participant.id, displayName })
      }
      if (this.localId && !this.participants.has(this.localId)) {
        this.upsertParticipant({ id: this.localId, displayName: this.config.displayName })
      }
      this.emitParticipants()
    } catch {
      // Join/leave events still keep the participant map usable if room info is temporarily unavailable.
    }
  }

  private scheduleParticipantRefresh() {
    for (const delay of [400, 1_400]) {
      const timer = window.setTimeout(() => {
        this.participantRefreshTimers.delete(timer)
        void this.refreshParticipants()
      }, delay)
      this.participantRefreshTimers.add(timer)
    }
  }

  private upsertParticipant(participant: MeetingParticipant) {
    upsertParticipantByEndpoint(this.participants, participant)
  }

  private emitParticipants() {
    const snapshot = this.getParticipants()
    for (const listener of this.participantListeners) listener(snapshot)
  }
}
