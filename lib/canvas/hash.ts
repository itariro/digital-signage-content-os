import { createHash } from 'node:crypto'
import { defaultSlideshow } from '@/lib/albums'
import { deploymentAlbumFrom } from '@/lib/canvas/composition'
import type { Album, CanvasAlbum, CanvasConfig, CanvasDeployment, DeploymentAlbum, Layout } from '@/lib/types'

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(source).sort()) result[key] = canonical(source[key])
    return result
  }
  return value
}

function digest(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex')
}

function normalizedAlbum(album: Album | DeploymentAlbum | null | undefined): DeploymentAlbum | null {
  if (!album) return null
  const canvas = album as CanvasAlbum & DeploymentAlbum
  const scenes = (canvas.scenes ?? []).filter((scene) => scene.enabled)
  const layers = canvas.layers?.map((layer) => ({
    ...layer,
    scenes: layer.scenes.filter((scene) => scene.enabled),
  })).filter((layer) => layer.scenes.length > 0)
  return deploymentAlbumFrom({
    ...canvas,
    theme: 'canvas',
    items: [],
    slideshow: {
      ...defaultSlideshow('canvas'),
      interval: 30,
      transition: 'none',
      presentation: 'canvas',
      order: canvas.order ?? 'sequence',
      canvas: { crossfadeMs: canvas.crossfadeMs ?? 400 },
    },
    scenes,
    layers,
    transition: canvas.transition,
    paletteId: (canvas as CanvasAlbum).paletteId ?? canvas.palette?.id,
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  } as CanvasAlbum)
}

function hashPayload(
  layout: { name: string; canvas: CanvasConfig | null; albumId: string | null },
  album: Album | DeploymentAlbum | null | undefined,
): string {
  return digest({ layout, album: normalizedAlbum(album) })
}

export function canvasContentHash(layout: Layout, album: Album | null | undefined): string {
  return hashPayload(
    {
      name: layout.name,
      canvas: layout.canvas ?? null,
      albumId: layout.settings.albumId ?? null,
    },
    album,
  )
}

export function deployedCanvasContentHash(deployment: CanvasDeployment): string {
  return hashPayload(
    {
      name: deployment.name,
      canvas: deployment.config,
      albumId: deployment.album?.id ?? null,
    },
    deployment.album ?? null,
  )
}
