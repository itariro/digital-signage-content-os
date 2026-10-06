export type FontOption = {
  id: string
  label: string
  css: string
  category: 'Sans' | 'Serif' | 'Display' | 'Mono'
  weights: number[]
}

export const BUILTIN_FONTS: FontOption[] = [
  { id: 'inter', label: 'Inter', css: 'var(--font-inter), system-ui, sans-serif', category: 'Sans', weights: [200, 300, 400, 500, 600, 700, 800] },
  { id: 'outfit', label: 'Outfit', css: 'var(--font-outfit), system-ui, sans-serif', category: 'Sans', weights: [200, 300, 400, 500, 600, 700, 800] },
  { id: 'grotesk', label: 'Space Grotesk', css: 'var(--font-grotesk), system-ui, sans-serif', category: 'Sans', weights: [300, 400, 500, 600, 700] },
  { id: 'playfair', label: 'Playfair Display', css: 'var(--font-playfair), Georgia, serif', category: 'Serif', weights: [400, 500, 600, 700, 800] },
  { id: 'instrument', label: 'Instrument Serif', css: 'var(--font-instrument), Georgia, serif', category: 'Serif', weights: [400] },
  { id: 'bebas', label: 'Bebas Neue', css: 'var(--font-bebas), Impact, sans-serif', category: 'Display', weights: [400] },
  { id: 'mono', label: 'JetBrains Mono', css: 'var(--font-jetbrains), ui-monospace, monospace', category: 'Mono', weights: [200, 300, 400, 500, 600, 700, 800] },
]

const CUSTOM_PREFIX = 'gf:'

export function customFontId(family: string) {
  return `${CUSTOM_PREFIX}${family}`
}

export function isCustomFont(id: string) {
  return id.startsWith(CUSTOM_PREFIX)
}

export function fontStack(id: string) {
  const builtin = BUILTIN_FONTS.find((f) => f.id === id)
  if (builtin) return builtin.css
  if (isCustomFont(id)) return `'${id.slice(CUSTOM_PREFIX.length)}', system-ui, sans-serif`
  return BUILTIN_FONTS[0].css
}

export function fontLabel(id: string) {
  const builtin = BUILTIN_FONTS.find((f) => f.id === id)
  if (builtin) return builtin.label
  if (isCustomFont(id)) return id.slice(CUSTOM_PREFIX.length)
  return 'Inter'
}

export function googleFontHref(family: string) {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&display=swap`
}
