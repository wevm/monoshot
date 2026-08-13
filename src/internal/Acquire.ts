import type ts from 'typescript'

/**
 * Fills a virtual file system with the types a document's imports need.
 *
 * One request per package, reading whole npm tarballs rather than one file at
 * a time: `shiki` alone ships 442 declarations, and a CDN that serves them
 * singly turns acquiring it into 442 round trips.
 *
 * `load` is where a package's declarations come from, because a browser cannot
 * reach the registry across origins and reads them back through a route
 * instead. Everything after it is shared, so every surface resolves the same
 * types for the same imports.
 */
export async function acquire(options: acquire.Options): Promise<void> {
  const { active, code, compiler, files, load, onPackage, onProgress } = options
  const seen = new Set<string>()
  let queue = references(compiler, code)
  let done = 0

  while (queue.length) {
    // Deduplicated first: a package named by fifty declaration files is still
    // one package, and filtering alone lets every copy through.
    const wanted = [...new Set(queue)].filter((name) => !seen.has(name))
    for (const name of wanted) seen.add(name)
    if (!wanted.length) return

    const packages = (
      await Promise.all(
        wanted.map(async (name) => {
          onPackage?.(name, true)
          try {
            return await read(name)
          } finally {
            onPackage?.(name, false)
          }
        }),
      )
    ).filter((value) => value !== undefined)
    done += wanted.length
    // A superseded acquisition can finish fetching, but must not replace files
    // selected by the request that superseded it.
    if (active?.() === false) return

    // Package declarations can reference additional packages, which form the
    // next acquisition round.
    queue = packages.flatMap((entry) => {
      const found: string[] = []
      const root = `/node_modules/${entry.name}`
      // A resolver can replace a package with another version. Remove files
      // absent from the replacement before writing the files it does ship.
      for (const path of files.keys()) if (path.startsWith(`${root}/`)) files.delete(path)
      for (const [path, source] of Object.entries(entry.files)) {
        files.set(`${root}${path}`, source)
        if (/\.d\.[cm]?ts$/.test(path))
          for (const reference of references(compiler, source)) found.push(reference)
      }
      return found
    })
    // Counted after the next round is known, and over the names that will
    // require fetching: duplicate package names share one request, and a total
    // counting it twice never arrives at itself.
    onProgress?.(done, done + new Set(queue.filter((name) => !seen.has(name))).size)
  }

  async function read(name: string): Promise<acquire.Package | undefined> {
    const fetched = await load(name)
    if (!fetched) return undefined
    // A package shipping no declarations may still be described on
    // DefinitelyTyped, which is where the compiler looks next.
    const typed = Object.keys(fetched.files).some((path) => /\.d\.[cm]?ts$/.test(path))
    if (typed) return fetched
    const types = await load(`@types/${mangle(name)}`)
    return types ? { files: types.files, name: `@types/${mangle(name)}` } : fetched
  }
}

export declare namespace acquire {
  type Options = {
    /** Whether fetched packages still belong to the active request. */
    active?: (() => boolean) | undefined
    /** The document whose imports to resolve. */
    code: string
    /** A TypeScript module, used to read imports out of source. */
    compiler: typeof ts
    /** The virtual file system to fill, keyed by absolute path. */
    files: Map<string, string>
    /**
     * Reads one package's declarations. Returns `undefined` for a package with
     * none, which leaves its imports as `any`.
     */
    load: (name: string) => Promise<Package | undefined>
    /** Called when each package starts and finishes loading. */
    onPackage?: ((name: string, loading: boolean) => void) | undefined
    /** Called as packages land, for a caller that shows progress. */
    onProgress?: ((loaded: number, total: number) => void) | undefined
  }

  /** A package's declarations, keyed by path relative to its root. */
  type Package = {
    files: Record<string, string>
    name: string
  }
}

/**
 * The packages a source file imports. Relative paths are already on disk once
 * their package arrives, and the compiler resolves its own lib references.
 * A `node:` specifier names a runtime builtin, which npm has no package for.
 */
function references(compiler: typeof ts, code: string) {
  const info = compiler.preProcessFile(code, true, true)
  const imported = info.importedFiles
    .concat(info.referencedFiles)
    .map((file) => file.fileName)
    .filter((name) => !name.startsWith('.') && !name.startsWith('/') && !name.startsWith('node:'))
    .map(bare)
  // A `/// <reference types="node" />` names a DefinitelyTyped package, not an
  // import: `node` is a package of its own on npm and not the one meant. The
  // directive spells a scope out already, so `@types/` is all it needs.
  const ambient = info.typeReferenceDirectives.map((file) => `@types/${file.fileName}`)
  return [...imported, ...ambient]
}

/** `shiki/core` lives in the `shiki` package; a scope keeps two segments. */
function bare(specifier: string) {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? specifier)
}

/** DefinitelyTyped flattens a scope: `@shikijs/core` is `shikijs__core`. */
function mangle(name: string) {
  return name.startsWith('@') ? name.slice(1).replace('/', '__') : name
}
