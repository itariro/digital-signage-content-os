import { describe, it, expect } from 'vitest'
import { albumUpdateSchema, slideshowSchema, subjectSchema } from '../schema'
import { normalize } from '../store'

const revealSlideshow = {
  presentation: 'reveal',
  transition: 'none',
  kenBurns: false,
  interval: 25,
  order: 'sequence',
  artSize: 74,
  artPosition: 'center',
  backdrop: 'solid',
  backdropColor: '#14161b',
  reveal: { tilesAcross: 6, tilesDown: 5, gap: 2, group: 'single', effect: 'fade' },
}

const legacySlideshow = {
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

describe('reveal schema', () => {
  it('legacy slideshow without reveal validates', () => {
    expect(slideshowSchema.safeParse(legacySlideshow).success).toBe(true)
  })

  it('reveal presentation with reveal config validates', () => {
    expect(slideshowSchema.safeParse(revealSlideshow).success).toBe(true)
  })

  it('reveal presentation without reveal config validates (engine defaults apply)', () => {
    expect(slideshowSchema.safeParse({ ...revealSlideshow, reveal: undefined }).success).toBe(true)
  })

  it('out-of-range tiles rejected', () => {
    for (const patch of [{ tilesAcross: 1 }, { tilesDown: 11 }, { tilesAcross: 2.5 }]) {
      const parsed = slideshowSchema.safeParse({ ...revealSlideshow, reveal: { ...revealSlideshow.reveal, ...patch } })
      expect(parsed.success).toBe(false)
    }
  })

  it('out-of-range gap rejected', () => {
    const parsed = slideshowSchema.safeParse({ ...revealSlideshow, reveal: { ...revealSlideshow.reveal, gap: 99 } })
    expect(parsed.success).toBe(false)
  })

  it('invalid group and effect rejected', () => {
    expect(slideshowSchema.safeParse({ ...revealSlideshow, reveal: { ...revealSlideshow.reveal, group: 'spiral' } }).success).toBe(false)
    expect(slideshowSchema.safeParse({ ...revealSlideshow, reveal: { ...revealSlideshow.reveal, effect: 'explode' } }).success).toBe(false)
  })
})

describe('subject schema', () => {
  const validSubject = {
    name: 'Ada Lovelace',
    type: 'search',
    image: '/api/media/abc.jpg',
    sourceUrl: 'https://upload.wikimedia.org/x.jpg',
    imagePosition: 'center',
  }

  it('valid subject validates', () => {
    expect(subjectSchema.safeParse(validSubject).success).toBe(true)
  })

  it('non-http image rejected', () => {
    expect(subjectSchema.safeParse({ ...validSubject, image: 'ftp://x/y.jpg' }).success).toBe(false)
    expect(subjectSchema.safeParse({ ...validSubject, image: 'http://insecure/y.jpg' }).success).toBe(false)
  })

  it('invalid imagePosition rejected', () => {
    expect(subjectSchema.safeParse({ ...validSubject, imagePosition: 'left' }).success).toBe(false)
  })

  it('albumUpdateSchema accepts reveal + subject and preserves absent subject keys', () => {
    const album = { name: 'Portraits', theme: 'photos', items: [], slideshow: revealSlideshow, subject: validSubject }
    const parsed = albumUpdateSchema.safeParse(album)
    expect(parsed.success).toBe(true)

    // A debounced PUT without subject must not clobber an existing portrait.
    const withoutSubject = { name: 'Portraits', theme: 'photos', items: [], slideshow: revealSlideshow }
    const stripped = albumUpdateSchema.safeParse(withoutSubject)
    expect(stripped.success).toBe(true)
    if (stripped.success) expect('subject' in stripped.data).toBe(false)

    // null clears it.
    const cleared = albumUpdateSchema.safeParse({ ...withoutSubject, subject: null })
    expect(cleared.success).toBe(true)
    if (cleared.success) expect(cleared.data.subject).toBeNull()
  })
})

describe('normalize reveal repair', () => {
  const makeStore = (slideshow: Record<string, unknown>) => ({
    activeId: 'l1',
    layouts: [{ id: 'l1', name: 'T', widgets: [], settings: { resolution: '1080x1920', background: '', dim: 0, locationName: '', lat: 0, lon: 0, units: 'metric', snap: false, gridSize: 20, albumId: null }, createdAt: '', updatedAt: '' }],
    schedule: { enabled: false, rules: [] },
    albums: [
      { id: 'a1', name: 'R', theme: 'photos', items: [], slideshow, createdAt: '', updatedAt: '' },
    ],
  })

  it('repairs out-of-range reveal config', () => {
    const store = makeStore({
      ...revealSlideshow,
      reveal: { tilesAcross: 99, tilesDown: 0, gap: -3, group: 'spiral', effect: 'explode' },
    }) as never
    const result = normalize(store)
    const reveal = result.albums[0].slideshow.reveal
    expect(reveal?.tilesAcross).toBeGreaterThanOrEqual(2)
    expect(reveal?.tilesAcross).toBeLessThanOrEqual(10)
    expect(reveal?.tilesDown).toBeGreaterThanOrEqual(2)
    expect(reveal?.tilesDown).toBeLessThanOrEqual(10)
    expect(reveal?.gap).toBeGreaterThanOrEqual(0)
    expect(reveal?.gap).toBeLessThanOrEqual(12)
    expect(['single', 'pair', 'quad', 'row']).toContain(reveal?.group)
    expect(['fade', 'none']).toContain(reveal?.effect)
  })

  it('supplies defaults for a reveal album missing config', () => {
    const store = makeStore(revealSlideshow as unknown as Record<string, unknown>) as never
    const result = normalize(store)
    expect(result.albums[0].slideshow.reveal).toEqual({
      tilesAcross: 6,
      tilesDown: 5,
      gap: 2,
      group: 'single',
      effect: 'fade',
    })
  })

  it('leaves non-reveal albums untouched', () => {
    const store = makeStore(legacySlideshow) as never
    const result = normalize(store)
    expect(result.albums[0].slideshow.presentation).toBe('fill')
    expect(result.albums[0].slideshow.reveal).toBeUndefined()
  })

  it('passes subject through normalization untouched', () => {
    const subject = { name: 'Frida', type: 'upload', image: '/api/media/f.jpg', sourceUrl: '', imagePosition: 'top' }
    const withSubject = { ...makeStore(revealSlideshow), albums: [{ id: 'a1', name: 'R', theme: 'photos', items: [], slideshow: revealSlideshow, subject, createdAt: '', updatedAt: '' }] } as never
    const result = normalize(withSubject)
    expect(result.albums[0].subject).toEqual(subject)
  })
})
