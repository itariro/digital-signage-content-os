import { describe, it, expect } from 'vitest'
import { checkLimit } from '../rate-limit'

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
})
