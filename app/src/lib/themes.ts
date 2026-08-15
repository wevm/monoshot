import { Theme } from 'monoshot'

import { swatches } from './swatches.js'
import * as Wallpapers from './wallpapers.js'

/** Frame overrides applied when a theme is selected. */
const framing: Record<string, Framing> = {
  // Match the rectangular geometry of the Tempo artwork.
  tempo: { radius: 0 },
}

/** Theme-specific frame properties. */
export type Framing = { radius: number }

/** Default frame properties. */
const plain: Framing = { radius: 12 }

/** Returns the frame overrides for a theme. */
export function frame(name: string): Partial<Framing> {
  return framing[name] ?? {}
}

/**
 * Returns frame changes required by a theme transition.
 *
 * Applies theme overrides on entry and restores defaults on exit. Transitions
 * between themes without overrides preserve the current frame settings.
 */
export function reframe(from: string, to: string): Partial<Framing> {
  if (framing[to]) return framing[to]
  return framing[from] ? plain : {}
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
  return Wallpapers.byId(name) !== undefined
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
