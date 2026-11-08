import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { canManageFrames } from '@/lib/console/access'

const root = path.resolve(__dirname, '..')
const pageSource = readFileSync(path.join(root, 'app/page.tsx'), 'utf8')
const editorSource = readFileSync(path.join(root, 'components/editor/editor.tsx'), 'utf8')

describe('frame administration visibility', () => {
  it('requires a signed-in user', () => {
    expect(canManageFrames({ signedIn: false, roleConfigured: false, hasRole: false })).toBe(false)
  })

  it('allows a signed-in user when no console role is configured', () => {
    expect(canManageFrames({ signedIn: true, roleConfigured: false, hasRole: false })).toBe(true)
  })

  it('requires the configured console role', () => {
    expect(canManageFrames({ signedIn: true, roleConfigured: true, hasRole: true })).toBe(true)
    expect(canManageFrames({ signedIn: true, roleConfigured: true, hasRole: false })).toBe(false)
  })

  it('passes server-derived access and only opens the authorized Frames deep-link', () => {
    expect(pageSource).toContain('canManageFrames={canManageFrames}')
    expect(pageSource).toContain('initialPanel={initialPanel}')
    expect(pageSource).toContain("panel === 'frames' && canManageFrames ? 'frames' : null")
  })

  it('fails closed when the editor has no authorized Frames deep-link', () => {
    expect(editorSource).toContain('canManageFrames = false')
    expect(editorSource).toContain('initialPanel = null')
    expect(editorSource).toMatch(
      /useState<DrawerId \| null>\(\(\) =>\s*canManageFrames && initialPanel === 'frames' \? 'frames' : null/,
    )
  })

  it('keeps the existing frame query behavior', () => {
    expect(pageSource).toContain('const { frame, panel } = await searchParams')
    expect(pageSource).toContain('const frameId = frame || undefined')
    expect(pageSource).toContain('frameId={frameId}')
  })
})
