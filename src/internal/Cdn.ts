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
  // Enable diagnostics for JavaScript documents as well as type resolution.
  checkJs: true,
  // Spelled out because this same set decides which lib files are loaded, and
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
 * Creates a twoslasher that reads a document's packages from the registry
 * rather than from the machine running it, so a snippet resolves the same
 * locally, in CI, and in a Worker.
 *
 * Two stages, because they come from different places: the compiler's lib
 * files are the same for every snippet and are loaded once per process, while
 * packages depend on what a document imports and are fetched per document by
 * {@link prepare}.
 */
export function create(): create.ReturnType {
  /** The compiler's file system, written to directly by both stages. */
  const files = new Map<string, string>()
  let started: Promise<Cdn> | undefined

  /** What every twoslasher here compiles with, however it was built. */
  const overrides = {
    compilerOptions,
    // The tags the frame draws, which stay ordinary comments unless the
    // compiler is told to read them.
    customTags: [...tags],
    // Half-typed code is the normal case, and twoslash otherwise insists
    // every compiler error be declared in the source.
    handbookOptions: { noErrorValidation: true },
  }

  async function start(): Promise<Cdn> {
    const compiler = (await import('typescript')).default
    const lib = await bundled(compiler)
    // Node has the compiler on disk, so its lib files are read rather than
    // fetched: a hundred requests per process is slow where it works and flaky
    // where a network throttles them, and `String` resolving to `any` is what
    // a half-fetched set looks like. Package declarations still come from the
    // registry, which is what keeps a render off the caller's `node_modules`.
    if (lib) {
      for (const [path, source] of lib) files.set(path, source)
      const { createTwoslasher } = await import('twoslash')
      const twoslasher = createTwoslasher({ ...overrides, fsMap: files })
      return { compiler, run: (code, lang) => twoslasher(code, lang) }
    }
    // A runtime with no file system reads them over the network instead.
    const { createTwoslashFromCDN } = await import('twoslash-cdn')
    const twoslash = createTwoslashFromCDN({
      compilerOptions,
      fsMap: files,
      storage: await cache(),
      twoSlashOptionsOverrides: overrides,
    })
    // Only the lib files. Acquiring a document's packages is the second stage.
    await twoslash.init()
    return { compiler, run: (code, lang) => twoslash.runSync(code, lang) }
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
      return (source, lang) => cdn.run(source, lang)
    },
  }
}

export declare namespace create {
  type ReturnType = {
    /**
     * Fetches required declarations, then returns a Twoslash instance that
     * reads them. Call it for each document, before compiling it.
     */
    prepare: (code: string) => Promise<Twoslasher>
  }

  /** Resolves a snippet against the types already acquired. */
  type Twoslasher = (code: string, lang?: string) => TwoslashReturn
}

/**
 * Where fetched lib files are kept on a runtime that has to fetch them, shared
 * by every resolver in the process. They are the same hundred or so files for
 * every snippet, and fetching them per renderer would make a second frame cost
 * as much as the first.
 */
let storage: Promise<Storage> | undefined
function cache() {
  return (storage ??= import('unstorage').then((module) => module.createStorage()))
}

/** What {@link create} holds once the lib files have landed. */
type Cdn = {
  compiler: typeof import('typescript')
  run: create.Twoslasher
}

/**
 * The compiler's own lib files, read from the package this process loaded, or
 * nothing on a runtime with no file system to read them from.
 *
 * They belong to the compiler rather than to the caller's project: a `lib` set
 * from anywhere else would describe a different TypeScript than the one about
 * to compile the snippet.
 */
async function bundled(compiler: typeof import('typescript')) {
  const directory = compiler.sys?.getExecutingFilePath?.()
  if (!directory) return undefined
  try {
    const [fs, path] = await Promise.all([import('node:fs/promises'), import('node:path')])
    const root = path.dirname(directory)
    const names = (await fs.readdir(root)).filter((name) => /^lib\..*\.d\.ts$/.test(name))
    if (!names.length) return undefined
    return new Map(
      await Promise.all(
        names.map(
          async (name) => [`/${name}`, await fs.readFile(path.join(root, name), 'utf8')] as const,
        ),
      ),
    )
  } catch {
    return undefined
  }
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
    // Missing declaration packages resolve as `any`. Registry failures remain
    // errors because treating them as absent would produce incorrect annotations.
    if (cause instanceof Registry.RegistryError && cause.absent) return undefined
    throw cause
  }
}
