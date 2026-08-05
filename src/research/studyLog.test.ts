import { describe, expect, it } from 'vitest'
import {
  clearStudyEvents,
  createStudyLogBundle,
  getOrCreateStudyIdentity,
  persistStudyEvents,
  readStudyEvents,
} from './studyLog'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

describe('study log persistence', () => {
  it('reuses one pseudonymous identity for the browser session', () => {
    const storage = new MemoryStorage()
    expect(getOrCreateStudyIdentity(storage)).toEqual(getOrCreateStudyIdentity(storage))
  })

  it('persists and clears structured events', () => {
    const storage = new MemoryStorage()
    const events = [{ sequence: 1, at: '2026-07-24T00:00:00.000Z', type: 'joined' }]
    persistStudyEvents(storage, 'session', events)
    expect(readStudyEvents(storage, 'session')).toEqual(events)
    clearStudyEvents(storage, 'session')
    expect(readStudyEvents(storage, 'session')).toEqual([])
  })

  it('adds a final export snapshot without mutating persisted events', () => {
    const events = [{ sequence: 4, at: '2026-08-05T00:00:00.000Z', type: 'joined' }]
    const bundle = createStudyLogBundle(
      { sessionId: 'session', participantPseudonym: 'P-test0001' },
      {
        schemaVersion: 2,
        condition: 'mimosa',
        roomName: 'group-a',
        protocolVersion: 14,
        settings: { roomSilenceThresholdMs: 8_000 },
      },
      {
        localRole: 'unassigned',
        deferredMomentIds: ['seed-a'],
        deferredQuestionCount: 1,
        participantCount: 4,
        sensorStatus: 'listening',
        connection: 'connected',
      },
      events,
      '2026-08-05T00:01:00.000Z',
    )

    expect(events).toHaveLength(1)
    expect(bundle.events.at(-1)).toMatchObject({
      sequence: 5,
      type: 'export_snapshot',
      details: { deferredQuestionCount: 1, participantCount: 4 },
    })
  })
})

