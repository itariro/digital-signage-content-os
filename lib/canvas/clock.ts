export type ClockSample = { at: number; rttMs: number; offsetMs: number }

export type ClockQuality = 'good' | 'fair' | 'poor'

export type ClockEstimate = {
  offsetMs: number
  uncertaintyMs: number
  jitterMs: number
  quality: ClockQuality
  sampledAt: number
}

const MAX_RTT_MS = 3000
const FRESH_MS = 120_000
const MAX_SAMPLES = 16
const RECENT = 8

/** `offsetMs` is console time minus local time. */
export function sampleFrom(t0: number, t1: number, serverTime: number): ClockSample | null {
  const rtt = t1 - t0
  if (!(rtt >= 0 && rtt <= MAX_RTT_MS)) return null
  return { at: t1, rttMs: rtt, offsetMs: serverTime + rtt / 2 - t1 }
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export function estimate(samples: ClockSample[], now: number): ClockEstimate | null {
  const fresh = samples
    .filter((sample) => Number.isFinite(sample.at) && Number.isFinite(sample.rttMs) && Number.isFinite(sample.offsetMs))
    .filter((sample) => now - sample.at <= FRESH_MS)
    .slice(-MAX_SAMPLES)
  if (fresh.length === 0) return null

  const recent = fresh.slice(-RECENT)
  const best = recent.reduce((winner, sample) => (sample.rttMs < winner.rttMs ? sample : winner), recent[0])
  const lowRtt = [...recent].sort((a, b) => a.rttMs - b.rttMs).slice(0, 4)
  const jitterMs = standardDeviation(lowRtt.map((sample) => sample.offsetMs))
  const uncertaintyMs = best.rttMs / 2
  const quality: ClockQuality =
    uncertaintyMs <= 15 && jitterMs <= 10 ? 'good' : uncertaintyMs <= 50 ? 'fair' : 'poor'

  return { offsetMs: best.offsetMs, uncertaintyMs, jitterMs, quality, sampledAt: best.at }
}

/**
 * Move the applied offset toward the target without a visible jump. A step
 * above the threshold is a genuine clock change; below it the correction is
 * spread over time at `maxRateMsPerSec`.
 */
export function slewOffset(applied: number, target: number, dtMs: number, maxRateMsPerSec = 2, stepThresholdMs = 250): number {
  const delta = target - applied
  if (Math.abs(delta) > stepThresholdMs) return target
  const maxStep = (maxRateMsPerSec * Math.max(0, dtMs)) / 1000
  if (Math.abs(delta) <= maxStep) return target
  return applied + Math.sign(delta) * maxStep
}
