// lz-string is CommonJS and assigns its API object to `module.exports`, which
// Node cannot read as named exports, so the whole object arrives as default.
import lzString from 'lz-string'
import * as z from 'zod'

/**
 * Everything a shared link carries. Every field falls back rather than
 * failing, so a truncated or hand-edited link still opens something usable.
 */
export const schema = z.object({
  /** `default`, `none`, or a `#rrggbb` color for the frame's backdrop. */
  background: z
    .union([z.literal('default'), z.literal('none'), z.string().regex(/^#[0-9a-f]{6}$/i)])
    .catch('default'),
  code: z.string().catch(''),
  /** A shiki language id, or `auto` to read it from the code. */
  lang: z.string().catch('auto'),
  lineNumbers: z.boolean().catch(false),
  /** Space around the window, in pixels. */
  padding: z.number().int().min(0).max(256).catch(64),
  /** Corner radius of the window, in pixels. */
  radius: z.number().int().min(0).max(24).catch(12),
  /** A shiki theme name. */
  theme: z.string().catch('vitesse-dark'),
  /** The window's title, which is empty when it has none. */
  title: z.string().catch(''),
  titleBar: z.boolean().catch(true),
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
  lineNumbers: 'n',
  padding: 'p',
  radius: 'r',
  theme: 't',
  title: 'i',
  titleBar: 'y',
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
 * Reads state back out of a URL fragment. A fragment that does not decompress,
 * is not an object, or carries the wrong types still yields usable state:
 * every field falls back on its own.
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
  const packed = (() => {
    try {
      const json = lzString.decompressFromEncodedURIComponent(hash.replace(/^#/, ''))
      const value: unknown = json ? JSON.parse(json) : undefined
      return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  })()
  const state: Record<string, unknown> = {}
  for (const [field, key] of Object.entries(keys)) state[field] = packed[key]
  return schema.parse(state)
}
