import { describe, expect, it } from 'vitest'
import { clamp, fold } from '@/lib/canvas/math'
import { hash01, hash32, sampleInt, seedFromString, seededPermutation } from '@/lib/canvas/prng'

describe('fold', () => {
  it('is a triangle wave with period 2 * range', () => {
    expect(fold(0, 10)).toBe(0)
    expect(fold(5, 10)).toBe(5)
    expect(fold(10, 10)).toBe(10)
    expect(fold(15, 10)).toBe(5)
    expect(fold(20, 10)).toBe(0)
    expect(fold(-5, 10)).toBe(5)
    expect(fold(-20, 10)).toBe(0)
  })

  it('returns 0 for a non-positive range', () => {
    expect(fold(3, 0)).toBe(0)
    expect(fold(3, -1)).toBe(0)
  })
})

describe('seeded permutation', () => {
  it('is a stable permutation for the same seed and round', () => {
    const a = seededPermutation(8, 1234, 3)
    const b = seededPermutation(8, 1234, 3)
    expect(a).toEqual(b)
    expect([...a].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  it('varies across rounds and seeds', () => {
    const a = seededPermutation(12, 1234, 0)
    const b = seededPermutation(12, 1234, 1)
    const c = seededPermutation(12, 999, 0)
    expect(a).not.toEqual(b)
    expect(a).not.toEqual(c)
  })
})

describe('hash helpers', () => {
  it('is deterministic and in range', () => {
    expect(hash01(42, 7)).toBe(hash01(42, 7))
    for (let k = 0; k < 100; k++) {
      const value = hash01(42, k)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
      expect(sampleInt(42, k, 3, 7)).toBeGreaterThanOrEqual(3)
      expect(sampleInt(42, k, 3, 7)).toBeLessThanOrEqual(7)
    }
    expect(seedFromString('abc')).toBe(seedFromString('abc'))
    expect(hash32(1)).toBe(hash32(1))
  })

  it('clamps', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-5, 0, 3)).toBe(0)
    expect(clamp(2, 0, 3)).toBe(2)
  })
})
