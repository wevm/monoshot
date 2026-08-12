import {
  transformerNotationDiff,
  transformerNotationFocus,
  transformerNotationHighlight,
} from '@shikijs/transformers'
import { createHighlighter } from 'shiki'
import type { TwoslashReturn } from 'twoslash'
import type * as Cdn from './internal/Cdn.js'
import * as Document from './internal/Document.js'
import * as Marks from './internal/Marks.js'
import * as Tags from './internal/Tags.js'
import * as Theme from './Theme.js'
import type {
  BundledLanguage,
  BundledTheme,
  Highlighter,
  RegexEngine,
  ShikiTransformer,
  ThemeRegistrationRaw,
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
export function create<const themes extends Themes = []>(
  options: create.Options<themes> = {},
): create.ReturnType<themes> {
  const { engine, langs = [], themes = [] } = options

  // Retains one TypeScript compiler and its library files per renderer. They
  // load only when a render requires type information.
  let resolver: Promise<Cdn.create.ReturnType> | undefined

  /**
   * The renderer that draws the blocks, over types already resolved or over a
   * compiler asked to resolve them. A resolved run skips the compiler
   * entirely, which is the difference between loading megabytes and not.
   */
  async function annotate(
    types: render.Types | undefined,
    code: string,
  ): Promise<ShikiTransformer> {
    if (types !== undefined) return build(() => types)
    // A rejection must not be cached, or one failed fetch would leave the
    // renderer unable to annotate for the rest of its life.
    const instance = await (resolver ??= import('./internal/Cdn.js')
      .then((module) => module.create())
      .catch((cause: unknown) => {
        resolver = undefined
        throw cause
      }))
    // Awaited before the transformer is built, which compiles synchronously
    // and so cannot fetch anything itself.
    return build(checked(await instance.prepare(code)))
  }

  /**
   * Imported here rather than at the top of the module: the compiler is
   * megabytes, `Frame` loads highlighting resources in a browser, and a
   * static import would put one in every bundle that holds the other.
   *
   * The `core` entrypoint rather than the package root, which imports
   * `twoslash` for the convenience wrapper it exports. Reaching for the root
   * would load the compiler even when a resolved run made it unnecessary.
   */
  async function build(
    twoslasher: Cdn.create.Twoslasher | (() => render.Types),
  ): Promise<ShikiTransformer> {
    const { createTransformerFactory, rendererRich } = await import('@shikijs/twoslash/core')
    return createTransformerFactory(
      // The factory requires a mutable node list, although this path never
      // mutates it. Avoid copying resolved data solely to satisfy that type.
      twoslasher as Parameters<typeof createTransformerFactory>[0],
      rendererRich({ errorRendering: 'line', queryRendering: 'line' }),
    )({
      // Include JavaScript and TypeScript IDs and aliases. The default omits
      // JavaScript, even though the language service resolves its types.
      langs: ['javascript', 'js', 'jsx', 'ts', 'tsx', 'typescript'],
      // Editor input is frequently incomplete, but available type information
      // remains useful when compilation fails.
      throws: false,
    })
  }

  // Kept as a promise so concurrent renders share one creation rather than
  // racing to build a highlighter each.
  let highlighter: Promise<Highlighter> | undefined

  async function resolve(parameters: load.Options<themes>): Promise<Highlighter> {
    const { lang, theme } = parameters
    // Remove rejected promises from the cache so a transient failure does not
    // affect subsequent renders.
    highlighter ??= start().catch((cause: unknown) => {
      highlighter = undefined
      throw cause
    })
    const instance = await highlighter
    await Promise.all([
      // Load themes that are neither already loaded nor composed locally.
      instance.getLoadedThemes().includes(theme)
        ? undefined
        : instance.loadTheme(
            Theme.composed.find((one) => one.name === theme) ?? (theme as BundledTheme),
          ),
      instance.getLoadedLanguages().includes(lang) ? undefined : instance.loadLanguage(lang),
    ])
    return instance
  }

  /**
   * The highlighter, with the engine resolved. `javascript` is imported here
   * rather than taken from the caller: `shiki` is this package's own
   * dependency, and a consumer has no import path to its engine.
   */
  async function start(): Promise<Highlighter> {
    const resolved =
      engine === 'javascript'
        ? (await import('shiki/engine/javascript')).createJavaScriptRegexEngine()
        : engine
    return createHighlighter({
      ...(resolved ? { engine: resolved } : {}),
      langs: [...langs],
      themes: [...themes],
    })
  }

  /**
   * Keeps the compiler off the lines a snippet marks as removed, and draws the
   * snippet as it was written rather than as the compiler saw it.
   */
  function checked(twoslasher: Cdn.create.Twoslasher) {
    return (code: string, lang?: string) => {
      const result = twoslasher(Marks.unchecked(code), lang)
      return { ...result, code: Marks.cut(code, result.meta.removals) }
    }
  }

  // A closure rather than a sibling method: an operation read off a destructured
  // renderer has no receiver to resolve.
  async function highlight(parameters: render.Options<themes>): Promise<render.ReturnType> {
    const { code, lang, theme, twoslash = false } = parameters
    const [instance, annotations] = await Promise.all([
      resolve({ lang, theme }),
      twoslash === false ? undefined : annotate(twoslash === true ? undefined : twoslash, code),
    ])
    // Twoslash formats resolved annotations as TypeScript, independent of the
    // source language, so annotated output requires that grammar.
    if (annotations) {
      const popup = lang === 'jsx' || lang === 'tsx' ? 'tsx' : 'ts'
      if (!instance.getLoadedLanguages().includes(popup)) await instance.loadLanguage(popup)
    }
    const html = instance.codeToHtml(code, {
      lang,
      theme,
      transformers: [
        // Ahead of the numbering, which counts the lines that survive: a tag
        // becomes a row of prose rather than staying one of them. Ahead of the
        // resolved run too, which strips the tags it was told about and leaves
        // the rest: a run resolved elsewhere need not have been told at all.
        Tags.transformer(),
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
        // Presentation the snippet carries itself, the way a `^?` query
        // does: `[!code focus]`, `[!code hl]`, and `[!code ++]` mark lines
        // and are taken back out of what is drawn.
        ...notations,
      ],
    })
    // The styles belong to the markup rather than to a document: a caller
    // embedding `html` has nowhere else to read them from.
    const marked = Document.marked(html)
    const palette = annotations || marked ? Theme.derive(instance.getTheme(theme)) : undefined
    const css = palette
      ? [annotations ? Document.annotations(palette) : '', marked ? Document.marks(palette) : '']
          .filter(Boolean)
          .join('\n')
      : ''
    return {
      html,
      ...(css ? { css } : {}),
      // Detached: the registry entry is shared, so handing it out would let
      // one caller's edit change what later renders produce.
      theme: structuredClone(instance.getTheme(theme)),
    }
  }

  return {
    async dispose() {
      const instance = await highlighter?.catch(() => undefined)
      // Disposal releases the compiler and virtual file system. A later typed
      // render recreates both resources.
      resolver = undefined
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
        tokens: instance.codeToTokensBase(code, { lang, theme: theme as BundledTheme }),
      }
    },
  }
}

/**
 * A bundled theme, a theme composed by this package, or a custom theme passed
 * to {@link create}.
 *
 * Named rather than a plain string, so a misspelled theme is a type error here
 * instead of a rejected load at runtime.
 */
export type Name<themes extends Themes = []> =
  | BundledTheme
  | Theme.Composed
  | Extract<themes[number], { name: string }>['name']

/** What {@link create} accepts as themes to preload. */
type Themes = readonly (BundledTheme | ThemeRegistrationRaw)[]

export declare namespace create {
  type Options<themes extends Themes = []> = {
    /**
     * How the grammars are matched. Defaults to shiki's own, which compiles
     * WebAssembly at runtime and so cannot start where that is disallowed.
     * `javascript` selects shiki's JavaScript engine, which a Cloudflare
     * Worker needs. A shiki engine may be passed directly instead.
     *
     * @example
     * ```ts twoslash
     * import { Frame } from 'monoshot'
     *
     * const frame = Frame.create({ engine: 'javascript' })
     * ```
     */
    engine?: RegexEngine | 'javascript' | undefined
    /** Languages to preload. Anything else loads on first use. */
    langs?: readonly BundledLanguage[] | undefined
    /**
     * Bundled or custom themes to preload. Custom theme names are accepted by
     * this renderer's `render`, `load`, and `tokens` operations.
     */
    themes?: themes | undefined
  }

  type ReturnType<themes extends Themes = []> = {
    /**
     * Releases the highlighter and the grammars it loaded. The renderer stays
     * usable: the next `render` builds a fresh highlighter.
     */
    dispose: () => Promise<void>
    /**
     * Loads a theme and language before the next `render`. The highlighter
     * remains private to the instance.
     */
    load: (options: load.Options<themes>) => Promise<void>
    /**
     * Highlights code and returns the markup a frame renders.
     *
     * Rejects when shiki cannot load the requested theme or language.
     */
    render: (options: render.Options<themes>) => Promise<render.ReturnType>
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
    tokens: (options: tokens.Options<themes>) => Promise<tokens.ReturnType>
  }
}

export declare namespace load {
  type Options<themes extends Themes = []> = {
    /** Language grammar to load. */
    lang: BundledLanguage
    /** Theme to load. */
    theme: Name<themes>
  }
}

export declare namespace tokens {
  /** Tokenizing resolves no types, so a query is left as the comment it is. */
  type Options<themes extends Themes = []> = Omit<render.Options<themes>, 'twoslash'>

  type ReturnType = {
    /** The resolved theme, ready for `Theme.derive`. A copy, safe to mutate. */
    theme: ThemeRegistrationResolved
    /** One array of tokens per line, in source order. */
    tokens: readonly (readonly ThemedToken[])[]
  }
}

export declare namespace toDocument {
  /** What to render, and the frame to render it in. */
  type Options<themes extends Themes = []> = Omit<
    Document.Options,
    'annotated' | 'html' | 'palette'
  > &
    render.Options<themes>

  /** The frame as one standalone HTML document. */
  type ReturnType = string
}

export declare namespace render {
  type Options<themes extends Themes = []> = {
    /** Source to highlight. */
    code: string
    /** Language to tokenize with. */
    lang: BundledLanguage
    /** Theme to color with. */
    theme: Name<themes>
    /**
     * Render resolved types for `^?` queries in document flow.
     *
     * `true` resolves them here, which needs `typescript` and applies to the
     * TypeScript family only. A {@link Types} resolved elsewhere is drawn as
     * given, and loads no compiler. Defaults to `false`.
     */
    twoslash?: boolean | Types | undefined
  }

  /**
   * Twoslash data consumed by the renderer. A build step, worker, or cache can
   * resolve types once and pass this data to a later render.
   */
  type Types = {
    /** The source the run was resolved against. */
    code: string
    /** What the run found in it. */
    nodes: readonly TwoslashReturn['nodes'][number][]
  }

  type ReturnType = {
    /**
     * Styles for query blocks, marked rows, tags, and hover popovers. Absent
     * when the render contains none of those elements.
     */
    css?: string | undefined
    /** Highlighted markup: a `pre.shiki` whose lines carry `data-line`. */
    html: string
    /** The resolved theme, ready for `Theme.derive`. A copy, safe to mutate. */
    theme: ThemeRegistrationResolved
  }
}

/**
 * Shiki transformers for notation markers embedded in source code. They remain
 * enabled because unmarked snippets render unchanged.
 */
const notations = [
  transformerNotationDiff(),
  transformerNotationFocus(),
  transformerNotationHighlight(),
]

/** A hast node's classes, which arrive as a string or as a list. */
function classes(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.map(String)
  return typeof value === 'string' ? value.split(/\s+/) : []
}
