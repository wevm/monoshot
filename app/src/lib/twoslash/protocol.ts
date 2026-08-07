import type * as Twoslash from 'monoshot/twoslash'

/** Languages twoslash can resolve types for. */
export type Lang = 'js' | 'jsx' | 'ts' | 'tsx'

/** A document handed to the worker to resolve. */
export type Request = {
  code: string
  lang: Lang
  /** Increments per document; a reply carrying an older one is stale. */
  version: number
}

/** What the worker sends back. */
export type Response =
  | { error: string; version: number }
  | { result: Twoslash.Result; version: number }
