import { afterEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'

const env = process.env as Record<string, string | undefined>
const originalEnv = {
  DATABASE_URL: env.DATABASE_URL,
  FRAME_DATA_DIR: env.FRAME_DATA_DIR,
  FRAME_DB_PATH: env.FRAME_DB_PATH,
  FRAME_MODE: env.FRAME_MODE,
  NODE_ENV: env.NODE_ENV,
  CONSOLE_ADMIN_TOKEN: env.CONSOLE_ADMIN_TOKEN,
}

const ADMIN_TOKEN = 'frame-admin-test-token'

function configureTestEnvironment() {
  delete env.DATABASE_URL
  env.FRAME_MODE = 'instance'
  env.FRAME_DB_PATH = ':memory:'
  env.FRAME_DATA_DIR = '.test-data/frame-admin-api'
  env.NODE_ENV = 'production'
  env.CONSOLE_ADMIN_TOKEN = ADMIN_TOKEN
}

async function freshDb() {
  configureTestEnvironment()
  const { resetSqliteDb } = await import('@/lib/db/sqlite')
  resetSqliteDb()
  const { resetStoreCache } = await import('@/lib/store')
  resetStoreCache()
  const { runMigrations } = await import('@/lib/db/migrate')
  await runMigrations()
}

function adminGet(url: string) {
  return new NextRequest(url, { headers: { 'x-admin-token': ADMIN_TOKEN } })
}

function adminPost(url: string, resolution: string) {
  const body = new FormData()
  body.set('resolution', resolution)
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'x-admin-token': ADMIN_TOKEN },
    body,
  })
}

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete env[key]
    else env[key] = value
  }
})

describe('frame administration read APIs', () => {
  it('rejects unauthorized conflict and audit reads without caching', async () => {
    configureTestEnvironment()

    const [{ GET: getConflicts }, { GET: getAudit }] = await Promise.all([
      import('@/app/api/sync/conflicts/route'),
      import('@/app/api/audit/route'),
    ])
    const conflictResponse = await getConflicts(new NextRequest('http://console.test/api/sync/conflicts'))
    const auditResponse = await getAudit(new NextRequest('http://console.test/api/audit'))

    expect(conflictResponse.status).toBe(401)
    expect(conflictResponse.headers.get('cache-control')).toBe('no-store')
    expect(auditResponse.status).toBe(401)
    expect(auditResponse.headers.get('cache-control')).toBe('no-store')
  })

  it('returns only open and rejected conflict fields and minimal audit summaries', async () => {
    await freshDb()
    const { recordConflict, resolveConflict } = await import('@/lib/sync/conflicts')
    const open = await recordConflict({
      instanceId: 'frame-a',
      entityType: 'document',
      entityId: 'doc-open',
      localRevision: 2,
      remoteRevision: 3,
      localPayload: { secret: 'conflict-payload-secret' },
      remotePayload: { secret: 'remote-payload-secret' },
    })
    await recordConflict({
      instanceId: 'frame-b',
      entityType: 'document',
      entityId: 'doc-rejected',
      localRevision: 4,
      remoteRevision: 5,
      status: 'rejected',
      localPayload: { secret: 'rejected-payload-secret' },
      remotePayload: { secret: 'rejected-remote-secret' },
    })
    const resolved = await recordConflict({
      instanceId: 'frame-c',
      entityType: 'document',
      entityId: 'doc-resolved',
      localRevision: 6,
      remoteRevision: 7,
    })
    await resolveConflict(resolved.id, 'remote')

    const { audit } = await import('@/lib/audit')
    await audit('operator@example.test', 'resolve_conflict', 'conflict', open.id, {
      secret: 'audit-details-secret',
    })

    const [{ GET: getConflicts }, { GET: getAudit }] = await Promise.all([
      import('@/app/api/sync/conflicts/route'),
      import('@/app/api/audit/route'),
    ])
    const conflictResponse = await getConflicts(adminGet('http://console.test/api/sync/conflicts'))
    const auditResponse = await getAudit(adminGet('http://console.test/api/audit'))

    expect(conflictResponse.status).toBe(200)
    expect(conflictResponse.headers.get('cache-control')).toBe('no-store')
    const conflictBody = await conflictResponse.json()
    expect(conflictBody.conflicts).toHaveLength(2)
    expect(conflictBody.conflicts.map((conflict: { status: string }) => conflict.status).sort()).toEqual(['open', 'rejected'])
    expect(Object.keys(conflictBody.conflicts[0]).sort()).toEqual([
      'createdAt',
      'entityId',
      'entityType',
      'id',
      'instanceId',
      'localRevision',
      'remoteRevision',
      'status',
    ])
    expect(JSON.stringify(conflictBody)).not.toContain('payload-secret')

    expect(auditResponse.status).toBe(200)
    expect(auditResponse.headers.get('cache-control')).toBe('no-store')
    const auditBody = await auditResponse.json()
    expect(auditBody.entries).toHaveLength(1)
    expect(Object.keys(auditBody.entries[0]).sort()).toEqual([
      'action',
      'actor',
      'createdAt',
      'id',
      'targetId',
      'targetType',
    ])
    expect(JSON.stringify(auditBody)).not.toContain('audit-details-secret')
  })
})

describe('POST /api/sync/conflicts/[id]/resolve discard', () => {
  it('discards a rejected conflict', async () => {
    await freshDb()
    const { recordConflict, listConflicts } = await import('@/lib/sync/conflicts')
    const conflict = await recordConflict({
      instanceId: 'frame-a',
      entityType: 'document',
      entityId: 'doc-rejected',
      localRevision: 2,
      remoteRevision: 3,
      status: 'rejected',
    })
    const { POST } = await import('@/app/api/sync/conflicts/[id]/resolve/route')

    const response = await POST(
      adminPost(`http://console.test/api/sync/conflicts/${conflict.id}/resolve`, 'discard'),
      { params: Promise.resolve({ id: conflict.id }) },
    )

    expect(response.status).toBe(200)
    const rows = await listConflicts()
    expect(rows.find(({ id }) => id === conflict.id)?.status).toBe('discarded')
  })

  it('rejects discard of an open conflict and leaves it open', async () => {
    await freshDb()
    const { recordConflict, listConflicts } = await import('@/lib/sync/conflicts')
    const conflict = await recordConflict({
      instanceId: 'frame-a',
      entityType: 'document',
      entityId: 'doc-open',
      localRevision: 2,
      remoteRevision: 3,
    })
    const { POST } = await import('@/app/api/sync/conflicts/[id]/resolve/route')

    const response = await POST(
      adminPost(`http://console.test/api/sync/conflicts/${conflict.id}/resolve`, 'discard'),
      { params: Promise.resolve({ id: conflict.id }) },
    )

    expect(response.status).toBe(404)
    const rows = await listConflicts()
    expect(rows.find(({ id }) => id === conflict.id)?.status).toBe('open')
  })
})
