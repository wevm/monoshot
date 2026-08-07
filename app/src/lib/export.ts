import { snapdom } from '@zumer/snapdom'

/** Scales the export menu offers, as multiples of the artwork's own size. */
export const scales = [2, 4, 6] as const

/** Marks chrome that belongs to the editor rather than the artwork. */
export const ignore = 'data-ignore-in-export'

/**
 * Chromium refuses to rasterize a canvas past this on either side, and browsers
 * cap total area well below the square of it. Both are silent failures: the
 * capture returns a blank image rather than throwing.
 */
const side = 16_384

/** Total pixels a canvas can hold. Mobile Safari gives up far sooner. */
const area = () => (matchMedia('(pointer: coarse)').matches ? 33_000_000 : 130_000_000)

/**
 * The largest scale that still rasterizes, at or below the one asked for. A
 * request past the cap is met rather than refused, at the size that works.
 */
export function fit(size: { height: number; width: number }, scale: number): number {
  const { height, width } = size
  if (!height || !width) return scale
  const bySide = Math.min(side / width, side / height)
  const byArea = Math.sqrt(area() / (width * height))
  return Math.max(1, Math.min(scale, bySide, byArea))
}

/**
 * Captures a node as an image. Fonts are inlined and editor chrome is dropped,
 * so the result carries only the artwork.
 */
export async function capture(node: Element, options: capture.Options): Promise<Blob> {
  const { scale, type } = options
  const blob = await snapdom.toBlob(node, {
    // Transparent rather than white, so a frame exported without a backdrop
    // composites onto whatever it is pasted into.
    backgroundColor: 'transparent',
    // Pinned, or snapdom would multiply by the display's own ratio and a 4x
    // export would come out 8x on a retina screen and 4x everywhere else.
    dpr: 1,
    embedFonts: true,
    exclude: [`[${ignore}]`],
    // Hiding would leave the handles' space in the artwork.
    excludeMode: 'remove',
    scale,
    type,
  })
  // A canvas past the browser's limit resolves to an empty image rather than
  // throwing, which would otherwise save as a blank file.
  if (type !== 'svg' && blob.size < 1024) throw new Error('The image came back empty.')
  return blob
}

export declare namespace capture {
  type Options = {
    /** Multiplier on the node's own size. */
    scale: number
    type: 'png' | 'svg'
  }
}

/** Saves a blob to the user's downloads. */
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = name
  link.href = url
  link.click()
  // Not in this tick: revoking before the browser has read the blob cancels
  // the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Puts an image on the clipboard. The blob is handed over as a promise because
 * Safari only honors a write that starts in the gesture that asked for it.
 */
export async function copy(blob: Promise<Blob>): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
}
