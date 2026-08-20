import * as Cdn from './internal/Cdn.js'

export { acquire } from './internal/Acquire.js'
export { compilerOptions, overrides } from './internal/Cdn.js'
export { dialects, languages } from './internal/Languages.js'
export { cut, unchecked } from './internal/Marks.js'
import { unchecked } from './internal/Marks.js'
export * as Registry from './internal/Registry.js'
export { tagged, tags } from './internal/Tags.js'

/** A type the language service resolved for a span of the source. */
export type Annotation = {
  /** Offset into the source as written, notations included. */
  from: number
  /** The identifier the type belongs to. */
  name: string
  /** The type, formatted the way the language service returned it. */
  text: string
  /** Exclusive end offset of the identifier. */
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
  /** Exclusive end offset of the diagnostic span. */
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
 * Create one per editor session, CLI run, or worker. Later calls reuse the
 * compiler and library files loaded by the first run.
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
export function create(options: create.Options = {}): create.ReturnType {
  const resolver = Cdn.create(options)
  return {
    async run(code, options = {}) {
      const twoslasher = await resolver.prepare(code)
      // Exclude lines marked as removed. Compiling both a declaration and its
      // replacement would report a conflict that the displayed snippet omits.
      return annotate(twoslasher(unchecked(code), options.lang ?? 'ts'))
    },
  }
}

export declare namespace create {
  /**
   * Resolver dependencies. Defaults support Node and Workers. Browsers must
   * provide storage and a declaration loader.
   */
  type Options = Cdn.create.Options

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
    // Omit nodes without language-service output.
    if (node.text === undefined) continue
    const from = raw(node.start, removals)
    if (node.type === 'error') {
      diagnostics.push({
        ...(node.code === undefined ? {} : { code: node.code }),
        from,
        level: node.level ?? 'error',
        text: node.text,
        // Map the end independently because a diagnostic can cross a notation
        // line that Twoslash removed before compilation.
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
 * Maps a compiled offset back to the original source. Twoslash removes notation
 * lines before compiling, so later offsets need each removed length restored.
 * `removals` must be ascending.
 */
function raw(offset: number, removals: readonly (readonly [number, number])[]): number {
  let mapped = offset
  for (const [start, end] of removals) if (start <= mapped) mapped += end - start
  return mapped
}

/**
 * Maps an exclusive range end back to the original source. A removal that
 * starts at the end lies outside the range and does not change the result.
 */
function rawEnd(offset: number, removals: readonly (readonly [number, number])[]): number {
  let mapped = offset
  for (const [start, end] of removals) if (start < mapped) mapped += end - start
  return mapped
}
