import fs from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const env = process.env as Record<string, string | undefined>
const managed = [
  'FRAME_MODE', 'DATABASE_URL', 'INSTANCE_ID', 'FRAME_DB_PATH', 'FRAME_DATA_DIR',
  'KIOSK_MGMT_PORT', 'PORT',
]
const original: Record<string, string | undefined> = {}
const dataDir = '/private/var/folders/3x/vty317751d9dtvqpsjpvygzc0000gn/T/opencode/canvas-assets-route'

beforeEach(() => {
  for (const key of managed) original[key] = env[key]
  delete env.FRAME_MODE
  delete env.DATABASE_URL
  delete env.INSTANCE_ID
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = dataDir
  fs.rmSync(dataDir, { recursive: true, force: true })
})

afterEach(() => {
  for (const key of managed) {
    if (original[key] === undefined) delete env[key]
    else env[key] = original[key]
  }
})

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

function upload(bytes: Buffer) {
  const form = new FormData()
  form.set('file', new Blob([bytes], { type: 'image/png' }), 'wall.png')
  return new Request('http://localhost/api/canvas/assets', { method: 'POST', body: form })
}

describe('canvas asset routes', () => {
  it('accepts a small magic-byte png and returns a canvas ref', async () => {
    const { resetSqliteDb } = await import('@/lib/db/sqlite')
    const { runMigrations } = await import('@/lib/db/migrate')
    resetSqliteDb()
    await runMigrations()
    const { POST } = await import('@/app/api/canvas/assets/route')
    const response = await POST(upload(png))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ref).toMatch(/^canvas-asset:[a-f0-9]{64}$/)
    expect(body.mime).toBe('image/png')
  })

  it('rejects oversized files', async () => {
    const { POST } = await import('@/app/api/canvas/assets/route')
    const big = Buffer.concat([png, Buffer.alloc(10 * 1024 * 1024)])
    const response = await POST(upload(big))
    expect(response.status).toBe(413)
  })

  it('serves an uploaded asset from the kiosk-local route', async () => {
    const { hashCanvasAsset, putCanvasAsset } = await import('@/lib/canvas/assets')
    const hash = hashCanvasAsset(png)
    await putCanvasAsset({ hash, mime: 'image/png', bytes: png })
    const { GET } = await import('@/app/api/canvas/assets/[hash]/route')
    const response = await GET(new Request(`http://localhost/api/canvas/assets/${hash}`), { params: Promise.resolve({ hash }) })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png)
  })

  it('allows the delivery path through the frame gate', async () => {
    const { decideRequest } = await import('@/lib/frame-gate')
    env.KIOSK_MGMT_PORT = '8808'
    env.PORT = '3000'
    expect(decideRequest({ host: '127.0.0.1:3000', method: 'GET', path: '/api/canvas/assets/abc' })).toEqual({ kind: 'allow' })
    expect(decideRequest({ host: '127.0.0.1:3000', method: 'POST', path: '/api/canvas/assets' })).toEqual({ kind: 'not_found' })
  })
})
