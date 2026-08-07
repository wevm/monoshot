import { createHighlighter } from 'shiki'
import * as Document from './internal/Document.js'
import * as Theme from './Theme.js'
import type {
  BundledLanguage,
  BundledTheme,
  Highlighter,
  ThemeRegistrationResolved,
  ThemedToken,
} from 'shiki'

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

  async function resolve(parameters: load.Options): Promise<Highlighter> {
    const { lang, theme } = parameters
    // A rejected promise must not be cached, or one transient failure would
    // poison every later render on this renderer.
    highlighter ??= createHighlighter({ langs: [...langs], themes: [...themes] }).catch(
      (cause: unknown) => {
        highlighter = undefined
        throw cause
      },
    )
    const instance = await highlighter
    await Promise.all([
      instance.getLoadedThemes().includes(theme) ? undefined : instance.loadTheme(theme),
      instance.getLoadedLanguages().includes(lang) ? undefined : instance.loadLanguage(lang),
    ])
    return instance
  }

  // A closure rather than a sibling method: an operation read off a destructured
  // renderer has no receiver to resolve.
  async function highlight(parameters: render.Options): Promise<render.ReturnType> {
    const { code, lang, theme } = parameters
    const instance = await resolve({ lang, theme })
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
      // Detached: the registry entry is shared, so handing it out would let
      // one caller's edit change what later renders produce.
      theme: structuredClone(instance.getTheme(theme)),
    }
  }

  return {
    async dispose() {
      const instance = await highlighter?.catch(() => undefined)
      highlighter = undefined
      instance?.dispose()
    },
    async load(parameters) {
      await resolve(parameters)
    },
    render: highlight,
    async toDocument(parameters) {
      const { code, lang, theme, ...rest } = parameters
      const result = await highlight({ code, lang, theme })
      return Document.build({ ...rest, html: result.html, palette: Theme.derive(result.theme) })
    },
    async tokens(parameters) {
      const { code, lang, theme } = parameters
      const instance = await resolve({ lang, theme })
      return {
        theme: structuredClone(instance.getTheme(theme)),
        tokens: instance.codeToTokensBase(code, { lang, theme }),
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
    /**
     * Releases the highlighter and the grammars it loaded. The renderer stays
     * usable: the next `render` builds a fresh highlighter.
     */
    dispose: () => Promise<void>
    /**
     * Loads a theme and language ahead of time so the next `render` is
     * immediate. The highlighter itself stays private to the instance.
     */
    load: (options: load.Options) => Promise<void>
    /**
     * Highlights code and returns the markup a frame renders.
     *
     * Rejects when shiki cannot load the requested theme or language.
     */
    render: (options: render.Options) => Promise<render.ReturnType>
    /**
     * Renders a frame as a standalone document: chrome, backdrop, and code in
     * one HTML string with no scripts and no external requests.
     *
     * This is what every headless surface screenshots, so a CLI and a hosted
     * API produce the same image from the same state.
     *
     * Rejects when shiki cannot load the requested theme or language, and when
     * `background` or a font field carries CSS that would leave the stylesheet
     * or fetch a resource.
     */
    toDocument: (options: toDocument.Options) => Promise<toDocument.ReturnType>
    /**
     * Tokenizes code without rendering it, for a surface that draws its own
     * text. An editor colors its own document from these.
     */
    tokens: (options: tokens.Options) => Promise<tokens.ReturnType>
  }
}

export declare namespace load {
  type Options = {
    /** Language grammar to load. */
    lang: BundledLanguage
    /** Theme to load. */
    theme: BundledTheme
  }
}

export declare namespace tokens {
  type Options = render.Options

  type ReturnType = {
    /** The resolved theme, ready for `Theme.derive`. A copy, safe to mutate. */
    theme: ThemeRegistrationResolved
    /** One array of tokens per line, in source order. */
    tokens: readonly (readonly ThemedToken[])[]
  }
}

export declare namespace toDocument {
  /** What to render, and the frame to render it in. */
  type Options = Omit<Document.Options, 'html' | 'palette'> & render.Options

  /** The frame as one standalone HTML document. */
  type ReturnType = string
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
    /** The resolved theme, ready for `Theme.derive`. A copy, safe to mutate. */
    theme: ThemeRegistrationResolved
  }
}
