import { createHighlighter } from 'shiki'
import type { BundledLanguage, BundledTheme, Highlighter, ThemeRegistrationResolved } from 'shiki'

/**
 * Creates a renderer that owns a highlighter for its lifetime.
 *
 * Construct one per lifecycle that should share loaded themes and languages:
 * a browser tab, a CLI run, a request pipeline.
 *
 * @example
 * ```ts twoslash
 * import { Frame } from 'monoshot'
 *
 * const frame = Frame.create()
 * const result = await frame.render({ code: 'const a = 1', lang: 'ts', theme: 'vitesse-dark' })
 * result.html
 * // ^?
 * ```
 */
export function create(options: create.Options = {}): create.ReturnType {
  const { langs = [], themes = [] } = options

  // Kept as a promise so concurrent renders share one creation rather than
  // racing to build a highlighter each.
  let highlighter: Promise<Highlighter> | undefined

  async function load(parameters: load.Options): Promise<Highlighter> {
    const { lang, theme } = parameters
    highlighter ??= createHighlighter({ langs: [...langs], themes: [...themes] })
    const instance = await highlighter
    await Promise.all([
      instance.getLoadedThemes().includes(theme) ? undefined : instance.loadTheme(theme),
      instance.getLoadedLanguages().includes(lang) ? undefined : instance.loadLanguage(lang),
    ])
    return instance
  }

  return {
    load,
    async render(parameters) {
      const { code, lang, theme } = parameters
      const instance = await load({ lang, theme })
      return {
        html: instance.codeToHtml(code, {
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
        theme: instance.getTheme(theme),
      }
    },
  }
}

export declare namespace create {
  type Options = {
    /** Languages to preload. Anything else loads on first use. */
    langs?: readonly BundledLanguage[] | undefined
    /** Themes to preload. Anything else loads on first use. */
    themes?: readonly BundledTheme[] | undefined
  }

  type ReturnType = {
    /** Resolves the highlighter, loading the theme and language on first use. */
    load: (options: load.Options) => Promise<Highlighter>
    /**
     * Highlights code and returns the markup a frame renders.
     *
     * Rejects when shiki cannot load the requested theme or language.
     */
    render: (options: render.Options) => Promise<render.ReturnType>
  }
}

export declare namespace load {
  type Options = {
    lang: BundledLanguage
    theme: BundledTheme
  }
}

export declare namespace render {
  type Options = {
    /** Source to highlight. */
    code: string
    /** Language to tokenize with. */
    lang: BundledLanguage
    /** Theme to color with. */
    theme: BundledTheme
  }

  type ReturnType = {
    /** Highlighted markup: a `pre.shiki` whose lines carry `data-line`. */
    html: string
    /** The resolved theme, ready for `Theme.derive`. */
    theme: ThemeRegistrationResolved
  }
}
