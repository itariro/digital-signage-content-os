import { describe, it, expect, beforeEach } from 'vitest'
import { checkLimit, __limitsSize, __resetLimits, MAX_WINDOWS } from '../rate-limit'

beforeEach(() => { __resetLimits() })

describe('checkLimit', () => {
  it('allows up to max per window, then blocks', () => {
    let nowMs = 1_000_000
    const now = () => nowMs
    for (let i = 0; i < 10; i++) expect(checkLimit('ip1', 10, 60_000, now).allowed).toBe(true)
    const blocked = checkLimit('ip1', 10, 60_000, now)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterMs).toBeGreaterThan(0)
  })

  it('does not leak across keys', () => {
    const now = () => 1_000_000
    expect(checkLimit('a', 1, 60_000, now).allowed).toBe(true)
    expect(checkLimit('a', 1, 60_000, now).allowed).toBe(false)
    expect(checkLimit('b', 1, 60_000, now).allowed).toBe(true)
  })

  it('resets when the window rolls over', () => {
    let nowMs = 1_000_000
    const now = () => nowMs
    expect(checkLimit('ip', 1, 500, now).allowed).toBe(true)
    expect(checkLimit('ip', 1, 500, now).allowed).toBe(false)
    nowMs += 600
    expect(checkLimit('ip', 1, 500, now).allowed).toBe(true)
  })

  it('bounds the number of tracked windows', () => {
    const now = () => 2_000_000
    for (let i = 0; i < MAX_WINDOWS + 1; i++) checkLimit(`k${i}`, 1, 60_000, now)
    expect(__limitsSize()).toBeLessThanOrEqual(MAX_WINDOWS)
  })

  it('evicts the oldest window first when the map is full', () => {
    const now = () => 3_000_000
    checkLimit('oldest', 1, 60_000, now)
    for (let i = 0; i < MAX_WINDOWS - 1; i++) checkLimit(`k${i}`, 1, 60_000, now)
    expect(__limitsSize()).toBe(MAX_WINDOWS)
    checkLimit('trigger', 1, 60_000, now)
    expect(checkLimit('oldest', 1, 60_000, now).allowed).toBe(true)
  })
})
