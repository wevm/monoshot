import * as Cdn from './internal/Cdn.js'

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

/** Compiler diagnostic mapped to the original source. */
export type Diagnostic = {
  /** TypeScript diagnostic code, such as 2322, when available. */
  code?: number | string | undefined
  /** Offset into the source as written, notations included. */
  from: number
  /** Diagnostic severity reported by the compiler. */
  level: 'error' | 'message' | 'suggestion' | 'warning'
  /** Diagnostic message reported by the compiler. */
  text: string
  /** Offset just past the span the message is about. */
  to: number
}

/** Resolved types and diagnostics mapped to the original source. */
export type Result = {
  /** Compiler diagnostics in source order. */
  diagnostics: readonly Diagnostic[]
  /** Every identifier for which the language service resolved a type. */
  hovers: readonly Annotation[]
  /** Types requested by `^?` queries, in source order. */
  queries: readonly Annotation[]
}

/**
 * Creates a resolver that owns a TypeScript compiler for its lifetime.
 *
 * Requires `typescript` in the consuming installation. The compiler and type
 * definitions load when the first snippet is resolved, not during import.
 *
 * Construct one per lifecycle that should share the compiler: an editor
 * session, CLI run, or worker. Subsequent snippets reuse the compiler and
 * library files loaded by the first run.
 *
 * @example
 * ```ts twoslash
 * import { Twoslash } from 'monoshot'
 *
 * const twoslash = Twoslash.create()
 * const result = await twoslash.run("const a = 'x'\n//    ^?")
 * result.queries[0]?.text
 * // ^?
 * ```
 */
export function create(): create.ReturnType {
  const resolver = Cdn.create()
  return {
    async run(code, options = {}) {
      const twoslasher = await resolver.prepare(code)
      // Blanked as the frame blanks it: a line the snippet marks as removed is
      // not code it is claiming, and compiling it reports the conflict between
      // a declaration and its replacement rather than a mistake in either.
      return annotate(twoslasher(unchecked(code), options.lang ?? 'ts'))
    },
  }
}

export declare namespace create {
  type ReturnType = {
    /**
     * Resolves a snippet's types after fetching imported declarations. The
     * declarations come from the registry for consistent results across hosts.
     */
    run: (code: string, options?: run.Options) => Promise<Result>
  }
}

/**
 * Resolves a snippet's types.
 *
 * Positions refer to the original source instead of Twoslash's transformed
 * source.
 *
 * Creates a compiler for one call and releases it afterwards. Use
 * {@link create} to resolve multiple snippets with one compiler.
 *
 * @example
 * ```ts twoslash
 * import { Twoslash } from 'monoshot'
 *
 * const result = await Twoslash.run("const a = 'x'\n//    ^?")
 * result.queries[0]?.text
 * // ^?
 * ```
 */
export function run(code: string, options: run.Options = {}): Promise<Result> {
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
 * This function is separate from {@link run} so browser workers can perform
 * type acquisition independently and pass the result for normalization.
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
