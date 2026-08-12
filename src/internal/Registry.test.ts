import * as Registry from './Registry.js'

/**
 * Builds a tar archive in memory. Real npm tarballs are the thing under test
 * everywhere else; this covers the header shapes they only sometimes use.
 */
function tar(entries: readonly { body?: string; flag?: string; name: string; prefix?: string }[]) {
  const encoder = new TextEncoder()
  const blocks: Uint8Array[] = []
  for (const entry of entries) {
    const body = encoder.encode(entry.body ?? '')
    const header = new Uint8Array(512)
    header.set(encoder.encode(entry.name.slice(0, 100)), 0)
    // Size is octal, NUL-terminated, in a 12-byte field.
    header.set(encoder.encode(body.length.toString(8).padStart(11, '0')), 124)
    header[156] = (entry.flag ?? '0').charCodeAt(0)
    if (entry.prefix) header.set(encoder.encode(entry.prefix), 345)
    blocks.push(header)
    const padded = new Uint8Array(Math.ceil(body.length / 512) * 512)
    padded.set(body)
    blocks.push(padded)
  }
  // Two zero blocks terminate the archive.
  blocks.push(new Uint8Array(1024))
  const total = blocks.reduce((sum, block) => sum + block.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const block of blocks) {
    out.set(block, offset)
    offset += block.length
  }
  return out
}

describe('extract', () => {
  test('keeps declarations and the manifest, and nothing else', () => {
    const archive = tar([
      { body: '{"name":"x"}', name: 'package/package.json' },
      { body: 'declare const a: 1', name: 'package/index.d.ts' },
      { body: 'declare const b: 2', name: 'package/mod.d.mts' },
      { body: 'declare const c: 3', name: 'package/mod.d.cts' },
      { body: 'export const a = 1', name: 'package/index.js' },
      { body: '# docs', name: 'package/README.md' },
    ])
    expect(Object.keys(Registry.extract(archive))).toMatchInlineSnapshot(`
      [
        "/package.json",
        "/index.d.ts",
        "/mod.d.mts",
        "/mod.d.cts",
      ]
    `)
  })

  test('reads a path too long for the name field out of its pax header', () => {
    const long = `package/${'nested/'.repeat(15)}deep.d.ts`
    const record = `${`path=${long}\n`.length + 4} path=${long}\n`
    const archive = tar([
      { body: record, flag: 'x', name: 'PaxHeader' },
      // The truncated name the pax record overrides.
      { body: 'declare const deep: 1', name: long.slice(0, 100) },
    ])
    expect(Object.keys(Registry.extract(archive))).toMatchInlineSnapshot(`
      [
        "/nested/nested/nested/nested/nested/nested/nested/nested/nested/nested/nested/nested/nested/nested/nested/deep.d.ts",
      ]
    `)
  })

  test('joins the prefix field, which splits a long path across two fields', () => {
    const archive = tar([
      { body: 'declare const a: 1', name: 'deep.d.ts', prefix: 'package/very/nested' },
    ])
    expect(Object.keys(Registry.extract(archive))).toMatchInlineSnapshot(`
      [
        "/very/nested/deep.d.ts",
      ]
    `)
  })

  test('skips directories and links, which carry no source', () => {
    const archive = tar([
      { flag: '5', name: 'package/dist/' },
      { flag: '2', name: 'package/link.d.ts' },
      { body: 'declare const a: 1', name: 'package/real.d.ts' },
    ])
    expect(Object.keys(Registry.extract(archive))).toMatchInlineSnapshot(`
      [
        "/real.d.ts",
      ]
    `)
  })
})
