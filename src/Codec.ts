// lz-string is CommonJS and assigns its API object to `module.exports`, which
// Node cannot read as named exports, so the whole object arrives as default.
import lzString from 'lz-string'
import * as z from 'zod'

/**
 * Everything a shared link carries. Every field falls back rather than
 * failing, so a truncated or hand-edited link still opens something usable.
 */
export const schema = z.object({
  /**
   * The frame's backdrop: `default` for the theme's own gradient, `none` for a
   * transparent one, a `#rrggbb` color, or `wallpaper:<id>` for a picture the
   * surface drawing it carries.
   */
  background: z
    .union([
      z.literal('default'),
      z.literal('none'),
      z.string().regex(/^#[0-9a-f]{6}$/i),
      z.string().regex(/^wallpaper:[a-z0-9-]+$/),
    ])
    .catch('default'),
  /** The snippet itself, which is empty when the window holds nothing. */
  code: z.string().catch(''),
  /** A shiki language id, or `auto` to read it from the code. */
  lang: z.string().catch('auto'),
  /** Space around the window, in pixels. */
  padding: z.number().int().min(0).max(256).catch(64),
  /** Corner radius of the window, in pixels. */
  radius: z.number().int().min(0).max(24).catch(12),
  /** A shiki theme name. */
  theme: z.string().catch('vitesse-dark'),
  /** The window's title, which is empty when it has none. */
  title: z.string().catch(''),
  /** Whether the window wears a title bar. */
  titleBar: z.boolean().catch(true),
  /** Whether the snippet is type checked, which only a TypeScript one can be. */
  types: z.boolean().catch(true),
  /** Width of the window, in pixels. */
  width: z.number().int().min(320).max(1600).catch(640),
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
  /** State to pack. Anything omitted takes the schema's fallback. */
  type Options = Partial<State>
}

/**
 * How much untrusted text is worth expanding. lz-string offers no bounded
 * decompression, so `fragment` is what caps the expansion: measured against
 * this version, a fragment that long reaches about 50 MB at worst, which
 * decodes in well under a second and is then refused. Honest content packs far
 * tighter, around 33,000 characters of source into that fragment, and never
 * approaches `decoded`.
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
 * Whether a fragment carries state at all, so a caller with defaults of its own
 * can tell a link it could not read from a visit with no link.
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

/** The fields a fragment packs, under the names {@link schema} knows. */
function fields(packed: Record<string, unknown>): Record<string, unknown> {
  const state: Record<string, unknown> = {}
  for (const [field, key] of Object.entries(keys)) state[field] = packed[key]
  return state
}

/** What a fragment unpacks to, or nothing when it unpacks to no object. */
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
