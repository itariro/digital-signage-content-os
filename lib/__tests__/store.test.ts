import { describe, expect, it } from 'vitest'
import { normalize, seed } from '@/lib/store'
import { defaultSlideshow } from '@/lib/albums'

describe('normalize canvas albums', () => {
  it('forces canvas invariants and clamps crossfade', () => {
    const store = seed()
    store.albums.push({
      id: 'canvas-1',
      name: 'Wall',
      theme: 'canvas',
      items: [{ id: 'x', image: '/x.png', sourceUrl: '', title: 'x', subtitle: '', year: '' }],
      slideshow: { ...defaultSlideshow('canvas'), transition: 'fade', canvas: { crossfadeMs: 99_000 } },
      scenes: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    const out = normalize(store).albums.find((album) => album.id === 'canvas-1')!
    expect(out.items).toEqual([])
    expect(out.scenes).toEqual([])
    expect(out.slideshow.presentation).toBe('canvas')
    expect(out.slideshow.transition).toBe('none')
    expect(out.slideshow.canvas).toEqual({ crossfadeMs: 3000 })
  })

  it('leaves a canvas album with scenes intact', () => {
    const store = seed()
    const scene = { id: 's1', name: 'Test', enabled: true, durationSec: 30, seed: 1, type: 'sync-test' as const, config: { periodSec: 4, showGrid: true, showBezels: true } }
    store.albums.push({
      id: 'canvas-2',
      name: 'Wall',
      theme: 'canvas',
      items: [],
      scenes: [scene],
      slideshow: defaultSlideshow('canvas'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    const out = normalize(store).albums.find((album) => album.id === 'canvas-2')!
    expect(out.scenes).toEqual([scene])
  })
})
