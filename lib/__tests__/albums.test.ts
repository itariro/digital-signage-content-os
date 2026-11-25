import { describe, it, expect } from 'vitest'
import { PRESENTATION_META, defaultSlideshow, themeMeta, THEME_META } from '../albums'
import { albumUpdateSchema } from '../schema'

describe('themeMeta', () => {
  it('returns the requested theme when known', () => {
    expect(themeMeta('music')).toBe(THEME_META.music)
  })

  it('exposes Map Art as a supported album type', () => {
    expect(THEME_META['map-art'].label).toBe('Map Art')
    expect(THEME_META['map-art'].searchable).toBe(false)
  })

  it('accepts Map Art configuration on album updates', () => {
    const city = { id: 1, name: 'Paris', lat: 48.8566, lon: 2.3522, country: 'France' }
    const mapArt = {
      mode: 'cities' as const,
      query: 'Paris, France',
      continent: 'Europe',
      count: '10',
      customCount: 10,
      cities: [city],
      results: [city],
      ambiguities: [],
      city,
      activeIndex: 0,
      styleId: 'classic' as const,
      title: true,
      showCoords: true,
      orientation: 'portrait' as const,
      zoom: 1,
      backgroundColor: '#f5f0e3',
      streetLabels: 'all' as const,
      showRailways: true,
      showTrails: true,
      customText: '',
    }
    const parsed = albumUpdateSchema.safeParse({
      name: 'Map Art',
      theme: 'map-art',
      items: [],
      mapArt,
      slideshow: {
        presentation: 'gallery',
        transition: 'slide',
        kenBurns: false,
        interval: 30,
        order: 'sequence',
        artSize: 74,
        artPosition: 'center',
        backdrop: 'blur',
        backdropColor: '#14161b',
      },
    })

    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.mapArt).toEqual(mapArt)
  })

  it('falls back for unknown themes instead of throwing', () => {
    expect(themeMeta('podcasts' as never)).toBe(THEME_META.photos)
    expect(themeMeta(undefined as never)).toBe(THEME_META.photos)
  })
})

describe('canvas album metadata', () => {
  it('has theme and presentation metadata', () => {
    expect(THEME_META.canvas.label).toBe('Canvas')
    expect(THEME_META.canvas.searchable).toBe(false)
    expect(PRESENTATION_META.canvas.label).toBe('Canvas')
  })

  it('defaults to the canvas presentation with no transition', () => {
    const slide = defaultSlideshow('canvas')
    expect(slide.presentation).toBe('canvas')
    expect(slide.transition).toBe('none')
    expect(slide.interval).toBe(30)
    expect(slide.canvas).toEqual({ crossfadeMs: 400 })
  })
})
