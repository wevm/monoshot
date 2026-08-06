import { createHighlighter } from 'shiki'
import type { BundledLanguage, BundledTheme, Highlighter } from 'shiki'

/**
 * Highlights code and returns the markup a frame renders, along with the
 * palette derived from the theme.
 *
 * @example
 * ```ts twoslash
 * import { Frame } from 'monoshot'
 *
 * const frame = await Frame.render({ code: 'const a = 1', lang: 'ts', theme: 'vitesse-dark' })
 * frame.html
 * // ^?
 * ```
 */
export async function render(options: render.Options): Promise<render.ReturnType> {
  const { code, lang, theme } = options
  const highlighter = await load({ lang, theme })
  return {
    html: highlighter.codeToHtml(code, {
      lang,
      theme,
      transformers: [
        {
          line(node, line) {
            node.properties['data-line'] = line
          },
        },
      ],
    }),
    theme: highlighter.getTheme(theme),
  }
}

export declare namespace render {
  type Options = {
    code: string
    lang: BundledLanguage
    theme: BundledTheme
  }

  type ReturnType = {
    /** Highlighted markup: a `pre.shiki` whose lines carry `data-line`. */
    html: string
    /** The resolved theme, ready for `Theme.derive`. */
    theme: ReturnType_Theme
  }
}

type ReturnType_Theme = Awaited<ReturnType<Highlighter['getTheme']>>

/**
 * Resolves the shared highlighter, loading the theme and language on first use.
 *
 * One highlighter is reused for the process: creation is expensive, and
 * highlighting is synchronous once the resources are registered.
 */
export async function load(options: load.Options): Promise<Highlighter> {
  const { lang, theme } = options
  highlighter ??= createHighlighter({ langs: [], themes: [] })
  const instance = await highlighter
  await Promise.all([
    instance.getLoadedThemes().includes(theme) ? undefined : instance.loadTheme(theme),
    instance.getLoadedLanguages().includes(lang) ? undefined : instance.loadLanguage(lang),
  ])
  return instance
}

export declare namespace load {
  type Options = {
    lang: BundledLanguage
    theme: BundledTheme
  }
}

let highlighter: Promise<Highlighter> | undefined
