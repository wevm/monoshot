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
import * as Terminal from './internal/Terminal.js'
import * as Theme from './Theme.js'
import { version } from './version.js'

/** Default deployment for generated share links. */
const site = 'https://monoshot.dev'

/**
 * Default language when neither an option nor a file extension specifies one.
 * Uses Shiki's canonical ID rather than the `ts` alias, so every language is
 * recorded under one name.
 */
const fallback = 'typescript' satisfies BundledLanguage

/**
 * Every bundled language against the names shiki accepts for it, including
 * aliases such as `py`, which is also what a file extension looks like.
 *
 * `bundledLanguagesInfo` types `id` as a plain string; the membership test in
 * `Cli.test.ts` verifies this narrowing.
 */
const languages = new Map<string, BundledLanguage>(
  bundledLanguagesInfo.flatMap((info) =>
    [info.id, ...(info.aliases ?? [])].map((name) => [name, info.id as BundledLanguage] as const),
  ),
)

/**
 * Frame settings shared by image and link commands. Each setting is optional;
 * {@link Codec.schema} defines the defaults.
 */
const settings = z.object({
  background: z
    .string()
    .optional()
    .describe('Frame background: `default`, `none`, or a `#rrggbb` color.'),
  lang: z
    .string()
    .optional()
    .describe('Syntax language. Defaults to the language inferred from the file extension.'),
  padding: z.number().optional().describe('Space around the window, in pixels.'),
  radius: z.number().optional().describe('Window corner radius, in pixels.'),
  theme: z.string().optional().describe('Theme name from `monoshot themes`.'),
  title: z.string().optional().describe('Window title.'),
  titleBar: z.boolean().optional().describe('Render the title bar.'),
  width: z.number().optional().describe('Width of the window, in pixels.'),
})

/** Canonical Shiki language IDs that support Twoslash type resolution. */
const typed: ReadonlySet<string> = new Set(['javascript', 'jsx', 'tsx', 'typescript'])

/** File-based snippet input. */
const source = z.object({
  file: z.string().optional().describe('Source file path, or `-` for standard input.'),
})

/** Inline snippet input. */
const inline = z.object({
  code: z.string().optional().describe('Inline source code instead of a file.'),
})

/** Options shared by commands that generate links. */
const linked = settings.extend({
  base: z.string().optional().describe(`Base URL for the generated link. Defaults to ${site}.`),
  code: z.string().optional().describe('Inline source code instead of a file.'),
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
    description:
      'Create code images with syntax highlighting, customizable themes, and type-aware annotations.',
    mcp: {
      instructions:
        'Turn code into PNG or SVG images, or shareable links. Supports syntax highlighting, themes, and type annotations for JavaScript and TypeScript. Use `themes` to list available themes.',
      // Four commands do not need a discovery gateway. Direct exposure also
      // keeps `mcp doctor` identical to what MCP clients list.
      tools: { discovery: 'direct' },
    },
    version,
  })
    .command('render', {
      alias: { code: 'c', out: 'o', scale: 's', theme: 't' },
      args: source,
      description: 'Render a snippet to an image.',
      examples: [
        { args: { file: 'app.ts' }, options: { out: 'app.png' } },
        { args: { file: 'app.ts' }, description: 'Render as SVG.', options: { type: 'svg' } },
        {
          args: { file: 'app.ts' },
          description: 'Display an inline terminal preview.',
          options: { preview: true },
        },
        { description: 'Render inline source code.', options: { code: 'const a = 1' } },
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
        executable: z.string().optional().describe('Path to a Chrome or Chromium executable.'),
        embed: z
          .boolean()
          .optional()
          .describe(
            'Include the image as a data URL for clients without access to the output path.',
          ),
        type: z
          .enum(['png', 'svg'])
          .optional()
          .describe('Image format. Inferred from the `--out` extension, and `png` otherwise.'),
        out: z
          .string()
          .optional()
          .describe('Image output path. Defaults to a file beside the source.'),
        preview: z.boolean().optional().describe('Display the rendered image in the terminal.'),
        scale: z
          .number()
          .positive()
          .finite()
          .optional()
          .describe('Frame scale multiplier. Defaults to 3.'),
        twoslash: z
          .boolean()
          .optional()
          .describe(
            'Render resolved types for `^?` queries. Enabled by default for JavaScript and TypeScript.',
          ),
      }),
      output: z.object({
        bytes: z.number().describe('Size of the image written.'),
        dataUrl: z.string().optional().describe('The image as a data URL when `--embed` is set.'),
        path: z.string().describe('Where the image was written.'),
      }),
      async run({ args, error, formatExplicit, ok, options }) {
        const code = await read(args.file, options.code)
        if (code instanceof Error) return error({ code: 'no_snippet', message: code.message })
        const resolved = frame(args.file, code, options)
        if ('message' in resolved) return error(resolved)
        // Reject an explicit format that conflicts with the output extension.
        const named_out = named(options.out)
        if (options.type && named_out && options.type !== named_out)
          return error({
            code: 'type_conflict',
            message: `\`--type ${options.type}\` conflicts with an \`--out\` ending \`.${named_out}\`.`,
          })
        const type = options.type ?? named_out ?? 'png'
        const out = options.out ?? destination(args.file, type)
        // Reading a file and then writing the image over it would leave the
        // caller with neither.
        if (args.file !== undefined && path.resolve(out) === path.resolve(args.file))
          return error({
            code: 'output_collision',
            message:
              'The image output would overwrite the source file. Specify a different path with `--out`.',
          })
        // `error` returns its result rather than throwing, so a failed render
        // has to come back as a value the handler can return through.
        const rendered = await (async () => {
          const renderer = Headless.create({
            ...(options.browserArg === undefined ? {} : { args: options.browserArg }),
            ...(options.executable === undefined ? {} : { executable: options.executable }),
          })
          try {
            const picture = await themedPicture(resolved.state)
            const parameters = {
              ...resolved.state,
              ...(picture === undefined ? {} : { picture }),
              twoslash: options.twoslash ?? typed.has(resolved.state.lang),
              ...(options.scale === undefined ? {} : { scale: options.scale }),
            }
            const image = await renderer.render({ ...parameters, type })
            const preview =
              options.preview === true && !formatExplicit
                ? type === 'png'
                  ? image
                  : await renderer.render({ ...parameters, type: 'png' }).catch(() => undefined)
                : undefined
            return { image, preview }
          } catch (cause) {
            return cause instanceof Error ? cause : new Error(String(cause))
          } finally {
            await renderer.dispose()
          }
        })()
        if (rendered instanceof Error)
          return error({ code: 'render_failed', message: rendered.message })
        await fs.writeFile(out, rendered.image)
        if (rendered.preview) await Terminal.preview(rendered.preview)
        return ok(
          {
            bytes: rendered.image.length,
            ...(options.embed
              ? {
                  dataUrl: `data:image/${type === 'svg' ? 'svg+xml' : 'png'};base64,${Buffer.from(rendered.image).toString('base64')}`,
                }
              : {}),
            path: out,
          },
          {
            cta: {
              commands: [
                {
                  command: shareCommand(args.file, options),
                  description: 'Create a matching editor link.',
                },
              ],
              description: 'Next, create an editor link:',
            },
          },
        )
      },
    })
    .command('share', {
      alias: { code: 'c', theme: 't' },
      args: source,
      description: 'Build a link that opens the snippet in a browser.',
      // The command reads a file and returns a string without modifying state.
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
          type: z.union([z.literal('light'), z.literal('dark')]).describe('Theme color scheme.'),
        }),
      ),
      run() {
        return Theme.list().map((theme) => ({ ...theme }))
      },
    })
}

/** Builds a copy-ready POSIX command for a matching editor link. */
function shareCommand(
  file: string | undefined,
  options: z.output<typeof settings> & z.output<typeof inline>,
) {
  const command = ['share']
  if (options.titleBar) command.push('--title-bar')
  if (file !== undefined) command.push(shellQuote(file))
  for (const [name, value] of Object.entries({
    background: options.background,
    code: file === undefined ? options.code : undefined,
    lang: options.lang,
    padding: options.padding,
    radius: options.radius,
    theme: options.theme,
    title: options.title,
    width: options.width,
  })) {
    if (value === undefined) continue
    command.push(`--${name}`, shellQuote(String(value)))
  }
  return command.join(' ')
}

/** Quotes one shell token without allowing interpolation or command substitution. */
function shellQuote(value: string) {
  if (/^[\w%+./:=,@-]+$/.test(value)) return value
  return `'${value.replaceAll("'", `'\\''`)}'`
}

/** Command failure returned through the CLI error handler. */
type Failure = { code: string; message: string }

/**
 * Resolves frame settings for a snippet. Every command uses this function so
 * links and images apply the same validation and defaults.
 */
function frame(
  file: string | undefined,
  code: string,
  options: z.output<typeof settings>,
): { state: Codec.State & { lang: BundledLanguage; theme: Frame.Name } } | Failure {
  const state = Codec.schema.parse({ ...options, code })
  // Read from the flag rather than the state, which already fell back to a
  // valid theme. Report the specific theme error before generic validation so
  // the message can direct the caller to the available names.
  if (options.theme !== undefined && Theme.info(options.theme) === undefined)
    return {
      code: 'unknown_theme',
      message: `Unknown theme \`${options.theme}\`. Run \`monoshot themes\` to list the available themes.`,
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
  return {
    state: {
      ...state,
      lang,
      // Tempo's artwork is rectangular. Keep an explicitly selected radius.
      radius: options.radius === undefined && state.theme === 'tempo' ? 0 : state.radius,
    },
  }
}

/** Returns the artwork a composed theme owns when its default backdrop is selected. */
async function themedPicture(state: Codec.State): Promise<string | undefined> {
  if (state.background !== 'default' || !Theme.composed.some((theme) => theme.name === state.theme))
    return undefined
  const bytes = await fs.readFile(
    new URL(`../app/public/wallpapers/${state.theme}.webp`, import.meta.url),
  )
  return `data:image/webp;base64,${bytes.toString('base64')}`
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
 * Builds a snippet link or returns a validation failure. Failures are data so
 * each command can report them through its own handler.
 */
async function link(
  file: string | undefined,
  options: z.output<typeof linked>,
): Promise<{ url: string } | Failure> {
  const code = await read(file, options.code)
  if (code instanceof Error) return { code: 'no_snippet', message: code.message }
  // An empty fragment opens the application sample instead of the requested
  // content, so empty snippets are rejected.
  if (code.trim() === '') return { code: 'empty_snippet', message: 'The snippet is empty.' }
  const resolved = frame(file, code, options)
  if ('message' in resolved) return resolved
  const fragment = Codec.serialize(resolved.state)
  // The decoder drops a fragment it considers oversized and restores defaults,
  // so reject links that cannot preserve the source through a round trip.
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
 * Opens a link with the platform URL handler. The detached process may outlive
 * the CLI process, and launch errors do not affect the returned URL.
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

/** Resolves the default image output path. */
function destination(file: string | undefined, type: 'png' | 'svg'): string {
  if (file === undefined || file === '-') return `monoshot.${type}`
  return `${file.slice(0, file.length - path.extname(file).length)}.${type}`
}

/** Returns the image format identified by a supported file extension. */
function named(out: string | undefined): 'png' | 'svg' | undefined {
  const extension = out === undefined ? '' : path.extname(out).slice(1).toLowerCase()
  return extension === 'png' || extension === 'svg' ? extension : undefined
}

/**
 * Resolves the syntax language. `auto` uses a recognized file extension or the
 * default language.
 */
function language(name: string, file: string | undefined): BundledLanguage | undefined {
  if (name !== 'auto') return languages.get(name)
  if (file === undefined) return fallback
  return languages.get(path.extname(file).slice(1).toLowerCase()) ?? fallback
}

/**
 * Reads source code from one input. File and inline inputs are mutually
 * exclusive to prevent either value from being ignored.
 */
async function read(file: string | undefined, code: string | undefined): Promise<string | Error> {
  if (code !== undefined && file !== undefined)
    return new Error('Specify either a file or `--code`, but not both.')
  if (code !== undefined) return code
  if (file === undefined)
    return new Error('Specify a file, use `--code`, or pass `-` to read standard input.')
  try {
    if (file === '-') {
      // Serving MCP, standard input carries the protocol, and reading it here
      // would take bytes the transport is waiting for.
      if (process.argv.includes('--mcp'))
        return new Error(
          'Standard input is reserved for the MCP transport. Use `--code` or specify a file.',
        )
      return await text(process.stdin)
    }
    return await fs.readFile(file, 'utf8')
  } catch (cause) {
    return cause instanceof Error ? cause : new Error(String(cause))
  }
}
