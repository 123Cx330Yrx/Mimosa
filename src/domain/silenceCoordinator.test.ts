import { describe, expect, it } from 'vitest'
import {
  electCoordinatorCandidate,
  electTechnicalCoordinator,
  isRoomSpeaking,
  pruneParticipantActivity,
  remainingDelay,
  SPEECH_ACTIVITY_STALE_MS,
} from './silenceCoordinator'

describe('silence coordinator helpers', () => {
  it('elects the same lowest endpoint independently of participant order', () => {
    expect(electTechnicalCoordinator('c', ['b', 'a', 'c'])).toBe('a')
    expect(electTechnicalCoordinator('a', ['c', 'b'])).toBe('a')
  })

  it('elects one coordinator across four clients by the portable client key', () => {
    const candidates = [
      { endpointId: 'endpoint-seen-as-d', clientKey: 'client-d' },
      { endpointId: 'endpoint-seen-as-b', clientKey: 'client-b' },
      { endpointId: 'endpoint-seen-as-a', clientKey: 'client-a' },
      { endpointId: 'endpoint-seen-as-c', clientKey: 'client-c' },
    ]
    expect(electCoordinatorCandidate(candidates)?.endpointId).toBe('endpoint-seen-as-a')
    expect(electCoordinatorCandidate(candidates.reverse())?.endpointId).toBe('endpoint-seen-as-a')
  })

  it('treats stale speaking heartbeats as inactive', () => {
    const activity = new Map([
      ['a', { speaking: true, observedAt: 1_000 }],
      ['b', { speaking: false, observedAt: 4_000 }],
    ])
    expect(isRoomSpeaking(activity, 1_000 + SPEECH_ACTIVITY_STALE_MS - 1)).toBe(true)
    expect(isRoomSpeaking(activity, 1_000 + SPEECH_ACTIVITY_STALE_MS + 1)).toBe(false)
  })

  it('prunes participants who left the room', () => {
    const activity = new Map([
      ['a', { speaking: true, observedAt: 1 }],
      ['b', { speaking: false, observedAt: 2 }],
    ])
    expect([...pruneParticipantActivity(activity, ['b']).keys()]).toEqual(['b'])
  })

  it('computes candidate window delay from its shared deadline', () => {
    expect(remainingDelay('2026-07-24T00:00:12.000Z', Date.parse('2026-07-24T00:00:05.000Z'))).toBe(7_000)
    expect(remainingDelay('2026-07-24T00:00:12.000Z', Date.parse('2026-07-24T00:00:13.000Z'))).toBe(0)
  })
})
