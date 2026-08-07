import { createTwoslasher } from 'twoslash'
import type { TwoslashReturn } from 'twoslash'

/** A type the language service resolved for a span of the source. */
export type Annotation = {
  /** Offset into the source as written, notations included. */
  from: number
  /** The identifier the type belongs to. */
  name: string
  /** The type, formatted the way the language service returned it. */
  text: string
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
 * Resolves a snippet's types.
 *
 * Positions come back against the source as written rather than the source
 * twoslash compiled, so a caller holding the original text can use them
 * directly.
 *
 * @example
 * ```ts twoslash
 * import { Twoslash } from 'monoshot'
 *
 * const result = Twoslash.run("const a = 'x'\n//    ^?")
 * result.queries[0]?.text
 * // ^?
 * ```
 */
export function run(code: string, options: run.Options = {}): Result {
  const { lang = 'ts' } = options
  // Half-typed code is the normal case in an editor, and twoslash otherwise
  // insists every compiler error be declared in the source with an `@errors`
  // tag, throwing when it is not. A snippet that does not compile still has
  // types worth showing.
  const result = twoslasher()(code, lang, { handbookOptions: { noErrorValidation: true } })
  return annotate(result)
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
export function annotate(result: TwoslashReturn): Result {
  const removals = [...result.meta.removals].sort((a, b) => a[0] - b[0])
  const hovers: Annotation[] = []
  const queries: Annotation[] = []
  for (const node of result.nodes) {
    if (node.type !== 'hover' && node.type !== 'query') continue
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

/**
 * The offset a compiled position had in the source as written. Twoslash cuts
 * its notation lines out before compiling, so every offset after one is short
 * by what was taken.
 */
export function raw(offset: number, removals: readonly (readonly [number, number])[]): number {
  let mapped = offset
  // Ascending, because each removal shifts the ones after it. Twoslash reports
  // them in the order it found them, which is not that order.
  for (const [start, end] of [...removals].sort((a, b) => a[0] - b[0]))
    if (start <= mapped) mapped += end - start
  return mapped
}

let instance: ReturnType<typeof createTwoslasher> | undefined

/** One twoslasher per process: it caches the compiler host between runs. */
function twoslasher() {
  instance ??= createTwoslasher()
  return instance
}
