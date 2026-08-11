import { Theme } from 'monoshot'

import { palettes } from './palettes.js'
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
