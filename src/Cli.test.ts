import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { bundledLanguages, bundledLanguagesInfo } from 'shiki'

import * as Cli from './Cli.js'
import * as Codec from './Codec.js'
import * as Headless from './Headless.js'
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

/** Returns settings encoded in a link for any destination. */
function settings(url: string) {
  return Codec.deserialize(new URL(url).hash.slice(1))
}

describe('create', () => {
  describe('themes', () => {
    test('lists every theme a frame offers', async () => {
      const { output } = await run(['themes'])
      expect(output).toHaveLength(Theme.list().length)
      expect(output[0]).toMatchInlineSnapshot(`
        {
          "displayName": "Aurora X",
          "name": "aurora-x",
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

    test('refuses a base that is not HTTP', async () => {
      const source = await file('demo.ts')
      const { exit, output } = await run(['share', source, '--base', 'file:///tmp/monoshot'])
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

    test('applies Tempo framing unless the radius is explicit', async () => {
      const source = await file('demo.ts')
      const implicit = await run(['share', source, '--theme', 'tempo'])
      const explicit = await run(['share', source, '--theme', 'tempo', '--radius', '8'])
      expect({
        explicit: settings((explicit.output as { url: string }).url).radius,
        implicit: settings((implicit.output as { url: string }).url).radius,
      }).toMatchInlineSnapshot(`
        {
          "explicit": 8,
          "implicit": 0,
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
          "message": "Specify either a file or \`--code\`, but not both.",
        }
      `)
    })

    test('refuses a run with no snippet at all', async () => {
      const { exit, output } = await run(['share'])
      expect(exit).toBe(1)
      expect(output).toMatchInlineSnapshot(`
        {
          "code": "no_snippet",
          "message": "Specify a file, use \`--code\`, or pass \`-\` to read standard input.",
        }
      `)
    })

    test('reports a file it cannot read', async () => {
      const { exit, output } = await run(['share', '/monoshot/no/such/file.ts'])
      expect(exit).toBe(1)
      expect((output as { code: string }).code).toMatchInlineSnapshot(`"no_snippet"`)
    })

    test('refuses a theme it does not have, rather than encoding it', async () => {
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

    test('reads file extensions case-insensitively', async () => {
      const source = await file('demo.PY', 'greeting = "hello"\n')
      const { output } = await run(['share', source])
      expect(settings((output as { url: string }).url).lang).toMatchInlineSnapshot(`"python"`)
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
          "message": "Specify a file, use \`--code\`, or pass \`-\` to read standard input.",
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
    test('renders Tempo on its artwork with square corners by default', async () => {
      const source = await file('demo.ts')
      const render = vi.fn((_options: Headless.render.Options) =>
        Promise.resolve(new Uint8Array([1, 2, 3])),
      )
      const create = vi.spyOn(Headless, 'create').mockReturnValue({
        dispose: () => Promise.resolve(),
        render,
      } as never)
      try {
        await run(['render', source, '--theme', 'tempo'])
        const options = render.mock.calls[0]?.[0]
        expect({
          background: options?.background,
          picture: options?.picture?.startsWith('data:image/webp;base64,'),
          radius: options?.radius,
          width: options?.width,
        }).toMatchInlineSnapshot(`
          {
            "background": "default",
            "picture": true,
            "radius": 0,
            "width": undefined,
          }
        `)
      } finally {
        create.mockRestore()
      }
    })

    test('preserves explicit Tempo frame settings', async () => {
      const source = await file('demo.ts')
      const render = vi.fn((_options: Headless.render.Options) =>
        Promise.resolve(new Uint8Array([1, 2, 3])),
      )
      const create = vi.spyOn(Headless, 'create').mockReturnValue({
        dispose: () => Promise.resolve(),
        render,
      } as never)
      try {
        await run(['render', source, '--theme', 'tempo', '--background', 'none'])
        await run(['render', source, '--theme', 'tempo', '--radius', '8'])
        const background = render.mock.calls[0]?.[0]
        const radius = render.mock.calls[1]?.[0]
        expect({
          background: {
            background: background?.background,
            picture: background?.picture,
            radius: background?.radius,
          },
          radius: {
            background: radius?.background,
            picture: radius?.picture?.startsWith('data:image/webp;base64,'),
            radius: radius?.radius,
          },
        }).toMatchInlineSnapshot(`
          {
            "background": {
              "background": "none",
              "picture": undefined,
              "radius": 0,
            },
            "radius": {
              "background": "default",
              "picture": true,
              "radius": 8,
            },
          }
        `)
      } finally {
        create.mockRestore()
      }
    })

    test('suggests creating a matching editor link', async () => {
      const source = await file('demo.ts')
      const create = vi.spyOn(Headless, 'create').mockReturnValue({
        dispose: () => Promise.resolve(),
        render: () => Promise.resolve(new Uint8Array([1, 2, 3])),
      } as never)
      try {
        const { output } = await run([
          'render',
          source,
          '--theme',
          'tempo',
          '--title-bar',
          '--width',
          '720',
          '--full-output',
        ])
        expect((output as { meta: { cta: unknown } }).meta.cta).toEqual({
          commands: [
            {
              command: `monoshot share --title-bar ${source} --theme tempo --width 720`,
              description: 'Create a matching editor link.',
            },
          ],
          description: 'Next, create an editor link:',
        })
      } finally {
        create.mockRestore()
      }
    })

    test('refuses a theme it does not have, before starting a browser', async () => {
      const source = await file('demo.ts')
      const { exit, output } = await run(['render', source, '--theme', 'nope'])
      expect(exit).toBe(1)
      expect(output).toMatchInlineSnapshot(`
        {
          "code": "unknown_theme",
          "message": "Unknown theme \`nope\`. Run \`monoshot themes\` to list the available themes.",
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
          "message": "The image output would overwrite the source file. Specify a different path with \`--out\`.",
        }
      `)
    })

    test('refuses a `--type` the `--out` contradicts', async () => {
      // Reject output extensions that conflict with the requested format.
      const source = await file('demo.ts')
      const { exit, output } = await run(['render', source, '--type', 'png', '--out', 'a.svg'])
      expect(exit).toBe(1)
      expect(output).toMatchInlineSnapshot(`
        {
          "code": "type_conflict",
          "message": "\`--type png\` conflicts with an \`--out\` ending \`.svg\`.",
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
