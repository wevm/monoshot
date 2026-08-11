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

/** The small copy a swatch is drawn from. */
export function thumbnail(id: string) {
  return `/wallpapers/${id}-thumb.webp`
}

const embedded = new Map<string, Promise<string>>()

/**
 * The image as data, which is how it reaches both the artwork on screen and the
 * copy an export captures: a capture reads the styles it finds, and a URL there
 * would leave the backdrop to a fetch the capture never waits for.
 */
export function embed(id: string): Promise<string> {
  const held = embedded.get(id)
  if (held) return held
  const loading = (async () => {
    const response = await fetch(`/wallpapers/${id}.webp`)
    if (!response.ok) throw new Error(`Wallpaper ${id} is not here (${response.status}).`)
    const blob = await response.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(reader.error ?? new Error(`Wallpaper ${id} did not read.`))
      reader.onload = () => resolve(String(reader.result))
      reader.readAsDataURL(blob)
    })
  })()
  // Held only while it stands: a failed load is worth trying again, and holding
  // the rejection would fail every later attempt without asking.
  loading.catch(() => embedded.delete(id))
  embedded.set(id, loading)
  return loading
}
