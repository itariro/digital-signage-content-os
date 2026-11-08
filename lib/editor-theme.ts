export type EditorTheme = 'light' | 'dark'

export const EDITOR_THEME_STORAGE_KEY = 'mural-editor-theme'

export function storedEditorTheme(value: string | null): EditorTheme | null {
  return value === 'light' || value === 'dark' ? value : null
}

export function resolveEditorTheme(value: string | null, systemPrefersDark: boolean): EditorTheme {
  return storedEditorTheme(value) ?? (systemPrefersDark ? 'dark' : 'light')
}
