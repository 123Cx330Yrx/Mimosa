import type { StudyCondition } from '../domain/studyCondition'

export const STUDY_LOG_SCHEMA_VERSION = 2 as const

export interface StudyIdentity {
  sessionId: string
  participantPseudonym: string
}

export interface StudyEvent {
  sequence: number
  at: string
  type: string
  momentId?: string
  details?: Record<string, unknown>
}

export interface StudyLogMetadata {
  schemaVersion: typeof STUDY_LOG_SCHEMA_VERSION
  condition: StudyCondition
  roomName: string
  protocolVersion: number
  settings: Record<string, string | number | boolean | null>
}

export interface StudyExportSnapshot {
  activeMomentId?: string
  activeMomentPhase?: string
  localRole: string
  deferredMomentIds: string[]
  deferredQuestionCount: number
  participantCount: number
  sensorStatus: string
  connection: string
}

export interface StudyLogBundle {
  identity: StudyIdentity
  generatedAt: string
  study: StudyLogMetadata
  snapshot: StudyExportSnapshot
  events: readonly StudyEvent[]
}

const IDENTITY_KEY = 'mimosa:study-identity'

export function getOrCreateStudyIdentity(storage: Storage): StudyIdentity {
  try {
    const existing = storage.getItem(IDENTITY_KEY)
    if (existing) {
      const parsed = JSON.parse(existing) as Partial<StudyIdentity>
      if (parsed.sessionId && parsed.participantPseudonym) return parsed as StudyIdentity
    }
  } catch {
    // A fresh in-memory identity is still sufficient when storage is unavailable.
  }
  const identity = {
    sessionId: crypto.randomUUID(),
    participantPseudonym: `P-${crypto.randomUUID().slice(0, 8)}`,
  }
  try {
    storage.setItem(IDENTITY_KEY, JSON.stringify(identity))
  } catch {
    // Private browsing can disable storage; logging continues in React state.
  }
  return identity
}

export function studyEventStorageKey(sessionId: string) {
  return `mimosa:study-events:${sessionId}`
}

export function readStudyEvents(storage: Storage, sessionId: string): StudyEvent[] {
  try {
    const raw = storage.getItem(studyEventStorageKey(sessionId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function persistStudyEvents(
  storage: Storage,
  sessionId: string,
  events: readonly StudyEvent[],
) {
  try {
    storage.setItem(studyEventStorageKey(sessionId), JSON.stringify(events))
  } catch {
    // Logging remains available for export from current React state.
  }
}

export function clearStudyEvents(storage: Storage, sessionId: string) {
  try {
    storage.removeItem(studyEventStorageKey(sessionId))
  } catch {
    // Ignore unavailable storage.
  }
}

export function createStudyLogBundle(
  identity: StudyIdentity,
  study: StudyLogMetadata,
  snapshot: StudyExportSnapshot,
  events: readonly StudyEvent[],
  generatedAt = new Date().toISOString(),
): StudyLogBundle {
  const nextSequence = events.reduce(
    (highest, event) => Math.max(highest, event.sequence),
    0,
  ) + 1
  const snapshotEvent: StudyEvent = {
    sequence: nextSequence,
    at: generatedAt,
    type: 'export_snapshot',
    momentId: snapshot.activeMomentId,
    details: { ...snapshot },
  }
  return {
    identity,
    generatedAt,
    study,
    snapshot,
    events: [...events, snapshotEvent],
  }
}

