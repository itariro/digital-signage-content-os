import { describe, it, expect } from 'vitest'
import { themeMeta, THEME_META } from '../albums'

describe('themeMeta', () => {
  it('returns the requested theme when known', () => {
    expect(themeMeta('music')).toBe(THEME_META.music)
  })

  it('falls back for unknown themes instead of throwing', () => {
    expect(themeMeta('podcasts' as never)).toBe(THEME_META.photos)
    expect(themeMeta(undefined as never)).toBe(THEME_META.photos)
  })
})
