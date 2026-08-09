import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { text } from 'node:stream/consumers'
import * as Incur from 'incur'
import type { BundledLanguage } from 'shiki'
import { bundledLanguagesInfo } from 'shiki'
import * as z from 'zod'

import * as Codec from './Codec.js'
import * as Headless from './Headless.js'
import * as Theme from './Theme.js'
import { version } from './version.js'

/** Where a share link points when the caller names no other deployment. */
const site = 'https://monoshot.broken-thunder-fb8b.workers.dev'

/**
 * The language a snippet is tokenized as when nothing names or implies one.
 * Shiki's own id rather than the `ts` alias, so every resolved language is
 * recorded under one name.
 */
const fallback = 'typescript' satisfies BundledLanguage

/**
 * Every bundled language against the names shiki accepts for it, including
 * aliases such as `py`, which is also what a file extension looks like.
 *
 * `bundledLanguagesInfo` types `id` as a plain string; the membership test in
 * `Cli.test.ts` is what keeps this narrowing honest.
 */
const languages = new Map<string, BundledLanguage>(
  bundledLanguagesInfo.flatMap((info) =>
    [info.id, ...(info.aliases ?? [])].map((name) => [name, info.id as BundledLanguage] as const),
  ),
)

/**
 * The frame settings, named as the codec names them so a link and a render of
 * the same snippet are described the same way. Each one is optional here and
 * falls back in {@link Codec.schema}, which owns the defaults.
 */
const settings = z.object({
  background: z.string().optional().describe('`default`, `none`, or a `#rrggbb` color.'),
  lang: z.string().optional().describe('Language to tokenize with. Read from the file otherwise.'),
  lineNumbers: z.boolean().optional().describe('Number the snippet down its left edge.'),
  padding: z.number().optional().describe('Space around the window, in pixels.'),
  radius: z.number().optional().describe("The window's corner radius, in pixels."),
  theme: z.string().optional().describe('A shiki theme name.'),
  title: z.string().optional().describe("The window's title."),
  titleBar: z.boolean().optional().describe('Draw the title bar.'),
  width: z.number().optional().describe('Width of the window, in pixels.'),
})

/** Where a snippet comes from, when it does not arrive as `--code`. */
const source = z.object({
  file: z.string().optional().describe('Path to a source file, or `-` to read standard input.'),
})

/** The snippet itself, for a caller holding the code rather than a path. */
const inline = z.object({
  code: z.string().optional().describe('The snippet itself, in place of a file.'),
})

/**
 * Builds the command surface: `render` to an image, `share` to a link, and
 * `themes` for the names the other two accept.
 *
 * Returns the CLI rather than serving it, so `serve` belongs to the bin and a
 * test can drive the same definition through `fetch`.
 */
export function create() {
  return Incur.Cli.create('monoshot', {
    description: 'Render code to images with type annotations.',
    mcp: {
      instructions:
        'Renders a source file or an inline snippet to a PNG, or to a link that opens the same frame in a browser. `themes` lists the names `--theme` accepts.',
    },
    version,
  })
    .command('render', {
      alias: { out: 'o', scale: 's', theme: 't' },
      args: source,
      description: 'Render a snippet to a PNG.',
      examples: [
        { args: { file: 'app.ts' }, options: { out: 'app.png' } },
        { description: 'From a snippet rather than a file.', options: { code: 'const a = 1' } },
        {
          args: { file: 'app.ts' },
          description: 'A light theme at print size.',
          options: { scale: 4, theme: 'github-light' },
        },
      ],
      options: settings.extend({
        ...inline.shape,
        executable: z.string().optional().describe('Path to a Chrome to render in.'),
        out: z
          .string()
          .optional()
          .describe('Where to write the image. Beside the source by default.'),
        scale: z.number().optional().describe('Multiplier on the frame’s own size. Defaults to 2.'),
      }),
      output: z.object({
        bytes: z.number().describe('Size of the image written.'),
        path: z.string().describe('Where the image was written.'),
      }),
      async run({ args, error, options }) {
        const code = await read(args.file, options.code)
        if (code instanceof Error) return error({ code: 'no_snippet', message: code.message })
        const state = frame(args.file, code, options)
        if (!state)
          return error({
            code: 'unknown_language',
            message: `\`${options.lang}\` is not a bundled language.`,
          })
        const theme = Theme.info(state.theme)
        if (!theme)
          return error({
            code: 'unknown_theme',
            message: `\`${state.theme}\` is not a bundled theme. \`monoshot themes\` lists every name.`,
          })
        // `error` returns its result rather than throwing, so a failed render
        // has to come back as a value the handler can return through.
        const image = await (async () => {
          try {
            return await Headless.render({
              ...state,
              lang: state.lang,
              theme: theme.name,
              ...(options.executable === undefined ? {} : { executable: options.executable }),
              ...(options.scale === undefined ? {} : { scale: options.scale }),
            })
          } catch (cause) {
            return cause instanceof Error ? cause : new Error(String(cause))
          }
        })()
        if (image instanceof Error) return error({ code: 'render_failed', message: image.message })
        const out = options.out ?? destination(args.file)
        await fs.writeFile(out, image)
        return { bytes: image.length, path: out }
      },
    })
    .command('share', {
      alias: { theme: 't' },
      args: source,
      description: 'Build a link that opens the snippet in a browser.',
      // Reads a file and returns a string. An agent may reach for it freely.
      mcp: { annotations: { readOnlyHint: true } },
      examples: [{ args: { file: 'app.ts' }, options: { theme: 'vitesse-light' } }],
      options: settings.extend({
        ...inline.shape,
        base: z.string().optional().describe(`Deployment the link points at. Defaults to ${site}.`),
      }),
      output: z.object({ url: z.string().describe('The link.') }),
      async run({ args, error, options }) {
        const code = await read(args.file, options.code)
        if (code instanceof Error) return error({ code: 'no_snippet', message: code.message })
        const state = frame(args.file, code, options)
        if (!state)
          return error({
            code: 'unknown_language',
            message: `\`${options.lang}\` is not a bundled language.`,
          })
        return { url: `${options.base ?? site}#${Codec.serialize(state)}` }
      },
    })
    .command('themes', {
      description: 'List the bundled themes.',
      mcp: { annotations: { readOnlyHint: true } },
      output: z.array(
        z.object({
          displayName: z.string().describe('Human-readable name.'),
          name: z.string().describe('The name `--theme` accepts.'),
          type: z.union([z.literal('light'), z.literal('dark')]).describe('Which scheme it suits.'),
        }),
      ),
      run() {
        return Theme.list().map((theme) => ({ ...theme }))
      },
    })
}

/**
 * Frame settings for a file, or nothing when the language is not one shiki
 * bundles. Both commands resolve `auto` here so a link and an image made from
 * the same file are tokenized the same way.
 */
function frame(
  file: string | undefined,
  code: string,
  options: z.output<typeof settings>,
): (Codec.State & { lang: BundledLanguage }) | undefined {
  const state = Codec.schema.parse({ ...options, code })
  const lang = language(state.lang, file)
  return lang === undefined ? undefined : { ...state, lang }
}

/** Where an image lands when the caller names no path. */
function destination(file: string | undefined): string {
  if (file === undefined || file === '-') return 'monoshot.png'
  return `${file.slice(0, file.length - path.extname(file).length)}.png`
}

/**
 * The language to tokenize with. `auto` reads the file extension, which is a
 * language name often enough to be worth trying before falling back.
 */
function language(name: string, file: string | undefined): BundledLanguage | undefined {
  if (name !== 'auto') return languages.get(name)
  if (file === undefined) return fallback
  return languages.get(path.extname(file).slice(1)) ?? fallback
}

/**
 * The snippet, or why there is none to draw. Named sources are exclusive:
 * taking one over the other would quietly ignore what the caller passed.
 */
async function read(file: string | undefined, code: string | undefined): Promise<string | Error> {
  if (code !== undefined && file !== undefined)
    return new Error('Name a file or pass `--code`, not both.')
  if (code !== undefined) return code
  if (file === undefined)
    return new Error('Name a file, pass `--code`, or pass `-` to read standard input.')
  try {
    if (file === '-') return await text(process.stdin)
    return await fs.readFile(file, 'utf8')
  } catch (cause) {
    return cause instanceof Error ? cause : new Error(String(cause))
  }
}
