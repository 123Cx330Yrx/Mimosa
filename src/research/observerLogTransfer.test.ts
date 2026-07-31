import { describe, expect, it } from 'vitest'
import { assembleLogTransferChunks, createLogTransferChunks } from './observerLogTransfer'

describe('observer log transfer', () => {
  it('chunks and restores a participant log', () => {
    const events = Array.from({ length: 180 }, (_, index) => ({
      sequence: index + 1,
      at: '2026-07-25T00:00:00.000Z',
      type: 'sample_event',
      details: { note: `event-${index}-含羞草` },
    }))
    const chunks = createLogTransferChunks(
      'request-1',
      { sessionId: 'session-1', participantPseudonym: 'P-test0001' },
      events,
      '2026-07-25T00:01:00.000Z',
    )

    expect(chunks.length).toBeGreaterThan(1)
    expect(assembleLogTransferChunks([...chunks].reverse())).toEqual({
      identity: { sessionId: 'session-1', participantPseudonym: 'P-test0001' },
      generatedAt: '2026-07-25T00:01:00.000Z',
      events,
    })
  })

  it('rejects an incomplete transfer', () => {
    const chunks = createLogTransferChunks(
      'request-2',
      { sessionId: 'session-2', participantPseudonym: 'P-test0002' },
      Array.from({ length: 200 }, (_, sequence) => ({
        sequence,
        at: '2026-07-25T00:00:00.000Z',
        type: 'sample_event',
        details: { payload: 'x'.repeat(100) },
      })),
    )
    expect(chunks.length).toBeGreaterThan(1)
    expect(assembleLogTransferChunks(chunks.slice(1))).toBeNull()
  })
})
