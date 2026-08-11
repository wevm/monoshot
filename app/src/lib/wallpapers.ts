import { converter, formatCss } from 'culori'

/**
 * The default macOS wallpapers, offered as backdrops. Apple's artwork, taken
 * from 512pixels.net's archive and resized to 2560px WebP here, which neither
 * Apple nor that archive licenses for redistribution.
 *
 * @see https://512pixels.net/projects/default-mac-wallpapers-in-5k/
 */

/** What a background carries when it names a wallpaper rather than a color. */
const prefix = 'wallpaper:'

/** A wallpaper offered as a backdrop, named for the release it shipped with. */
export type Wallpaper = { id: string; name: string }

/** A loaded wallpaper: the image itself, and the color it reads as. */
export type Picture = {
  /**
   * The strongest color in the picture, for whatever is tinted to match it.
   * Absent until it has been read, which the picture does not wait for.
   */
  color?: string | undefined
  /** The image as a `data:` URL. */
  source: string
}

/** The wallpapers on offer, newest release first. */
export const list: readonly Wallpaper[] = [
  { id: 'golden-gate-light', name: 'Golden Gate' },
  { id: 'golden-gate-dark', name: 'Golden Gate Dark' },
  { id: 'tahoe-light', name: 'Tahoe' },
  { id: 'tahoe-dark', name: 'Tahoe Dark' },
  { id: 'sequoia-light', name: 'Sequoia' },
  { id: 'sequoia-dark', name: 'Sequoia Dark' },
  { id: 'mountain-lion', name: 'Mountain Lion' },
  { id: 'snow-leopard', name: 'Snow Leopard' },
  { id: 'panther', name: 'Panther' },
]

/** The background a wallpaper is set as. */
export function background(id: string) {
  return `${prefix}${id}`
}

/** The wallpaper a background names, or nothing when it names a color. */
export function at(background: string): Wallpaper | undefined {
  if (!background.startsWith(prefix)) return undefined
  const id = background.slice(prefix.length)
  return list.find((wallpaper) => wallpaper.id === id)
}

/** The wallpaper of that id, or nothing when it names none. */
export function byId(id: string): Wallpaper | undefined {
  return list.find((wallpaper) => wallpaper.id === id)
}

/** The small copy a swatch is drawn from. */
export function thumbnail(id: string) {
  return `/wallpapers/${id}-thumb.webp`
}

const embedded = new Map<string, Promise<string>>()
const cast = new Map<string, Promise<string>>()

/**
 * The picture as data, which is how it reaches both the artwork on screen and
 * the copy an export captures: a capture reads the styles it finds, and a URL
 * there would leave the backdrop to a fetch the capture never waits for.
 */
export function embed(id: string): Promise<string> {
  const held = embedded.get(id)
  if (held) return held
  const loading = (async () => {
    const response = await fetch(`/wallpapers/${id}.webp`)
    if (!response.ok) throw new Error(`Wallpaper ${id} is not here (${response.status}).`)
    return await read(await response.blob(), id)
  })()
  // Held only while it stands: a failed load is worth trying again, and holding
  // the rejection would fail every later attempt without asking.
  loading.catch(() => embedded.delete(id))
  embedded.set(id, loading)
  return loading
}

/**
 * The strongest color in the picture, read once the picture is here.
 *
 * Asked for apart from the picture rather than with it: reading the color means
 * decoding the image, and a backdrop that waited for that would be held back by
 * work nothing on screen is waiting for.
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
    // drag every arc toward whatever little tint they hold.
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
