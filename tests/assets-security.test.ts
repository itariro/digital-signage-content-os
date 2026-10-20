import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import fs from 'node:fs'

// Asset endpoints (H4): upload/delete/list require a credential; delivered
// Content-Type derives from magic bytes, never from the stored client claim.
const env = process.env as Record<string, string | undefined>
const ADMIN = { NODE_ENV: 'production', CONSOLE_ADMIN_TOKEN: 'admin-tok' }

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fake-png-bytes')])
const PNG2 = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('other-png-bytes')])
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

beforeAll(() => {
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '/tmp/scratchpad/assets-adata'
})

async function freshDb() {
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

function adminHeaders() {
  return { 'Content-Type': 'application/json', 'x-admin-token': 'admin-tok' }
}

async function postAssets(body: unknown, headers: Record<string, string> = {}) {
  const { NextRequest } = await import('next/server')
  const { POST } = await import('@/app/api/assets/route')
  const req = new NextRequest('http://localhost/api/assets', { method: 'POST', headers: { ...headers }, body: JSON.stringify(body) })
  return POST(req)
}

function dataUrl(mime: string, buf: Buffer) {
  return `data:${mime};base64,${buf.toString('base64')}`
}

afterEach(() => {
  delete env.NODE_ENV
  delete env.CONSOLE_ADMIN_TOKEN
  delete env.ASSET_MAX_COUNT
  delete env.ASSET_MAX_TOTAL_BYTES
})

describe('asset upload auth', () => {
  it('unauthenticated upload is rejected with 401', async () => {
    Object.assign(env, { NODE_ENV: 'production', CONSOLE_ADMIN_TOKEN: 'admin-tok' })
    await freshDb()
    const res = await postAssets({ dataUrl: dataUrl('image/png', PNG) })
    expect(res.status).toBe(401)
  })

  it('authenticated upload of a real png succeeds', async () => {
    Object.assign(env, ADMIN)
    await freshDb()
    const res = await postAssets({ dataUrl: dataUrl('image/png', PNG) }, adminHeaders())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.asset.mime).toBe('image/png')
  })
})

describe('asset mime derivation', () => {
  it('rejects a dataUrl claiming text/html whose bytes are not a known media type (415)', async () => {
    Object.assign(env, ADMIN)
    await freshDb()
    const res = await postAssets({ dataUrl: dataUrl('text/html', Buffer.from('<script>alert(1)</script>')) }, adminHeaders())
    expect(res.status).toBe(415)
  })

  it('stores the DERIVED mime when the client declares a different one', async () => {
    Object.assign(env, ADMIN)
    await freshDb()
    const res = await postAssets({ dataUrl: dataUrl('text/html', PNG) }, adminHeaders())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.asset.mime).toBe('image/png')
  })

  it('serves svg as text/plain with nosniff', async () => {
    Object.assign(env, ADMIN)
    await freshDb()
    const res = await postAssets({ dataUrl: dataUrl('image/svg+xml', SVG) }, adminHeaders())
    expect(res.status).toBe(200)
    const body = await res.json()
    const { NextRequest } = await import('next/server')
    const { GET } = await import('@/app/api/assets/[id]/route')
    const delivered = await GET(new NextRequest('http://localhost/x'), { params: Promise.resolve({ id: body.asset.id }) })
    expect(delivered.headers.get('Content-Type')).toBe('text/plain')
    expect(delivered.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })

  it('downgrades a legacy poisoned stored mime to application/octet-stream', async () => {
    Object.assign(env, ADMIN)
    await freshDb()
    const { getDb: g } = await import('@/lib/db')
    const { getTables } = await import('@/lib/db/tables')
    const db = g() as any
    const tables = getTables() as any
    const now = new Date()
    const buf = Buffer.from('<script>alert(document.domain)</script>')
    const { hashBuffer } = await import('@/lib/assets/storage')
    const hash = hashBuffer(buf)
    const name = `${hash.slice(0, 12)}.html`
    fs.mkdirSync('/tmp/scratchpad/assets-adata/assets', { recursive: true })
    fs.writeFileSync(`/tmp/scratchpad/assets-adata/assets/${name}`, buf)
    await db.insert(tables.assets).values({ id: 'legacy1', type: 'image', name, mime: 'text/html', size: buf.length, hash, version: 1, createdAt: now, updatedAt: now, refCount: 0, source: 'local' })
    const { NextRequest } = await import('next/server')
    const { GET } = await import('@/app/api/assets/[id]/route')
    const delivered = await GET(new NextRequest('http://localhost/x'), { params: Promise.resolve({ id: 'legacy1' }) })
    expect(delivered.headers.get('Content-Type')).toBe('application/octet-stream')
    expect(delivered.headers.get('Content-Disposition')).toContain('attachment')
    expect(delivered.headers.get('X-Content-Type-Options')).toBe('nosniff')
  })
})

describe('asset quotas', () => {
  it('rejects an upload over the per-file size limit (413)', async () => {
    Object.assign(env, ADMIN)
    await freshDb()
    const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(11 * 1024 * 1024)])
    const res = await postAssets({ dataUrl: dataUrl('image/png', big) }, adminHeaders())
    expect(res.status).toBe(413)
  })

  it('rejects past ASSET_MAX_COUNT with 507', async () => {
    Object.assign(env, ADMIN, { ASSET_MAX_COUNT: '1' })
    await freshDb()
    const first = await postAssets({ dataUrl: dataUrl('image/png', PNG) }, adminHeaders())
    expect(first.status).toBe(200)
    const second = await postAssets({ dataUrl: dataUrl('image/png', PNG2) }, adminHeaders())
    expect(second.status).toBe(507)
  })
})

describe('asset delete auth', () => {
  it('unauthenticated delete is rejected with 401', async () => {
    Object.assign(env, { NODE_ENV: 'production', CONSOLE_ADMIN_TOKEN: 'admin-tok' })
    await freshDb()
    const { NextRequest } = await import('next/server')
    const { DELETE } = await import('@/app/api/assets/[id]/route')
    const res = await DELETE(new NextRequest('http://localhost/x', { method: 'DELETE' }), { params: Promise.resolve({ id: 'nope' }) })
    expect(res.status).toBe(401)
  })
})
