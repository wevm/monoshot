/**
 * Available backdrops include Tempo artwork and macOS wallpapers sourced from
 * the 512 Pixels archive. Neither source grants redistribution rights here.
 *
 * @see https://512pixels.net/projects/default-mac-wallpapers-in-5k/
 */

/** Prefix for wallpaper background identifiers. */
const prefix = 'wallpaper:'

/** Wallpaper metadata. */
export type Wallpaper = {
  id: string
  name: string
}

/** Loaded wallpaper data and its dominant color. */
export type Picture = {
  /**
   * Dominant image color used to tint related UI.
   * Available after color analysis completes.
   */
  color?: string | undefined
  /** Four dominant colors used to pair the picture with syntax highlighting. */
  colors?: readonly string[] | undefined
  /** The image as a `data:` URL. */
  source: string
}

/** Available wallpapers, with macOS releases first and Tempo last. */
export const list: readonly Wallpaper[] = [
  { id: 'golden-gate-dark', name: 'Golden Gate Dark' },
  { id: 'golden-gate-light', name: 'Golden Gate' },
  { id: 'tahoe-light', name: 'Tahoe' },
  { id: 'tahoe-dark', name: 'Tahoe Dark' },
  { id: 'sequoia-light', name: 'Sequoia' },
  { id: 'sequoia-dark', name: 'Sequoia Dark' },
  { id: 'mountain-lion', name: 'Mountain Lion' },
  { id: 'snow-leopard', name: 'Snow Leopard' },
  { id: 'panther', name: 'Panther' },
  { id: 'tempo', name: 'Tempo' },
]

/** The background a wallpaper is set as. */
export function background(id: string) {
  return `${prefix}${id}`
}

/** Returns the wallpaper referenced by a background, or `undefined` for colors. */
export function at(background: string): Wallpaper | undefined {
  if (!background.startsWith(prefix)) return undefined
  const id = background.slice(prefix.length)
  return list.find((wallpaper) => wallpaper.id === id)
}

/** Whether a background references a wallpaper identifier. */
export function names(background: string): boolean {
  return background.startsWith(prefix)
}

/** Returns the thumbnail path used by a wallpaper swatch. */
export function thumbnail(id: string) {
  return `/wallpapers/${id}-thumb.webp`
}

const embedded = new Map<string, Promise<string>>()
const palettes = new Map<string, Promise<readonly string[]>>()

/**
 * Loads a wallpaper as a data URL for display and image export.
 */
export function embed(id: string): Promise<string> {
  const held = embedded.get(id)
  if (held) return held
  const loading = (async () => {
    const response = await fetch(`/wallpapers/${id}.webp`)
    if (!response.ok) throw new Error(`Wallpaper ${id} is not here (${response.status}).`)
    return await read(await response.blob(), id)
  })()
  // Remove failed loads from the cache so a later request can retry.
  loading.catch(() => embedded.delete(id))
  embedded.set(id, loading)
  return loading
}

/**
 * Returns the dominant wallpaper color after the image loads.
 *
 * Color analysis is separate from image loading so it does not delay display.
 */
export function palette(id: string): Promise<readonly string[]> {
  const held = palettes.get(id)
  if (held) return held
  const reading = embed(id).then(analyze)
  reading.catch(() => palettes.delete(id))
  palettes.set(id, reading)
  return reading
}

/** Loads and analyzes every bundled wallpaper for immediate selection. */
export async function preload(): Promise<void> {
  await Promise.allSettled(list.map((wallpaper) => palette(wallpaper.id)))
}

/** Reads the four most common, visually distinct colors in an image. */
export async function analyze(source: string): Promise<readonly string[]> {
  const image = new Image()
  image.src = source
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.height = grid.height
  canvas.width = grid.width
  const context = canvas.getContext('2d')
  if (!context) return ['#808080']
  context.drawImage(image, 0, 0, grid.width, grid.height)
  const { data } = context.getImageData(0, 0, grid.width, grid.height)
  return dominant(data)
}

/** Extracts up to four common, visually distinct colors from RGBA pixels. */
export function dominant(data: Uint8ClampedArray): readonly string[] {
  const buckets = new Map<number, { b: number; count: number; g: number; r: number }>()
  for (let at = 0; at < data.length; at += 4) {
    if ((data[at + 3] ?? 0) < 128) continue
    const r = data[at] ?? 0
    const g = data[at + 1] ?? 0
    const b = data[at + 2] ?? 0
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key) ?? { b: 0, count: 0, g: 0, r: 0 }
    bucket.b += b
    bucket.count += 1
    bucket.g += g
    bucket.r += r
    buckets.set(key, bucket)
  }
  const colors = [...buckets.values()]
    .sort((left, right) => right.count - left.count)
    .map(
      (bucket) =>
        [
          Math.round(bucket.r / bucket.count),
          Math.round(bucket.g / bucket.count),
          Math.round(bucket.b / bucket.count),
        ] as const,
    )
  const selected: (readonly [number, number, number])[] = []
  for (const candidate of colors) {
    if (selected.every((color) => distance(color, candidate) > 48 ** 2)) selected.push(candidate)
    if (selected.length === 4) break
  }
  for (const candidate of colors) {
    if (selected.includes(candidate)) continue
    selected.push(candidate)
    if (selected.length === 4) break
  }
  return selected.map(hex)
}

function read(blob: Blob, id: string) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error(`Wallpaper ${id} did not read.`))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

/** How coarsely the picture is read: enough pixels to weigh it, few to walk. */
const grid = { height: 40, width: 64 }

function distance(left: readonly number[], right: readonly number[]) {
  return (left[0]! - right[0]!) ** 2 + (left[1]! - right[1]!) ** 2 + (left[2]! - right[2]!) ** 2
}

function hex(color: readonly number[]) {
  return `#${color.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}
