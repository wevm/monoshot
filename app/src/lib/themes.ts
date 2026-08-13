import { Theme } from 'monoshot'

import { swatches } from './swatches.js'
import * as Wallpapers from './wallpapers.js'

/**
 * Frame settings a theme brings with it, which the frame takes when the theme
 * is chosen. A theme naming none leaves the frame as the app draws it.
 */
const framing: Record<string, Framing> = {
  // Square, because the artwork it stands on is drawn in straight lines.
  tempo: { radius: 0 },
}

/** What a theme asks of the frame around it. */
export type Framing = { radius: number }

/** The frame the app draws for a theme that asks for nothing of its own. */
const plain: Framing = { radius: 12 }

/**
 * How the frame changes when the theme does.
 *
 * A theme's own framing applies when it is picked, and the plain frame comes
 * back on leaving it. Stepping between two themes that ask for nothing leaves
 * a reader's own frame alone.
 */
export function reframe(from: string, to: string): Partial<Framing> {
  if (framing[to]) return framing[to]
  return framing[from] ? plain : {}
}

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
