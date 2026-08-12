import * as stylex from '@stylexjs/stylex'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Codec, Frame as Core, Theme } from 'monoshot'
import type { BundledLanguage } from 'shiki'
import { flushSync } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { detect, languages } from '#/lib/detect.js'
import * as Export from '#/lib/export.js'
import * as Links from '#/lib/links.js'
import * as Twoslash from '#/lib/twoslash/client.js'
import { without } from '#/lib/twoslash/protocol.js'
import type { Run } from '#/lib/twoslash/protocol.js'
import { dialects } from '#/lib/twoslash/options.js'
import * as Wallpapers from '#/lib/wallpapers.js'
import * as Sample from '#/lib/twoslash/sample.gen.js'
import * as Warm from '#/lib/warm.js'
import { sample } from '#/lib/sample.js'
import * as Themes from '#/lib/themes.js'
import { text } from '#/theme/text.js'
import { font, motion } from '../theme/tokens.stylex.js'
import { ExportMenu } from './-components/ExportMenu.js'
import { Editor } from './-components/Editor.js'
import { Frame } from './-components/Frame.js'
import { Toolbar } from './-components/Toolbar.js'

export const Route = createFileRoute('/')({
  component: Page,
})

const styles = stylex.create({
  offscreen: {
    // In the document so it lays out at its real size, off the page so it is
    // never seen. Not `display: none`, which would give it no box at all.
    insetBlockStart: 0,
    insetInlineStart: -20000,
    pointerEvents: 'none',
    position: 'fixed',
  },
  page: {
    display: 'flex',
    flexDirection: 'column',
    fontFamily: font.mono,
    minHeight: '100dvh',
    transitionDuration: motion.medium,
    transitionProperty: 'background-color, color',
    transitionTimingFunction: motion.out,
  },
  // The shell takes its colors from the artwork, so the app recedes behind it.
  canvasColor: (surface: { background: string; foreground: string }) => ({
    backgroundColor: surface.background,
    color: surface.foreground,
  }),
  // Extend the artwork image across the page under a color overlay that keeps
  // the artwork boundary visible.
  canvasPicture: (picture: { scrim: string; source: string }) => ({
    // Held to the viewport, which the artwork's own copy is held to as well: one
    // picture across both, rather than each covering its own box with a
    // different part of it.
    backgroundAttachment: 'fixed',
    backgroundImage: `linear-gradient(${picture.scrim}, ${picture.scrim}), url("${picture.source}")`,
    backgroundPosition: 'center',
    backgroundSize: 'cover',
  }),
  header: {
    alignItems: 'center',
    display: 'flex',
    height: 56,
    justifyContent: 'space-between',
    paddingInline: 20,
  },
  wordmark: { fontFamily: font.mono },
  actions: { alignItems: 'center', display: 'flex', gap: 12 },
  // Beside the menu that started the export, quiet enough to read as a note on
  // the action rather than a failure of the page.
  notice: { opacity: 0.7 },
  stage: {
    alignItems: 'center',
    display: 'flex',
    flex: 1,
    justifyContent: 'center',
    // Room for the floating toolbar.
    paddingBlock: 24,
    paddingBottom: 120,
    paddingInline: 24,
  },
  canvas: { maxWidth: '100%' },
  // Crop guides: dashed lines continuing the artwork's edges across the
  // viewport. Fixed and measured, so they never add to the page's own size.
  // The page stacks in three layers: guides over the artwork (a solid fill
  // would otherwise paint over them, which is exactly when the crop edge is
  // hardest to see), then the theme arrows, then the toolbar and its panels.
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
  // Half the region beside the artwork is the target, taken from the page's own
  // edge where its contents sit: chevron outboard, destination name inboard. The
  // half nearer the artwork is left alone, so reaching past the frame's width
  // handle is not also reaching for another theme.
  arrow: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderStyle: 'none',
    color: 'inherit',
    cursor: 'pointer',
    display: 'flex',
    opacity: { default: 0.35, ':hover': 1, ':focus-visible': 1 },
    outline: 'none',
    paddingInline: 28,
    position: 'fixed',
    transitionDuration: motion.fast,
    transitionProperty: 'opacity',
    transitionTimingFunction: motion.out,
    zIndex: 2,
  },
  arrowAt: (box: { height: number; top: number; width: number }) => ({
    height: box.height,
    top: box.top,
    width: box.width,
  }),
  arrowStart: { justifyContent: 'flex-start', left: 0 },
  arrowEnd: { justifyContent: 'flex-end', right: 0 },
  // A band this large cannot scale on press, so the press lands on its
  // contents. `:active` never reaches a child and arrow keys never raise it at
  // all, so both pointer and key presses drive the same state instead.
  arrowInner: {
    alignItems: 'center',
    display: 'flex',
    gap: 6,
    transform: 'scale(1)',
    transitionDuration: motion.fast,
    transitionProperty: 'transform',
    transitionTimingFunction: motion.out,
  },
  arrowInnerEnd: { flexDirection: 'row-reverse' },
  arrowInnerPressed: { transform: 'scale(0.92)' },
  // Display the corresponding arrow key using colors derived from the page theme.
  arrowKey: {
    alignItems: 'center',
    backgroundColor: 'color-mix(in oklab, currentColor 14%, transparent)',
    borderColor: 'color-mix(in oklab, currentColor 30%, transparent)',
    borderRadius: 4,
    borderStyle: 'solid',
    borderWidth: 1,
    display: 'flex',
    height: 15,
    justifyContent: 'center',
    minWidth: 15,
    paddingInline: 3,
  },
  arrowName: { whiteSpace: 'nowrap' },
  // Floats over the artwork so opening a taller panel never reflows the page.
  controls: {
    bottom: 24,
    zIndex: 3,
    display: 'flex',
    insetInline: 0,
    justifyContent: 'center',
    paddingInline: 20,
    pointerEvents: 'none',
    position: 'fixed',
  },
  controlsInner: { pointerEvents: 'auto' },
})

/** Held still so the editor is not reconfigured with a fresh array each render. */
const empty: Editor.Props['types'] = []

/** Stable empty offset list used before compiler results are available. */
const emptyOffsets: readonly number[] = []

const quiet: Editor.Props['diagnostics'] = []

/** Everything on screen that a shared link carries, less the code and title. */
type Settings = Toolbar.State & { padding: number; radius: number; width: number }

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
  language: BundledLanguage
  options: Export.capture.Options
  settings: Settings
  title: string
}

const fallback: Settings = {
  background: 'default',
  language: 'auto',
  padding: 64,
  radius: 12,
  theme: 'golden-gate-dark',
  titleBar: false,
  types: true,
  width: 640,
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
      theme,
      titleBar: state.titleBar,
      types: state.types,
      width: state.width,
    } satisfies Settings,
    title: state.title,
  }
}

/**
 * The picture the artwork stands on: the one chosen as a backdrop, or the one a
 * theme is made of. `default` is the theme's own backdrop, and a theme made
 * from a picture has that picture for one.
 */
function backdrop(settings: Settings) {
  return (
    Wallpapers.at(settings.background) ??
    (settings.background === 'default' ? Wallpapers.byId(settings.theme) : undefined)
  )
}

/** The fragment a link carries for the state on screen. */
function share(parameters: { code: string; settings: Settings; title: string }) {
  const { code, settings, title } = parameters
  return Codec.serialize({
    background: settings.background,
    code,
    lang: settings.language,
    padding: settings.padding,
    radius: settings.radius,
    theme: settings.theme,
    title,
    titleBar: settings.titleBar,
    types: settings.types,
    width: settings.width,
  })
}

// One renderer for the page: it caches the themes and languages already loaded.
const renderer = Core.create({ langs: ['tsx'] })
const themes = Theme.list()
const names = themes.map((entry) => entry.name)

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

function Page() {
  const navigate = useNavigate()
  const [settings, setSettings] = useState<Settings>(fallback)
  const [title, setTitle] = useState('')
  const [code, setCode] = useState(sample)

  // A fragment is never sent to the server, so it is applied after mount
  // rather than during render, which could not match what was served. Before
  // paint, so a shared link never shows the defaults first.
  useLayoutEffect(() => {
    // Retain application defaults when the fragment is absent or unreadable.
    if (!Codec.readable(window.location.hash)) return
    const shared = restore(window.location.hash)
    setCode(shared.code)
    setSettings(shared.settings)
    setTitle(shared.title)
  }, [])
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
  const stage = useRef<HTMLDivElement>(null)
  const pending = useRef<Promise<unknown> | undefined>(undefined)
  // Which export the notice on screen belongs to.
  const attempt = useRef(0)
  const [detected, setDetected] = useState<BundledLanguage>('tsx')

  // Under `auto` the language is read from the code, debounced: reading the
  // whole document on every keystroke would recolor the frame mid-word, and a
  // guess that cannot be made leaves the language where it is.
  useEffect(() => {
    if (settings.language !== 'auto') return
    const timer = setTimeout(() => setDetected((current) => detect(code) ?? current), 400)
    return () => clearTimeout(timer)
  }, [code, settings.language])

  // The sample was resolved as one language at build time, and reads as that
  // one regardless of detection. Detection still controls every other
  // document, including one it cannot place, which stays TypeScript.
  const language =
    settings.language !== 'auto' ? settings.language : code === sample ? Sample.language : detected

  // The fragment is the only place state is kept, so it is written on every
  // change, debounced: a keystroke should not push a history entry, and the
  // router owns the address bar rather than `history.replaceState`.
  useEffect(() => {
    const timer = setTimeout(() => {
      void navigate({ hash: share({ code, settings, title }), replace: true, resetScroll: false })
    }, 500)
    return () => clearTimeout(timer)
  }, [code, navigate, settings, title])

  // Tokens are the editor's colors, so this reruns on every edit as well as
  // every theme change. Shiki tokenizes synchronously once a theme is loaded.
  useEffect(() => {
    let active = true
    renderer.tokens({ code, lang: language, theme: settings.theme }).then(
      (result) => {
        if (!active) return
        setError(undefined)
        setFrame({ palette: Theme.derive(result.theme), tokens: result.tokens })
      },
      (cause: Error) => {
        if (active) setError(cause)
      },
    )
    return () => {
      active = false
    }
  }, [code, language, settings.theme])

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
      onError: () => setResolved(undefined),
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
    // Cleared first: the artwork would otherwise keep the picture it is holding
    // while the next one loads, which is the last theme's backdrop under this
    // theme's colors.
    setWallpaper(undefined)
    if (!picture) return
    let active = true
    void Wallpapers.embed(picture).then(
      (source) => {
        if (active) setWallpaper({ source })
      },
      (cause: Error) => {
        if (active) setNotice(cause.message)
      },
    )
    // Behind the picture rather than before it: the shell takes the picture's
    // color once it has been read, and stands on the theme's own until then.
    // A picture that will not decode still hangs on the wall.
    void Wallpapers.color(picture).then(
      (color) => {
        if (active) setWallpaper((current) => (current ? { ...current, color } : current))
      },
      () => {},
    )
    return () => {
      active = false
    }
    // The picture is what this loads; every other setting leaves it alone, and
    // a drag on the padding would otherwise reload it on every frame.
  }, [picture])

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
    void paint(settings.theme, resolved.result.hovers).then((painted) => {
      if (active) setAnnotations(painted)
    })
    return () => {
      active = false
    }
  }, [code, resolved, settings.theme])

  /**
   * Renders the frame away from the page and captures that, so an export
   * carries the artwork rather than the editor's caret, selection, and handles.
   */
  async function draw(capture: Capture) {
    const { code, language, options, settings, title, types } = capture
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
    const picture = named ? await Wallpapers.embed(named.id) : undefined
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
    const capture: Capture = { code, language, options, settings, title, types }
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
    // The one moment the snippet leaves the browser, and only because a link
    // that previews itself has to be one a server can read. A deployment
    // without the store, or a request that fails, still copies a link.
    const text = Links.shorten(state).catch(() => long.toString())
    // Handed over as a promise where that is available: Safari only honors a
    // clipboard write that starts in the gesture that asked for it, and the
    // short link is a round trip away. A browser without `ClipboardItem`
    // throws on the constructor rather than rejecting, so the shape is checked
    // rather than caught.
    const rich =
      typeof ClipboardItem === 'function' && typeof navigator.clipboard.write === 'function'
    const written = rich
      ? navigator.clipboard.write([
          new ClipboardItem({ 'text/plain': text.then((value) => new Blob([value])) }),
        ])
      : text.then((value) => navigator.clipboard.writeText(value))
    void written.catch(() => setNotice('The link could not be copied.'))
  }

  const [measure, rect] = useEdges()

  // The list wraps at both ends, so every step lands on a theme.
  const themeIndex = themes.findIndex((entry) => entry.name === settings.theme)
  const at = (direction: number) => themes[(themeIndex + direction + themes.length) % themes.length]
  const previousTheme = at(-1)
  const nextTheme = at(1)

  // Reads the theme off current state, so the key listener never goes stale.
  function step(direction: number) {
    setSettings((current) => {
      const index = themes.findIndex((entry) => entry.name === current.theme)
      const entry = themes[(index + direction + themes.length) % themes.length]
      return entry ? { ...current, theme: entry.name } : current
    })
  }

  const previousArrow = useRef<HTMLButtonElement>(null)
  const nextArrow = useRef<HTMLButtonElement>(null)
  const [pressed, setPressed] = useState<number>()
  const release = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Themes load their own chunk on first use, so an unvisited one costs a
  // round trip. Warming the list outward from the opening theme keeps every
  // switch after the page settles instant. Runs once: the sweep covers the
  // whole list wherever it starts.
  useEffect(() => {
    const controller = new AbortController()
    void Warm.themes({
      from: settings.theme,
      // The full sweep is a couple of megabytes of chunks, so a metered
      // connection preloads only adjacent themes.
      limit: metered() ? 4 : names.length,
      list: names,
      load: (theme) => renderer.load({ lang: 'tsx', theme }),
      signal: controller.signal,
    })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    function walk(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
      if (!direction || !(event.target instanceof Element)) return
      // A field or a frame handle owns its own arrow keys.
      if (event.target.closest('input, textarea, [role="slider"], [contenteditable]')) return
      event.preventDefault()
      step(direction)
      // Focus the corresponding control and show brief pressed feedback.
      const arrow = direction === -1 ? previousArrow : nextArrow
      arrow.current?.focus()
      setPressed(direction)
      clearTimeout(release.current)
      release.current = setTimeout(() => setPressed(undefined), 140)
    }
    window.addEventListener('keydown', walk)
    return () => {
      clearTimeout(release.current)
      window.removeEventListener('keydown', walk)
    }
  }, [])

  // Override browser defaults for shortcuts advertised by the export menu.
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.altKey || !(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 's' && !event.shiftKey) {
        event.preventDefault()
        save({ scale: 2, type: 'png' })
      } else if (key === 'c' && event.shiftKey) {
        // ⌘ only, as the menu advertises it. Ctrl+Shift+C is the element
        // picker on Windows and Linux, which the page has no business taking.
        if (!event.metaKey) return
        event.preventDefault()
        copyUrl()
      } else if (key === 'c' && !event.shiftKey && !copying(event)) {
        event.preventDefault()
        copyImage()
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [copyImage, copyUrl, save])

  // A dark fill lands on the same near-black the shell mixes to, leaving no
  // visible artwork edge, so the guides carry the crop the whole way across.
  const bleed =
    settings.background === 'none' ||
    (settings.background.startsWith('#') && lightness(settings.background) < 0.2)

  // With no backdrop the window is the whole artwork, so the shell takes the
  // window's own colors and the two read as one surface.
  const canvas = (() => {
    if (!frame) return undefined
    if (settings.background === 'none') return frame.palette.window
    // A chosen color owns the whole surface, so the shell takes a darkened
    // cast of it rather than sitting against an unrelated hue.
    if (settings.background.startsWith('#'))
      return {
        background: `color-mix(in oklab, ${settings.background} 22%, #08080a)`,
        foreground: frame.palette.page.foreground,
      }
    // A picture owns the surface the same way, in the strongest color it holds.
    if (wallpaper?.color)
      return {
        background: `color-mix(in oklab, ${wallpaper.color} 22%, #08080a)`,
        foreground: frame.palette.page.foreground,
      }
    return frame.palette.page
  })()

  return (
    <main
      {...stylex.props(
        styles.page,
        canvas ? styles.canvasColor(canvas) : null,
        canvas && wallpaper
          ? styles.canvasPicture({
              scrim: `color-mix(in oklab, ${canvas.background} 82%, transparent)`,
              source: wallpaper.source,
            })
          : null,
      )}
    >
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

      {rect && (
        <>
          <button
            aria-keyshortcuts="ArrowLeft"
            aria-label={`Previous theme: ${previousTheme?.displayName}`}
            onClick={() => step(-1)}
            onPointerCancel={() => setPressed(undefined)}
            onPointerDown={() => setPressed(-1)}
            onPointerLeave={() => setPressed(undefined)}
            onPointerUp={() => setPressed(undefined)}
            ref={previousArrow}
            type="button"
            {...stylex.props(
              styles.arrow,
              styles.arrowStart,
              styles.arrowAt({
                height: rect.bottom - rect.top,
                top: rect.top,
                width: Math.max(0, rect.left - 12) / 2,
              }),
            )}
          >
            <span {...stylex.props(styles.arrowInner, pressed === -1 && styles.arrowInnerPressed)}>
              <kbd {...stylex.props(styles.arrowKey, text.label10)}>←</kbd>
              <span aria-hidden {...stylex.props(styles.arrowName, text.label12)}>
                {previousTheme?.displayName}
              </span>
            </span>
          </button>
          <button
            aria-keyshortcuts="ArrowRight"
            aria-label={`Next theme: ${nextTheme?.displayName}`}
            onClick={() => step(1)}
            onPointerCancel={() => setPressed(undefined)}
            onPointerDown={() => setPressed(1)}
            onPointerLeave={() => setPressed(undefined)}
            onPointerUp={() => setPressed(undefined)}
            ref={nextArrow}
            type="button"
            {...stylex.props(
              styles.arrow,
              styles.arrowEnd,
              styles.arrowAt({
                height: rect.bottom - rect.top,
                top: rect.top,
                width: Math.max(0, rect.width - rect.right - 12) / 2,
              }),
            )}
          >
            <span
              {...stylex.props(
                styles.arrowInner,
                styles.arrowInnerEnd,
                pressed === 1 && styles.arrowInnerPressed,
              )}
            >
              <kbd {...stylex.props(styles.arrowKey, text.label10)}>→</kbd>
              <span aria-hidden {...stylex.props(styles.arrowName, text.label12)}>
                {nextTheme?.displayName}
              </span>
            </span>
          </button>
        </>
      )}

      <header {...stylex.props(styles.header)}>
        <span {...stylex.props(styles.wordmark, text.heading16)}>monoshot</span>
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
        <div {...stylex.props(styles.actions)}>
          {notice && (
            <span role="status" {...stylex.props(styles.notice, text.copy14)}>
              {notice}
            </span>
          )}
          <ExportMenu onCopyImage={copyImage} onCopyUrl={copyUrl} onSave={save} />
        </div>
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
                background={settings.background}
                onPaddingChange={(padding) => setSettings((current) => ({ ...current, padding }))}
                onTitleChange={setTitle}
                onWidthChange={(width) => setSettings((current) => ({ ...current, width }))}
                padding={settings.padding}
                onRadiusChange={(radius) => setSettings((current) => ({ ...current, radius }))}
                palette={frame.palette}
                radius={settings.radius}
                title={title}
                titleBar={settings.titleBar}
                wallpaper={wallpaper ? { source: wallpaper.source, spread: 'viewport' } : undefined}
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

      <div {...stylex.props(styles.controls)}>
        <div {...stylex.props(styles.controlsInner)}>
          <Toolbar
            resolved={language}
            {...settings}
            onChange={(next) => setSettings((current) => ({ ...current, ...next }))}
          />
        </div>
      </div>
    </main>
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
    const measure = () => {
      const box = node.getBoundingClientRect()
      setRect({
        bottom: box.bottom,
        height: window.innerHeight,
        left: box.left,
        right: box.right,
        top: box.top,
        width: window.innerWidth,
      })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, { passive: true })
    return () => {
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

/** Whether the connection indicates reduced data usage. */
function metered() {
  const { connection } = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean } | undefined
  }
  if (!connection) return false
  return connection.saveData === true || /^(slow-)?2g$/.test(connection.effectiveType ?? '')
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
