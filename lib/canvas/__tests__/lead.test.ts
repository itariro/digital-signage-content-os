import { describe, expect, it } from 'vitest'
import { leadMs, minLeadMs } from '@/lib/canvas/lead'

const env = { ...process.env }

describe('canvas lead', () => {
  it('uses a 15 s floor for frames that already have canvas state', () => {
    expect(minLeadMs([true, true], env)).toBe(15_000)
  })

  it('uses a 65 s floor when any frame is newly enrolled to canvas state', () => {
    expect(minLeadMs([true, false], env)).toBe(65_000)
    expect(minLeadMs([false], env)).toBe(65_000)
  })

  it('raises a short request to the floor and caps long requests at ten minutes', () => {
    expect(leadMs(1_000, [true], env)).toBe(15_000)
    expect(leadMs(undefined, [false], env)).toBe(65_000)
    expect(leadMs(999_999, [true], env)).toBe(600_000)
  })

  it('respects the phase 1 poll overrides', () => {
    const custom = { ...env, CANVAS_POLL_ACTIVE_SECONDS: '2', CANVAS_POLL_IDLE_SECONDS: '4' }
    expect(minLeadMs([true], custom)).toBe(9_000)
    expect(minLeadMs([false], custom)).toBe(13_000)
  })
})
