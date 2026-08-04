import { describe, expect, it } from 'vitest'
import { createEnvelope, MIMOSA_PROTOCOL_VERSION, parseEnvelope } from './protocol'

describe('Mimosa protocol compatibility', () => {
  it('keeps waiting-role confirmation on the established v14 channel', () => {
    const message = createEnvelope({
      roomId: 'app/group-a',
      silentMomentId: 'moment-a',
      senderId: 'participant-a',
      type: 'WAITING_ROLE_CONFIRMED',
      payload: {
        claimId: 'claim-a',
        question: 'What should we do next?',
      },
    })

    expect(MIMOSA_PROTOCOL_VERSION).toBe(14)
    expect(parseEnvelope(JSON.stringify(message))).toEqual(message)
  })

  it('carries baseline notices without requiring a new protocol version', () => {
    const message = createEnvelope({
      roomId: 'app/group-a',
      silentMomentId: 'baseline-a',
      senderId: 'coordinator-a',
      type: 'BASELINE_SILENCE_NOTICE',
      payload: {
        detectedAt: '2026-08-04T00:00:00.000Z',
        visibleForMs: 5_000,
      },
    })

    expect(parseEnvelope(JSON.stringify(message))).toEqual(message)
  })
})
