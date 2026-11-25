/** Largest uniform scale that fits a slot inside the viewport. */
export function fitScale(slotW: number, slotH: number, viewportW: number, viewportH: number): number {
  if (!(slotW > 0) || !(slotH > 0) || !(viewportW > 0) || !(viewportH > 0)) return 0
  return Math.min(viewportW / slotW, viewportH / slotH)
}
