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
 * What Twoslash is told about a snippet, beyond the compiler's own options.
 *
 * Shared with every surface that runs Twoslash itself rather than through
 * {@link create}: a resolver configured differently reads the same snippet
 * differently, which is what the editor and the exported image must not do.
 */
export const overrides = {
  compilerOptions,
  // Register custom tags so Twoslash interprets them instead of ordinary comments.
  customTags: [...tags],
  // Allow incomplete snippets without requiring annotations for every diagnostic.
  handbookOptions: { noErrorValidation: true },
}

/**
 * Creates a Twoslash resolver with consistent package declarations across runtimes.
 *
 * Compiler libraries load once per process; imported packages load per document through {@link prepare}.
 */
export function create(options: create.Options = {}): create.ReturnType {
  /** The compiler's file system, written to directly by both stages. */
  const files = new Map<string, string>()
  let started: Promise<Cdn> | undefined

  async function start(): Promise<Cdn> {
    const compiler = options.compiler ?? (await loadCompiler())
    const lib = await bundled(compiler)
    // Read compiler libraries from disk in Node to avoid network-dependent type resolution.
    if (lib) {
      for (const [path, source] of lib) files.set(path, source)
      const { createTwoslasher } = await import('twoslash')
      const twoslasher = createTwoslasher({ ...overrides, fsMap: files })
      return {
        compiler,
        run: (code, lang, types) => twoslasher(code, lang, runOptions(types)),
      }
    }
    // Fetch compiler libraries when the runtime has no filesystem access.
    const { createTwoslashFromCDN } = await import('twoslash-cdn')
    const twoslash = createTwoslashFromCDN({
      compilerOptions,
      fsMap: files,
      storage: options.storage ?? (await cache()),
      twoSlashOptionsOverrides: overrides,
    })
    // Only the lib files. Acquiring a document's packages is the second stage.
    await twoslash.init()
    return {
      compiler,
      run: (code, lang, types) => twoslash.runSync(code, lang, runOptions(types)),
    }
  }

  return {
    async prepare(code) {
      // A rejection must not be cached, or one failed fetch would leave this
      // resolver unable to resolve anything for the rest of its life.
      const cdn = await (started ??= start().catch((cause: unknown) => {
        started = undefined
        throw cause
      }))
      const acquired = await acquire({
        code,
        compiler: cdn.compiler,
        files,
        load: options.load ?? read,
      })
      return (source, lang) => cdn.run(source, lang, acquired.types)
    },
  }
}

/**
 * Loads TypeScript without its Node filesystem in workerd. Node compatibility
 * exposes `process` and a bundler `require` stub, which otherwise makes the
 * compiler select its Node path and call the unusable stub during import.
 */
async function loadCompiler(): Promise<typeof import('typescript')> {
  const runtime =
    typeof navigator !== 'undefined' &&
    navigator.userAgent === 'Cloudflare-Workers' &&
    typeof process !== 'undefined'
      ? (process as typeof process & { browser?: boolean | undefined })
      : undefined
  if (!runtime) return (await import('typescript')).default

  const previous = runtime.browser
  runtime.browser = true
  try {
    return (await import('typescript')).default
  } finally {
    if (previous === undefined) delete runtime.browser
    else runtime.browser = previous
  }
}

export declare namespace create {
  type Options = {
    /**
     * The compiler to resolve with. Defaults to the installed `typescript`,
     * loaded so workerd selects its browser path rather than a `require` stub
     * Node compatibility leaves unusable.
     *
     * Pass one to skip that detection, or to share a compiler the surface
     * already holds for its own language service.
     */
    compiler?: typeof import('typescript') | undefined
    /**
     * Where a package's declarations come from. Defaults to the npm registry,
     * which a browser cannot reach across origins and reads back through a
     * route of its own instead.
     */
    load?: acquire.Options['load'] | undefined
    /**
     * Where compiler libraries fetched by a filesystem-free runtime are kept.
     * Defaults to memory, which does not survive the surface that built it.
     */
    storage?: Storage | undefined
  }

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

/** Shared storage for compiler libraries fetched by filesystem-free runtimes. */
let storage: Promise<Storage> | undefined
function cache() {
  return (storage ??= import('unstorage').then((module) => module.createStorage()))
}

/** Initialized compiler and Twoslash runner. */
type Cdn = {
  compiler: typeof import('typescript')
  run: (code: string, lang: string | undefined, types: readonly string[]) => TwoslashReturn
}

/** Adds only the ambient roots this document acquired to a Twoslash run. */
function runOptions(types: readonly string[]) {
  return types.length ? { compilerOptions: { types: [...types] } } : undefined
}

/**
 * Reads library declarations from the active TypeScript installation.
 *
 * Returns `undefined` when the runtime provides no compatible filesystem API.
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

/** Loads one package's declarations from the registry. */
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
