import type { Frame } from 'monoshot'
import type * as Twoslash from 'monoshot/twoslash'

/**
 * A run, as the renderer needs it plus the cuts the editor maps through.
 * Built from the renderer's shape rather than intersected with the reader's:
 * a run satisfies the narrower one already.
 */
export type Run = Frame.render.Types & {
  meta: { removals: readonly (readonly [number, number])[] }
}

/** Languages twoslash can resolve types for. */
export type Lang = 'js' | 'jsx' | 'ts' | 'tsx'

/** Something the language service can offer at a position. */
export type Completion = {
  /** The kind the language service gave it, such as `method` or `property`. */
  kind: string
  /** The name shown in the menu, and what is inserted when `insert` is absent. */
  label: string
  /** Document offset the replacement starts at, when it is not the typed word. */
  from?: number | undefined
  /** Text to insert, when it differs from the label. */
  insert?: string | undefined
  /** Document offset the replacement ends at. */
  to?: number | undefined
}

/** A document handed to the worker to resolve. */
export type Resolve = {
  /** The document to resolve types for. */
  code: string
  /** Names this message among the requests the worker accepts. */
  kind: 'resolve'
  /** The dialect to read `code` as. */
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
  /** The document the caret sits in. */
  code: string
  /** Pairs this request with its reply; several can be in flight. */
  id: number
  /** Names this message among the requests the worker accepts. */
  kind: 'complete'
  /** The dialect to read `code` as. */
  lang: Lang
  /** Document offset the caret sits at. */
  position: number
}

/** What the worker is asked to do. */
export type Request = Complete | Resolve

/** What the worker sends back. */
export type Response =
  | {
      /** What the language service offers at the requested position. */
      completions: readonly Completion[]
      /** The `id` of the request this answers. */
      id: number
      /** Names this message among the replies the worker sends. */
      kind: 'complete'
    }
  | {
      /** Why the document could not be resolved. */
      error: string
      /** Names this message among the replies the worker sends. */
      kind: 'resolve'
      /** The `version` of the request this answers. */
      version: number
    }
  | {
      /** Names this message among the replies the worker sends. */
      kind: 'resolve'
      /** The types found in the document, as the editor reads them. */
      result: Twoslash.Result
      /**
       * The run those types were read from, which the frame draws directly.
       * Sent alongside rather than derived here: reading a run needs
       * `monoshot/twoslash`, which carries the compiler into whatever imports
       * it, and the worker is the one place that already has one.
       */
      types: Run
      /** The `version` of the request this answers. */
      version: number
    }

/**
 * The run with the complaints at these offsets left out, so an exported frame
 * draws what the editor shows rather than every objection the compiler had.
 *
 * The offsets are into the document; the run's own are into the code twoslash
 * returned, which is the document minus what it took out.
 */
export function without(run: Run, ignored: readonly number[]): Run {
  if (!ignored.length) return run
  const cuts = [...run.meta.removals].sort((a, b) => a[0] - b[0])
  const marks = ignored.map((at) =>
    cuts.reduce((out, [from, to]) => (to <= at ? out - (to - from) : out), at),
  )
  return {
    ...run,
    nodes: run.nodes.filter(
      (node) =>
        node.type !== 'error' ||
        !marks.some((at) => at >= node.start && at <= node.start + node.length),
    ),
  }
}
