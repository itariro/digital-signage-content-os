import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8')

describe('ordinary editor canvas filtering', () => {
  it('hides canvas albums from the album picker and list', () => {
    const source = read('components/editor/albums-panel.tsx')
    expect(read('lib/albums.ts')).toContain("ALBUM_THEMES.filter((theme) => theme !== 'canvas')")
    expect(source).toContain('EDITOR_ALBUM_THEMES.map')
    expect(source).toContain("albums.filter((album) => album.theme !== 'canvas')")
  })

  it('never offers the canvas presentation in album detail', () => {
    const source = read('components/editor/album-detail.tsx')
    expect(read('lib/albums.ts')).toContain("PRESENTATIONS.filter((presentation) => presentation !== 'canvas')")
    expect(source).toContain('EDITOR_PRESENTATIONS.map')
  })
})
