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
      expect((output as { url: string }).url.startsWith('https://example.com/#')).toBe(true)
    })

    test('replaces a fragment the base already carries', async () => {
      // Appending would leave two, and a browser reads everything after the
      // first `#` as one fragment, which the decoder then rejects.
      const source = await file('demo.ts')
      const { output } = await run(['share', source, '--base', 'https://example.com/#old'])
      const url = (output as { url: string }).url
      expect(url.split('#')).toHaveLength(2)
      expect(settings(url).code).toBe(code)
    })

    test('refuses a base that is not a URL', async () => {
      const source = await file('demo.ts')
      const { exit, output } = await run(['share', source, '--base', 'not a url'])
      expect(exit).toBe(1)
      expect((output as { code: string }).code).toMatchInlineSnapshot(`"invalid_base"`)
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

    test('refuses a theme that is not bundled, rather than encoding it', async () => {
      // The app replaces an unknown theme on restore, so the link would open
      // something other than what was asked for.
      const source = await file('demo.ts')
      const { exit, output } = await run(['share', source, '--theme', 'nope'])
      expect(exit).toBe(1)
      expect((output as { code: string }).code).toMatchInlineSnapshot(`"unknown_theme"`)
    })

    test('refuses a setting the codec would silently replace', async () => {
      const source = await file('demo.ts')
      const { exit, output } = await run(['share', source, '--width', '200'])
      expect(exit).toBe(1)
      expect(output).toMatchInlineSnapshot(`
        {
          "code": "invalid_settings",
          "message": "\`--width\` is not a value the frame accepts.",
        }
      `)
    })

    test('names every setting it could not accept', async () => {
      const source = await file('demo.ts')
      const { output } = await run(['share', source, '--width', '200', '--background', 'red'])
      expect((output as { message: string }).message).toMatchInlineSnapshot(
        `"\`--background\`, \`--width\` are not values the frame accepts."`,
      )
    })

    test('refuses an empty snippet, which would open the sample', async () => {
      const { exit, output } = await run(['share', '--code', '   '])
      expect(exit).toBe(1)
      expect(output).toMatchInlineSnapshot(`
        {
          "code": "empty_snippet",
          "message": "The snippet is empty.",
        }
      `)
    })

    test('refuses a snippet the decoder would discard', async () => {
      // Past the codec's fragment limit the whole payload is dropped on
      // restore, so the link would open the app's defaults.
      const long = Array.from({ length: 40_000 }, (_, index) => `id${index}`).join(' ')
      const { exit, output } = await run(['share', '--code', long])
      expect(exit).toBe(1)
      expect((output as { code: string }).code).toMatchInlineSnapshot(`"snippet_too_large"`)
    })

    test('reads an extension whatever its case', async () => {
      const source = await file('demo.PY', 'greeting = "hello"\n')
      const { output } = await run(['share', source])
      expect(settings((output as { url: string }).url).lang).toMatchInlineSnapshot(`"python"`)
    })

    test('reads a range spelling into the lines it names', async () => {
      const source = await file('demo.ts', 'const a = 1\nconst b = 2\nconst c = 3\nconst d = 4\n')
      const { output } = await run(['share', source, '--highlight', '3,1-2'])
      expect(settings((output as { url: string }).url).highlightedLines).toMatchInlineSnapshot(`
        [
          1,
          2,
          3,
        ]
      `)
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

  describe('open', () => {
    // Only the paths that stop before a browser is launched: the suite must
    // not open windows on the machine running it.
    test('refuses a run with no snippet, before opening anything', async () => {
      const { exit, output } = await run(['open'])
      expect(exit).toBe(1)
      expect(output).toMatchInlineSnapshot(`
        {
          "code": "no_snippet",
          "message": "Name a file, pass \`--code\`, or pass \`-\` to read standard input.",
        }
      `)
    })

    test('refuses a language shiki does not bundle', async () => {
      const { exit, output } = await run(['open', '--code', 'const a = 1', '--lang', 'klingon'])
      expect(exit).toBe(1)
      expect((output as { code: string }).code).toMatchInlineSnapshot(`"unknown_language"`)
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

    test('refuses to write the image over the snippet it came from', async () => {
      const source = await file('demo.png', 'const a = 1\n')
      const { exit, output } = await run(['render', source])
      expect(exit).toBe(1)
      expect(output).toMatchInlineSnapshot(`
        {
          "code": "output_collision",
          "message": "The image would overwrite the snippet it was made from. Name an \`--out\`.",
        }
      `)
    })

    test('refuses a scale that cannot produce an image', async () => {
      // `scale` is not a codec setting, so the frame check never sees it, and
      // a nonpositive one reaches Chromium's device scale factor.
      const source = await file('demo.ts')
      const { exit } = await run(['render', source, '--scale', '0'])
      expect(exit).toBe(1)
    })

    test('leaves twoslash off for a language it cannot resolve types for', async () => {
      // Reaching the browser at all proves the frame resolved: a python file
      // must not be handed to the compiler.
      const source = await file('demo.py', 'greeting = "hello"\n')
      const { exit, output } = await run([
        'render',
        source,
        '--executable',
        '/monoshot/no/such/chrome',
      ])
      expect(exit).toBe(1)
      expect((output as { code: string }).code).toMatchInlineSnapshot(`"render_failed"`)
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
