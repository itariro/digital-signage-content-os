import { afterEach, describe, expect, it, vi } from 'vitest'
import { consoleTemplateWriteClient, createCanvasTemplate } from '@/lib/canvas/template-service'

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

  it('deletes the created album when template creation fails', async () => {
    const calls: string[] = []
    const client = {
      createAlbum: async () => {
        calls.push('album:create')
        return { id: 'album-1' }
      },
      updateAlbum: async () => {
        calls.push('album:update')
      },
      createLayout: async () => {
        calls.push('layout:create')
        throw new Error('layout limit')
      },
      deleteAlbum: async (id: string) => {
        calls.push(`album:delete:${id}`)
      },
    }

    await expect(createCanvasTemplate('hello-wall', client)).rejects.toThrow('layout limit')
    expect(calls).toEqual(['album:create', 'album:update', 'layout:create', 'album:delete:album-1'])
  })

  it('consoleTemplateWriteClient targets the canvas library frame', async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'album-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'album-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'layout-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const client = consoleTemplateWriteClient()
    await client.createAlbum({ name: 'Hello', theme: 'canvas' })
    await client.updateAlbum('album-1', { name: 'Hello' })
    await client.createLayout({ name: 'Layout' })

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      '/api/albums?frame=canvas-library',
      '/api/albums/album-1?frame=canvas-library',
      '/api/layouts?frame=canvas-library',
    ])
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})
