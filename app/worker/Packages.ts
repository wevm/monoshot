/** Splits a package specifier while preserving scoped package prefixes. */
export function parse(spec: string): parse.Result {
  const at = spec.lastIndexOf('@')
  if (at <= 0) return { name: spec, version: 'latest' }
  return { name: spec.slice(0, at), version: spec.slice(at + 1) }
}

export declare namespace parse {
  type Result = { name: string; version: string }
}

/** Returns whether a version is an exact immutable semantic version. */
export function exact(version: string): boolean {
  return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
    version,
  )
}

/** Canonical cache URL for a resolved package request. */
export function key(origin: string, options: key.Options): string {
  const url = new URL('/api/types', origin)
  url.searchParams.set('name', options.name)
  url.searchParams.set('version', options.version)
  return url.toString()
}

export declare namespace key {
  type Options = { name: string; version: string }
}
