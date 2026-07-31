export const ROOM_SILENCE_THRESHOLD_MS = 8_000
export const ROLE_CONFIRMATION_WINDOW_MS = 12_000
export const SPEECH_ACTIVITY_STALE_MS = 4_000
export const RECOVERY_SPEECH_CONFIRM_MS = 2_000

export interface ParticipantActivity {
  speaking: boolean
  observedAt: number
}

export interface CoordinatorCandidate {
  endpointId: string
  clientKey: string
}

export function electCoordinatorCandidate(
  candidates: readonly CoordinatorCandidate[],
) {
  return [...candidates].sort((a, b) =>
    a.clientKey.localeCompare(b.clientKey))[0] ?? null
}

export function electTechnicalCoordinator(
  localId: string | null,
  participantIds: readonly string[],
) {
  if (!localId) return null
  return [...new Set([...participantIds, localId])].sort((a, b) => a.localeCompare(b))[0] ?? localId
}

export function isRoomSpeaking(
  activity: ReadonlyMap<string, ParticipantActivity>,
  now: number,
) {
  for (const participant of activity.values()) {
    if (participant.speaking && now - participant.observedAt <= SPEECH_ACTIVITY_STALE_MS) {
      return true
    }
  }
  return false
}

export function pruneParticipantActivity(
  activity: ReadonlyMap<string, ParticipantActivity>,
  participantIds: readonly string[],
) {
  const allowed = new Set(participantIds)
  return new Map([...activity].filter(([participantId]) => allowed.has(participantId)))
}

export function remainingDelay(deadlineIso: string | undefined, now = Date.now()) {
  if (!deadlineIso) return 0
  const deadline = Date.parse(deadlineIso)
  return Number.isFinite(deadline) ? Math.max(0, deadline - now) : 0
}
