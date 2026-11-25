import { estimate, SYSTEM_CLOCK, type CanvasClock, type ClockSample } from './clock'

export { SYSTEM_CLOCK } from './clock'

const samples: ClockSample[] = []
const MAX_SAMPLES = 16

export function recordClockSample(sample: ClockSample | null): void {
  if (!sample) return
  samples.push(sample)
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES)
}

export function getCanvasClock(now = Date.now()): CanvasClock {
  const result = estimate(samples, now)
  if (!result) return SYSTEM_CLOCK
  return {
    offsetMs: result.offsetMs,
    uncertaintyMs: result.uncertaintyMs,
    quality: result.quality,
    source: 'console',
    sampledAt: result.sampledAt,
  }
}

export function resetClockSamples(): void {
  samples.length = 0
}
