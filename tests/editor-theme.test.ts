import { describe, expect, it, vi } from 'vitest'
import { resolveEditorTheme, saveEditorThemePreference, storedEditorTheme } from '@/lib/editor-theme'

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

  it('reports preference persistence failures', () => {
    const error = new Error('Storage unavailable')
    const result = saveEditorThemePreference(
      { setItem: () => { throw error } },
      'dark',
    )

    expect(result).toEqual({ ok: false, error })
  })

  it('saves an explicit theme preference', () => {
    const setItem = vi.fn()

    expect(saveEditorThemePreference({ setItem }, 'light')).toEqual({ ok: true })
    expect(setItem).toHaveBeenCalledWith('mural-editor-theme', 'light')
  })
})
