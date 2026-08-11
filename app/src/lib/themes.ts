import { Theme } from 'monoshot'

import { swatches } from './swatches.js'
import * as Wallpapers from './wallpapers.js'

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

/** Whether a theme was made from a picture rather than bundled by shiki. */
export function curated(name: string): boolean {
  return Wallpapers.byId(name) !== undefined
}

const drawn = new Map<string, Swatch>(
  Object.entries(swatches).map(([name, shown]) => [
    name,
    {
      // A theme made from a picture is shown standing on it, as it renders.
      backdrop: curated(name) ? `url("${Wallpapers.thumbnail(name)}")` : shown.backdrop,
      colors: shown.colors,
    },
  ]),
)
