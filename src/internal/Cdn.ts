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
 * Creates a Twoslash resolver with consistent package declarations across runtimes.
 *
 * Compiler libraries load once per process; imported packages load per document through {@link prepare}.
 */
export function create(): create.ReturnType {
  /** The compiler's file system, written to directly by both stages. */
  const files = new Map<string, string>()
  let started: Promise<Cdn> | undefined

  /** Compiler and Twoslash options shared by local and CDN-backed resolvers. */
  const overrides = {
    compilerOptions,
    // Register custom tags so Twoslash interprets them instead of ordinary comments.
    customTags: [...tags],
    // Allow incomplete snippets without requiring annotations for every diagnostic.
    handbookOptions: { noErrorValidation: true },
  }

  async function start(): Promise<Cdn> {
    const compiler = await loadCompiler()
    const lib = await bundled(compiler)
    // Read compiler libraries from disk in Node to avoid network-dependent type resolution.
    if (lib) {
      for (const [path, source] of lib) files.set(path, source)
      const { createTwoslasher } = await import('twoslash')
      const twoslasher = createTwoslasher({ ...overrides, fsMap: files })
      return { compiler, run: (code, lang) => twoslasher(code, lang) }
    }
    // Fetch compiler libraries when the runtime has no filesystem access.
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
  run: create.Twoslasher
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
