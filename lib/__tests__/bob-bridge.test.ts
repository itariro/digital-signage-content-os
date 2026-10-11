import { describe, it, expect } from 'vitest'
import { bobVariantFor } from '../bob-bridge'

describe('bobVariantFor', () => {
  it('maps celebration to success', () => {
    expect(bobVariantFor('celebration')).toBe('success')
  })

  it('maps reminder to reminder', () => {
    expect(bobVariantFor('reminder')).toBe('reminder')
  })

  it('maps action to warning', () => {
    expect(bobVariantFor('action')).toBe('warning')
  })

  it('maps every other display state to info', () => {
    for (const state of ['ambient', 'information', 'activity', 'gallery', 'weather', 'family'] as const) {
      expect(bobVariantFor(state)).toBe('info')
    }
  })
})
