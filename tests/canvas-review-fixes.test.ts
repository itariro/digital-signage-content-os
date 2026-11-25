import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

const root = path.resolve(__dirname, '..')
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8')

describe('canvas review fixes', () => {
  it('does not reset an album draft on every render', () => {
    const source = read('components/editor/canvas-admin/albums-tab.tsx')
    expect(source).toContain('const visibleAlbums = useMemo(')
    expect(source).toContain('[store.albums])')
    expect(source).toContain('[openId, visibleAlbums])')
  })

  it('requires a saved draft before deploying, releasing or identifying', () => {
    const source = read('components/editor/canvas-admin/layouts-tab.tsx')
    expect(source.match(/disabled=\{dirty \|\| busy\}/g)?.length).toBe(4)
  })

  it('measures marquee strips even when the config style is missing', async () => {
    const { measureMarquee } = await import('@/lib/canvas/measure-client')
    const context = { font: '', measureText: (text: string) => ({ width: text.length * 10 }) }
    vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) })
    const strip = measureMarquee({ lines: ['one', 'two'], separator: ' / ', fontSize: 40, lineHeight: 48 } as never)
    expect(strip.segments).toHaveLength(3)
    expect(strip.lengthPx).toBeGreaterThan(0)
    vi.unstubAllGlobals()
  })
})
