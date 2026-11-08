import { describe, expect, it } from 'vitest'
import { resolveEditorTheme, storedEditorTheme } from '@/lib/editor-theme'

describe('editor theme preference', () => {
  it('accepts only explicit light and dark preferences', () => {
    expect(storedEditorTheme('light')).toBe('light')
    expect(storedEditorTheme('dark')).toBe('dark')
    expect(storedEditorTheme(null)).toBeNull()
    expect(storedEditorTheme('system')).toBeNull()
    expect(storedEditorTheme('')).toBeNull()
  })

  it('uses the saved preference before the operating-system preference', () => {
    expect(resolveEditorTheme('light', true)).toBe('light')
    expect(resolveEditorTheme('dark', false)).toBe('dark')
  })

  it('uses the operating-system preference when there is no saved choice', () => {
    expect(resolveEditorTheme(null, true)).toBe('dark')
    expect(resolveEditorTheme(null, false)).toBe('light')
    expect(resolveEditorTheme('invalid', true)).toBe('dark')
  })
})
