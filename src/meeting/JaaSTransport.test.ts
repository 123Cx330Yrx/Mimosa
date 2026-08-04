import { describe, expect, it } from 'vitest'
import type { MeetingParticipant } from './MeetingTransport'
import { upsertParticipantByEndpoint } from './JaaSTransport'

describe('JaaS participant directory', () => {
  it('keeps different endpoints even when participants use the same display name', () => {
    const participants = new Map<string, MeetingParticipant>()
    upsertParticipantByEndpoint(participants, { id: 'endpoint-a', displayName: 'Participant' })
    upsertParticipantByEndpoint(participants, { id: 'endpoint-b', displayName: 'Participant' })
    upsertParticipantByEndpoint(participants, { id: 'endpoint-c', displayName: 'Participant' })
    upsertParticipantByEndpoint(participants, { id: 'endpoint-d', displayName: 'Participant' })

    expect([...participants.keys()]).toEqual([
      'endpoint-a',
      'endpoint-b',
      'endpoint-c',
      'endpoint-d',
    ])
  })

  it('updates one endpoint without deleting another endpoint', () => {
    const participants = new Map<string, MeetingParticipant>()
    upsertParticipantByEndpoint(participants, { id: 'endpoint-a', displayName: 'A' })
    upsertParticipantByEndpoint(participants, { id: 'endpoint-b', displayName: 'B' })
    upsertParticipantByEndpoint(participants, { id: 'endpoint-a', displayName: 'A renamed' })

    expect(participants).toHaveLength(2)
    expect(participants.get('endpoint-a')?.displayName).toBe('A renamed')
    expect(participants.get('endpoint-b')?.displayName).toBe('B')
  })
})
