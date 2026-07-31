import { describe, expect, it } from 'vitest'
import {
  clearStudyEvents,
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
})

