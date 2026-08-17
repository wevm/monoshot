import * as stylex from '@stylexjs/stylex'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Codec, Frame as Core, Theme } from 'monoshot'
import { AnimatePresence, MotionConfig, motion as m } from 'motion/react'
import type { BundledLanguage } from 'shiki'
import { flushSync } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { detect, languages, preferred } from '#/lib/detect.js'
import type { LanguageId } from '#/lib/detect.js'
import * as Backgrounds from '#/lib/backgrounds.js'
import { bare } from '#/lib/editor/notations.js'
import * as Export from '#/lib/export.js'
import * as Links from '#/lib/links.js'
import * as Opening from '#/lib/opening.js'
import * as Twoslash from '#/lib/twoslash/client.js'
import { without } from '#/lib/twoslash/protocol.js'
import type { Run } from '#/lib/twoslash/protocol.js'
import { dialects } from '#/lib/twoslash/options.js'
import * as Wallpapers from '#/lib/wallpapers.js'
import * as Sample from '#/lib/twoslash/sample.gen.js'
import { sample } from '#/lib/sample.js'
import * as Themes from '#/lib/themes.js'
import { text } from '#/theme/text.js'
import { Button } from '#/ui/Button.js'
import { Menu } from '#/ui/Menu.js'
import { color, crossfade, font, motion } from '../theme/tokens.stylex.js'
import { Editor } from './-components/Editor.js'
import { Frame } from './-components/Frame.js'
import { Drawer } from './-components/Drawer.js'

export const Route = createFileRoute('/')({
  component: Page,
})

const bareSample = bare(sample)

const loadingReveal = stylex.keyframes({
  from: { clipPath: 'inset(0 100% 0 0)', opacity: 0.7 },
  to: { clipPath: 'inset(0)', opacity: 1 },
})

const styles = stylex.create({
  offscreen: {
    // In the document so it lays out at its real size, off the page so it is
    // never seen. Not `display: none`, which would give it no box at all.
    insetBlockStart: 0,
    insetInlineStart: 0,
    pointerEvents: 'none',
    position: 'fixed',
    transform: 'translateX(calc(-100% - 1px))',
    width: 'max-content',
  },
  page: {
    display: 'flex',
    flexDirection: 'column',
    fontFamily: font.mono,
    minHeight: '100dvh',
    transitionDuration: motion.medium,
    paddingInlineEnd: { default: 0, '@media (min-width: 800px)': 352 },
    transitionProperty: 'background-color, color',
    transitionTimingFunction: motion.out,
  },
  // The shell takes its colors from the artwork, so the app recedes behind it.
  canvasColor: (surface: { background: string; foreground: string }) => ({
    backgroundColor: surface.background,
    color: surface.foreground,
  }),
  // One full-page picture sits behind the transparent live artwork. Keeping a
  // single copy prevents the seams caused by independently covered boxes.
  canvasPicture: {
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
    insetBlock: 0,
    insetInlineStart: 0,
    insetInlineEnd: { default: 0, '@media (min-width: 800px)': 352 },
    pointerEvents: 'none',
    position: 'fixed',
    zIndex: 0,
  },
  canvasPictureSource: (source: string) => ({ backgroundImage: `url("${source}")` }),
  header: {
    alignItems: 'center',
    display: 'flex',
    height: { default: 64, '@media (min-width: 800px)': 56 },
    justifyContent: 'space-between',
    paddingInline: { default: 16, '@media (min-width: 800px)': 20 },
    position: 'relative',
    zIndex: 2,
  },
  wordmark: {
    backgroundColor: 'currentColor',
    blockSize: { default: 22, '@media (min-width: 800px)': 26 },
    display: 'block',
    inlineSize: { default: 86, '@media (min-width: 800px)': 101 },
    maskImage: 'url("/logo-light.svg")',
    maskPosition: 'center',
    maskRepeat: 'no-repeat',
    maskSize: 'contain',
  },
  // Beside the menu that started the export, quiet enough to read as a note on
  // the action rather than a failure of the page.
  notice: { opacity: 0.7 },
  stage: {
    alignItems: 'center',
    display: 'flex',
    flex: 1,
    justifyContent: 'safe center',
    minWidth: 0,
    overflowX: 'auto',
    paddingBlock: 24,
    paddingInline: { default: 10, '@media (min-width: 800px)': 24 },
    position: 'relative',
    zIndex: 2,
  },
  canvas: { flexShrink: 0, maxWidth: '100%' },
  mobileActions: {
    alignItems: 'center',
    display: { default: 'flex', '@media (min-width: 800px)': 'none' },
    insetBlockStart: 8,
    insetInlineEnd: 16,
    position: 'fixed',
    zIndex: 5,
  },
  mobileExport: { height: 48 },
  mobileToggle: {
    backgroundColor: {
      default: 'transparent',
      ':active': 'transparent',
      ':hover': 'transparent',
    },
  },
  mobileToggleIcon: {
    fill: 'none',
    height: 20,
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeWidth: 1.75,
    width: 20,
  },
  scrim: { inset: 0, pointerEvents: 'none', position: 'fixed', zIndex: 0 },
  scrimBlock: (box: {
    color: string
    height: number
    left: number
    top: number
    width: number
  }) => ({
    backgroundColor: box.color,
    height: Math.max(0, box.height),
    left: box.left,
    position: 'absolute',
    top: box.top,
    width: Math.max(0, box.width),
  }),
  // Crop guides: dashed lines continuing the artwork's edges across the
  // viewport. Fixed and measured, so they never add to the page's own size.
  // The page stacks in three layers: guides over the artwork (a solid fill
  // would otherwise paint over them, which is exactly when the crop edge is
  // hardest to see), then the drawer.
  guides: { inset: 0, pointerEvents: 'none', position: 'fixed', zIndex: 1 },
  // A hairline drawn as a background rather than a border, so it stays exactly
  // one device-independent pixel and the dashes keep an even rhythm.
  guide: { opacity: 0.18, position: 'absolute' },
  guideRow: (edge: { from: number; to: number; top: number }) => ({
    backgroundImage: 'repeating-linear-gradient(to right, currentColor 0 4px, transparent 4px 8px)',
    height: 1,
    left: edge.from,
    top: edge.top,
    width: Math.max(0, edge.to - edge.from),
  }),
  guideColumn: (edge: { from: number; left: number; to: number }) => ({
    backgroundImage:
      'repeating-linear-gradient(to bottom, currentColor 0 4px, transparent 4px 8px)',
    height: Math.max(0, edge.to - edge.from),
    left: edge.left,
    top: edge.from,
    width: 1,
  }),
  // Reserves the frame's footprint so the first highlight does not shift the
  // page, and gives failures somewhere to speak.
  fallback: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
    minHeight: 320,
  },
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: color.background,
    color: color.gray1000,
    display: 'var(--loading-screen-display, flex)',
    inset: 0,
    justifyContent: 'center',
    opacity: 1,
    position: 'fixed',
    transitionDuration: motion.medium,
    transitionProperty: 'opacity',
    transitionTimingFunction: motion.out,
    zIndex: 100,
  },
  loadingScreenReady: { opacity: 0, pointerEvents: 'none' },
  loadingMark: { blockSize: 48, inlineSize: 184, position: 'relative' },
  loadingLogo: {
    backgroundColor: 'currentColor',
    inset: 0,
    maskImage: 'url("/logo-light.svg")',
    maskPosition: 'center',
    maskRepeat: 'no-repeat',
    maskSize: 'contain',
    position: 'absolute',
  },
  loadingLogoBase: { opacity: 0.16 },
  loadingLogoReveal: {
    animationDirection: 'alternate',
    animationDuration: motion.slow,
    animationIterationCount: 'infinite',
    animationName: loadingReveal,
    animationTimingFunction: motion.inOut,
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
      clipPath: 'inset(0)',
      opacity: 0.7,
    },
  },
})

/** Held still so the editor is not reconfigured with a fresh array each render. */
const empty: Editor.Props['types'] = []

/** Stable empty offset list used before compiler results are available. */
const emptyOffsets: readonly number[] = []

const quiet: Editor.Props['diagnostics'] = []

/** Everything on screen that a shared link carries, less the code and title. */
type Settings = Drawer.State

/**
 * Snapshot of offscreen export content. Captures span asynchronous operations,
 * so this prevents later edits from changing title, palette, or geometry.
 */
type Artwork = {
  /** Styles the annotated markup needs, when the render produced any. */
  css: string | undefined
  html: string
  palette: Theme.derive.Result
  settings: Settings
  title: string
  /** The backdrop's picture as data, when the settings named one. */
  wallpaper: string | undefined
}

/**
 * An export as it was asked for. One can be queued behind another, so it holds
 * the state of the moment its action ran rather than of the moment the queue
 * reaches it.
 */
type Capture = {
  code: string
  /** The run the frame draws its annotations from, when one is current. */
  types: Run | undefined
  language: LanguageId
  options: Export.capture.Options
  settings: Settings
  title: string
  /** The backdrop as it stood when export began, including a local image. */
  wallpaper: string | undefined
}

const fallback: Settings = {
  background: 'wallpaper:golden-gate-dark',
  language: 'auto',
  padding: 64,
  radius: 12,
  syntax: 'auto',
  theme: 'golden-gate-dark',
  titleBar: false,
  types: true,
}

/**
 * Page state from a shared fragment. The codec guarantees the shape but not
 * that a theme or language still exists, so both are checked against what this
 * build carries before they reach the renderer.
 */
function restore(hash: string) {
  const state = Codec.deserialize(hash)
  const theme = names.find((name) => name === state.theme) ?? fallback.theme
  const language =
    state.lang === 'auto'
      ? 'auto'
      : (languages.find((entry) => entry.id === state.lang)?.id ?? 'auto')
  return {
    // Use the sample when a fragment is unreadable or contains an empty document.
    code: state.code || sample,
    settings: {
      background: state.background,
      language,
      padding: state.padding,
      radius: state.radius,
      syntax: state.syntax,
      theme,
      titleBar: state.titleBar,
      types: state.types,
      width: state.width,
    } satisfies Settings,
    title: state.title,
  }
}

/** Merges settings and applies frame overrides when the theme changes. */
function merged(current: Settings, next: Partial<Settings>): Settings {
  const settings = { ...current, ...next }
  if (!next.theme || next.theme === current.theme) return settings
  return { ...settings, ...Themes.reframe(current.theme, next.theme) }
}

/** The wallpaper explicitly selected as the artwork backdrop. */
function backdrop(settings: Settings) {
  return Wallpapers.at(settings.background)
}

/** The fragment a link carries for the state on screen. */
function share(parameters: { code: string; settings: Settings; title: string }) {
  const { code, settings, title } = parameters
  return Codec.serialize({
    // Custom images stay local; a shared link falls back to the selected theme gradient.
    background: settings.background === 'image' ? 'default' : settings.background,
    code,
    lang: settings.language,
    padding: settings.padding,
    radius: settings.radius,
    syntax: settings.syntax,
    theme:
      settings.background === 'image' && settings.syntax === 'auto'
        ? Backgrounds.syntax('default')
        : settings.theme,
    title,
    titleBar: settings.titleBar,
    types: settings.types,
    width: settings.width,
  })
}

// One renderer for the page: it caches the themes and languages already loaded.
const renderer = Core.create({ langs: ['tsx'] })
const names = Theme.list().map((entry) => entry.name)

/**
 * The resolved types, tokenized so they are painted in the theme's colors
 * rather than a flat foreground. Distinct texts only: a type repeated across
 * the document is one signature to tokenize.
 */
async function paint(
  theme: Settings['theme'],
  annotations: Twoslash.Result['hovers'],
): Promise<Editor.Props['types']> {
  const entries = await Promise.all(
    [...new Set(annotations.map((annotation) => annotation.text))].map(async (text) => {
      const result = await renderer.tokens({ code: text, lang: 'ts', theme })
      return [text, result.tokens] as const
    }),
  )
  const painted = new Map(entries)
  return annotations.map((annotation) => ({
    annotation: painted.get(annotation.text) ?? [],
    from: annotation.from,
    to: annotation.to,
  }))
}

/**
 * The default snippet as the editor holds a resolved document: its run was
 * produced at build time, and the editor's view of it is read here rather
 * than stored twice.
 */
function resolvedSample(): Twoslash.Resolved {
  return {
    document: sample,
    lang: Sample.lang,
    result: Sample.result,
    types: Sample.types,
  }
}

/** Interactive editor initialized from an optional server-visible shared state. */
export function Page({ state }: { state?: string | undefined } = {}) {
  const navigate = useNavigate()
  const initial = state ? restore(state) : { code: sample, settings: fallback, title: '' }
  const [settings, setSettings] = useState<Settings>(initial.settings)
  const [syntaxPreview, setSyntaxPreview] = useState<Theme.Info['name']>()
  const [mobile, setMobile] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(true)
  const [title, setTitle] = useState(initial.title)
  const [code, setCode] = useState(initial.code)

  useEffect(() => {
    const query = matchMedia('(max-width: 799px)')
    const update = () => setMobile(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  // A fragment is never sent to the server, so it is applied after mount
  // rather than during render, which could not match what was served. Before
  // paint, so a shared link never shows the defaults first.
  useLayoutEffect(() => {
    if (state) return
    // Retain application defaults when the fragment is absent or unreadable.
    if (!Codec.readable(window.location.hash)) return
    const shared = restore(window.location.hash)
    setCode(shared.code)
    setSettings(shared.settings)
    setTitle(shared.title)
  }, [state])
  const [frame, setFrame] = useState<{
    palette: Theme.derive.Result
    tokens: Editor.Props['tokens']
  }>()
  const [annotations, setAnnotations] = useState<Editor.Props['types']>(empty)
  // Kept rather than derived: a reply for a document that has been edited past
  // carries offsets into text that is no longer on screen, so the last set
  // that did match stays until one for this document arrives. The editor maps
  // what it already holds through the edits between.
  const [diagnostics, setDiagnostics] = useState<Editor.Props['diagnostics']>(quiet)
  /** Diagnostic offsets ignored by both the editor and exported image. */
  const [ignored, setIgnored] = useState<readonly number[]>(emptyOffsets)
  // Seeded with the default snippet's types, resolved at build time: the
  // worker that resolves them carries a compiler, and a first visit would
  // download it to draw a document nobody has touched.
  const [resolved, setResolved] = useState<Twoslash.Resolved | undefined>(() =>
    code === sample ? resolvedSample() : undefined,
  )
  const resolver = useRef<ReturnType<typeof Twoslash.create>>(null)
  const [error, setError] = useState<Error>()
  // Export failures speak for themselves: sharing `error` would swap the
  // artwork for the highlighter's fallback and leave it there.
  const [notice, setNotice] = useState<string>()
  const [artwork, setArtwork] = useState<Artwork>()
  // Held as data rather than drawn from its URL: the copy an export captures is
  // read as it stands, and a fetch it started would not have landed by then.
  const [wallpaper, setWallpaper] = useState<Wallpapers.Picture>()
  const [image, setImage] = useState<string>()
  // Gate only the opening visual assets; type resolution remains progressive.
  const [pictureReady, setPictureReady] = useState(false)
  const [fontsReady, setFontsReady] = useState(false)
  const [opening, setOpening] = useState(true)
  const stage = useRef<HTMLDivElement>(null)
  const mobileActions = useRef<HTMLDivElement>(null)
  const pending = useRef<Promise<unknown> | undefined>(undefined)
  // Which export the notice on screen belongs to.
  const attempt = useRef(0)
  const [detected, setDetected] = useState<BundledLanguage>(() => {
    const source = bare(code)
    return source === bareSample ? preferred(Sample.language) : (detect(source) ?? 'tsx')
  })

  // Under `auto` the language is read from the code, debounced: reading the
  // whole document on every keystroke would recolor the frame mid-word, and a
  // guess that cannot be made leaves the language where it is.
  useEffect(() => {
    if (settings.language !== 'auto') return
    const source = bare(code)
    if (source === bareSample) {
      setDetected(preferred(Sample.language))
      return
    }
    const timer = setTimeout(() => setDetected((current) => detect(source) ?? current), 400)
    return () => clearTimeout(timer)
  }, [code, settings.language])

  const language = settings.language !== 'auto' ? settings.language : detected
  const syntaxTheme = syntaxPreview ?? settings.theme

  // The fragment is the only place state is kept, so it is written on every
  // change, debounced: a keystroke should not push a history entry, and the
  // router owns the address bar rather than `history.replaceState`.
  useEffect(() => {
    const timer = setTimeout(() => {
      const hash = share({ code, settings, title })
      // Preserve the immutable short URL until the editor diverges from it.
      if (state === hash) return
      void navigate({ to: '/', hash, replace: true, resetScroll: false })
    }, 500)
    return () => clearTimeout(timer)
  }, [code, navigate, settings, state, title])

  // Tokens are the editor's colors, so this reruns on every edit as well as
  // every theme change. Shiki tokenizes synchronously once a theme is loaded.
  useEffect(() => {
    let active = true
    renderer.tokens({ code, lang: language, theme: syntaxTheme }).then(
      (result) => {
        if (!active) return
        setError(undefined)
        setFrame({ palette: palette(syntaxTheme, result.theme), tokens: result.tokens })
      },
      (cause: Error) => {
        if (active) setError(cause)
      },
    )
    return () => {
      active = false
    }
  }, [code, language, syntaxTheme])

  // The language service runs in a worker: it carries the TypeScript compiler,
  // which would block typing on this thread. Debounced, because resolving a
  // document costs more than drawing one.
  useEffect(() => {
    // Invalidate previous-document work before the debounce window can accept a stale result.
    resolver.current?.invalidate()
    // Turned off, the snippet is read as text: the compiler is what draws the
    // types, the squiggles, and the blocks a `^?` leaves behind.
    const dialect = settings.types ? dialects[language as keyof typeof dialects] : undefined
    if (!dialect) {
      setResolved(undefined)
      return
    }
    // A failure leaves the types belonging to a document that is no longer on
    // screen, so they go rather than stand in for the current one. Built even
    // for a document that needs no resolving, because a caret asking for
    // completions reaches through it and the worker inside is what is lazy.
    resolver.current ??= Twoslash.create({
      onError: (message) => {
        console.error('Type resolution failed.', message)
        setResolved(undefined)
      },
      onResult: setResolved,
    })
    // Already resolved, and by something other than the worker: an untouched
    // visit never spawns it.
    if (code === sample && dialect === Sample.lang) {
      setResolved(resolvedSample())
      return
    }
    const timer = setTimeout(() => resolver.current?.resolve(code, dialect), 300)
    return () => clearTimeout(timer)
  }, [code, language, settings.types])

  // The picture the artwork stands on, by name: what the effect below watches.
  const picture = backdrop(settings)?.id

  useEffect(() => {
    if (settings.background === 'image') {
      setWallpaper(image ? { source: image } : undefined)
      setPictureReady(true)
      if (image) {
        let active = true
        void Wallpapers.analyze(image).then(
          (colors) => {
            if (!active) return
            setWallpaper({ color: colors[0], colors, source: image })
            setSettings((current) =>
              current.background === 'image' && current.syntax === 'auto'
                ? merged(current, { theme: Backgrounds.syntax('image', colors) })
                : current,
            )
          },
          () => {},
        )
        return () => {
          active = false
        }
      }
      return
    }
    setPictureReady(!picture)
    if (!picture) {
      setWallpaper(undefined)
      return
    }
    let active = true
    void Promise.all([Wallpapers.embed(picture), Wallpapers.palette(picture)]).then(
      ([source, colors]) => {
        if (!active) return
        setWallpaper({ color: colors[0], colors, source })
        setSettings((current) =>
          backdrop(current)?.id === picture && current.syntax === 'auto'
            ? merged(current, { theme: Backgrounds.syntax(current.background, colors) })
            : current,
        )
        setPictureReady(true)
      },
      (cause: Error) => {
        if (!active) return
        setNotice(cause.message)
        setPictureReady(true)
      },
    )
    return () => {
      active = false
    }
    // The picture is what this loads; every other setting leaves it alone, and
    // a drag on the padding would otherwise reload it on every frame.
  }, [image, picture, settings.background])

  useEffect(() => {
    void Wallpapers.preload()
  }, [])

  useEffect(() => {
    let active = true
    void document.fonts.ready.then(() => {
      if (active) setFontsReady(true)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    // Latch open so later theme loads never bring the screen back.
    if (!fontsReady || !(error || (frame && pictureReady))) return
    setOpening(false)
    Opening.remember()
  }, [error, fontsReady, frame, pictureReady])

  useEffect(() => () => resolver.current?.dispose(), [])

  // Types are painted in the theme's own colors rather than a flat foreground.
  // Tokenized per distinct type rather than per span, since a document repeats
  // the same handful of types across many identifiers.
  useEffect(() => {
    if (!resolved) {
      setAnnotations(empty)
      setDiagnostics(quiet)
      return
    }
    // Painting is a second asynchronous stage: a theme's TypeScript grammar
    // can still be loading. The spans are offsets into the document that was
    // resolved, so an edit reruns this and drops them rather than marking the
    // wrong words. The editor keeps mapping the spans it already holds.
    // Validate the dialect as well as text because the same source is valid in one and
    // an error in another, so a reply from before a language change describes
    // a document this one no longer is.
    if (resolved.document !== code || resolved.lang !== dialects[language as keyof typeof dialects])
      return
    setDiagnostics(resolved.result.diagnostics)
    let active = true
    void paint(syntaxTheme, resolved.result.hovers).then((painted) => {
      if (active) setAnnotations(painted)
    })
    return () => {
      active = false
    }
  }, [code, resolved, syntaxTheme])

  /**
   * Renders the frame away from the page and captures that, so an export
   * carries the artwork rather than the editor's caret, selection, and handles.
   */
  async function draw(capture: Capture) {
    const { code, language, options, settings, title, types, wallpaper } = capture
    const { theme } = settings
    // The frame draws the annotations itself, from the run the worker already
    // resolved: the export and the command line then produce the same markup
    // rather than two readings of the same types.
    const rendered = await renderer.render({
      code,
      lang: language,
      theme,
      ...(types ? { twoslash: types } : {}),
    })
    const named = backdrop(settings)
    const picture = wallpaper ?? (named ? await Wallpapers.embed(named.id) : undefined)
    // Synchronous, so the copy is in the document before it is measured.
    flushSync(() =>
      setArtwork({
        css: rendered.css,
        html: rendered.html,
        palette: Theme.derive(rendered.theme),
        settings,
        title,
        wallpaper: picture,
      }),
    )
    try {
      const node = stage.current?.firstElementChild
      if (!node) throw new Error('The artwork is not ready.')
      // Fonts first: capturing before they load bakes in fallback metrics.
      await document.fonts.ready
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      // Complete entry animations before capture to avoid exporting transparent content.
      for (const animation of node.getAnimations({ subtree: true }))
        if (animation.playState !== 'idle') animation.finish()
      const size = node.getBoundingClientRect()
      return await Export.capture(node, { ...options, scale: Export.fit(size, options) })
    } finally {
      setArtwork(undefined)
    }
  }

  /**
   * Captures the artwork, one at a time. Every export mounts into the same
   * offscreen stage, so a second one starting mid-flight would clear the stage
   * the first is still reading from.
   *
   * The notice belongs to the newest export. An older one queued behind it
   * still runs, but its failure arrives about work the user has moved on from,
   * so it is not put back on screen.
   */
  function take(options: Export.capture.Options) {
    const id = (attempt.current += 1)
    setNotice(undefined)
    // Snapshot inputs now because the page remains editable while queued exports run.
    // Exported markup uses `^?` query results resolved against this document.
    // Only a run resolved against this very document: an older one carries
    // offsets into text that is no longer here.
    const found = resolved?.document === code ? resolved.types : undefined
    // What the editor stopped reporting is not in the picture either.
    const types = found && without(found, ignored)
    const capture: Capture = {
      code,
      language,
      options,
      settings,
      title,
      types,
      wallpaper: wallpaper?.source,
    }
    const run = Promise.resolve(pending.current)
      .catch(() => {})
      .then(() => draw(capture))
    // A failed export must not strand the queue, and the caller still sees the
    // rejection through `run`.
    pending.current = run.catch(() => {})
    return {
      report(cause: Error) {
        if (attempt.current === id) setNotice(cause.message)
      },
      run,
    }
  }

  function save(options: Export.capture.Options) {
    const { report, run } = take(options)
    // Derive the filename from the title captured when export starts.
    const name = `${title || 'untitled'}.${options.type}`
    void run.then((blob) => Export.download(blob, { name })).catch(report)
  }

  function copyImage() {
    const { report, run } = take({ scale: 2, type: 'png' })
    // Handed over as a promise: Safari only honors a clipboard write that
    // starts in the gesture that asked for it.
    void Export.copy(run).catch(report)
  }

  function copyUrl() {
    // Built from state rather than read from the address bar, so a copy never
    // waits on the debounced write.
    const state = share({ code, settings, title })
    const long = new URL(window.location.href)
    long.hash = state
    // Store the snippet for preview generation, with the fragment URL as fallback.
    const text = Links.shorten(state).catch(() => long.toString())
    // Start the clipboard write during the user gesture. Safari may reject a
    // write that begins after the short-link request completes.
    const rich =
      typeof ClipboardItem === 'function' && typeof navigator.clipboard.write === 'function'
    const written = rich
      ? navigator.clipboard
          .write([
            new ClipboardItem({
              // Match the Blob type to the ClipboardItem entry type.
              'text/plain': text.then((value) => new Blob([value], { type: 'text/plain' })),
            }),
          ])
          // Fall back when the browser rejects a deferred ClipboardItem value.
          .catch(async () => navigator.clipboard.writeText(await text))
      : text.then((value) => navigator.clipboard.writeText(value))
    void written.catch(() => setNotice('The link could not be copied.'))
  }

  const [measure, rect] = useEdges()
  const frameWidthMax = Math.max(360, (rect?.width ?? 1600) - (mobile ? 20 : 400))

  useEffect(() => {
    setSettings((current) => {
      const padding = Math.min(current.padding, mobile ? 16 : Frame.maxPadding(frameWidthMax))
      const width =
        current.width === undefined
          ? undefined
          : Math.min(frameWidthMax, Math.max(Frame.minWidth(padding), current.width))
      if (padding === current.padding && width === current.width) return current
      return { ...current, padding, width }
    })
  }, [frameWidthMax, mobile])

  // The wallpaper and its cutout enter together. Before the artwork has bounds,
  // showing the picture would briefly brighten the whole page without a scrim.
  const visibleWallpaper = rect ? wallpaper : undefined

  // Held in refs so a render never re-registers the listener below. Every
  // handler is redeclared each render, and the page renders on every keystroke.
  const exports = useRef({ copyImage, copyUrl, save })
  exports.current = { copyImage, copyUrl, save }

  // Override browser defaults for shortcuts advertised by the export menu.
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.altKey || !(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 's' && !event.shiftKey) {
        event.preventDefault()
        exports.current.save({ scale: 2, type: 'png' })
      } else if (key === 'c' && event.shiftKey) {
        // ⌘ only, as the menu advertises it. Ctrl+Shift+C is the element
        // picker on Windows and Linux, which the page has no business taking.
        if (!event.metaKey) return
        event.preventDefault()
        exports.current.copyUrl()
      } else if (key === 'c' && !event.shiftKey && !copying(event)) {
        event.preventDefault()
        exports.current.copyImage()
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (!mobile || controlsOpen || event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key.toLowerCase() !== 'e' || copying(event)) return
      event.preventDefault()
      mobileActions.current?.querySelector<HTMLButtonElement>('button')?.click()
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [controlsOpen, mobile])

  // A dark fill lands on the same near-black the shell mixes to, leaving no
  // visible artwork edge, so the guides carry the crop the whole way across.
  const customGradient = Backgrounds.gradient(settings.background)
  const bleed =
    settings.background === 'none' ||
    (settings.background.startsWith('#') && lightness(settings.background) < 0.2) ||
    (customGradient?.every((color) => lightness(color) < 0.2) ?? false)

  // With no backdrop the window is the whole artwork, so the shell takes the
  // window's own colors and the two read as one surface.
  const canvas = (() => {
    if (!frame) return undefined
    if (settings.background === 'none') return frame.palette.window
    // Whatever the backdrop leads with owns the surface, so the shell takes a
    // darkened cast of it rather than sitting against an unrelated hue: the
    // chosen color, the gradient's first stop, or the picture's strongest color.
    const tint = settings.background.startsWith('#')
      ? settings.background
      : (customGradient?.[0] ?? wallpaper?.color)
    if (!tint) return frame.palette.page
    return {
      background: `color-mix(in oklab, ${tint} 22%, #08080a)`,
      foreground: frame.palette.page.foreground,
    }
  })()
  const scrim =
    canvas && visibleWallpaper
      ? `color-mix(in oklab, ${canvas.background} 82%, transparent)`
      : undefined

  return (
    <MotionConfig reducedMotion="user">
      <main
        aria-busy={opening}
        {...stylex.props(styles.page, canvas ? styles.canvasColor(canvas) : null)}
      >
        <div
          aria-hidden
          data-loading-screen
          {...stylex.props(styles.loadingScreen, !opening && styles.loadingScreenReady)}
        >
          <div {...stylex.props(styles.loadingMark)}>
            <span {...stylex.props(styles.loadingLogo, styles.loadingLogoBase)} />
            <span {...stylex.props(styles.loadingLogo, styles.loadingLogoReveal)} />
          </div>
        </div>

        <AnimatePresence initial={false}>
          {visibleWallpaper && (
            <m.div
              animate={{ opacity: 1 }}
              aria-hidden
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key={visibleWallpaper.source}
              transition={crossfade}
              {...stylex.props(
                styles.canvasPicture,
                styles.canvasPictureSource(visibleWallpaper.source),
              )}
            />
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {rect && scrim && visibleWallpaper && (
            <m.div
              animate={{ opacity: 1 }}
              aria-hidden
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key={`${visibleWallpaper.source}:${scrim}`}
              transition={crossfade}
              {...stylex.props(styles.scrim)}
            >
              {[
                { height: rect.top, left: 0, top: 0, width: rect.width },
                {
                  height: rect.bottom - rect.top,
                  left: 0,
                  top: rect.top,
                  width: rect.left,
                },
                {
                  height: rect.bottom - rect.top,
                  left: rect.right,
                  top: rect.top,
                  width: rect.width - rect.right,
                },
                {
                  height: rect.height - rect.bottom,
                  left: 0,
                  top: rect.bottom,
                  width: rect.width,
                },
              ].map((box) => (
                <span
                  key={`${box.left}-${box.top}`}
                  {...stylex.props(styles.scrimBlock({ ...box, color: scrim }))}
                />
              ))}
            </m.div>
          )}
        </AnimatePresence>

        {rect && (
          // Constrain guides to artwork bounds when a backdrop defines visible edges.
          <div aria-hidden {...stylex.props(styles.guides)}>
            {[rect.top, rect.bottom].map((top) =>
              (bleed
                ? [{ from: 0, to: rect.width }]
                : [
                    { from: 0, to: rect.left },
                    { from: rect.right, to: rect.width },
                  ]
              ).map((span) => (
                <span
                  key={`row-${top}-${span.from}`}
                  {...stylex.props(styles.guide, styles.guideRow({ ...span, top }))}
                />
              )),
            )}
            {[rect.left, rect.right].map((left) =>
              (bleed
                ? [{ from: 0, to: rect.height }]
                : [
                    { from: 0, to: rect.top },
                    { from: rect.bottom, to: rect.height },
                  ]
              ).map((span) => (
                <span
                  key={`column-${left}-${span.from}`}
                  {...stylex.props(styles.guide, styles.guideColumn({ ...span, left }))}
                />
              )),
            )}
          </div>
        )}

        <header {...stylex.props(styles.header)}>
          <span aria-label="Monoshot" role="img" {...stylex.props(styles.wordmark)} />
          {/* Inert rather than `aria-hidden`: the copy carries a title field and
            the frame's handles, which stay tabbable while a capture runs. */}
          <div inert ref={stage} {...stylex.props(styles.offscreen)}>
            {artwork ? (
              <Frame
                background={artwork.settings.background}
                onPaddingChange={() => {}}
                onWidthChange={() => {}}
                padding={artwork.settings.padding}
                onRadiusChange={() => {}}
                palette={artwork.palette}
                radius={artwork.settings.radius}
                title={artwork.title}
                titleBar={artwork.settings.titleBar}
                wallpaper={
                  artwork.wallpaper ? { source: artwork.wallpaper, spread: 'artwork' } : undefined
                }
                width={artwork.settings.width}
              >
                <Frame.Code css={artwork.css} html={artwork.html} />
              </Frame>
            ) : null}
          </div>
          {notice && (
            <span role="status" {...stylex.props(styles.notice, text.copy14)}>
              {notice}
            </span>
          )}
        </header>

        <div {...stylex.props(styles.stage)}>
          <div {...stylex.props(styles.canvas)}>
            {error ? (
              <div role="alert" {...stylex.props(styles.fallback, text.copy14)}>
                Could not highlight this snippet.
              </div>
            ) : frame ? (
              <div ref={measure}>
                <Frame
                  background={
                    wallpaper || (picture && !pictureReady) ? 'none' : settings.background
                  }
                  maxWidth={frameWidthMax}
                  onPaddingChange={(padding) =>
                    setSettings((current) => {
                      const width = Math.min(
                        current.width ?? (rect ? Math.round(rect.right - rect.left) : 808),
                        frameWidthMax,
                      )
                      const windowWidth = width - current.padding * 2
                      const next = Math.min(
                        padding,
                        mobile ? 16 : Number.POSITIVE_INFINITY,
                        Frame.maxPaddingFor(frameWidthMax, windowWidth),
                      )
                      return {
                        ...current,
                        padding: next,
                        width: width + (next - current.padding) * 2,
                      }
                    })
                  }
                  onTitleChange={setTitle}
                  onWidthChange={(width) => setSettings((current) => ({ ...current, width }))}
                  padding={settings.padding}
                  onRadiusChange={(radius) => setSettings((current) => ({ ...current, radius }))}
                  palette={frame.palette}
                  radius={settings.radius}
                  responsive
                  title={title}
                  titleBar={settings.titleBar}
                  width={settings.width}
                >
                  <Editor
                    code={code}
                    diagnostics={diagnostics}
                    language={language}
                    onCodeChange={setCode}
                    onIgnore={setIgnored}
                    // Return no completions for unsupported languages or before resolver creation.
                    onComplete={async (document, position) => {
                      const dialect = settings.types
                        ? dialects[language as keyof typeof dialects]
                        : undefined
                      if (!dialect) return []
                      return (await resolver.current?.complete(document, dialect, position)) ?? []
                    }}
                    palette={frame.palette}
                    tokens={frame.tokens}
                    types={annotations}
                  />
                </Frame>
              </div>
            ) : (
              <div {...stylex.props(styles.fallback)} />
            )}
          </div>
        </div>

        <Drawer
          image={image}
          maxWidth={frameWidthMax}
          mobile={mobile}
          open={!mobile || controlsOpen}
          onCopyImage={copyImage}
          onCopyUrl={copyUrl}
          onClose={() => setControlsOpen(false)}
          onImageChange={setImage}
          onSave={save}
          onSyntaxPreview={setSyntaxPreview}
          resolved={language}
          {...settings}
          width={Math.min(
            settings.width ?? (rect ? Math.round(rect.right - rect.left) : frameWidthMax),
            frameWidthMax,
          )}
          onChange={(next) =>
            setSettings((current) => {
              const syntax = next.syntax ?? current.syntax
              const background = next.background ?? current.background
              const theme =
                syntax === 'auto' && (next.background !== undefined || next.syntax === 'auto')
                  ? Backgrounds.syntax(background, background === 'image' ? wallpaper?.colors : [])
                  : next.theme
              return merged(current, { ...next, ...(theme ? { theme } : {}) })
            })
          }
        />
        {mobile && !controlsOpen && (
          <div ref={mobileActions} {...stylex.props(styles.mobileActions)}>
            <Menu label="Export" style={styles.mobileExport}>
              <Menu.Item onClick={() => save({ scale: 6, type: 'png' })}>PNG</Menu.Item>
              <Menu.Item onClick={() => save({ scale: 1, type: 'svg' })}>SVG</Menu.Item>
              <Menu.Item onClick={copyImage}>Copy image</Menu.Item>
              <Menu.Item onClick={copyUrl}>Copy URL</Menu.Item>
            </Menu>
            <Button
              aria-controls="editor-controls"
              aria-expanded={false}
              aria-label="Open controls"
              onClick={() => setControlsOpen(true)}
              size="large"
              square
              style={styles.mobileToggle}
              variant="tertiary"
            >
              <svg aria-hidden viewBox="0 0 24 24" {...stylex.props(styles.mobileToggleIcon)}>
                <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" />
              </svg>
            </Button>
          </div>
        )}
      </main>
    </MotionConfig>
  )
}

/**
 * Tracks the artwork's viewport rect so the crop guides can follow its edges.
 * Takes the node through a callback ref: the frame mounts after the first
 * render, which a ref object alone would not tell us about.
 */
function useEdges() {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [rect, setRect] = useState<Edges>()

  useLayoutEffect(() => {
    // Remove crop guides when the frame is unavailable.
    if (!node) {
      setRect(undefined)
      return
    }
    const read = () => {
      const box = node.getBoundingClientRect()
      const next = {
        bottom: box.bottom,
        height: window.innerHeight,
        left: box.left,
        right: box.right,
        top: box.top,
        width: window.innerWidth,
      }
      // Momentum scrolling and a settled ResizeObserver both report edges that
      // have not moved. Keeping the previous object leaves the page unrendered.
      setRect((current) =>
        current && (Object.keys(next) as (keyof Edges)[]).every((key) => current[key] === next[key])
          ? current
          : next,
      )
    }
    // One read per frame: every listener below fires faster than the page can
    // paint, and each read forces layout.
    let frame: number | undefined
    const measure = () => {
      if (frame !== undefined) return
      frame = requestAnimationFrame(() => {
        frame = undefined
        read()
      })
    }
    read()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, { passive: true })
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure)
    }
  }, [node])

  return [setNode, rect] as const
}

type Edges = {
  bottom: number
  /** Viewport size, so a guide can span it without reading layout at render. */
  height: number
  left: number
  right: number
  top: number
  width: number
}

/**
 * Whether native copy behavior should handle this keypress.
 * Inputs, editable content, and active selections retain the platform behavior.
 */
function copying(event: KeyboardEvent) {
  const { target } = event
  if (target instanceof Element && target.closest('input, textarea, [contenteditable]')) return true
  return getSelection()?.isCollapsed === false
}

const derived = new Map<string, Theme.derive.Result>()

/**
 * The palette of a syntax theme, one object per theme for the run.
 *
 * `Theme.derive` is deterministic, and the editor reconfigures its theme
 * compartment whenever the palette's identity changes. Deriving afresh on every
 * edit appends another CodeMirror style module, which style-mod never releases.
 */
function palette(name: string, theme: Parameters<typeof Theme.derive>[0]) {
  const cached = derived.get(name)
  if (cached) return cached
  const built = Theme.derive(theme)
  derived.set(name, built)
  return built
}

/** Rough perceptual lightness of a `#rrggbb` color, from 0 to 1. */
function lightness(hex: string) {
  if (hex.length !== 7) return 1
  const value = Number.parseInt(hex.slice(1), 16)
  if (Number.isNaN(value)) return 1
  return (
    (0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255)) / 255
  )
}
