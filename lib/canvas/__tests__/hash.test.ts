import { describe, expect, it } from 'vitest'
import { defaultSlideshow } from '@/lib/albums'
import { canvasContentHash, deployedCanvasContentHash } from '@/lib/canvas/hash'
import type { Album, CanvasConfig, CanvasDeployment, CanvasScene, Layout } from '@/lib/types'

const createdAt = '2026-01-01T00:00:00.000Z'

const config: CanvasConfig = {
  arrangement: 'row',
  gap: 0,
  align: 'center',
  slots: [{ id: 'slot-a', frameId: 'frame-a', offset: { x: 0, y: 0 }, scale: 1 }],
  background: '#000000',
  markers: 'identify',
  notifications: 'suppress',
  nightMode: 'inherit',
  maxFps: 30,
}

const scene: CanvasScene = {
  id: 'scene-1',
  name: 'Check alignment',
  enabled: true,
  durationSec: 30,
  seed: 7,
  type: 'sync-test',
  config: { periodSec: 4, showGrid: true, showBezels: true },
}

const layout: Layout = {
  id: 'wall-1',
  name: 'Entrance wall',
  kind: 'canvas',
  canvas: config,
  widgets: [],
  settings: {
    resolution: '1080x1920',
    background: '',
    dim: 0,
    locationName: '',
    lat: 0,
    lon: 0,
    units: 'metric',
    snap: true,
    gridSize: 20,
    albumId: 'album-1',
  },
  createdAt,
  updatedAt: createdAt,
}

const album: Album = {
  id: 'album-1',
  name: 'Entrance album',
  theme: 'canvas',
  items: [],
  scenes: [scene],
  slideshow: { ...defaultSlideshow('canvas'), canvas: { crossfadeMs: 400 } },
  createdAt,
  updatedAt: createdAt,
}

function deploymentFrom(value: Layout, source: Album): CanvasDeployment {
  if (!value.canvas) throw new Error('layout has no canvas config')
  return {
    canvasId: value.id,
    name: value.name,
    revision: 1,
    effectiveAt: 1_000_000,
    releaseAt: null,
    slotId: 'slot-a',
    config: value.canvas,
    album: {
      id: source.id,
      name: source.name,
      scenes: source.scenes ?? [],
      order: source.slideshow.order,
      crossfadeMs: source.slideshow.canvas?.crossfadeMs ?? 0,
    },
  }
}

describe('canvasContentHash', () => {
  it('is deterministic and ignores key order', () => {
    expect(canvasContentHash(layout, album)).toBe(canvasContentHash(layout, album))
    expect(canvasContentHash(
      {
        ...layout,
        canvas: {
          align: config.align,
          arrangement: config.arrangement,
          background: config.background,
          gap: config.gap,
          markers: config.markers,
          maxFps: config.maxFps,
          nightMode: config.nightMode,
          notifications: config.notifications,
          slots: config.slots,
        } as CanvasConfig,
      },
      album,
    )).toBe(canvasContentHash(layout, album))
  })

  it('changes when a layout field used by the deployment changes', () => {
    const before = canvasContentHash(layout, album)
    const after = canvasContentHash({ ...layout, canvas: { ...config, gap: 120 } }, album)
    expect(after).not.toBe(before)
  })

  it('changes when an album field used by the deployment changes', () => {
    const before = canvasContentHash(layout, album)
    const changed: CanvasScene = {
      ...scene,
      config: { ...scene.config, periodSec: 8 },
    }
    const after = canvasContentHash(layout, { ...album, scenes: [changed] })
    expect(after).not.toBe(before)
  })

  it('distinguishes a missing album from an empty album reference', () => {
    const withAlbum = canvasContentHash(layout, album)
    const withoutAlbum = canvasContentHash(layout, null)
    expect(withoutAlbum).not.toBe(withAlbum)
  })

  it('matches a deployment made from the same library content', () => {
    const deployment = deploymentFrom(layout, album)
    expect(deployedCanvasContentHash(deployment)).toBe(canvasContentHash(layout, album))
  })

  it('does not report a false positive immediately after deploy', () => {
    const deployment = deploymentFrom(layout, album)
    expect(deployedCanvasContentHash(deployment) === canvasContentHash(layout, album)).toBe(true)
    const deployedAlbum = deployment.album
    if (!deployedAlbum) throw new Error('deployment has no album')
    const editedDeployment: CanvasDeployment = {
      ...deployment,
      album: { ...deployedAlbum, crossfadeMs: 900 },
    }
    expect(deployedCanvasContentHash(editedDeployment)).not.toBe(canvasContentHash(layout, album))
  })

  it('changes when composition options change', () => {
    const before = canvasContentHash(layout, album)
    const layered = {
      ...album,
      layers: [{ id: 'base', name: 'Base', enabled: true, scenes: [scene], order: 'sequence' as const, crossfadeMs: 400 }],
      transition: { kind: 'wipe' as const, durationMs: 600, direction: 'left' as const },
      paletteId: 'aurora' as const,
    }
    expect(canvasContentHash(layout, layered)).not.toBe(before)
  })
})
