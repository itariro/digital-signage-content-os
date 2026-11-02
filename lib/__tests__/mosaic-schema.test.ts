import { describe, it, expect } from 'vitest'
import { slideshowSchema, albumUpdateSchema } from '../schema'
import { normalize } from '../store'

describe('mosaic schema', () => {
  it('legacy slideshow without mosaic validates', () => {
    const s = {
      presentation: 'fill',
      transition: 'fade',
      kenBurns: false,
      interval: 20,
      order: 'sequence',
      artSize: 74,
      artPosition: 'center',
      backdrop: 'blur',
      backdropColor: '#14161b',
    }
    expect(slideshowSchema.safeParse(s).success).toBe(true)
  })
  it('mosaic presentation with mosaic validates', () => {
    const s = {
      presentation: 'mosaic',
      transition: 'none',
      kenBurns: false,
      interval: 25,
      order: 'sequence',
      artSize: 74,
      artPosition: 'center',
      backdrop: 'solid',
      backdropColor: '#14161b',
      mosaic: { tilesAcross: 4, gap: 2, effect: 'flip' },
    }
    expect(slideshowSchema.safeParse(s).success).toBe(true)
  })
  it('mosaic presentation without mosaic validates', () => {
    const s = {
      presentation: 'mosaic',
      transition: 'none',
      kenBurns: false,
      interval: 25,
      order: 'sequence',
      artSize: 74,
      artPosition: 'center',
      backdrop: 'solid',
      backdropColor: '#14161b',
    }
    expect(slideshowSchema.safeParse(s).success).toBe(true)
  })
  it('out-of-range tilesAcross rejected', () => {
    const s = {
      presentation: 'mosaic',
      transition: 'none',
      kenBurns: false,
      interval: 25,
      order: 'sequence',
      artSize: 74,
      artPosition: 'center',
      backdrop: 'solid',
      backdropColor: '#14161b',
      mosaic: { tilesAcross: 1, gap: 2, effect: 'flip' },
    }
    expect(slideshowSchema.safeParse(s).success).toBe(false)
  })
  it('out-of-range gap rejected', () => {
    const s = {
      presentation: 'mosaic',
      transition: 'none',
      kenBurns: false,
      interval: 25,
      order: 'sequence',
      artSize: 74,
      artPosition: 'center',
      backdrop: 'solid',
      backdropColor: '#14161b',
      mosaic: { tilesAcross: 4, gap: 99, effect: 'flip' },
    }
    expect(slideshowSchema.safeParse(s).success).toBe(false)
  })
  it('invalid effect rejected', () => {
    const s = {
      presentation: 'mosaic',
      transition: 'none',
      kenBurns: false,
      interval: 25,
      order: 'sequence',
      artSize: 74,
      artPosition: 'center',
      backdrop: 'solid',
      backdropColor: '#14161b',
      mosaic: { tilesAcross: 4, gap: 2, effect: 'spin' },
    }
    expect(slideshowSchema.safeParse(s).success).toBe(false)
  })
  it('albumUpdateSchema accepts mosaic', () => {
    const album = {
      name: 'Test',
      theme: 'music',
      items: [],
      slideshow: {
        presentation: 'mosaic',
        transition: 'none',
        kenBurns: false,
        interval: 25,
        order: 'sequence',
        artSize: 74,
        artPosition: 'center',
        backdrop: 'solid',
        backdropColor: '#14161b',
        mosaic: { tilesAcross: 4, gap: 2, effect: 'flip' },
      },
    }
    expect(albumUpdateSchema.safeParse(album).success).toBe(true)
  })
  it('normalize repairs out-of-range mosaic', () => {
    const store = {
      activeId: 'l1',
      layouts: [{ id: 'l1', name: 'Test', widgets: [], settings: { resolution: '1080x1920', background: '', dim: 0, locationName: '', lat: 0, lon: 0, units: 'metric', snap: false, gridSize: 20, albumId: null }, createdAt: '', updatedAt: '' }],
      schedule: { enabled: false, rules: [] },
      albums: [
        {
          id: 'a1',
          name: 'M',
          theme: 'music',
          items: [],
          slideshow: {
            presentation: 'mosaic',
            transition: 'none',
            kenBurns: false,
            interval: 10000,
            order: 'sequence',
            artSize: 74,
            artPosition: 'center',
            backdrop: 'blur',
            backdropColor: '#14161b',
            mosaic: { tilesAcross: 1, gap: 99, effect: 'spin' },
          },
          createdAt: '',
          updatedAt: '',
        },
      ],
    } as any
    const result = normalize(store)
    const show = result.albums[0].slideshow
    expect(show.presentation).toBe('mosaic')
    expect(show.mosaic?.tilesAcross).toBeGreaterThanOrEqual(2)
    expect(show.mosaic?.tilesAcross).toBeLessThanOrEqual(10)
    expect(show.mosaic?.gap).toBeGreaterThanOrEqual(0)
    expect(show.mosaic?.gap).toBeLessThanOrEqual(12)
    expect(['flip', 'fade', 'zoom', 'none']).toContain(show.mosaic?.effect)
    expect(show.backdrop).toBe('solid')
  })
  it('normalize leaves non-mosaic albums untouched', () => {
    const store = {
      activeId: 'l1',
      layouts: [{ id: 'l1', name: 'Test', widgets: [], settings: { resolution: '1080x1920', background: '', dim: 0, locationName: '', lat: 0, lon: 0, units: 'metric', snap: false, gridSize: 20, albumId: null }, createdAt: '', updatedAt: '' }],
      schedule: { enabled: false, rules: [] },
      albums: [
        {
          id: 'a1',
          name: 'P',
          theme: 'photos',
          items: [],
          slideshow: {
            presentation: 'fill',
            transition: 'fade',
            kenBurns: true,
            interval: 20,
            order: 'sequence',
            artSize: 74,
            artPosition: 'center',
            backdrop: 'blur',
            backdropColor: '#14161b',
          },
          createdAt: '',
          updatedAt: '',
        },
      ],
    } as any
    const result = normalize(store)
    expect(result.albums[0].slideshow.presentation).toBe('fill')
    expect(result.albums[0].slideshow.mosaic).toBeUndefined()
  })
})