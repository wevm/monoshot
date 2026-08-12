import { createTwoslasher } from 'twoslash'

import { tags } from './internal/Tags.js'

export { acquire } from './internal/Acquire.js'
export { compilerOptions } from './internal/Cdn.js'
export { cut, unchecked } from './internal/Marks.js'
import { unchecked } from './internal/Marks.js'
export * as Registry from './internal/Registry.js'
export { tags } from './internal/Tags.js'

/** A type the language service resolved for a span of the source. */
export type Annotation = {
  /** Offset into the source as written, notations included. */
  from: number
  /** The identifier the type belongs to. */
  name: string
  /** The type, formatted the way the language service returned it. */
  text: string
  /** Offset just past the identifier, so `source.slice(from, to)` is `name`. */
  to: number
}

/** Something the compiler objected to, against the source as written. */
export type Diagnostic = {
  /** The TypeScript error number, such as 2322. Absent when the compiler gave none. */
  code?: number | string | undefined
  /** Offset into the source as written, notations included. */
  from: number
  /** How loudly the compiler complained. */
  level: 'error' | 'message' | 'suggestion' | 'warning'
  /** The message, as the compiler phrased it. */
  text: string
  /** Offset just past the span the message is about. */
  to: number
}

/** What a snippet's types look like once notations are out of the way. */
export type Result = {
  /** What the compiler objected to, in source order. */
  diagnostics: readonly Diagnostic[]
  /** Every identifier the language service knows a type for. */
  hovers: readonly Annotation[]
  /** The types a snippet asked for with `^?`, in source order. */
  queries: readonly Annotation[]
}

/**
 * Creates a resolver that owns a TypeScript compiler for its lifetime.
 *
 * Needs `typescript` in the consuming install. It is an optional peer because
 * only this entrypoint reaches the compiler; the root entrypoint never does.
 *
 * Construct one per lifecycle that should share the compiler: an editor
 * session, a CLI run, a worker. The first snippet builds the compiler and
 * every later one reuses it, which is what makes resolving on each keystroke
 * affordable.
 *
 * @example
 * ```ts twoslash
 * import * as Twoslash from 'monoshot/twoslash'
 *
 * const twoslash = Twoslash.create()
 * const result = twoslash.run("const a = 'x'\n//    ^?")
 * result.queries[0]?.text
 * // ^?
 * ```
 */
export function create(): create.ReturnType {
  const twoslasher = createTwoslasher({ customTags: [...tags] })
  return {
    run(code, options = {}) {
      return annotate(
        // Blanked as the frame blanks it: a line the snippet marks as removed is
        // not code it is claiming, and compiling it reports the conflict between
        // a declaration and its replacement rather than a mistake in either.
        twoslasher(unchecked(code), options.lang ?? 'ts', {
          // Half-typed code is the normal case in an editor, and twoslash
          // otherwise insists every compiler error be declared in the source
          // with an `@errors` tag, throwing when it is not. A snippet that
          // does not compile still has types worth showing.
          handbookOptions: { noErrorValidation: true },
        }),
      )
    },
  }
}

export declare namespace create {
  type ReturnType = {
    /** Resolves a snippet's types against the compiler this resolver holds. */
    run: (code: string, options?: run.Options) => Result
  }
}

/**
 * Resolves a snippet's types.
 *
 * Positions come back against the source as written rather than the source
 * twoslash compiled, so a caller holding the original text can use them
 * directly.
 *
 * Builds a compiler for the call and keeps nothing afterwards. Reach for
 * {@link create} to resolve more than one snippet.
 *
 * @example
 * ```ts twoslash
 * import * as Twoslash from 'monoshot/twoslash'
 *
 * const result = Twoslash.run("const a = 'x'\n//    ^?")
 * result.queries[0]?.text
 * // ^?
 * ```
 */
export function run(code: string, options: run.Options = {}): Result {
  return create().run(code, options)
}

export declare namespace run {
  type Options = {
    /** Defaults to `ts`. */
    lang?: 'js' | 'jsx' | 'ts' | 'tsx' | undefined
  }
}

/**
 * Reads a twoslash result into annotations against the original source.
 *
 * Separate from {@link run} because the browser runs twoslash in a worker with
 * its own type acquisition, and hands the result here.
 */
export function annotate(result: annotate.Input): Result {
  // Ascending, because each removal shifts the ones after it. Twoslash reports
  // them in the order it found them, which is not that order.
  const removals = [...result.meta.removals].sort((a, b) => a[0] - b[0])
  const diagnostics: Diagnostic[] = []
  const hovers: Annotation[] = []
  const queries: Annotation[] = []
  for (const node of result.nodes) {
    // A node the language service found no type or message for says nothing.
    if (node.text === undefined) continue
    const from = raw(node.start, removals)
    if (node.type === 'error') {
      diagnostics.push({
        ...(node.code === undefined ? {} : { code: node.code }),
        from,
        level: node.level ?? 'error',
        text: node.text,
        // Mapped on its own rather than added to `from`: a message can span a
        // notation line, and the length twoslash reports is measured in the
        // source it compiled, which no longer holds that line.
        to: rawEnd(node.start + node.length, removals),
      })
      continue
    }
    if (node.type !== 'hover' && node.type !== 'query') continue
    const annotation = {
      from,
      name: result.code.slice(node.start, node.start + node.length),
      text: node.text,
      to: from + node.length,
    }
    if (node.type === 'hover') hovers.push(annotation)
    else queries.push(annotation)
  }
  // The contract says source order, and twoslash reports nodes in the order it
  // found them, which for errors is the compiler's.
  diagnostics.sort((a, b) => a.from - b.from)
  return { diagnostics, hovers, queries }
}

export declare namespace annotate {
  /**
   * The parts of a twoslash run this reads.
   *
   * Structural rather than twoslash's own `TwoslashReturn`: the browser
   * acquires types through a separate twoslash build, and only these fields
   * have to agree.
   */
  type Input = {
    /** The source twoslash compiled, with the notation lines taken out. */
    code: string
    /** What twoslash changed on the way in. */
    meta: {
      /** Ranges cut from the source as written, in the order twoslash found them. */
      removals: readonly (readonly [number, number])[]
    }
    /** Everything the run produced. Anything but a hover, query, or error is ignored. */
    nodes: readonly {
      /** The TypeScript error number, on an error node. */
      code?: number | string | undefined
      /** How much of `code` the node covers. */
      length: number
      /** Severity, on an error node. Defaults to `error`. */
      level?: Diagnostic['level'] | undefined
      /** Offset into `code`. */
      start: number
      /** The formatted type or message, absent on the node kinds this ignores. */
      text?: string | undefined
      /** Only `hover`, `query`, and `error` are read. */
      type: string
    }[]
  }
}

/**
 * The offset a compiled position had in the source as written. Twoslash cuts
 * its notation lines out before compiling, so every offset after one is short
 * by what was taken. `removals` must be ascending, since each cut shifts the
 * ones after it.
 */
function raw(offset: number, removals: readonly (readonly [number, number])[]): number {
  let mapped = offset
  for (const [start, end] of removals) if (start <= mapped) mapped += end - start
  return mapped
}

/**
 * The same for the exclusive end of a range. A cut beginning exactly where the
 * range ends lies outside it, so the end stays before the cut instead of
 * jumping over it and covering a notation the message never mentioned.
 */
function rawEnd(offset: number, removals: readonly (readonly [number, number])[]): number {
  let mapped = offset
  for (const [start, end] of removals) if (start < mapped) mapped += end - start
  return mapped
}
