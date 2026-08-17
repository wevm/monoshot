import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { converter, formatCss } from 'culori'

/**
 * Reads the colors each wallpaper is made of and writes them out for the app to
 * build a theme from.
 *
 * Run after changing what `app/public/wallpapers` holds:
 *
 * ```sh
 * pnpm exec tsx scripts/wallpaper-palettes.ts
 * ```
 *
 * Needs ImageMagick, which is what decodes the WebP: the colors are read from
 * the picture rather than declared, so the themes cannot drift from it.
 */

/** How many colors a theme is built from, most telling first. */
const wanted = 6

/** Fallback palette colors for images without measurable chroma. */
const borrowed: Record<string, readonly string[]> = {
  // Tempo uses blue for accents and white for string tokens.
  tempo: ['oklch(64.94% 0.1982 251.813)', '#ffffff'],
}

/** Explicit canvas colors for artwork with a fixed background. */
const canvas: Record<string, string> = {
  // Match the translucent black background of the Tempo artwork.
  tempo: '#000000e6',
}

/** Corner radius a theme's artwork asks its window to take. */
const radii: Record<string, number> = {
  // Match the rectangular geometry of the Tempo artwork.
  tempo: 0,
}

/** How coarsely a picture is read: enough pixels to weigh it, few to walk. */
const grid = { height: 60, width: 96 }

const directory = path.join(import.meta.dirname, '..', 'app', 'public', 'wallpapers')
const output = path.join(import.meta.dirname, '..', 'src', 'internal', 'palettes.ts')
const toOklch = converter('oklch')

const palettes = fs
  .readdirSync(directory)
  .filter((file) => file.endsWith('.webp') && !file.endsWith('-thumb.webp'))
  .sort()
  .map((file) => {
    const id = file.replace(/\.webp$/, '')
    const pixels = read(path.join(directory, file))
    // Paired filenames specify their scheme. Infer the scheme from luminance
    // for standalone images.
    const paired = id.endsWith('-light') ? 'light' : id.endsWith('-dark') ? 'dark' : undefined
    return {
      ...(canvas[id] ? { background: canvas[id] } : {}),
      colors: strongest(pixels),
      displayName: titled(id),
      id,
      ...(radii[id] === undefined ? {} : { radius: radii[id] }),
      type: paired ?? (dark(pixels) ? 'dark' : 'light'),
    }
  })

for (const palette of palettes) {
  if (palette.colors.length > 0) continue
  const stated = borrowed[palette.id]
  if (!stated?.length)
    throw new Error(`\`${palette.id}\` reads no color, and none is named for it.`)
  palette.colors = [...stated]
}

fs.writeFileSync(
  output,
  `/**
 * The colors each of the default macOS wallpapers is made of, read from the
 * pictures by \`scripts/wallpaper-palettes.ts\`. Colors read off a picture, not
 * the picture: what a theme is composed from is a handful of numbers.
 *
 * Generated: edit the script, not this.
 */
export const palettes = ${JSON.stringify(palettes, null, 2)} as const satisfies readonly {
  background?: string
  colors: readonly string[]
  displayName: string
  id: string
  radius?: number
  type: 'dark' | 'light'
}[]
`,
)

console.log(`Wrote ${palettes.length} palettes to ${path.relative(process.cwd(), output)}`)

/** What a wallpaper's theme is called, which is what the release is called. */
function titled(id: string): string {
  return id
    .split('-')
    .map((part) => (part === 'gate' ? 'Gate' : part[0]?.toUpperCase() + part.slice(1)))
    .join(' ')
}

/** A picture's pixels, decoded to raw bytes through ImageMagick. */
function read(file: string): Uint8Array {
  const raw = execFileSync(
    'magick',
    [file, '-resize', `${grid.width}x${grid.height}!`, '-depth', '8', 'rgb:-'],
    { encoding: 'buffer', maxBuffer: 1 << 26 },
  )
  return new Uint8Array(raw)
}

/** Whether a picture is dark enough that code reads on it in the light. */
function dark(pixels: Uint8Array): boolean {
  let total = 0
  let count = 0
  for (let at = 0; at + 2 < pixels.length; at += 3) {
    total += lightness(pixels, at)
    count += 1
  }
  return count === 0 || total / count < 0.62
}

/**
 * The colors a picture is made of: hues gathered into arcs weighted by how
 * vivid they are, then the arcs in the order they carry the picture.
 *
 * Arc by arc rather than pixel by pixel, so a gradient running through a hue
 * counts once as that hue rather than as a hundred neighbours of it.
 */
function strongest(pixels: Uint8Array): string[] {
  const arcs = new Map<
    number,
    { chroma: number; count: number; lightness: number; weight: number; x: number; y: number }
  >()
  for (let at = 0; at + 2 < pixels.length; at += 3) {
    const color = toOklch({
      b: (pixels[at + 2] as number) / 255,
      g: (pixels[at + 1] as number) / 255,
      mode: 'rgb',
      r: (pixels[at] as number) / 255,
    })
    // Exclude achromatic pixels because their unstable hue would distort the
    // weighted hue groups.
    if (color.c <= 0.02 || !Number.isFinite(color.h)) continue
    const hue = color.h ?? 0
    const arc = Math.floor(hue / 20)
    const found = arcs.get(arc) ?? { chroma: 0, count: 0, lightness: 0, weight: 0, x: 0, y: 0 }
    const radians = (hue * Math.PI) / 180
    found.chroma += color.c
    found.count += 1
    found.lightness += color.l
    found.weight += color.c
    found.x += Math.cos(radians) * color.c
    found.y += Math.sin(radians) * color.c
    arcs.set(arc, found)
  }
  return [...arcs.values()]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, wanted)
    .map((arc) =>
      formatCss({
        c: arc.chroma / arc.count,
        h: ((Math.atan2(arc.y, arc.x) * 180) / Math.PI + 360) % 360,
        l: arc.lightness / arc.count,
        mode: 'oklch',
      }),
    )
}

function lightness(pixels: Uint8Array, at: number): number {
  const color = toOklch({
    b: (pixels[at + 2] as number) / 255,
    g: (pixels[at + 1] as number) / 255,
    mode: 'rgb',
    r: (pixels[at] as number) / 255,
  })
  return color.l
}
