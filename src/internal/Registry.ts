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
  const request = options.fetch ?? fetch
  const meta = await json({
    fetch: request,
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
  // Absent rather than failed: a version that ships no tarball ships none on
  // every later attempt too.
  if (typeof tarball !== 'string')
    throw new RegistryError(`\`${name}\` has no tarball to read.`, { absent: true })

  const response = await request(tarball)
  if (!response.ok || !response.body)
    throw new RegistryError(`Could not download \`${name}@${resolved}\`.`)
  const compressed = await bytes(response.body, limits.compressed, name)
  const packed = new ArrayBuffer(compressed.length)
  new Uint8Array(packed).set(compressed)
  const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))
  const tar = await bytes(stream, limits.decompressed, name)

  return { files: extract(tar), name, version: resolved }
}

/**
 * Picks a package's declaration files out of an unpacked tarball.
 *
 * The compiler reads declarations, and the manifest to find them; the rest of
 * a package is implementation it never opens.
 */
export function extract(tar: Uint8Array, options: extract.Options = {}): Types {
  const decoder = new TextDecoder()
  const files: Types = {}
  const entries = [...untar(tar)]
  // npm tarballs have one top-level directory. Most call it `package`, while
  // DefinitelyTyped packages use their own name, such as `node`.
  const wrappers = new Set(
    entries.map((entry) => {
      const slash = entry.name.indexOf('/')
      return slash === -1 ? '' : entry.name.slice(0, slash + 1)
    }),
  )
  const wrapper = wrappers.size === 1 ? (wrappers.values().next().value ?? '') : ''
  let count = 0
  let size = 0
  for (const entry of entries) {
    const path = entry.name.startsWith(wrapper) ? entry.name.slice(wrapper.length) : entry.name
    if (!/\.d\.[cm]?ts$/.test(path) && path !== 'package.json') continue
    if (count >= (options.files ?? limits.files))
      throw new RegistryError('The package contains too many declaration files.')
    count++
    size += entry.body.length
    if (size > (options.size ?? limits.declarations))
      throw new RegistryError('The package declarations are too large.')
    files[`/${path}`] = decoder.decode(entry.body)
  }
  return files
}

export declare namespace extract {
  type Options = {
    /** Maximum declaration and manifest files. */
    files?: number | undefined
    /** Maximum declaration and manifest bytes. */
    size?: number | undefined
  }
}

export declare namespace types {
  type Options = {
    /** Package name, scope included. */
    name: string
    /** Request implementation. Tests can provide a deterministic registry. */
    fetch?: typeof globalThis.fetch | undefined
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
const limits = {
  compressed: 8 * 1024 * 1024,
  declarations: 16 * 1024 * 1024,
  decompressed: 32 * 1024 * 1024,
  files: 4_096,
} as const

async function bytes(
  stream: ReadableStream<Uint8Array>,
  limit: number,
  name: string,
): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.length
      if (size > limit) {
        await reader.cancel()
        throw new RegistryError(`\`${name}\` is too large to read.`)
      }
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }
  const output = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

/** A scope's `/` is part of the name, so only the scope separator survives. */
function encodeName(name: string) {
  return name
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
}

async function json(options: {
  fetch: typeof globalThis.fetch
  name: string
  url: string
  version: string
}) {
  const response = await options.fetch(options.url, { headers: { accept: 'application/json' } })
  // The upstream URL stays out of the message: a caller gets its own request
  // back, not ours.
  if (response.status === 404)
    throw new RegistryError(`\`${options.name}@${options.version}\` is not on npm.`, {
      absent: true,
    })
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
  /**
   * Whether the package has no declarations. Registry failures remain distinct
   * because callers may treat only absent declarations as `any`.
   */
  absent: boolean

  constructor(message: string, options: RegistryError.Options = {}) {
    super(message)
    this.absent = options.absent ?? false
  }
}

export declare namespace RegistryError {
  type Options = {
    /** Whether the package is missing or contains no declarations. */
    absent?: boolean | undefined
  }
}
