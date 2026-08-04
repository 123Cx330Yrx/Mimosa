import { describe, expect, it } from 'vitest'
import { deliverReliably, RELIABLE_DELIVERY_DELAYS_MS } from './reliableDelivery'

describe('deliverReliably', () => {
  it('delivers immediately and retries the same message three times', () => {
    const scheduled: Array<{ callback: () => void; delayMs: number }> = []
    let deliveries = 0

    deliverReliably(
      () => { deliveries += 1 },
      (callback, delayMs) => scheduled.push({ callback, delayMs }),
    )

    expect(deliveries).toBe(1)
    expect(scheduled.map(({ delayMs }) => delayMs)).toEqual(RELIABLE_DELIVERY_DELAYS_MS)
    for (const { callback } of scheduled) callback()
    expect(deliveries).toBe(4)
  })
})
