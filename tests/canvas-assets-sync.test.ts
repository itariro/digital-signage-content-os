import fs from 'node:fs'
import type { SyncPullOptions } from '@/lib/sync/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const env = process.env as Record<string, string | undefined>
const managed = ['FRAME_MODE', 'DATABASE_URL', 'INSTANCE_ID', 'FRAME_DB_PATH', 'FRAME_DATA_DIR']
const original: Record<string, string | undefined> = {}
const dataDir = '/private/var/folders/3x/vty317751d9dtvqpsjpvygzc0000gn/T/opencode/canvas-assets-sync'
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9])

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

describe('canvas asset sync', () => {
  it('pulls only missing referenced assets and stores them locally', async () => {
    const { resetSqliteDb } = await import('@/lib/db/sqlite')
    const { runMigrations } = await import('@/lib/db/migrate')
    resetSqliteDb()
    await runMigrations()
    const { hashCanvasAsset, putCanvasAsset, getCanvasAsset } = await import('@/lib/canvas/assets')
    const { handlePull } = await import('@/lib/sync/server')
    const hash = hashCanvasAsset(png)
    await putCanvasAsset({ hash, mime: 'image/png', bytes: png })
    const options: SyncPullOptions = {
      caHave: [hash],
      canvasAssetRefs: [`canvas-asset:${hash}`, `canvas-asset:${'a'.repeat(64)}`],
    }
    const outcome = await handlePull('frame-a', undefined, options)
    expect(outcome.canvasAssets).toBeUndefined()

    const missingOnly = await handlePull('frame-a', undefined, { ...options, caHave: [] })
    expect(missingOnly.canvasAssets).toEqual([
      { hash, mime: 'image/png', dataBase64: png.toString('base64') },
    ])

    const { pullRemote } = await import('@/lib/sync/client')
    const storeSpy = vi.spyOn(await import('@/lib/store'), 'mutateStore')
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ changes: [], cursor: 'cursor', canvasAssets: missingOnly.canvasAssets }),
    })) as unknown as typeof fetch
    await pullRemote({ endpoint: 'http://console', token: 't', instanceId: 'frame-a' }, undefined, false, {
      caHave: [],
      canvasAssetRefs: [`canvas-asset:${hash}`],
    })
    expect(getCanvasAsset(hash)).toEqual(png)
    expect(storeSpy).not.toHaveBeenCalled()
  })

  it('sends local hashes and active canvas refs from runSyncCycle', async () => {
    const { resetSqliteDb } = await import('@/lib/db/sqlite')
    const { runMigrations } = await import('@/lib/db/migrate')
    resetSqliteDb()
    await runMigrations()
    const { hashCanvasAsset, putCanvasAsset } = await import('@/lib/canvas/assets')
    const { putCanvasState } = await import('@/lib/canvas/state-store')
    const hash = hashCanvasAsset(png)
    await putCanvasAsset({ hash, mime: 'image/png', bytes: png })
    const ref = `canvas-asset:${hash}`
    await putCanvasState('frame-a', {
      v: 1,
      active: { config: { scenes: [{ config: { images: [ref] } }] } } as never,
      pending: null,
      identify: null,
    } as never)
    const urls: string[] = []
    globalThis.fetch = vi.fn(async (input: string) => {
      urls.push(input)
      return { ok: true, status: 200, json: async () => ({ changes: [], cursor: 'cursor' }) }
    }) as unknown as typeof fetch
    const { runSyncCycle } = await import('@/lib/sync/client')
    await runSyncCycle({ endpoint: 'http://console', token: 't', instanceId: 'frame-a' })
    const url = new URL(urls[0])
    expect(url.searchParams.get('caHave')?.split(',')).toContain(hash)
    expect(url.searchParams.get('canvasAssetRefs')?.split(',')).toContain(ref)
  })

  it('keeps asset options on the 410 retry', async () => {
    const urls: string[] = []
    globalThis.fetch = vi.fn(async (input: string) => {
      urls.push(input)
      if (urls.length === 1) return { ok: false, status: 410, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => ({ changes: [], cursor: 'cursor' }) }
    }) as unknown as typeof fetch
    const { pullRemote } = await import('@/lib/sync/client')
    await pullRemote({ endpoint: 'http://console', token: 't', instanceId: 'frame-a' }, undefined, false, {
      caHave: ['a'.repeat(64)],
      canvasAssetRefs: [`canvas-asset:${'b'.repeat(64)}`],
    })
    expect(urls).toHaveLength(2)
    const retry = new URL(urls[1])
    expect(retry.searchParams.get('caHave')).toBe('a'.repeat(64))
    expect(retry.searchParams.get('canvasAssetRefs')).toBe(`canvas-asset:${'b'.repeat(64)}`)
  })
})
