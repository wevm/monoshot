import { converter, formatCss, parse } from 'culori'
import type { ThemeRegistrationResolved } from 'shiki'
import { themes } from 'tm-themes'

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
 */
export function derive(theme: ThemeRegistrationResolved): derive.Result {
  const type = theme.type === 'light' ? 'light' : 'dark'
  const background = theme.colors?.['editor.background'] ?? theme.bg ?? fallbackBg[type]
  const foreground = theme.colors?.['editor.foreground'] ?? theme.fg ?? fallbackFg[type]

  const bg = toOklch(background) ?? toOklch(fallbackBg[type])!
  const fg = toOklch(foreground) ?? toOklch(fallbackFg[type])!
  const accent = pickAccent(theme) ?? bg

  // Achromatic themes (min-light, vesper, ...) have no hue to rotate, so the
  // backdrop stays neutral rather than emitting `oklch(... NaN)`.
  const hue = Number.isFinite(accent.h) && (accent.c ?? 0) > 0.02 ? (accent.h ?? 0) : undefined
  const chroma = hue === undefined ? 0 : type === 'dark' ? 0.09 : 0.06
  const lightness = type === 'dark' ? clamp(bg.l + 0.16, 0.2, 0.55) : clamp(bg.l - 0.06, 0.7, 0.95)

  return {
    backdrop: {
      angle: 140,
      from: css({ l: lightness, c: chroma, h: rotate(hue, -25) }),
      to: css({ l: clamp(lightness - 0.06, 0.12, 0.98), c: chroma, h: rotate(hue, 25) }),
    },
    type,
    window: {
      background,
      border: css({ l: mix(fg.l, bg.l, 0.12), c: bg.c * 0.5, h: bg.h }),
      foreground,
      title: css({ l: mix(fg.l, bg.l, 0.55), c: bg.c * 0.5, h: bg.h }),
    },
  }
}

export declare namespace derive {
  type Result = {
    /** Gradient behind the window. */
    backdrop: { angle: number; from: string; to: string }
    type: 'light' | 'dark'
    /** The code surface itself, using the theme's own canvas. */
    window: { background: string; border: string; foreground: string; title: string }
  }
}

/** Theme metadata as published by `tm-themes`. */
export type Info = {
  displayName: string
  name: string
  type: 'light' | 'dark'
}

const infos: readonly Info[] = themes.map((theme) => ({
  displayName: theme.displayName,
  name: theme.name,
  type: theme.type === 'light' ? 'light' : 'dark',
}))

const byName = new Map(infos.map((entry) => [entry.name, entry]))

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

function mix(a: number, b: number, amount: number): number {
  return b + (a - b) * amount
}

function rotate(hue: number | undefined, degrees: number): number | undefined {
  return hue === undefined ? undefined : (hue + degrees + 360) % 360
}
