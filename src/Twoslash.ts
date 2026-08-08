import { createTwoslasher } from 'twoslash'

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

/** What a snippet's types look like once notations are out of the way. */
export type Result = {
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
  const twoslasher = createTwoslasher()
  return {
    run(code, options = {}) {
      return annotate(
        twoslasher(code, options.lang ?? 'ts', {
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
  const hovers: Annotation[] = []
  const queries: Annotation[] = []
  for (const node of result.nodes) {
    if (node.type !== 'hover' && node.type !== 'query') continue
    // A node the language service found no type for has nothing to annotate.
    if (node.text === undefined) continue
    const from = raw(node.start, removals)
    const annotation = {
      from,
      name: result.code.slice(node.start, node.start + node.length),
      text: node.text,
      to: from + node.length,
    }
    if (node.type === 'hover') hovers.push(annotation)
    else queries.push(annotation)
  }
  return { hovers, queries }
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
    /** Everything the run produced. Anything that is not a hover or a query is ignored. */
    nodes: readonly {
      /** How much of `code` the node covers. */
      length: number
      /** Offset into `code`. */
      start: number
      /** The formatted type, absent on the node kinds this ignores. */
      text?: string | undefined
      /** Only `hover` and `query` are read. */
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
