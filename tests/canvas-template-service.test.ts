import { describe, expect, it } from 'vitest'
import { createCanvasTemplate } from '@/lib/canvas/template-service'

describe('createCanvasTemplate', () => {
  it('writes the album before the layout and points the layout at the album', async () => {
    const calls: string[] = []
    const client = {
      createAlbum: async (body: Record<string, unknown>) => {
        calls.push('album:create')
        expect(body).toEqual({ name: 'Hello Wall', theme: 'canvas' })
        return { id: 'album-99' }
      },
      updateAlbum: async (id: string, body: Record<string, unknown>) => {
        calls.push('album:update')
        expect(id).toBe('album-99')
        expect(body.scenes).toHaveLength(2)
        expect(body.layers).toHaveLength(1)
        expect(body.paletteId).toBe('candy')
      },
      createLayout: async (body: Record<string, unknown>) => {
        calls.push('layout:create')
        expect(body.settings).toMatchObject({ albumId: 'album-99' })
        expect(body.kind).toBe('canvas')
        return { id: 'layout-99' }
      },
    }
    const result = await createCanvasTemplate('hello-wall', client)
    expect(result).toEqual({ albumId: 'album-99', layoutId: 'layout-99' })
    expect(calls).toEqual(['album:create', 'album:update', 'layout:create'])
  })

  it('does not mutate the template catalogue', async () => {
    const client = {
      createAlbum: async () => ({ id: 'a' }),
      updateAlbum: async () => undefined,
      createLayout: async () => ({ id: 'l' }),
    }
    await createCanvasTemplate('wall-clock', client)
    await createCanvasTemplate('wall-clock', client)
    const { templateDocuments } = await import('@/lib/canvas/templates')
    expect(templateDocuments('wall-clock').layout.settings.albumId).toBeNull()
  })
})
