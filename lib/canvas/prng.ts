import { hash01 } from '@/lib/mosaic'

export { hash01, seedFromString } from '@/lib/mosaic'

export function hash32(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return (t ^ (t >>> 14)) >>> 0
}

/** Stable Fisher-Yates permutation for an (n, seed, round) triple. */
export function seededPermutation(n: number, seed: number, round: number): number[] {
  const order = Array.from({ length: Math.max(0, n) }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const value = hash01(seed, round * 997 + i * 31 + 7)
    const j = Math.floor(value * (i + 1))
    const tmp = order[i]
    order[i] = order[j]
    order[j] = tmp
  }
  return order
}

export function sampleInt(seed: number, k: number, min: number, max: number): number {
  if (max < min) return min
  const value = Math.floor(hash01(seed, k) * (max - min + 1))
  return Math.min(max, min + value)
}

export function pickIndex(seed: number, k: number, length: number): number {
  if (length <= 0) return 0
  return Math.min(length - 1, Math.floor(hash01(seed, k) * length))
}
