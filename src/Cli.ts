import { spawn } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { text } from 'node:stream/consumers'
import { Cli } from 'incur'
import type { BundledLanguage } from 'shiki'
import { bundledLanguagesInfo } from 'shiki'
import * as z from 'zod'

import * as Codec from './Codec.js'
import type * as Frame from './Frame.js'
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
  padding: z.number().optional().describe('Space around the window, in pixels.'),
  radius: z.number().optional().describe("The window's corner radius, in pixels."),
  theme: z.string().optional().describe('A theme name, as `monoshot themes` lists them.'),
  title: z.string().optional().describe("The window's title."),
  titleBar: z.boolean().optional().describe('Draw the title bar.'),
  width: z.number().optional().describe('Width of the window, in pixels.'),
})

/** The languages twoslash resolves types for. Shiki's own ids, as resolved. */
const typed: ReadonlySet<string> = new Set(['javascript', 'jsx', 'tsx', 'typescript'])

/** Where a snippet comes from, when it does not arrive as `--code`. */
const source = z.object({
  file: z.string().optional().describe('Path to a source file, or `-` to read standard input.'),
})

/** The snippet itself, for a caller holding the code rather than a path. */
const inline = z.object({
  code: z.string().optional().describe('The snippet itself, in place of a file.'),
})

/** What both link commands take, which is the frame plus where it opens. */
const linked = settings.extend({
  base: z.string().optional().describe(`Deployment the link points at. Defaults to ${site}.`),
  code: z.string().optional().describe('The snippet itself, in place of a file.'),
})

/**
 * Builds the command surface: `render` to an image, `share` and `open` to a
 * link, and `themes` for the names the rest accept.
 *
 * Returns the CLI rather than serving it, so `serve` belongs to the bin and a
 * test can drive the same definition through `fetch`.
 */
export function create() {
  return Cli.create('monoshot', {
    description: 'Render code to images, with the types a `^?` query asks for.',
    mcp: {
      instructions:
        'Renders a source file or an inline snippet to a PNG, to a link, or straight into a browser. A `^?` query in TypeScript is drawn as the type it resolves to. `themes` lists the names `--theme` accepts.',
    },
    version,
  })
    .command('render', {
      alias: { code: 'c', out: 'o', scale: 's', theme: 't' },
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
        browserArg: z
          .array(z.string())
          .optional()
          .describe('Extra flag for the browser, such as `--no-sandbox`. Repeatable.'),
        executable: z.string().optional().describe('Path to a Chrome to render in.'),
        out: z
          .string()
          .optional()
          .describe('Where to write the image. Beside the source by default.'),
        scale: z
          .number()
          .positive()
          .finite()
          .optional()
          .describe('Multiplier on the frame’s own size. Defaults to 2.'),
        twoslash: z
          .boolean()
          .optional()
          .describe('Draw the types a `^?` query asks for. On for the TypeScript family.'),
      }),
      output: z.object({
        bytes: z.number().describe('Size of the image written.'),
        path: z.string().describe('Where the image was written.'),
      }),
      async run({ args, error, options }) {
        const code = await read(args.file, options.code)
        if (code instanceof Error) return error({ code: 'no_snippet', message: code.message })
        const resolved = frame(args.file, code, options)
        if ('message' in resolved) return error(resolved)
        const out = options.out ?? destination(args.file)
        // Reading a file and then writing the image over it would leave the
        // caller with neither.
        if (args.file !== undefined && path.resolve(out) === path.resolve(args.file))
          return error({
            code: 'output_collision',
            message: 'The image would overwrite the snippet it was made from. Name an `--out`.',
          })
        // `error` returns its result rather than throwing, so a failed render
        // has to come back as a value the handler can return through.
        const image = await (async () => {
          try {
            return await Headless.render({
              ...resolved.state,
              twoslash: options.twoslash ?? typed.has(resolved.state.lang),
              ...(options.browserArg === undefined ? {} : { args: options.browserArg }),
              ...(options.executable === undefined ? {} : { executable: options.executable }),
              ...(options.scale === undefined ? {} : { scale: options.scale }),
            })
          } catch (cause) {
            return cause instanceof Error ? cause : new Error(String(cause))
          }
        })()
        if (image instanceof Error) return error({ code: 'render_failed', message: image.message })
        await fs.writeFile(out, image)
        return { bytes: image.length, path: out }
      },
    })
    .command('share', {
      alias: { code: 'c', theme: 't' },
      args: source,
      description: 'Build a link that opens the snippet in a browser.',
      // Reads a file and returns a string. An agent may reach for it freely.
      mcp: { annotations: { readOnlyHint: true } },
      examples: [{ args: { file: 'app.ts' }, options: { theme: 'vitesse-light' } }],
      options: linked,
      output: z.object({ url: z.string().describe('The link.') }),
      async run({ args, error, options }) {
        const result = await link(args.file, options)
        if ('message' in result) return error(result)
        return { url: result.url }
      },
    })
    .command('open', {
      alias: { code: 'c', theme: 't' },
      args: source,
      description: 'Open the snippet in a browser.',
      examples: [{ args: { file: 'app.ts' } }],
      options: linked,
      output: z.object({ url: z.string().describe('The link that was opened.') }),
      async run({ args, error, options }) {
        const result = await link(args.file, options)
        if ('message' in result) return error(result)
        launch(result.url)
        return { url: result.url }
      },
    })
    .command('themes', {
      description: 'List every theme.',
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

/** What stopped a command, in the shape `error` takes. */
type Failure = { code: string; message: string }

/**
 * Frame settings for a snippet, or what stopped them from resolving. Every
 * command resolves here, so a link and an image made from the same file are
 * described the same way.
 */
function frame(
  file: string | undefined,
  code: string,
  options: z.output<typeof settings>,
): { state: Codec.State & { lang: BundledLanguage; theme: Frame.Name } } | Failure {
  const state = Codec.schema.parse({ ...options, code })
  // Read from the flag rather than the state, which already fell back to a
  // theme that exists: named before the generic complaint below, a theme has
  // somewhere to look the accepted names up.
  if (options.theme !== undefined && Theme.info(options.theme) === undefined)
    return {
      code: 'unknown_theme',
      message: `\`${options.theme}\` is not offered. \`monoshot themes\` lists every name.`,
    }
  // The codec falls back rather than failing, which a half-edited URL needs
  // and a command does not: a flag that was replaced was never understood.
  const replaced = ignored(options, state)
  if (replaced.length > 0)
    return {
      code: 'invalid_settings',
      message: `${replaced.map((flag) => `\`--${flag}\``).join(', ')} ${replaced.length === 1 ? 'is not a value' : 'are not values'} the frame accepts.`,
    }
  const lang = language(state.lang, file)
  if (lang === undefined)
    return { code: 'unknown_language', message: `\`${state.lang}\` is not a bundled language.` }
  return { state: { ...state, lang } }
}

/**
 * The flags the codec replaced with its own defaults, named as they were
 * typed. `lang` is left out: resolving an alias to shiki's own id is a
 * substitution the command makes on purpose.
 */
function ignored(options: z.output<typeof settings>, state: Codec.State): readonly string[] {
  const asked = options as Record<string, unknown>
  const kept = state as unknown as Record<string, unknown>
  return Object.keys(state)
    .filter((key) => key !== 'code' && key !== 'lang')
    .filter((key) => asked[key] !== undefined && asked[key] !== kept[key])
    .map((key) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`))
}

/**
 * The link for a snippet, or what stopped it from being built. Failures come
 * back as data rather than thrown, so each command reports them through its
 * own handler.
 */
async function link(
  file: string | undefined,
  options: z.output<typeof linked>,
): Promise<{ url: string } | Failure> {
  const code = await read(file, options.code)
  if (code instanceof Error) return { code: 'no_snippet', message: code.message }
  // A link carrying nothing opens the app's own sample, which is not what the
  // caller asked to share.
  if (code.trim() === '') return { code: 'empty_snippet', message: 'The snippet is empty.' }
  const resolved = frame(file, code, options)
  if ('message' in resolved) return resolved
  const fragment = Codec.serialize(resolved.state)
  // The decoder drops a fragment it considers oversized and restores defaults,
  // so a link that does not survive a round trip is not worth handing over.
  if (Codec.deserialize(fragment).code !== resolved.state.code)
    return {
      code: 'snippet_too_large',
      message: 'The snippet is too large to carry in a link. Render it to an image instead.',
    }
  const base = (() => {
    try {
      return new URL(options.base ?? site)
    } catch {
      return undefined
    }
  })()
  if (base === undefined)
    return { code: 'invalid_base', message: `\`${options.base}\` is not a URL.` }
  // Assigned rather than appended: a base carrying its own fragment would
  // otherwise leave two, and a browser reads everything after the first as one.
  base.hash = fragment
  return { url: base.toString() }
}

/**
 * Hands a link to whatever the platform opens links with. Detached and
 * unwatched: the command has the URL to report either way, and the browser
 * outlives the process that asked for it.
 */
function launch(url: string): void {
  const [command, args]: [string, readonly string[]] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]]
  const child = spawn(command, [...args], { detached: true, stdio: 'ignore' })
  child.on('error', () => {})
  child.unref()
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
  return languages.get(path.extname(file).slice(1).toLowerCase()) ?? fallback
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
    if (file === '-') {
      // Serving MCP, standard input carries the protocol, and reading it here
      // would take bytes the transport is waiting for.
      if (process.argv.includes('--mcp'))
        return new Error('Standard input is the MCP transport. Pass `--code` or name a file.')
      return await text(process.stdin)
    }
    return await fs.readFile(file, 'utf8')
  } catch (cause) {
    return cause instanceof Error ? cause : new Error(String(cause))
  }
}
