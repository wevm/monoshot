/** A package's declaration files, keyed by path relative to the package root. */
export type Types = Record<string, string>

/**
 * Reads a package's declaration files out of its npm tarball.
 *
 * One request for a whole package, rather than one per file: a package like
 * `shiki` ships 442 declaration files, and a CDN that serves them singly turns
 * that into 442 round trips.
 */
export async function types(options: types.Options): Promise<types.Result> {
  const { name, version } = options
  const meta = await json({
    name,
    url: `${registry}/${encodeName(name)}/${encodeURIComponent(version)}`,
    version,
  })
  const resolved = typeof meta['version'] === 'string' ? meta['version'] : version
  const dist = meta['dist']
  const tarball =
    typeof dist === 'object' && dist !== null && 'tarball' in dist
      ? (dist as { tarball: unknown }).tarball
      : undefined
  if (typeof tarball !== 'string') throw new RegistryError(`\`${name}\` has no tarball to read.`)

  const response = await fetch(tarball)
  if (!response.ok || !response.body)
    throw new RegistryError(`Could not download \`${name}@${resolved}\`.`)
  const tar = await new Response(
    response.body.pipeThrough(new DecompressionStream('gzip')),
  ).arrayBuffer()

  return { files: extract(new Uint8Array(tar)), name, version: resolved }
}

/**
 * Picks a package's declaration files out of an unpacked tarball.
 *
 * The compiler reads declarations, and the manifest to find them; the rest of
 * a package is implementation it never opens.
 */
export function extract(tar: Uint8Array): Types {
  const decoder = new TextDecoder()
  const files: Types = {}
  for (const entry of untar(tar)) {
    // npm wraps every tarball in a single `package/` directory.
    const path = entry.name.replace(/^package\//, '')
    if (!/\.d\.[cm]?ts$/.test(path) && path !== 'package.json') continue
    files[`/${path}`] = decoder.decode(entry.body)
  }
  return files
}

export declare namespace types {
  type Options = {
    /** Package name, scope included. */
    name: string
    /** An exact version or a tag such as `latest`. */
    version: string
  }

  type Result = {
    /** Declaration files and the manifest, keyed by absolute package path. */
    files: Types
    /** The package these belong to. */
    name: string
    /** The version a tag resolved to, which is what a cache key needs. */
    version: string
  }
}

const registry = 'https://registry.npmjs.org'

/** A scope's `/` is part of the name, so only the scope separator survives. */
function encodeName(name: string) {
  return name
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

async function json(options: { name: string; url: string; version: string }) {
  const response = await fetch(options.url, { headers: { accept: 'application/json' } })
  // The upstream URL stays out of the message: a caller gets its own request
  // back, not ours.
  if (response.status === 404)
    throw new RegistryError(`\`${options.name}@${options.version}\` is not on npm.`)
  if (!response.ok)
    throw new RegistryError(`The registry answered ${response.status} for \`${options.name}\`.`)
  return (await response.json()) as Record<string, unknown>
}

type Entry = { body: Uint8Array; name: string }

/**
 * Walks a tar archive's entries.
 *
 * Only what a package tarball uses: regular files, plus the pax and GNU
 * headers that carry a path too long for the 100-byte name field, which npm
 * emits for deeply nested declaration files.
 */
function* untar(buffer: Uint8Array): Generator<Entry> {
  const decoder = new TextDecoder()
  let offset = 0
  // Set by a header that precedes the entry it renames.
  let override: string | undefined

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512)
    // Two zero blocks end the archive, but a single one is enough to stop on.
    if (header.every((byte) => byte === 0)) return
    const name = text(decoder, header.subarray(0, 100))
    const size = Number.parseInt(text(decoder, header.subarray(124, 136)) || '0', 8)
    const flag = String.fromCharCode(header[156] ?? 0)
    const prefix = text(decoder, header.subarray(345, 500))
    offset += 512
    const body = buffer.subarray(offset, offset + size)
    // Entries are padded to a 512-byte boundary.
    offset += Math.ceil(size / 512) * 512

    // `x` carries pax records for the next entry; `L` is GNU's older long name.
    if (flag === 'x') {
      override = pax(decoder.decode(body))
      continue
    }
    if (flag === 'L') {
      override = text(decoder, body)
      continue
    }
    // `0` and NUL both mean a regular file; anything else is a directory or link.
    if (flag !== '0' && flag !== '\0') {
      override = undefined
      continue
    }
    yield { body, name: override ?? (prefix ? `${prefix}/${name}` : name) }
    override = undefined
  }
}

/** Pax records are `<length> <key>=<value>\n`; only the path matters here. */
function pax(records: string) {
  for (const line of records.split('\n')) {
    const record = line.slice(line.indexOf(' ') + 1)
    if (record.startsWith('path=')) return record.slice('path='.length)
  }
  return undefined
}

function text(decoder: TextDecoder, bytes: Uint8Array) {
  const end = bytes.indexOf(0)
  return decoder.decode(end === -1 ? bytes : bytes.subarray(0, end)).trim()
}

/** Thrown when a package cannot be read from the registry. */
export class RegistryError extends Error {
  override name = 'Registry.RegistryError'
}
