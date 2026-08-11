import { Theme } from 'monoshot'

import { palettes } from './palettes.js'
import { swatches } from './swatches.js'
import * as Wallpapers from './wallpapers.js'

/**
 * The themes on offer: the ones shiki bundles, and one made from the colors of
 * each wallpaper, so a snippet can be dressed in the picture behind it.
 */
export function list(): readonly Theme.Info[] {
  return offered
}

/** Metadata for one theme, or nothing when it is not one offered. */
export function info(name: string): Theme.Info | undefined {
  return byName.get(name)
}

/** The themes the renderer is built with, which the bundled ones are not. */
export const composed = palettes.map((palette) =>
  Theme.compose({
    colors: palette.colors,
    displayName: named(palette.id),
    name: palette.id,
    type: palette.type,
  }),
)

/** What a theme is shown as: the backdrop it draws, and the colors on it. */
export type Swatch = {
  /** A CSS image: the theme's own backdrop, or the picture it stands on. */
  backdrop: string
  colors: readonly string[]
}

/** The colors a theme is known by, for a picker to show it as. */
export function swatch(name: string): Swatch {
  return drawn.get(name) ?? { backdrop: '#101010', colors: ['#888888', '#aaaaaa', '#cccccc'] }
}

/** Whether a theme was made here from a picture rather than bundled by shiki. */
export function curated(name: string): boolean {
  return palettes.some((palette) => palette.id === name)
}

const drawn = new Map<string, Swatch>([
  ...Object.entries(swatches),
  // A composed theme is known by what it paints rather than by what it was made
  // from: the picture's colors are held to a lightness before they become text,
  // and the swatch shows the text.
  ...composed.map((theme) => {
    const painted = (theme.settings ?? [])
      .filter((rule) => rule.scope)
      .map((rule) => rule.settings.foreground)
      .filter((color) => color !== undefined)
    // Past the comment, which every theme paints quietest and none is known by.
    // The picture it stands on, which is the backdrop it is drawn against.
    return [
      theme.name as string,
      {
        backdrop: `url("${Wallpapers.thumbnail(theme.name as string)}")`,
        colors: painted.slice(1, 4),
      },
    ] as const
  }),
])

const offered: readonly Theme.Info[] = [
  ...Theme.list(),
  ...palettes.map((palette) => ({
    displayName: named(palette.id),
    // Composed rather than bundled, which the renderer is what knows: this list
    // is what a picker walks, and it walks both the same way.
    name: palette.id as Theme.Info['name'],
    type: palette.type,
  })),
]

const byName = new Map(offered.map((entry) => [entry.name as string, entry]))

/** What a picture's theme is called, which is what the picture is called. */
function named(id: string) {
  return Wallpapers.list.find((wallpaper) => wallpaper.id === id)?.name ?? id
}
