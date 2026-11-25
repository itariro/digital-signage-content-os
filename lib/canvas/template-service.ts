import type { CanvasTemplateId } from '@/lib/types'
import { templateDocuments } from './templates'

export type TemplateWriteClient = {
  createAlbum: (body: { name: string; theme: 'canvas' }) => Promise<{ id: string }>
  updateAlbum: (id: string, body: Record<string, unknown>) => Promise<void>
  createLayout: (body: Record<string, unknown>) => Promise<{ id: string }>
}

export type TemplateCreateResult = { albumId: string; layoutId: string }

/**
 * `POST /api/albums` only accepts albumCreateSchema (name and theme), so the
 * full canvas album is written with PUT to `/api/albums/<id>` next. The layout
 * is created last, after the album id is known.
 */
export async function createCanvasTemplate(
  templateId: CanvasTemplateId,
  client: TemplateWriteClient,
): Promise<TemplateCreateResult> {
  const template = templateDocuments(templateId)
  const album = await client.createAlbum({ name: template.album.name, theme: 'canvas' })
  await client.updateAlbum(album.id, { ...template.album })
  const layout = await client.createLayout({
    ...template.layout,
    settings: { ...template.layout.settings, albumId: album.id },
  })
  return { albumId: album.id, layoutId: layout.id }
}

async function write(url: string, method: 'POST' | 'PUT', body: Record<string, unknown>): Promise<{ id: string }> {
  const response = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${method} ${url} failed: ${await response.text()}`)
  const data = (await response.json()) as { id?: unknown }
  if (typeof data.id !== 'string') throw new Error(`${method} ${url} did not return an id`)
  return { id: data.id }
}

export function consoleTemplateWriteClient(): TemplateWriteClient {
  return {
    createAlbum: (body) => write('/api/albums?frame=canvas-library', 'POST', body),
    updateAlbum: async (id, body) => {
      await write(`/api/albums/${id}?frame=canvas-library`, 'PUT', body)
    },
    createLayout: (body) => write('/api/layouts?frame=canvas-library', 'POST', body),
  }
}
