import { beforeEach, describe, expect, it } from 'vitest'
import { sampleFrom } from '@/lib/canvas/clock'
import { getCanvasClock, recordClockSample, resetClockSamples } from '@/lib/canvas/clock-service'
import { getDisplayReport, recordDisplayReport, resetDisplayReport } from '@/lib/canvas/reporter'

describe('clock service', () => {
  beforeEach(() => resetClockSamples())

  it('reports the system clock until a sample arrives', () => {
    expect(getCanvasClock().source).toBe('system')
    recordClockSample(sampleFrom(1_000, 1_100, 1_050))
    const clock = getCanvasClock(2_000)
    expect(clock.source).toBe('console')
    expect(clock.sampledAt).not.toBeNull()
    expect(Number.isFinite(clock.offsetMs)).toBe(true)
  })

  it('ignores null samples', () => {
    recordClockSample(null)
    expect(getCanvasClock().source).toBe('system')
  })
})

describe('display reporter', () => {
  beforeEach(() => resetDisplayReport())

  it('keeps the last report per instance', () => {
    expect(getDisplayReport('frame-a')).toBeNull()
    recordDisplayReport('frame-a', { appliedRevision: 4, viewportW: 1080, viewportH: 1920, fpsAvg: 29.5 })
    expect(getDisplayReport('frame-a')).toEqual({ appliedRevision: 4, viewportW: 1080, viewportH: 1920, fpsAvg: 29.5 })
    expect(getDisplayReport('frame-b')).toBeNull()
  })
})
