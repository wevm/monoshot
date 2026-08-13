import ts from 'typescript'

import { acquire } from './Acquire.js'

/** A package carrying one declaration file, which is all the walk reads. */
function shipping(source: string) {
  return (name: string) => Promise.resolve({ files: { '/index.d.ts': source }, name })
}

describe('acquire', () => {
  test('reads a triple-slash type reference as its DefinitelyTyped package', async () => {
    // `node` is a package of its own on npm, and not the one the directive
    // means, so the name has to arrive already pointed at `@types`.
    const asked: string[] = []
    const result = await acquire({
      code: '/// <reference types="node" />\nconst a = 1\n',
      compiler: ts,
      files: new Map(),
      load: (name) => {
        asked.push(name)
        return Promise.resolve(undefined)
      },
    })
    expect(result.types).toEqual(['node'])
    expect(asked).toMatchInlineSnapshot(`
      [
        "@types/node",
      ]
    `)
  })

  test.each(['import { readFile } from "node:fs"', 'export { join } from "node:path"'])(
    'reads Node declarations for a builtin reference in %s',
    async (code) => {
      const asked: string[] = []
      const result = await acquire({
        code,
        compiler: ts,
        files: new Map(),
        load: (name) => {
          asked.push(name)
          return shipping('export {}')(name)
        },
      })
      expect(asked).toEqual(['@types/node'])
      expect(result.types).toEqual(['node'])
    },
  )

  test.each(['process.env.NODE_ENV', 'Buffer.from("value")', 'NodeJS.Process'])(
    'reads Node declarations for the global in %s',
    async (code) => {
      const asked: string[] = []
      const result = await acquire({
        code,
        compiler: ts,
        files: new Map(),
        load: (name) => {
          asked.push(name)
          return shipping('export {}')(name)
        },
      })
      expect(asked).toEqual(['@types/node'])
      expect(result.types).toEqual(['node'])
    },
  )

  test('ignores Node names in comments and strings', async () => {
    const asked: string[] = []
    const result = await acquire({
      code: [
        '// process and Buffer',
        'const prose = "node:process require NodeJS"',
        'const pattern = /process/',
        'const value = { process: true }',
        'function local(process: string) { return true }',
      ].join('\n'),
      compiler: ts,
      files: new Map(),
      load: (name) => {
        asked.push(name)
        return shipping('export {}')(name)
      },
    })
    expect(asked).toEqual([])
    expect(result.types).toEqual([])
  })

  test('reads Node declarations referenced by an acquired package', async () => {
    const asked: string[] = []
    const result = await acquire({
      code: 'import "library"',
      compiler: ts,
      files: new Map(),
      load: (name) => {
        asked.push(name)
        return shipping(name === 'library' ? 'import "node:stream"' : 'export {}')(name)
      },
    })
    expect(asked).toEqual(['library', '@types/node'])
    expect(result.types).toEqual(['node'])
  })

  test('writes what it reads under the package it came from', async () => {
    const files = new Map<string, string>()
    await acquire({
      code: "import { a } from 'left-pad'\n",
      compiler: ts,
      files,
      load: shipping('export declare const a: 1'),
    })
    expect([...files.keys()]).toMatchInlineSnapshot(`
      [
        "/node_modules/left-pad/index.d.ts",
      ]
    `)
  })

  test('counts a package named twice once, and reaches its own total', async () => {
    const progress: [number, number][] = []
    await acquire({
      // Two imports of one package, which is one request and one total.
      code: "import { a } from 'one'\nimport { b } from 'one'\n",
      compiler: ts,
      files: new Map(),
      load: shipping('export declare const a: 1'),
      onProgress: (loaded, total) => progress.push([loaded, total]),
    })
    // Counting the duplicate leaves the last call at `1, 2`, and a caller
    // showing progress permanently one short of done.
    expect(progress).toMatchInlineSnapshot(`
      [
        [
          1,
          1,
        ],
      ]
    `)
  })
})
