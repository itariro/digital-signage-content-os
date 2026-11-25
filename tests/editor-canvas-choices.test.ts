import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const panel = readFileSync(path.join(root, 'components/editor/albums-panel.tsx'), 'utf8')
const detail = readFileSync(path.join(root, 'components/editor/album-detail.tsx'), 'utf8')

describe('album editor choices', () => {
  it('uses the editor-only theme list', () => {
    expect(panel).toContain('EDITOR_ALBUM_THEMES')
    expect(panel).not.toContain(/[^_]ALBUM_THEMES/)
  })

  it('uses the editor-only presentation list', () => {
    expect(detail).toContain('EDITOR_PRESENTATIONS')
    expect(detail).not.toContain(/[^_]PRESENTATIONS/)
  })
})
