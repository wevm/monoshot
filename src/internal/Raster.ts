/**
 * Chromium's maximum rasterized width or height. Larger captures return a
 * blank image without throwing.
 */
const side = 16_384

/**
 * Returns the largest scale at or below the requested value that fits the
 * Chromium limit. Oversized frames may require a scale below 1.
 */
export function fit(box: { height: number; width: number } | null, scale: number): number {
  if (!box?.height || !box.width) return scale
  return Math.min(scale, side / box.width, side / box.height)
}
