// lz-string is CommonJS and assigns its API object to `module.exports`, which
// Node cannot read as named exports, so the whole object arrives as default.
import lzString from 'lz-string'
import * as z from 'zod'

import * as Theme from './Theme.js'

/**
 * Accepted pixel range for each sized field.
 *
 * UI controls and {@link strict} read these values, so both enforce the same
 * limits.
 */
export const bounds = {
  padding: { max: 256, min: 0 },
  radius: { max: 24, min: 0 },
  width: { max: 1600, min: 320 },
} as const

/**
 * Validates complete frame state without applying fallbacks.
 *
 * {@link schema} reuses these fields and replaces invalid values with defaults.
 */
export const strict = z.object({
  /**
   * Frame backdrop. Accepts `default`, `none`, a `#rrggbb` color,
   * `gradient:#rrggbb:#rrggbb`, or `wallpaper:<id>`.
   */
  background: z.union([
    z.enum(['default', 'none']),
    z.string().regex(/^#[0-9a-f]{6}$/i),
    z.string().regex(/^gradient:#[0-9a-f]{6}:#[0-9a-f]{6}$/i),
    z.string().regex(/^wallpaper:[a-z0-9-]+$/),
  ]),
  /** Source code displayed in the window. */
  code: z.string(),
  /** A shiki language id, or `auto` to read it from the code. */
  lang: z.string(),
  /** Space around the window, in pixels. */
  padding: z.number().int().min(bounds.padding.min).max(bounds.padding.max),
  /** Corner radius of the window, in pixels. */
  radius: z.number().int().min(bounds.radius.min).max(bounds.radius.max),
  /** `auto` pairs syntax colors with the backdrop; a theme name pins them. */
  syntax: z.union([z.literal('auto'), z.enum(Theme.names)]),
  /** A theme name, as `Theme.list` offers them. */
  theme: z.enum(Theme.names),
  /** The window's title, which is empty when it has none. */
  title: z.string(),
  /** Whether the window includes a title bar. */
  titleBar: z.boolean(),
  /** Whether the snippet is type checked, which only a TypeScript one can be. */
  types: z.boolean(),
  /**
   * Fixed window width in pixels. When omitted, rendered line width determines
   * the window width.
   */
  width: z.number().int().min(bounds.width.min).max(bounds.width.max).optional(),
})

/**
 * Parses shared-link state and replaces invalid fields with defaults.
 *
 * Field validation comes from {@link strict}.
 */
export const schema = z.object({
  background: strict.shape.background.catch('default'),
  code: strict.shape.code.catch(''),
  lang: strict.shape.lang.catch('auto'),
  padding: strict.shape.padding.catch(64),
  radius: strict.shape.radius.catch(12),
  syntax: strict.shape.syntax.catch('auto'),
  theme: strict.shape.theme.catch('golden-gate-dark'),
  title: strict.shape.title.catch(''),
  titleBar: strict.shape.titleBar.catch(false),
  types: strict.shape.types.catch(true),
  // The one field with no default: omitted, the rendered lines set the width.
  width: strict.shape.width.catch(undefined),
})

/** The state {@link serialize} writes and {@link deserialize} reads. */
export type State = z.output<typeof schema>

/**
 * Short keys, because the state rides in a URL. Compression already collapses
 * repeated text, so this only has to keep the fixed overhead small.
 */
const keys = {
  background: 'b',
  code: 'c',
  lang: 'g',
  padding: 'p',
  radius: 'r',
  syntax: 'x',
  theme: 't',
  title: 'i',
  titleBar: 'y',
  types: 's',
  width: 'w',
} as const satisfies Record<keyof State, string>

/**
 * Packs state into a URL fragment.
 *
 * @example
 * ```ts twoslash
 * import { Codec } from 'monoshot'
 *
 * const hash = Codec.serialize({ code: 'const a = 1', theme: 'vitesse-dark' })
 * ```
 */
export function serialize(state: serialize.Options): string {
  const parsed = schema.parse({ ...state })
  const packed: Record<string, unknown> = {}
  for (const [field, key] of Object.entries(keys)) packed[key] = parsed[field as keyof State]
  return lzString.compressToEncodedURIComponent(JSON.stringify(packed))
}

export declare namespace serialize {
  /** State to pack. Omitted width stays automatic; other omissions use their fallback. */
  type Options = Partial<State>
}

/**
 * Limits for expanding untrusted fragments. Because lz-string has no bounded
 * decompression, the fragment limit constrains worst-case memory use before the
 * decoded-size limit applies.
 */
const limit = { decoded: 512_000, fragment: 20_000 } as const

/**
 * Reads state back out of a URL fragment. A fragment that is oversized, does
 * not decompress, is not an object, or carries the wrong types still yields
 * usable state: every field falls back on its own.
 *
 * @example
 * ```ts twoslash
 * import { Codec } from 'monoshot'
 *
 * const state = Codec.deserialize('N4Igxg9gJgpiBcIQ')
 * state.theme
 * // ^?
 * ```
 */
export function deserialize(hash: string): State {
  return schema.parse(fields(read(hash) ?? {}))
}

/**
 * Returns whether a fragment contains readable state. This distinguishes an
 * invalid fragment from an absent fragment.
 *
 * @example
 * ```ts twoslash
 * import { Codec } from 'monoshot'
 *
 * Codec.readable('#garbage')
 * // ^?
 * ```
 */
export function readable(hash: string): boolean {
  return read(hash) !== undefined
}

/** Expands packed keys into the field names defined by {@link schema}. */
function fields(packed: Record<string, unknown>): Record<string, unknown> {
  const state: Record<string, unknown> = {}
  for (const [field, key] of Object.entries(keys)) state[field] = packed[key]
  return state
}

/** Unpacks a fragment into an object, or returns `undefined` when invalid. */
function read(hash: string): Record<string, unknown> | undefined {
  return (() => {
    try {
      const fragment = hash.replace(/^#/, '')
      if (!fragment || fragment.length > limit.fragment) return undefined
      const json = lzString.decompressFromEncodedURIComponent(fragment)
      if (!json || json.length > limit.decoded) return undefined
      const value: unknown = JSON.parse(json)
      return typeof value === 'object' && value !== null
        ? (value as Record<string, unknown>)
        : undefined
    } catch {
      return undefined
    }
  })()
}
