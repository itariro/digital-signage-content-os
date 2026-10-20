/**
 * Single source for reading the `?frame=` query parameter that a dozen API
 * routes were each re-parsing by hand.
 */
export function frameIdParam(source: string | { searchParams: URLSearchParams }): string | undefined {
  const url = typeof source === 'string' ? new URL(source) : source
  const value = url.searchParams.get('frame')?.trim()
  return value ? value : undefined
}
