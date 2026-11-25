/** Triangle wave: maps u onto [0, range], reflecting at both ends. */
export function fold(u: number, range: number): number {
  if (!(range > 0)) return 0
  const period = 2 * range
  const m = ((u % period) + period) % period
  return m <= range ? m : period - m
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
