import { describe, expect, it } from 'vitest'
import { estimate, sampleFrom, slewOffset, type ClockSample } from '@/lib/canvas/clock'

function sample(offsetMs: number, rttMs: number, at: number): ClockSample {
  return { at, rttMs, offsetMs }
}

describe('sampleFrom', () => {
  it('computes the offset with half the round trip', () => {
    expect(sampleFrom(1000, 1100, 2050)).toEqual({ at: 1100, rttMs: 100, offsetMs: 1000 })
  })

  it('drops negative and absurd round trips', () => {
    expect(sampleFrom(1100, 1000, 0)).toBeNull()
    expect(sampleFrom(0, 3001, 0)).toBeNull()
  })
})

describe('estimate', () => {
  it('returns null with no fresh samples', () => {
    expect(estimate([], 10_000)).toBeNull()
    expect(estimate([sample(0, 10, 0)], 200_000)).toBeNull()
  })

  it('chooses the minimum-RTT sample among the latest eight', () => {
    const samples = Array.from({ length: 10 }, (_, i) => sample(100 + i, 40 + i, 1_000 + i))
    const result = estimate(samples, 2_000)!
    expect(result.offsetMs).toBe(102)
    expect(result.uncertaintyMs).toBe(21)
    expect(result.quality).toBe('fair')
  })

  it('grades quality from uncertainty and jitter', () => {
    const good = estimate([sample(10, 20, 1_000), sample(10, 20, 1_100), sample(11, 20, 1_200), sample(10, 20, 1_300)], 2_000)!
    expect(good.quality).toBe('good')
    expect(good.jitterMs).toBeLessThan(10)

    const fair = estimate([sample(10, 80, 1_000)], 2_000)!
    expect(fair.quality).toBe('fair')
    expect(fair.uncertaintyMs).toBe(40)
  })

  it('drops samples older than 120 seconds', () => {
    const result = estimate([sample(1, 10, 0), sample(2, 10, 100_000)], 130_000)!
    expect(result.offsetMs).toBe(2)
  })
})

describe('slewOffset', () => {
  it('steps for large corrections', () => {
    expect(slewOffset(0, 300, 1_000)).toBe(300)
  })

  it('moves at the rate limit and never overshoots', () => {
    expect(slewOffset(0, 10, 1_000)).toBe(2)
    expect(slewOffset(0, 10, 6_000)).toBe(10)
    expect(slewOffset(0, -1, 250)).toBe(-0.5)
  })
})
