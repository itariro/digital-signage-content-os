import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const service = readFileSync(path.join(root, 'lib/canvas/service.ts'), 'utf8')

describe('canvas deployment snapshot composition', () => {
  it('uses deploymentAlbumFrom so layers, transition and palette reach the frame', () => {
    expect(service).toContain("import { deploymentAlbumFrom } from './composition'")
    expect(service).toContain('const deploymentAlbum = deploymentAlbumFrom(album as CanvasAlbum)')
    expect(service).toContain('album: deploymentAlbum')
  })

  it('keeps the snapshot schema permissive for old deployments', async () => {
    const { deploymentAlbumSchema } = await import('@/lib/canvas/schema')
    expect(deploymentAlbumSchema.safeParse({
      id: 'a', name: 'A', scenes: [], order: 'sequence', crossfadeMs: 400,
    }).success).toBe(true)
  })
})
