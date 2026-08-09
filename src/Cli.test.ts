import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { bundledLanguages, bundledLanguagesInfo } from 'shiki'

import * as Cli from './Cli.js'
import * as Codec from './Codec.js'
import * as Theme from './Theme.js'

const code = 'export const greeting = "hello"\n'

/** Runs the real command surface over argv and reads the envelope back. */
async function run(argv: readonly string[]) {
  let exit = 0
  let out = ''
  await Cli.create().serve([...argv, '--format', 'json'], {
    exit: (code) => {
      exit = code
    },
    stdout: (chunk) => {
      out += chunk
    },
  })
  return { exit, output: JSON.parse(out) as never }
}

/** A source file under a name the language resolution reads. */
async function file(name: string, contents = code) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'monoshot-'))
  const target = path.join(directory, name)
  await fs.writeFile(target, contents)
  return target
}

/** The settings a link carries, whatever the link is pointed at. */
function settings(url: string) {
  return Codec.deserialize(new URL(url).hash.slice(1))
}

describe('create', () => {
  describe('themes', () => {
    test('lists every bundled theme', async () => {
      const { output } = await run(['themes'])
      expect(output).toHaveLength(Theme.list().length)
      expect(output[0]).toMatchInlineSnapshot(`
        {
          "displayName": "Andromeeda",
          "name": "andromeeda",
          "type": "dark",
        }
      `)
    })
  })

  describe('share', () => {
    test('carries the snippet and the settings through the link', async () => {
      const source = await file('demo.ts')
      const { output } = await run(['share', source, '--theme', 'github-light', '--width', '800'])
      const state = settings((output as { url: string }).url)
      expect({ code: state.code, theme: state.theme, width: state.width }).toMatchInlineSnapshot(`
        {
          "code": "export const greeting = "hello"
        ",
          "theme": "github-light",
          "width": 800,
        }
      `)
    })

    test('points at the deployment the caller names', async () => {
      const source = await file('demo.ts')
      const { output } = await run(['share', source, '--base', 'https://example.com'])
      expect((output as { url: string }).url.startsWith('https://example.com#')).toBe(true)
    })

    test('reads the language from the file name, as shiki names it', async () => {
      const source = await file('demo.py', 'greeting = "hello"\n')
      const { output } = await run(['share', source])
      expect(settings((output as { url: string }).url).lang).toMatchInlineSnapshot(`"python"`)
    })

    test('falls back for a name that implies no language', async () => {
      const source = await file('demo')
      const { output } = await run(['share', source])
      expect(settings((output as { url: string }).url).lang).toMatchInlineSnapshot(`"typescript"`)
    })

    test('takes the snippet inline, without a file', async () => {
      const { output } = await run(['share', '--code', 'const a = 1', '--lang', 'ts'])
      const state = settings((output as { url: string }).url)
      expect({ code: state.code, lang: state.lang }).toMatchInlineSnapshot(`
        {
          "code": "const a = 1",
          "lang": "typescript",
        }
      `)
    })

    test('refuses a file and a snippet together', async () => {
      const source = await file('demo.ts')
      const { exit, output } = await run(['share', source, '--code', 'const a = 1'])
      expect(exit).toBe(1)
      expect(output).toMatchInlineSnapshot(`
        {
          "code": "no_snippet",
          "message": "Name a file or pass \`--code\`, not both.",
        }
      `)
    })

    test('refuses a run with no snippet at all', async () => {
      const { exit, output } = await run(['share'])
      expect(exit).toBe(1)
      expect(output).toMatchInlineSnapshot(`
        {
          "code": "no_snippet",
          "message": "Name a file, pass \`--code\`, or pass \`-\` to read standard input.",
        }
      `)
    })

    test('reports a file it cannot read', async () => {
      const { exit, output } = await run(['share', '/monoshot/no/such/file.ts'])
      expect(exit).toBe(1)
      expect((output as { code: string }).code).toMatchInlineSnapshot(`"no_snippet"`)
    })

    test('refuses a language shiki does not bundle', async () => {
      const source = await file('demo.ts')
      const { exit, output } = await run(['share', source, '--lang', 'klingon'])
      expect(exit).toBe(1)
      expect(output).toMatchInlineSnapshot(`
        {
          "code": "unknown_language",
          "message": "\`klingon\` is not a bundled language.",
        }
      `)
    })
  })

  describe('render', () => {
    test('refuses a theme that is not bundled, before starting a browser', async () => {
      const source = await file('demo.ts')
      const { exit, output } = await run(['render', source, '--theme', 'nope'])
      expect(exit).toBe(1)
      expect(output).toMatchInlineSnapshot(`
        {
          "code": "unknown_theme",
          "message": "\`nope\` is not a bundled theme. \`monoshot themes\` lists every name.",
        }
      `)
    })

    test('reports a browser it cannot start rather than throwing', async () => {
      const source = await file('demo.ts')
      const { exit, output } = await run([
        'render',
        source,
        '--executable',
        '/monoshot/no/such/chrome',
      ])
      expect(exit).toBe(1)
      expect((output as { code: string }).code).toMatchInlineSnapshot(`"render_failed"`)
    })
  })
})

// The language map narrows shiki's plainly-typed ids to `BundledLanguage`.
test('every bundled language id names a language shiki can load', () => {
  const known = new Set(Object.keys(bundledLanguages))
  expect(bundledLanguagesInfo.filter((info) => !known.has(info.id))).toMatchInlineSnapshot(`[]`)
})
