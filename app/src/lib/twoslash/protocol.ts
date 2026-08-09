import type * as Twoslash from 'monoshot/twoslash'

/** Languages twoslash can resolve types for. */
export type Lang = 'js' | 'jsx' | 'ts' | 'tsx'

/** Something the language service can offer at a position. */
export type Completion = {
  /** The kind the language service gave it, such as `method` or `property`. */
  kind: string
  /** What typing this would insert. */
  label: string
}

/** A document handed to the worker to resolve. */
export type Resolve = {
  code: string
  kind: 'resolve'
  lang: Lang
  /** Increments per document; a reply carrying an older one is stale. */
  version: number
}

/**
 * A request for what could go at a position.
 *
 * Carries its own copy of the document rather than leaning on the last one
 * resolved: a keystroke arrives before the document it produced has been
 * resolved, and completing against the previous text offers the wrong names.
 */
export type Complete = {
  code: string
  /** Pairs this request with its reply; several can be in flight. */
  id: number
  kind: 'complete'
  lang: Lang
  /** Document offset the caret sits at. */
  position: number
}

/** What the worker is asked to do. */
export type Request = Complete | Resolve

/** What the worker sends back. */
export type Response =
  | { completions: readonly Completion[]; id: number; kind: 'complete' }
  | { error: string; kind: 'resolve'; version: number }
  | { kind: 'resolve'; result: Twoslash.Result; version: number }
