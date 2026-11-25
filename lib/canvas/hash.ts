import { createHash } from 'node:crypto'
import type { Album, CanvasConfig, CanvasDeployment, Layout } from '@/lib/types'

type HashAlbum = {
  id: string
  name: string
  scenes: unknown[]
  order: string
  crossfadeMs: number
} | null

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

function hashAlbum(album: HashAlbum): HashAlbum {
  if (!album) return null
  return {
    id: album.id,
    name: album.name,
    scenes: album.scenes,
    order: album.order,
    crossfadeMs: album.crossfadeMs,
  }
}

function hashPayload(
  layout: { name: string; canvas: CanvasConfig | null; albumId: string | null },
  album: HashAlbum,
): string {
  return digest({ layout, album: hashAlbum(album) })
}

export function canvasContentHash(layout: Layout, album: Album | null | undefined): string {
  return hashPayload(
    {
      name: layout.name,
      canvas: layout.canvas ?? null,
      albumId: layout.settings.albumId ?? null,
    },
    album
      ? {
          id: album.id,
          name: album.name,
          scenes: album.scenes ?? [],
          order: album.slideshow.order,
          crossfadeMs: album.slideshow.canvas?.crossfadeMs ?? 0,
        }
      : null,
  )
}

export function deployedCanvasContentHash(deployment: CanvasDeployment): string {
  return hashPayload(
    {
      name: deployment.name,
      canvas: deployment.config,
      albumId: deployment.album?.id ?? null,
    },
    deployment.album
      ? {
          id: deployment.album.id,
          name: deployment.album.name,
          scenes: deployment.album.scenes,
          order: deployment.album.order,
          crossfadeMs: deployment.album.crossfadeMs,
        }
      : null,
  )
}
