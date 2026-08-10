import { createHighlighter } from 'shiki'
import type { TwoslashReturn } from 'twoslash'
import * as Document from './internal/Document.js'
import * as Theme from './Theme.js'
import type {
  BundledLanguage,
  BundledTheme,
  Highlighter,
  ShikiTransformer,
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

  // Holds a TypeScript compiler, so it is built once for the renderer rather
  // than per render, and only when a render actually asks for types.
  let annotator: Promise<ShikiTransformer> | undefined

  /**
   * The renderer that draws the blocks, over types already resolved or over a
   * compiler asked to resolve them. A resolved run skips the compiler
   * entirely, which is the difference between loading megabytes and not.
   */
  function annotate(types: render.Types | undefined): Promise<ShikiTransformer> {
    if (types !== undefined) return build(() => types)
    // A rejection must not be cached, or one failed chunk load would leave the
    // renderer unable to annotate for the rest of its life.
    return (annotator ??= build().catch((cause: unknown) => {
      annotator = undefined
      throw cause
    }))
  }

  /**
   * Imported here rather than at the top of the module: the compiler is
   * megabytes, `Frame` is what a browser reaches for to highlight, and a
   * static import would put one in every bundle that holds the other.
   */
  async function build(resolved?: () => render.Types): Promise<ShikiTransformer> {
    const { rendererRich, transformerTwoslash } = await import('@shikijs/twoslash')
    return transformerTwoslash({
      // A snippet in an editor is half-typed most of the time, and code that
      // does not compile still has types worth drawing.
      throws: false,
      renderer: rendererRich({ errorRendering: 'line', queryRendering: 'line' }),
      twoslasher: resolved ?? (await compiler()),
    })
  }

  /** The compiler, loaded only when nothing was resolved ahead of the render. */
  async function compiler() {
    const { createTwoslasher } = await import('twoslash')
    return createTwoslasher({
      // Twoslash otherwise insists every compiler error be declared in the
      // source and gives up on the whole snippet when one is not.
      handbookOptions: { noErrorValidation: true },
    })
  }

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
    const { code, lang, theme, twoslash = false } = parameters
    const [instance, annotations] = await Promise.all([
      resolve({ lang, theme }),
      twoslash === false ? undefined : annotate(twoslash === true ? undefined : twoslash),
    ])
    return {
      html: instance.codeToHtml(code, {
        lang,
        theme,
        transformers: [
          {
            // Numbered here rather than in `line`, which runs before twoslash
            // folds a query into a block and inserts its own lines: only what
            // survives into the code element is a line of code.
            code(node) {
              let number = 0
              for (const child of node.children) {
                if (child.type !== 'element') continue
                if (!classes(child.properties['class']).includes('line')) continue
                child.properties['data-line'] = ++number
              }
            },
          },
          ...(annotations ? [annotations] : []),
        ],
      }),
      ...(annotations ? { css: Document.annotations(Theme.derive(instance.getTheme(theme))) } : {}),
      // Detached: the registry entry is shared, so handing it out would let
      // one caller's edit change what later renders produce.
      theme: structuredClone(instance.getTheme(theme)),
    }
  }

  return {
    async dispose() {
      const instance = await highlighter?.catch(() => undefined)
      // The compiler and its virtual file system go with it: a renderer kept
      // after disposal rebuilds both on the next render that wants them.
      annotator = undefined
      highlighter = undefined
      instance?.dispose()
    },
    async load(parameters) {
      await resolve(parameters)
    },
    render: highlight,
    async toDocument(parameters) {
      const { code, lang, theme, twoslash = false, ...rest } = parameters
      const result = await highlight({ code, lang, theme, twoslash })
      return Document.build({
        ...rest,
        // Whichever resolved the types, the markup needs the styles.
        annotated: twoslash !== false,
        html: result.html,
        palette: Theme.derive(result.theme),
      })
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
  /** Tokenizing resolves no types, so a query is left as the comment it is. */
  type Options = Omit<render.Options, 'twoslash'>

  type ReturnType = {
    /** The resolved theme, ready for `Theme.derive`. A copy, safe to mutate. */
    theme: ThemeRegistrationResolved
    /** One array of tokens per line, in source order. */
    tokens: readonly (readonly ThemedToken[])[]
  }
}

export declare namespace toDocument {
  /** What to render, and the frame to render it in. */
  type Options = Omit<Document.Options, 'annotated' | 'html' | 'palette'> & render.Options

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
    /**
     * Draw the types a `^?` query asks for, in flow.
     *
     * `true` resolves them here, which needs `typescript` and applies to the
     * TypeScript family only. A {@link Types} resolved elsewhere is drawn as
     * given, and loads no compiler. Defaults to `false`.
     */
    twoslash?: boolean | Types | undefined
  }

  /**
   * A twoslash run, as the renderer reads it. Plain data, so a build step, a
   * worker, or a cache can resolve types once and hand them over later.
   */
  type Types = Pick<TwoslashReturn, 'code' | 'nodes'>

  type ReturnType = {
    /**
     * Styles the annotated markup needs, which draw the query blocks and keep
     * the hover popovers out of flow. Absent unless `twoslash` was asked for.
     */
    css?: string | undefined
    /** Highlighted markup: a `pre.shiki` whose lines carry `data-line`. */
    html: string
    /** The resolved theme, ready for `Theme.derive`. A copy, safe to mutate. */
    theme: ThemeRegistrationResolved
  }
}

/** A hast node's classes, which arrive as a string or as a list. */
function classes(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.map(String)
  return typeof value === 'string' ? value.split(/\s+/) : []
}
