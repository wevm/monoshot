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
  const load = cached(read)
  let started: Promise<Cdn> | undefined
  let storage: Promise<Storage> | undefined

  /** Storage owned by this resolver for compiler libraries in browser runtimes. */
  const cache = () => (storage ??= import('unstorage').then((module) => module.createStorage()))

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
      storage: await cache(),
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
        load,
      })
      return (source, lang) => cdn.run(source, lang, acquired.types)
    },
  }
}

/** Deduplicates bounded package reads by package and requested version. */
export function cached(
  load: (name: string, version: string) => Promise<acquire.Package | undefined>,
  options: cached.Options = {},
): (name: string, version: string) => Promise<acquire.Package | undefined> {
  const limit = options.limit ?? 128
  const now = options.now ?? Date.now
  const ttl = options.ttl ?? 5 * 60_000
  const held = new Map<string, { expires: number; loading: Promise<acquire.Package | undefined> }>()
  return (name, version) => {
    const key = `${name}@${version}`
    const found = held.get(key)
    if (found && found.expires > now()) {
      held.delete(key)
      held.set(key, found)
      return found.loading
    }
    held.delete(key)
    const loading = load(name, version)
    const entry = { expires: exact(version) ? Number.POSITIVE_INFINITY : now() + ttl, loading }
    held.set(key, entry)
    const oldest = held.size > limit ? held.keys().next().value : undefined
    if (oldest !== undefined) held.delete(oldest)
    void loading.then(
      (result) => {
        if (result === undefined && held.get(key) === entry) entry.expires = now() + ttl
      },
      () => {
        if (held.get(key) === entry) held.delete(key)
      },
    )
    return loading
  }
}

export declare namespace cached {
  type Options = {
    /** Maximum retained package reads. */
    limit?: number | undefined
    /** Clock used to expire mutable specifications and misses. */
    now?: (() => number) | undefined
    /** Milliseconds before a mutable specification or miss is revalidated. */
    ttl?: number | undefined
  }
}

/** Whether a package version can never resolve to different contents. */
function exact(version: string) {
  return /^v?\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)
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
async function read(name: string, version: string): Promise<acquire.Package | undefined> {
  try {
    const result = await Registry.types({ name, version })
    return { files: result.files, name: result.name, version: result.version }
  } catch (cause) {
    // Missing declaration packages resolve as `any`. Registry failures remain
    // errors because treating them as absent would produce incorrect annotations.
    if (cause instanceof Registry.RegistryError && cause.absent) return undefined
    throw cause
  }
}
