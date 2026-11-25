import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const env = process.env as Record<string, string | undefined>
const managed = ['FRAME_DB_PATH', 'DATABASE_URL', 'FRAME_DATA_DIR']
const original: Record<string, string | undefined> = {}
const dataDir = '/private/var/folders/3x/vty317751d9dtvqpsjpvygzc0000gn/T/opencode/canvas-assets-test'

beforeEach(() => {
  for (const key of managed) original[key] = env[key]
  env.FRAME_DB_PATH = ':memory:'
  delete env.DATABASE_URL
  env.FRAME_DATA_DIR = dataDir
  fs.rmSync(dataDir, { recursive: true, force: true })
})

afterEach(() => {
  for (const key of managed) {
    if (original[key] === undefined) delete env[key]
    else env[key] = original[key]
  }
})

describe('canvas asset references', () => {
  it('hashes bytes with sha256 and round-trips a reference', async () => {
    const { hashCanvasAsset, parseCanvasAssetRef, canvasAssetUrl } = await import('@/lib/canvas/assets')
    const bytes = Buffer.from('canvas-image-bytes')
    const hash = hashCanvasAsset(bytes)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(parseCanvasAssetRef(`canvas-asset:${hash}`)).toBe(hash)
    expect(parseCanvasAssetRef('/api/media/x.png')).toBeNull()
    expect(canvasAssetUrl(hash)).toBe(`/api/canvas/assets/${hash}`)
  })

  it('stores bytes under the local data dir and lists records', async () => {
    const { hashCanvasAsset, putCanvasAsset, getCanvasAsset, listCanvasAssets } = await import('@/lib/canvas/assets')
    const { resetSqliteDb } = await import('@/lib/db/sqlite')
    const { runMigrations } = await import('@/lib/db/migrate')
    resetSqliteDb()
    await runMigrations()
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
    const hash = hashCanvasAsset(bytes)
    await putCanvasAsset({ hash, mime: 'image/png', bytes })
    expect(getCanvasAsset(hash)).toEqual(bytes)
    expect(await listCanvasAssets()).toEqual([{ hash, mime: 'image/png', size: bytes.length }])
    expect(fs.existsSync(path.join(dataDir, 'canvas-assets', `${hash}.png`))).toBe(true)
  })
})
