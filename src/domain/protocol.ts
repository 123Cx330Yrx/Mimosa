export const MIMOSA_PROTOCOL_VERSION = 14 as const

export type MomentRole = 'unassigned' | 'waiting' | 'responding' | 'dismissed'
export type MomentTrigger = 'manual' | 'silence-detected'
export type ParticipantCue = 'NEED_TIME' | 'CHECKING' | 'SOCIAL_PRESSURE'
export type CareAction = 'WAIT' | 'OPEN_TO_ALL' | 'REFRAME' | 'DEFER' | 'RESOLVE'
export type EnvironmentState = 'calm' | 'sunlight' | 'watering' | 'cloudy'
export type PlantState = 'neutral' | 'growing' | 'closing' | 'paused' | 'open' | 'seed' | 'resolved'
export type MomentPhase = 'ROLE_CONFIRMATION' | 'SENSITIVE_SILENCE' | 'RELIEVED' | 'DEFERRED' | 'RESOLVED'
export type SilentMomentOutcome = 'DEFERRED' | 'RESOLVED'
export type CandidateCancellationReason = 'unclaimed' | 'speech-resumed' | 'coordinator-left'
export type SpeechActivitySource = 'local-vad' | 'manual'
export type ExperimentMarker = 'START' | 'END'

export interface PublicMomentSnapshot {
  id: string
  question: string
  coordinatorId: string
  waitingMemberId?: string
  trigger: MomentTrigger
  resumedFrom?: string
  candidateExpiresAt?: string
  phase: MomentPhase
  environments: EnvironmentState[]
  plant: PlantState
  publicFeedbacks: string[]
}

interface EnvelopeBase<TType extends string, TPayload> {
  app: 'mimosa'
  version: typeof MIMOSA_PROTOCOL_VERSION
  messageId: string
  roomId: string
  silentMomentId: string
  senderId: string
  sentAt: string
  type: TType
  payload: TPayload
}

export type MimosaEnvelope =
  | EnvelopeBase<'COORDINATOR_HELLO', {
      clientKey: string
    }>
  | EnvelopeBase<'OBSERVER_HELLO', {
      observerSessionId: string
    }>
  | EnvelopeBase<'SPEECH_ACTIVITY', {
      speaking: boolean
      observedAt: string
      source: SpeechActivitySource
    }>
  | EnvelopeBase<'SILENCE_CANDIDATE_CREATED', {
      question?: string
      detectedAt: string
      expiresAt: string
    }>
  | EnvelopeBase<'SILENCE_CANDIDATE_CANCELLED', {
      reason: CandidateCancellationReason
    }>
  | EnvelopeBase<'SILENCE_COORDINATOR_CHANGED', {
      expiresAt: string
    }>
  | EnvelopeBase<'SILENT_MOMENT_CREATED', {
      question: string
      resumedFrom?: string
      trigger: 'manual'
    }>
  | EnvelopeBase<'WAITING_ROLE_CLAIMED', { claimId: string; question?: string }>
  | EnvelopeBase<'WAITING_ROLE_ACCEPTED', { claimId: string; question: string }>
  | EnvelopeBase<'WAITING_ROLE_CONFIRMED', { claimId: string; question: string }>
  | EnvelopeBase<'PARTICIPANT_CUE', { cue: ParticipantCue; environment: EnvironmentState }>
  | EnvelopeBase<'PARTICIPANT_CUE_ACK', { cue: ParticipantCue }>
  | EnvelopeBase<'ENVIRONMENT_STATE', { environment: EnvironmentState; publicCue: string }>
  | EnvelopeBase<'OBSERVER_ROUND_SUMMARY', {
      responseCount: number
      cueCounts: Record<ParticipantCue, number>
    }>
  | EnvelopeBase<'CARE_ACTION', { action: CareAction; plant: PlantState; feedback: string }>
  | EnvelopeBase<'PLANT_CLOSING_STARTED', Record<string, never>>
  | EnvelopeBase<'MOMENT_ENDED', {
      outcome: SilentMomentOutcome
      question: string
    }>
  | EnvelopeBase<'STATE_REQUEST', Record<string, never>>
  | EnvelopeBase<'STATE_SNAPSHOT', PublicMomentSnapshot>
  | EnvelopeBase<'DEFERRED_STATE_REQUEST', Record<string, never>>
  | EnvelopeBase<'DEFERRED_STATE_SNAPSHOT', {
      moments: Array<{ id: string; question: string; ownerId: string }>
    }>
  | EnvelopeBase<'DEFERRED_MOMENT_REMOVED', {
      momentId: string
    }>
  | EnvelopeBase<'EXPERIMENT_MARKER', {
      marker: ExperimentMarker
      label?: string
    }>
  | EnvelopeBase<'OBSERVER_CANCEL_MOMENT', {
      reason: 'false-positive'
    }>
  | EnvelopeBase<'STUDY_LOG_REQUEST', {
      requestId: string
    }>
  | EnvelopeBase<'STUDY_LOG_RESPONSE_CHUNK', {
      requestId: string
      participantPseudonym: string
      sessionId: string
      chunkIndex: number
      chunkCount: number
      data: string
      generatedAt: string
    }>

export function createEnvelope<T extends MimosaEnvelope>(
  message: Omit<T, 'app' | 'version' | 'messageId' | 'sentAt'>,
): T {
  return {
    ...message,
    app: 'mimosa',
    version: MIMOSA_PROTOCOL_VERSION,
    messageId: crypto.randomUUID(),
    sentAt: new Date().toISOString(),
  } as T
}

export function parseEnvelope(value: string): MimosaEnvelope | null {
  try {
    const parsed = JSON.parse(value) as Partial<MimosaEnvelope>
    if (
      parsed.app !== 'mimosa' ||
      parsed.version !== MIMOSA_PROTOCOL_VERSION ||
      typeof parsed.messageId !== 'string' ||
      typeof parsed.senderId !== 'string' ||
      typeof parsed.type !== 'string'
    ) {
      return null
    }
    return parsed as MimosaEnvelope
  } catch {
    return null
  }
}

export function bindSnapshotToSender(
  snapshot: PublicMomentSnapshot,
  senderId: string,
): PublicMomentSnapshot {
  return snapshot.phase === 'ROLE_CONFIRMATION'
    ? snapshot
    : { ...snapshot, waitingMemberId: senderId }
}
