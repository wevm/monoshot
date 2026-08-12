import { clampChroma, converter, formatCss, formatHex, parse } from 'culori'
import { bundledThemesInfo } from 'shiki'

import { palettes } from './internal/palettes.js'

// Declared before anything module scope reads it: the composed themes are
// built as this module loads, and they are read through here.
const oklch = converter('oklch')
import type { ThemeRegistrationRaw, ThemeRegistrationResolved } from 'shiki'

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

/** A theme name {@link list} offers. */
export type Name = (typeof names)[number]

/**
 * Stable semantic colors for source annotations across every theme.
 *
 * Shared by the editor and image renderer to keep annotation colors consistent.
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
    // Use a dark surface tinted by the theme hue to maintain separation between
    // application chrome and artwork.
    page: {
      background: css({
        c: hue === undefined ? 0 : 0.05,
        h: hue,
        // Keep the final stop near the window color instead of fading to black.
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

/**
 * Builds a syntax theme from an ordered color palette.
 *
 * Maps the supplied colors to syntax roles and adjusts their lightness for
 * contrast against the generated background.
 *
 * @example
 * ```ts twoslash
 * import { Theme } from 'monoshot'
 *
 * const theme = Theme.compose({
 *   colors: ['#4f9cf0', '#f0a84f', '#8bd18b'],
 *   displayName: 'Tahoe',
 *   name: 'tahoe',
 *   type: 'dark',
 * })
 * theme.name
 * // ^?
 * ```
 */
export function compose<const name extends string>(
  options: compose.Options<name>,
): ThemeRegistrationRaw & { name: name } {
  const { colors, displayName, name, type } = options
  const parsed = colors.map((color) => toOklch(color)).filter((color) => color !== undefined)
  const dominant = parsed[0]
  const hue = dominant && Number.isFinite(dominant.h) ? dominant.h : undefined
  // Repeat available colors with small hue and lightness adjustments when the
  // source palette has fewer colors than the syntax theme requires.
  const roles = Array.from({ length: 5 }, (_, at) => {
    const from = parsed[at % Math.max(parsed.length, 1)] ?? { c: 0.1, h: hue ?? 0, l: 0.7 }
    const round = Math.floor(at / Math.max(parsed.length, 1))
    return {
      color: { ...from, h: rotate(from.h, round * 14 * (at % 2 === 0 ? 1 : -1)) },
      weight: round === 0 ? 1 : round % 2 === 1 ? 0.92 : 1.07,
    }
  })
  const background = hex({
    c: hue === undefined ? 0 : 0.02,
    h: hue,
    l: type === 'dark' ? 0.17 : 0.97,
  })
  const foreground = hex({
    c: hue === undefined ? 0 : 0.01,
    h: hue,
    l: type === 'dark' ? 0.9 : 0.28,
  })
  /** A picture's color as text on this theme's background. */
  const token = (color: Oklch, weight = 1) =>
    hex({
      // A color with no hue stays without one: a floor on the chroma would
      // shift an achromatic picture's tokens toward the zero-degree red hue.
      c: Number.isFinite(color.h)
        ? clamp(color.c * 1.4, type === 'dark' ? 0.06 : 0.05, type === 'dark' ? 0.17 : 0.15)
        : 0,
      h: color.h,
      l: type === 'dark' ? clamp(0.78 * weight, 0.5, 0.92) : clamp(0.46 / weight, 0.24, 0.6),
    })
  type Role = { color: Oklch; weight: number }
  const [keyword, string, callable, constant, entity] = roles as [Role, Role, Role, Role, Role]
  // Render comments with reduced chroma to distinguish prose from code tokens.
  const comment = hex({
    c: hue === undefined ? 0 : 0.02,
    h: hue,
    l: type === 'dark' ? 0.55 : 0.6,
  })
  const punctuation = hex({
    c: hue === undefined ? 0 : 0.01,
    h: hue,
    l: type === 'dark' ? 0.68 : 0.48,
  })
  return {
    bg: background,
    // Carried as the literal it was given, so a renderer built with this theme
    // accepts its name where it accepts a bundled one.
    name,
    colors: { 'editor.background': background, 'editor.foreground': foreground },
    displayName,
    fg: foreground,
    // One list, under the name the format gives it: `tokenColors` is the same
    // field by another name, and a theme carrying both has one of them ignored.
    // The unscoped rule leads, as what every token falls back to.
    settings: [
      { settings: { background, foreground } },
      { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: comment } },
      {
        scope: ['keyword', 'storage', 'storage.type', 'keyword.control', 'keyword.operator.new'],
        settings: { foreground: token(keyword.color, keyword.weight) },
      },
      {
        scope: ['string', 'string.quoted', 'constant.other.symbol', 'markup.inserted'],
        settings: { foreground: token(string.color, string.weight) },
      },
      {
        scope: ['entity.name.function', 'support.function', 'meta.function-call'],
        settings: { foreground: token(callable.color, callable.weight) },
      },
      {
        scope: ['constant.numeric', 'constant.language', 'constant.character', 'support.constant'],
        settings: { foreground: token(constant.color, constant.weight) },
      },
      {
        scope: ['entity.name.type', 'entity.name.class', 'support.type', 'support.class'],
        settings: { foreground: token(entity.color, entity.weight) },
      },
      // Keep common variables at the foreground color so accent colors retain
      // semantic emphasis.
      { scope: ['variable', 'variable.other', 'support.variable'], settings: { foreground } },
      {
        scope: ['variable.parameter', 'variable.other.property', 'meta.object-literal.key'],
        settings: { foreground: token(entity.color, entity.weight * 0.94) },
      },
      {
        scope: ['punctuation', 'meta.brace', 'keyword.operator'],
        settings: { foreground: punctuation },
      },
      {
        scope: ['entity.name.tag'],
        settings: { foreground: token(keyword.color, keyword.weight) },
      },
      {
        scope: ['entity.other.attribute-name'],
        settings: { foreground: token(callable.color, callable.weight) },
      },
    ],
    type,
  }
}

export declare namespace compose {
  type Options<name extends string = string> = {
    /** The colors the theme is made of, the most telling of them first. */
    colors: readonly string[]
    /** Human-readable name, for a picker. */
    displayName: string
    /** Name the theme is loaded and rendered by. */
    name: name
    /** Whether the theme reads as a light or a dark one. */
    type: 'dark' | 'light'
  }
}

/** Theme metadata. Frozen: callers share one instance. */
export type Info = {
  /** Human-readable name for a picker. */
  readonly displayName: string
  /**
   * Identifier accepted by `Frame.render`: one shiki bundles, or one of the
   * themes {@link composed} here.
   */
  readonly name: Name
  /** Whether the theme is a light or dark scheme. */
  readonly type: 'light' | 'dark'
}

/** The name of a theme composed here, as opposed to one shiki bundles. */
export type Composed = (typeof palettes)[number]['id']

/**
 * The themes composed here rather than bundled by shiki, made from the colors
 * of the default macOS wallpapers.
 *
 * A renderer loads one of these by name the way it loads a bundled theme; this
 * is what it loads.
 */
export const composed: readonly ThemeRegistrationRaw[] = palettes.map((palette) =>
  compose({
    colors: palette.colors,
    displayName: palette.displayName,
    name: palette.id,
    type: palette.type,
  }),
)

// `bundledThemesInfo` types `id` as a plain string; `Theme.test.ts` verifies the
// narrowing. Freeze the array because `list()` returns this shared instance.
/** The themes offered, in the order a picker walks them. */
const offered = [
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
] as const

/**
 * Every name {@link list} offers, in the same order. A schema reads this to
 * enumerate what it accepts; a picker reads {@link list} for the labels.
 */
export const names = [...offered, ...palettes.map((palette) => palette.id)] as const

const infos: readonly Info[] = Object.freeze([
  ...bundledThemesInfo
    .filter((theme) => offered.some((name) => name === theme.id))
    .map((theme) =>
      Object.freeze({
        displayName: theme.displayName,
        name: theme.id as Name,
        type: theme.type === 'light' ? 'light' : ('dark' as const),
      }),
    ),
  // The composed ones after, so a picker walks what shiki brought before what
  // was made here.
  ...palettes.map((palette) =>
    Object.freeze({
      displayName: palette.displayName,
      name: palette.id,
      type: palette.type,
    }),
  ),
])

const byName = new Map<string, Info>(infos.map((entry) => [entry.name, entry]))

const fallbackBg = { dark: '#101010', light: '#ffffff' }
const fallbackFg = { dark: '#ededed', light: '#171717' }

/** First candidate a color parser accepts, else the fallback. */
function pick(candidates: readonly (string | undefined)[], fallback: string): string {
  for (const candidate of candidates) if (candidate && toOklch(candidate)) return candidate
  return fallback
}

type Oklch = { c: number; h?: number | undefined; l: number }

function toOklch(value: string): Oklch | undefined {
  const parsed = parse(value)
  if (!parsed) return undefined
  const converted = oklch(parsed)
  return { c: converted.c, h: converted.h, l: converted.l }
}

/** How wide a hue reads as one hue, in degrees either side of it. */
const reach = 15

/** How far apart two hues are, the short way around the circle. */
function apart(one: number, other: number): number {
  const gap = Math.abs(one - other) % 360
  return gap > 180 ? 360 - gap : gap
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
  const painted: { chroma: number; hue: number; weight: number }[] = []
  for (const token of tokens) {
    const value = token.settings?.foreground
    if (!value) continue
    const color = toOklch(value)
    if (!color || !Number.isFinite(color.h) || color.c <= 0.02) continue
    // A rule painting twenty scopes carries twenty times as much of the theme
    // as one painting a single scope, and a vivid color carries more than a
    // muted one at the same reach.
    painted.push({ chroma: color.c, hue: color.h ?? 0, weight: scopes(token.scope) * color.c })
  }
  // A window around each hue the theme paints, rather than fixed arcs: an arc
  // boundary falling inside one hue splits it, and reds at 359 and 1 degrees
  // are the same red.
  let heaviest: { near: typeof painted; weight: number } | undefined
  for (const centre of painted) {
    const near = painted.filter((one) => apart(one.hue, centre.hue) <= reach)
    const weight = near.reduce((total, one) => total + one.weight, 0)
    if (heaviest && heaviest.weight >= weight) continue
    heaviest = { near, weight }
  }
  if (!heaviest) return undefined
  // The mean of the hues that won rather than of the whole palette: averaging
  // every hue a theme uses lands between them, on a color it never paints.
  const [x, y] = heaviest.near.reduce(
    ([across, up], one) => {
      const radians = (one.hue * Math.PI) / 180
      return [across + Math.cos(radians) * one.weight, up + Math.sin(radians) * one.weight]
    },
    [0, 0],
  )
  return {
    c: heaviest.near.reduce((total, one) => total + one.chroma, 0) / heaviest.near.length,
    h: ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360,
    l: 0.5,
  }
}

/** How much of a theme a rule paints, as the number of scopes it names. */
function scopes(scope: string | readonly string[] | undefined): number {
  if (Array.isArray(scope)) return Math.max(scope.length, 1)
  if (typeof scope === 'string') return Math.max(scope.split(',').length, 1)
  return 1
}

/**
 * A color as `#rrggbb`, pulled into sRGB on the way: a theme's colors are read
 * as much by what parses textmate as by what renders CSS, and only this shape
 * is read by both.
 */
function hex(color: Oklch): string {
  return formatHex(clampChroma({ mode: 'oklch', ...color, h: color.h ?? 0 }, 'oklch')) ?? '#000000'
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
