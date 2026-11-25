export const CANVAS_ASSET_PREFIX = 'canvas-asset:'

export function parseCanvasAssetRef(ref: unknown): string | null {
  if (typeof ref !== 'string' || !ref.startsWith(CANVAS_ASSET_PREFIX)) return null
  const hash = ref.slice(CANVAS_ASSET_PREFIX.length)
  return /^[a-f0-9]{64}$/.test(hash) ? hash : null
}

export function canvasAssetUrl(hash: string): string {
  return `/api/canvas/assets/${hash}`
}
