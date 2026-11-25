import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

const env = process.env as Record<string, string | undefined>
const root = path.resolve(__dirname, '..')

beforeAll(() => {
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/canvas-guards'
  env.NODE_ENV = 'production'
  env.CONSOLE_ADMIN_TOKEN = 'canvas-admin'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { resetStoreCache } = await import('@/lib/store')
  resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

function request(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-admin-token': 'canvas-admin' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function docFor(id: string) {
  const { getDb } = await import('@/lib/db')
  const { getTables } = await import('@/lib/db/tables')
  const rows = await getDb().select().from(getTables().frameDocuments).where(
    eq(getTables().frameDocuments.identifier, id),
  )
  return rows[0]
}

const settings = {
  resolution: '1080x1920',
  background: '',
  dim: 0,
  locationName: '',
  lat: 0,
  lon: 0,
  units: 'metric',
  snap: true,
  gridSize: 20,
  albumId: null,
}

const canvas = {
  arrangement: 'row',
  gap: 0,
  align: 'center',
  slots: [{ id: 'a', frameId: null, offset: { x: 0, y: 0 }, scale: 1 }],
  background: '#000000',
  markers: 'identify',
  notifications: 'suppress',
  nightMode: 'inherit',
  maxFps: 30,
}

describe('canvas library route guards', () => {
  it('accepts a canvas layout only in the library', async () => {
    await freshDb()
    const { POST } = await import('@/app/api/layouts/route')
    const payload = { name: 'Wall', kind: 'canvas', canvas, widgets: [], settings }

    const rejected = await POST(request('http://localhost/api/layouts', 'POST', payload))
    expect(rejected.status).toBe(400)

    const accepted = await POST(request('http://localhost/api/layouts?frame=canvas-library', 'POST', payload))
    expect(accepted.status).toBe(200)
    const json = await accepted.json()
    expect(json.store.layouts[0].kind).toBe('canvas')
    expect(json.store.activeId).toBeNull()
  })

  it('refuses a frame layout in the library', async () => {
    await freshDb()
    const { POST } = await import('@/app/api/layouts/route')
    const res = await POST(request('http://localhost/api/layouts?frame=canvas-library', 'POST', {
      name: 'Frame', kind: 'frame', widgets: [], settings,
    }))
    expect(res.status).toBe(400)
  })

  it('allows deleting the last library layout but not a live canvas layout', async () => {
    await freshDb()
    const { POST } = await import('@/app/api/layouts/route')
    const { DELETE } = await import('@/app/api/layouts/[id]/route')
    const created = await POST(request('http://localhost/api/layouts?frame=canvas-library', 'POST', {
      name: 'Wall', kind: 'canvas', canvas, widgets: [], settings,
    }))
    const { id } = await created.json()
    const res = await DELETE(
      request(`http://localhost/api/layouts/${id}?frame=canvas-library`, 'DELETE'),
      { params: Promise.resolve({ id }) },
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.store.layouts).toEqual([])
    expect(json.store.activeId).toBeNull()
  })

  it('creates one enabled sync-test scene for a canvas album', async () => {
    await freshDb()
    const { POST } = await import('@/app/api/albums/route')
    const res = await POST(request('http://localhost/api/albums?frame=canvas-library', 'POST', {
      name: 'Canvas album', theme: 'canvas',
    }))
    expect(res.status).toBe(200)
    const json = await res.json()
    const album = json.store.albums[0]
    expect(album.theme).toBe('canvas')
    expect(album.slideshow.presentation).toBe('canvas')
    expect(album.scenes).toHaveLength(1)
    expect(album.scenes[0].type).toBe('sync-test')
    expect(album.scenes[0].enabled).toBe(true)
    expect(album.scenes[0].durationSec).toBe(30)
  })

  it('rejects a canvas album outside the library', async () => {
    await freshDb()
    const { POST } = await import('@/app/api/albums/route')
    const res = await POST(request('http://localhost/api/albums', 'POST', {
      name: 'Canvas album', theme: 'canvas',
    }))
    expect(res.status).toBe(400)
  })

  it('hides and protects the library in /api/frames', async () => {
    await freshDb()
    const { ensureCanvasLibrary, CANVAS_LIBRARY_ID } = await import('@/lib/canvas/library')
    await ensureCanvasLibrary()
    const framesModule = await import('@/app/api/frames/route')
    const list = await framesModule.GET()
    const ids = (await list.json()).map((row: { id: string }) => row.id)
    expect(ids).not.toContain(CANVAS_LIBRARY_ID)

    const patch = await framesModule.PATCH(request('http://localhost/api/frames', 'PATCH', {
      id: CANVAS_LIBRARY_ID, name: 'Hacked',
    }))
    expect(patch.status).toBe(400)
    const del = await framesModule.DELETE(request(`http://localhost/api/frames?id=${CANVAS_LIBRARY_ID}`, 'DELETE'))
    expect(del.status).toBe(400)
  })

  it('returns 404 for /frame/canvas-library at source level', () => {
    const source = readFileSync(path.join(root, 'app/frame/[frameId]/page.tsx'), 'utf8')
    expect(source).toMatch(/isLibraryFrame\(frameId\).*notFound\(\)/)
  })

  it('skips the Bob tick for the library at source level', () => {
    const source = readFileSync(path.join(root, 'app/api/store/route.ts'), 'utf8')
    expect(source).toMatch(/if \(!isLibraryFrame\(frameId\)\) \{\s*after\(async \(\) => \{\s*await tickBobEngine\(frameId\)/)
  })
})
