import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const read = (relative: string) => readFileSync(path.join(root, relative), 'utf8')

describe('canvas scene authoring forms', () => {
  it('declares fields for every phase 1 scene type', () => {
    const source = read('lib/canvas/scenes/fields.ts')
    for (const type of ['marquee', 'bounce', 'pong']) {
      expect(source).toContain(`  ${type}: [`)
    }
    expect(source).toContain("  'sync-test': [")
    expect(source).toContain("key: 'lines'")
    expect(source).toContain("key: 'style.fontFamily'")
    expect(source).toContain("key: 'rallyHits.0'")
  })

  it('renders every SceneField kind and writes dot paths', () => {
    const source = read('components/editor/canvas-admin/scene-fields.tsx')
    for (const kind of ['number', 'slider', 'text', 'textarea', 'lines', 'select', 'color', 'toggle', 'font', 'style', 'image']) {
      expect(source).toContain(`case '${kind}'`)
    }
    expect(source).toContain('function setPath(')
    expect(source).toContain('function getPath(')
  })

  it('keeps marquee lines and logo data URIs local', () => {
    const lines = read('components/editor/canvas-admin/marquee-lines-editor.tsx')
    const measureClient = read('lib/canvas/measure-client.ts')
    const logo = read('components/editor/canvas-admin/logo-upload.tsx')
    const album = read('components/editor/canvas-admin/album-editor.tsx')
    expect(lines).toContain('withMeasuredStrip')
    expect(measureClient).toContain("config.layout === 'block'")
    expect(logo).toContain('downscaleToDataUri')
    expect(logo).toContain("startsWith('data:image/')")
    expect(album).toContain('Unpublished changes')
    expect(album).toContain('canvasSceneSchema.safeParse')
    expect(album).toContain('SCENE_META[scene.type]')
  })
})
