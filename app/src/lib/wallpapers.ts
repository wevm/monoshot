import { converter, formatCss } from 'culori'

/** Prefix for wallpaper background identifiers. */
const prefix = 'wallpaper:'

/** Wallpaper metadata. */
export type Wallpaper = {
  id: string
  name: string
  /**
   * Whether the wallpaper is exclusive to its associated theme.
   */
  themed?: boolean
}

/** Loaded wallpaper data and its dominant color. */
export type Picture = {
  /**
   * Dominant image color used to tint related UI.
   * Available after color analysis completes.
   */
  color?: string | undefined
  /** The image as a `data:` URL. */
  source: string
}

/** Available wallpapers. Add only artwork with documented redistribution rights. */
export const list: readonly Wallpaper[] = []

/** Wallpapers available as user-selectable backdrops. */
export const offered: readonly Wallpaper[] = list.filter((wallpaper) => !wallpaper.themed)

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

/** Returns the wallpaper with the specified identifier, when available. */
export function byId(id: string): Wallpaper | undefined {
  return list.find((wallpaper) => wallpaper.id === id)
}

/** Returns the thumbnail path used by a wallpaper swatch. */
export function thumbnail(id: string) {
  return `/wallpapers/${id}-thumb.webp`
}

const embedded = new Map<string, Promise<string>>()
const cast = new Map<string, Promise<string>>()

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
export function color(id: string): Promise<string> {
  const held = cast.get(id)
  if (held) return held
  const reading = embed(id).then((source) => strongest(source))
  reading.catch(() => cast.delete(id))
  cast.set(id, reading)
  return reading
}

function read(blob: Blob, id: string) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error(`Wallpaper ${id} did not read.`))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

const toOklch = converter('oklch')

/** How coarsely the picture is read: enough pixels to weigh it, few to walk. */
const grid = { height: 40, width: 64 }

/**
 * The color a picture reads as: hues gathered into arcs weighted by how vivid
 * they are, and the mean of the arc that carries the most.
 *
 * The mean of the whole picture would land between its hues, on a color it
 * never shows; the heaviest arc is a color it does.
 */
async function strongest(source: string): Promise<string> {
  const image = new Image()
  image.src = source
  await image.decode()
  const canvas = document.createElement('canvas')
  canvas.height = grid.height
  canvas.width = grid.width
  const context = canvas.getContext('2d')
  if (!context) return achromatic
  context.drawImage(image, 0, 0, grid.width, grid.height)
  const { data } = context.getImageData(0, 0, grid.width, grid.height)
  const arcs = new Map<
    number,
    { chroma: number; count: number; weight: number; x: number; y: number }
  >()
  let lightness = 0
  let read = 0
  for (let at = 0; at < data.length; at += 4) {
    const color = toOklch({
      b: (data[at + 2] as number) / 255,
      g: (data[at + 1] as number) / 255,
      mode: 'rgb',
      r: (data[at] as number) / 255,
    })
    lightness += color.l
    read += 1
    const chroma = color.c
    // A grey pixel carries no hue to weigh, and enough of them would otherwise
    // shift every hue toward weak chromatic noise.
    if (chroma <= 0.02 || !Number.isFinite(color.h)) continue
    const hue = color.h ?? 0
    const arc = Math.floor(hue / 30)
    const found = arcs.get(arc) ?? { chroma: 0, count: 0, weight: 0, x: 0, y: 0 }
    const radians = (hue * Math.PI) / 180
    found.chroma += chroma
    found.count += 1
    found.weight += chroma
    found.x += Math.cos(radians) * chroma
    found.y += Math.sin(radians) * chroma
    arcs.set(arc, found)
  }
  const heaviest = [...arcs.values()].sort((a, b) => b.weight - a.weight)[0]
  if (!heaviest || !read) return achromatic
  return formatCss({
    c: heaviest.chroma / heaviest.count,
    h: ((Math.atan2(heaviest.y, heaviest.x) * 180) / Math.PI + 360) % 360,
    l: lightness / read,
    mode: 'oklch',
  })
}

/** What a picture with no hue to speak of reads as. */
const achromatic = 'oklch(0.5 0 0)'
