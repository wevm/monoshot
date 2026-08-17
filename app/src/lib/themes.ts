import { Theme } from 'monoshot'

import { swatches } from './swatches.js'
import * as Wallpapers from './wallpapers.js'

/** Theme-specific frame properties. */
export type Framing = { radius: number }

/** Default frame properties. */
const plain: Framing = { radius: 12 }

/**
 * Returns the frame overrides a theme asks for.
 *
 * Read off the theme rather than listed here: a theme composed from artwork
 * states the geometry that artwork wants, and the CLI and the card renderer
 * read the same statement.
 */
function frame(name: string): Partial<Framing> {
  const radius = Theme.info(name)?.radius
  return radius === undefined ? {} : { radius }
}

/**
 * Returns frame changes required by a theme transition.
 *
 * Applies theme overrides on entry and restores defaults on exit. Transitions
 * between themes without overrides preserve the current frame settings.
 */
export function reframe(from: string, to: string): Partial<Framing> {
  const entering = frame(to)
  if (entering.radius !== undefined) return entering
  return frame(from).radius === undefined ? {} : plain
}

/** Theme preview colors and background. */
export type Swatch = {
  /** Code surface behind the syntax colors. */
  background: string
  /** CSS background used by the theme preview. */
  backdrop: string
  /** Representative syntax foreground colors. */
  colors: readonly string[]
}

/** Returns the preview swatch for a theme. */
export function swatch(name: string): Swatch {
  return (
    drawn.get(name) ?? {
      background: '#101010',
      backdrop: '#101010',
      colors: ['#888888', '#aaaaaa', '#cccccc'],
    }
  )
}

/** Returns whether a theme is derived from curated artwork. */
export function curated(name: string): boolean {
  return Theme.info(name)?.artwork === true
}

const drawn = new Map<string, Swatch>(
  Object.entries(swatches).map(([name, shown]) => [
    name,
    {
      background: shown.background,
      // Use curated artwork as the preview background when available.
      backdrop: curated(name) ? `url("${Wallpapers.thumbnail(name)}")` : shown.backdrop,
      colors: shown.colors,
    },
  ]),
)
