import { describe, expect, it } from 'vitest'
import { assembleLogTransferChunks, createLogTransferChunks } from './observerLogTransfer'

function createBundle(events: Array<{
  sequence: number
  at: string
  type: string
  details: Record<string, string>
}>, sessionId: string, generatedAt = '2026-07-25T00:01:00.000Z') {
  return {
    identity: { sessionId, participantPseudonym: `P-${sessionId}` },
    generatedAt,
    study: {
      schemaVersion: 2 as const,
      condition: 'mimosa' as const,
      roomName: 'group-a',
      protocolVersion: 14,
      settings: { roomSilenceThresholdMs: 8_000 },
    },
    snapshot: {
      localRole: 'unassigned',
      deferredMomentIds: [],
      deferredQuestionCount: 0,
      participantCount: 4,
      sensorStatus: 'listening',
      connection: 'connected',
    },
    events,
  }
}

describe('observer log transfer', () => {
  it('chunks and restores a participant log', () => {
    const events = Array.from({ length: 180 }, (_, index) => ({
      sequence: index + 1,
      at: '2026-07-25T00:00:00.000Z',
      type: 'sample_event',
      details: { note: `event-${index}-含羞草` },
    }))
    const bundle = createBundle(events, 'session-1')
    const chunks = createLogTransferChunks('request-1', bundle)

    expect(chunks.length).toBeGreaterThan(1)
    expect(assembleLogTransferChunks([...chunks].reverse())).toEqual(bundle)
  })

  it('rejects an incomplete transfer', () => {
    const chunks = createLogTransferChunks('request-2', createBundle(
      Array.from({ length: 200 }, (_, sequence) => ({
        sequence,
        at: '2026-07-25T00:00:00.000Z',
        type: 'sample_event',
        details: { payload: 'x'.repeat(100) },
      })),
      'session-2',
    ))
    expect(chunks.length).toBeGreaterThan(1)
    expect(assembleLogTransferChunks(chunks.slice(1))).toBeNull()
  })
})
