import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const frameUtils = readFileSync(path.join(root, 'lib/frame-utils.ts'), 'utf8')
const measureClient = readFileSync(path.join(root, 'lib/canvas/measure-client.ts'), 'utf8')
const hook = readFileSync(path.join(root, 'hooks/use-canvas-library.ts'), 'utf8')

describe('canvas browser helpers', () => {
  it('downscales to the long side and keeps alpha', () => {
    expect(frameUtils).toContain('export async function downscaleToDataUri(file: File, maxDim = 512, mime: LogoMime =')
    expect(frameUtils).toContain('const scale = Math.min(1, maxDim / Math.max(img.width, img.height))')
    expect(frameUtils).toContain('canvas.toDataURL(mime')
    expect(frameUtils).toContain('MAX_LOGO_DATA_URI_BYTES')
    expect(frameUtils).not.toContain("toDataURL('image/jpeg', 0.82)\n}")
  })

  it('measures marquee strips in the browser only', () => {
    expect(measureClient).toContain("'use client'")
    expect(measureClient).toContain('export function measureMarquee(config: MarqueeConfig): MarqueeStrip')
    expect(measureClient).toContain('ctx.measureText')
    expect(measureClient).toContain("config.layout === 'block'")
  })

  it('routes library mutations to the reserved frame id', () => {
    expect(hook).toContain('useFrameStore(EMPTY_CANVAS_LIBRARY_STORE, CANVAS_LIBRARY_ID)')
    expect(hook).toContain("from '@/lib/canvas/ids'")
    expect(hook).toContain("path.startsWith('/api/layouts') || path.startsWith('/api/albums')")
    expect(hook).toContain('frame=${encodeURIComponent(CANVAS_LIBRARY_ID)}')
    expect(hook).toContain("'/api/canvas/deploy'")
    expect(hook).toContain("'/api/canvas/release'")
    expect(hook).toContain("'/api/canvas/identify'")
  })
})
