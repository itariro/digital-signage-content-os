import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const styles = readFileSync(path.join(root, 'app/globals.css'), 'utf8')
const controls = readFileSync(path.join(root, 'components/editor/controls.tsx'), 'utf8')

describe('editor visual system', () => {
  it('defines editor-scoped action variants and field focus treatment', () => {
    for (const selector of [
      '.editor-button',
      '.editor-button-primary',
      '.editor-button-secondary',
      '.editor-button-quiet',
      '.editor-button-destructive',
      '.editor-control:focus-visible',
      '.editor-icon-button',
    ]) {
      expect(styles).toContain(selector)
    }
  })

  it('exposes a typed EditorButton that composes the shared action styles', () => {
    expect(controls).toContain("export type EditorButtonVariant = 'primary' | 'secondary' | 'quiet' | 'destructive'")
    expect(controls).toContain('export function EditorButton')
    expect(controls).toContain('editor-button-${variant}')
  })
})
