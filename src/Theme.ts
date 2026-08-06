import { converter, formatCss, parse } from 'culori'
import { bundledThemesInfo } from 'shiki'
import type { BundledTheme, ThemeRegistrationResolved } from 'shiki'

/** Every theme shiki bundles, as pickable metadata. Carries no theme payload. */
export function list(): readonly Info[] {
  return infos
}

/** Metadata for one theme, or `undefined` when the name is not bundled. */
export function info(name: string): Info | undefined {
  return byName.get(name)
}

/**
 * Derives the frame palette from a loaded shiki theme so every bundled theme
 * produces a coherent window, backdrop, and annotation styling.
 *
 * Pure and deterministic: the same theme always yields the same palette.
 *
 * @example
 * ```ts twoslash
 * import { Frame, Theme } from 'monoshot'
 *
 * const result = await Frame.create().render({ code: 'a', lang: 'ts', theme: 'nord' })
 * const palette = Theme.derive(result.theme)
 * palette.backdrop.from
 * // ^?
 * ```
 */
export function derive(theme: ThemeRegistrationResolved): derive.Result {
  const type = theme.type === 'light' ? 'light' : 'dark'
  // `||` rather than `??`: an empty string is a missing color, not a value.
  const background = theme.colors?.['editor.background'] || theme.bg || fallbackBg[type]
  const foreground = theme.colors?.['editor.foreground'] || theme.fg || fallbackFg[type]

  const bg = toOklch(background) ?? toOklch(fallbackBg[type])!
  const fg = toOklch(foreground) ?? toOklch(fallbackFg[type])!
  const accent = pickAccent(theme)

  // Achromatic themes (min-light, vesper, ...) have no hue to rotate, so the
  // backdrop stays neutral rather than emitting `oklch(... NaN)`.
  const hue = accent?.h
  const chroma = hue === undefined ? 0 : type === 'dark' ? 0.09 : 0.06
  // Symmetric magnitude in both directions so the window always separates from
  // the backdrop by the same amount, whichever way the theme leans.
  const shift = 0.16
  const lightness = clamp(type === 'dark' ? bg.l + shift : bg.l - shift, 0.16, 0.94)

  return {
    backdrop: {
      angle: 140,
      from: css({ c: chroma, h: rotate(hue, -25), l: lightness }),
      to: css({ c: chroma, h: rotate(hue, 25), l: clamp(lightness - 0.06, 0.1, 0.98) }),
    },
    type,
    window: {
      background,
      border: css({ c: bg.c * 0.5, h: bg.h, l: mix(fg.l, bg.l, 0.12) }),
      title: css({ c: bg.c * 0.5, h: bg.h, l: contrast(mix(fg.l, bg.l, 0.55), bg.l) }),
    },
  }
}

export declare namespace derive {
  type Result = {
    /** Gradient painted behind the window. */
    backdrop: {
      /** Gradient angle in degrees. */
      angle: number
      /** Gradient start color. */
      from: string
      /** Gradient end color. */
      to: string
    }
    /** Whether the frame reads as a light or dark surface. */
    type: 'light' | 'dark'
    /** The code surface itself, using the theme's own canvas. */
    window: {
      /** Canvas behind the code. */
      background: string
      /** Hairline around the window. */
      border: string
      /** Title-bar text, kept readable against the canvas. */
      title: string
    }
  }
}

/** Theme metadata as published by shiki. Frozen: callers share one instance. */
export type Info = {
  /** Human-readable name for a picker. */
  readonly displayName: string
  /** Identifier accepted by `Frame.render`. */
  readonly name: BundledTheme
  /** Whether the theme is a light or dark scheme. */
  readonly type: 'light' | 'dark'
}

// `bundledThemesInfo` types `id` as a plain string; the set-equality test in
// `Theme.test.ts` is what keeps this narrowing honest.
const infos: readonly Info[] = bundledThemesInfo.map((theme) =>
  Object.freeze({
    displayName: theme.displayName,
    name: theme.id as BundledTheme,
    type: theme.type === 'light' ? 'light' : ('dark' as const),
  }),
)

const byName = new Map(infos.map((entry) => [entry.name as string, entry]))

const fallbackBg = { dark: '#101010', light: '#ffffff' }
const fallbackFg = { dark: '#ededed', light: '#171717' }

const oklch = converter('oklch')

type Oklch = { c: number; h?: number | undefined; l: number }

function toOklch(value: string): Oklch | undefined {
  const parsed = parse(value)
  if (!parsed) return undefined
  const converted = oklch(parsed)
  return { c: converted.c, h: converted.h, l: converted.l }
}

/**
 * The theme's identity hue: a chroma-weighted circular mean over its token
 * colors. Averaging beats picking the most saturated token, which is usually
 * the one loud error red rather than the palette the theme reads as.
 *
 * Resolved themes carry their token colors on `settings`; `tokenColors` is the
 * unresolved input shape and is empty by the time shiki hands the theme back.
 */
function pickAccent(theme: ThemeRegistrationResolved): Oklch | undefined {
  const tokens = [...(theme.settings ?? []), ...(theme.tokenColors ?? [])]
  let x = 0
  let y = 0
  let chroma = 0
  let count = 0
  for (const token of tokens) {
    const value = token.settings?.foreground
    if (!value) continue
    const color = toOklch(value)
    if (!color || !Number.isFinite(color.h) || color.c <= 0.02) continue
    const radians = ((color.h ?? 0) * Math.PI) / 180
    x += Math.cos(radians) * color.c
    y += Math.sin(radians) * color.c
    chroma += color.c
    count += 1
  }
  if (count === 0) return undefined
  // A near-zero resultant means hues cancel out (a balanced rainbow palette),
  // so there is no identity hue to borrow.
  if (Math.hypot(x, y) / chroma < 0.15) return undefined
  return { c: chroma / count, h: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360, l: 0.5 }
}

function css(color: Oklch): string {
  return formatCss({ mode: 'oklch', ...color, h: color.h ?? 0 })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Pushes `value` away from `against` until the two are legible together. */
function contrast(value: number, against: number, minimum = 0.28): number {
  if (Math.abs(value - against) >= minimum) return value
  return clamp(against + (against > 0.5 ? -minimum : minimum), 0, 1)
}

function mix(a: number, b: number, amount: number): number {
  return b + (a - b) * amount
}

function rotate(hue: number | undefined, degrees: number): number | undefined {
  return hue === undefined ? undefined : (hue + degrees + 360) % 360
}
