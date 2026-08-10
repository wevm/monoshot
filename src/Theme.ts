import { converter, formatCss, parse } from 'culori'
import { bundledThemesInfo } from 'shiki'
import type { BundledTheme, ThemeRegistrationResolved } from 'shiki'

/**
 * The themes a frame offers, as pickable metadata. Carries no theme payload.
 *
 * A chosen few rather than everything shiki bundles: a picker is a decision to
 * make, and sixty of them is a list to read.
 */
export function list(): readonly Info[] {
  return infos
}

/** Metadata for one theme, or `undefined` when it is not one offered. */
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
/**
 * The hues a mark carries, which mean what they mean whatever the theme: a
 * deletion reads as a deletion in every one of them.
 *
 * Read by whatever draws a marked snippet, so an editor showing the marks live
 * and the image it exports agree on what they look like.
 */
export const marks = {
  /** An added line, and an `@annotate` tag. */
  add: 'oklch(66% 0.15 150)',
  /** A `@log` tag. */
  log: 'oklch(64% 0.15 250)',
  /** A removed line, and an `@error` tag. */
  remove: 'oklch(62% 0.19 20)',
  /** A `@warn` tag. */
  warn: 'oklch(74% 0.14 80)',
} as const

export function derive(theme: ThemeRegistrationResolved): derive.Result {
  const type = theme.type === 'light' ? 'light' : 'dark'
  // First parseable candidate wins: an unparseable color is as missing as an
  // absent one, and would otherwise be returned raw as `window.background`.
  const background = pick([theme.colors?.['editor.background'], theme.bg], fallbackBg[type])
  const foreground = pick([theme.colors?.['editor.foreground'], theme.fg], fallbackFg[type])

  const bg = toOklch(background)!
  const fg = toOklch(foreground)!
  const accent = pickAccent(theme)

  // An achromatic theme has no hue to rotate, so the backdrop stays neutral
  // rather than emitting `oklch(... NaN)`.
  const hue = accent?.h
  // The backdrop is the theme's own color rather than a fixed wash of its hue,
  // so a vivid theme sits on a vivid one. Bounded either way: unbounded, a
  // saturated keyword becomes a backdrop that outshouts the code on it.
  const chroma =
    accent === undefined
      ? 0
      : type === 'dark'
        ? clamp(accent.c, 0.06, 0.15)
        : clamp(accent.c * 0.6, 0.03, 0.09)
  // Symmetric magnitude in both directions so the window always separates from
  // the backdrop by the same amount, whichever way the theme leans.
  const shift = 0.16
  const lightness = clamp(type === 'dark' ? bg.l + shift : bg.l - shift, 0.16, 0.94)

  return {
    // Nearly black, tinted by the theme's own hue, so the app chrome recedes
    // behind the artwork whatever the theme.
    page: {
      background: css({
        c: hue === undefined ? 0 : 0.05,
        h: hue,
        // Sits just off the window rather than falling away to black, so the
        // theme still reads in the shell.
        l: type === 'dark' ? clamp(bg.l + 0.06, 0.16, 0.32) : 0.2,
      }),
      foreground: css({ c: hue === undefined ? 0 : 0.01, h: hue, l: 0.93 }),
    },
    backdrop: {
      angle: 140,
      from: css({ c: chroma, h: rotate(hue, -25), l: lightness }),
      to: css({ c: chroma, h: rotate(hue, 25), l: clamp(lightness - 0.06, 0.1, 0.98) }),
    },
    type,
    window: {
      background,
      border: css({ c: bg.c * 0.5, h: bg.h, l: mix(fg.l, bg.l, 0.12) }),
      foreground,
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
    /**
     * Canvas the frame sits on: near-black with a hint of the theme's hue.
     * Surfaces with the backdrop turned off use `window` instead, so the
     * artwork reads as one continuous color.
     */
    page: {
      /** The canvas color itself. */
      background: string
      /** Readable against `page.background`. */
      foreground: string
    }
    /** Whether the frame reads as a light or dark surface. */
    type: 'light' | 'dark'
    /** The code surface itself, using the theme's own canvas. */
    window: {
      /** Canvas behind the code. */
      background: string
      /** Hairline around the window. */
      border: string
      /** The theme's own text color, readable against `background`. */
      foreground: string
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
// The container is frozen as well as its entries: `list()` hands out this very
// array, so an ordinary `sort()` would reorder it for every later caller.
/** The themes offered, in the order a picker walks them. */
const offered: readonly string[] = [
  'aurora-x',
  'dracula',
  'github-dark',
  'github-dark-default',
  'github-light',
  'gruvbox-light-soft',
  'horizon',
  'horizon-bright',
  'houston',
  'nord',
  'poimandres',
  'rose-pine',
  'tokyo-night',
  'vitesse-dark',
  'vitesse-light',
]

const infos: readonly Info[] = Object.freeze(
  bundledThemesInfo
    .filter((theme) => offered.includes(theme.id))
    .map((theme) =>
      Object.freeze({
        displayName: theme.displayName,
        name: theme.id as BundledTheme,
        type: theme.type === 'light' ? 'light' : ('dark' as const),
      }),
    ),
)

const byName = new Map(infos.map((entry) => [entry.name as string, entry]))

const fallbackBg = { dark: '#101010', light: '#ffffff' }
const fallbackFg = { dark: '#ededed', light: '#171717' }

/** First candidate a color parser accepts, else the fallback. */
function pick(candidates: readonly (string | undefined)[], fallback: string): string {
  for (const candidate of candidates) if (candidate && toOklch(candidate)) return candidate
  return fallback
}

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
  /** Token colors gathered by hue, wide enough that one hue lands in one arc. */
  const arcs = new Map<
    number,
    { chroma: number; count: number; weight: number; x: number; y: number }
  >()
  for (const token of tokens) {
    const value = token.settings?.foreground
    if (!value) continue
    const color = toOklch(value)
    if (!color || !Number.isFinite(color.h) || color.c <= 0.02) continue
    // A rule painting twenty scopes carries twenty times as much of the theme
    // as one painting a single scope, and a vivid color carries more than a
    // muted one at the same reach.
    const weight = scopes(token.scope) * color.c
    const arc = Math.floor((color.h ?? 0) / 30)
    const found = arcs.get(arc) ?? { chroma: 0, count: 0, weight: 0, x: 0, y: 0 }
    const radians = ((color.h ?? 0) * Math.PI) / 180
    found.chroma += color.c
    found.count += 1
    found.weight += weight
    found.x += Math.cos(radians) * weight
    found.y += Math.sin(radians) * weight
    arcs.set(arc, found)
  }
  const heaviest = [...arcs.values()].sort((a, b) => b.weight - a.weight)[0]
  if (!heaviest) return undefined
  // The mean of the arc that won rather than of the whole palette: averaging
  // every hue a theme uses lands between them, on a color it never paints.
  return {
    c: heaviest.chroma / heaviest.count,
    h: ((Math.atan2(heaviest.y, heaviest.x) * 180) / Math.PI + 360) % 360,
    l: 0.5,
  }
}

/** How much of a theme a rule paints, as the number of scopes it names. */
function scopes(scope: string | readonly string[] | undefined): number {
  if (Array.isArray(scope)) return Math.max(scope.length, 1)
  if (typeof scope === 'string') return Math.max(scope.split(',').length, 1)
  return 1
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
