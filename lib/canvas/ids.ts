export const CANVAS_LIBRARY_ID = 'canvas-library'

export function isLibraryFrame(frameId: string | null | undefined): boolean {
  return frameId === CANVAS_LIBRARY_ID
}
