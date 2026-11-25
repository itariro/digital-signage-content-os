import { describe, expect, it } from 'vitest'
import { fitScale } from '@/lib/canvas/stage'

describe('fitScale', () => {
  it('fits a slot inside the viewport without cropping', () => {
    expect(fitScale(1080, 1920, 1080, 1920)).toBe(1)
    expect(fitScale(1080, 1920, 1920, 1080)).toBe(0.5625)
    expect(fitScale(540, 960, 1080, 1920)).toBe(2)
  })

  it('returns zero before the viewport is known', () => {
    expect(fitScale(1080, 1920, 0, 0)).toBe(0)
    expect(fitScale(0, 1920, 1080, 1920)).toBe(0)
  })
})
