import type { BobExpression } from './types'

export const BOB_EXPRESSIONS: readonly BobExpression[] = [
  'thinking', 'action', 'celebrate', 'idea', 'reminder', 'success',
  'exercise', 'talking', 'planning', 'building', 'reading', 'happy',
]

export const BOB_FALLBACK_EXPRESSION: BobExpression = 'happy'

/**
 * Inline SVG shown when the artwork file is missing, so a Bob widget is never a
 * broken image. Themed with the default accent so it reads as intentional.
 */
export const BOB_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
      '<circle cx="100" cy="100" r="88" fill="#7cc4ff" opacity="0.22"/>' +
      '<circle cx="72" cy="86" r="12" fill="#ffffff"/>' +
      '<circle cx="128" cy="86" r="12" fill="#ffffff"/>' +
      '<path d="M64 128q36 34 72 0" stroke="#ffffff" stroke-width="10" fill="none" stroke-linecap="round"/>' +
      '</svg>',
  )

export function isBobExpression(value: unknown): value is BobExpression {
  return typeof value === 'string' && (BOB_EXPRESSIONS as readonly string[]).includes(value)
}

/** Resolves the semantic expression to an asset path, never a broken filename. */
export function bobAsset(expression: unknown): string {
  const safe = isBobExpression(expression) ? expression : BOB_FALLBACK_EXPRESSION
  return `/bob/${safe}.webp`
}
