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

