export const RELIABLE_DELIVERY_DELAYS_MS = [450, 1_250, 2_600] as const

type Schedule = (callback: () => void, delayMs: number) => unknown

export function deliverReliably(
  deliver: () => void,
  schedule: Schedule = (callback, delayMs) => window.setTimeout(callback, delayMs),
) {
  deliver()
  for (const delayMs of RELIABLE_DELIVERY_DELAYS_MS) schedule(deliver, delayMs)
}
