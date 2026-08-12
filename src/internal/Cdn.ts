import type { TwoslashReturn } from 'twoslash'
import type { Storage } from 'unstorage'

import { acquire } from './Acquire.js'
import * as Registry from './Registry.js'
import { tags } from './Tags.js'

/**
 * What a snippet is compiled with, wherever it is compiled.
 *
 * ESNext numerically: the enums live in `typescript`, which a browser worker
 * carries once rather than importing for a few constants.
 */
export const compilerOptions = {
  // Without it a JavaScript document resolves types but is never checked, so
  // the editor marks nothing in half the languages it highlights.
  checkJs: true,
  // Spelled out because this same set decides which lib files are fetched, and
  // defaults to ES5 without a target. A mismatch leaves the compiler with no
  // `Promise` at all, and every type behind an `await` collapses to `any`.
  lib: ['esnext', 'dom'],
  module: 99,
  // Bundler, the only dialect that both reads `exports` subpaths and takes the
  // extensionless relative imports snippets are written with.
  moduleResolution: 100,
  // Twoslash compiles strict, which marks every untyped parameter: a missing
  // annotation rather than a mistake, in a snippet that left its context
  // behind.
  noImplicitAny: false,
  target: 99,
}

/**
 * Creates a twoslasher that reads every type it needs over the network.
 *
 * The compiler's own lib files and each imported package arrive from the
 * registry rather than from the machine running this, so a snippet resolves to
 * the same types on a laptop, in CI, and in a Worker, whatever any of them
 * happens to have installed.
 *
 * Two stages, because they are cached differently: lib files are the same for
 * every snippet and are fetched once per process, while packages depend on
 * what a document imports and are fetched per document by {@link prepare}.
 */
export function create(): create.ReturnType {
  /** The compiler's file system, written to directly by both stages. */
  const files = new Map<string, string>()
  let started: Promise<Cdn> | undefined

  async function start(): Promise<Cdn> {
    const [{ createTwoslashFromCDN }, compiler] = await Promise.all([
      import('twoslash-cdn'),
      import('typescript'),
    ])
    const twoslash = createTwoslashFromCDN({
      compilerOptions,
      fsMap: files,
      storage: await cache(),
      twoSlashOptionsOverrides: {
        compilerOptions,
        // The tags the frame draws, which stay ordinary comments unless the
        // compiler is told to read them.
        customTags: [...tags],
        // Half-typed code is the normal case, and twoslash otherwise insists
        // every compiler error be declared in the source.
        handbookOptions: { noErrorValidation: true },
      },
    })
    // Only the lib files. Acquiring a document's packages is the second stage.
    await twoslash.init()
    return { compiler: compiler.default, twoslash }
  }

  return {
    async prepare(code) {
      // A rejection must not be cached, or one failed fetch would leave this
      // resolver unable to resolve anything for the rest of its life.
      const cdn = await (started ??= start().catch((cause: unknown) => {
        started = undefined
        throw cause
      }))
      await acquire({
        code,
        compiler: cdn.compiler,
        files,
        load: (name) => read(name),
      })
      return (source, lang) => cdn.twoslash.runSync(source, lang)
    },
  }
}

export declare namespace create {
  type ReturnType = {
    /**
     * Fetches the types a document needs, then answers with a twoslasher that
     * reads them. Call it for each document, before compiling it.
     */
    prepare: (code: string) => Promise<Twoslasher>
  }

  /** Resolves a snippet against the types already acquired. */
  type Twoslasher = (code: string, lang?: string) => TwoslashReturn
}

/**
 * Where the compiler's lib files are kept, shared by every resolver in the
 * process. They are the same hundred or so files for every snippet, and
 * fetching them per renderer would make a second frame cost as much as the
 * first.
 */
let storage: Promise<Storage> | undefined
function cache() {
  return (storage ??= import('unstorage').then((module) => module.createStorage()))
}

/** What {@link create} holds once the lib files have landed. */
type Cdn = {
  compiler: typeof import('typescript')
  twoslash: ReturnType<typeof import('twoslash-cdn').createTwoslashFromCDN>
}

/**
 * One package's declarations, straight from the registry. The browser reaches
 * for a route instead, which is the only difference between the two.
 */
async function read(name: string) {
  try {
    const result = await Registry.types({ name, version: 'latest' })
    return { files: result.files, name: result.name }
  } catch (cause) {
    // A package with nothing to read leaves its imports as `any`, which is what
    // a snippet naming one that does not exist should draw. A registry that
    // failed to answer is not that: drawing over the types it would have
    // returned bakes wrong annotations into an image nobody can tell apart
    // from a right one.
    if (cause instanceof Registry.RegistryError && cause.absent) return undefined
    throw cause
  }
}
