/**
 * Chromium refuses to rasterize past this on either side, and fails by
 * returning a blank image rather than by throwing.
 */
const side = 16_384

/**
 * The largest scale that still rasterizes, at or below the one asked for. A
 * frame already past the limit at 1x gets a scale below 1: clamping to 1 would
 * hand back a scale this cannot promise.
 */
export function fit(box: { height: number; width: number } | null, scale: number): number {
  if (!box?.height || !box.width) return scale
  return Math.min(scale, side / box.width, side / box.height)
}
