import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'
import { Frame as Core, Theme } from 'monoshot'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { types } from '#/lib/annotations.js'
import * as Warm from '#/lib/warm.js'
import { sample } from '#/lib/sample.js'
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
  header: {
    alignItems: 'center',
    display: 'flex',
    height: 56,
    justifyContent: 'space-between',
    paddingInline: 20,
  },
  wordmark: { fontFamily: font.mono },
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
  // The whole guide region beside the artwork is the target; its contents sit
  // at the page edge, chevron outboard and destination name inboard. The band
  // stops short of the artwork so the frame's own width handle stays reachable.
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
  // A key cap carrying the arrow key that does the same thing. Both surfaces
  // mix from the inherited text color, so it sits on any theme's page.
  arrowKey: {
    alignItems: 'center',
    backgroundColor: 'color-mix(in oklab, currentColor 14%, transparent)',
    borderColor: 'color-mix(in oklab, currentColor 30%, transparent)',
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

// One renderer for the page: it caches the themes and languages already loaded.
const renderer = Core.create({ langs: ['tsx'] })
const themes = Theme.list()
const names = themes.map((entry) => entry.name)

function Page() {
  const [settings, setSettings] = useState<
    Toolbar.State & { padding: number; radius: number; width: number }
  >({
    background: 'default',
    lineNumbers: false,
    padding: 64,
    radius: 12,
    theme: 'vitesse-dark',
    titleBar: true,
    width: 640,
  })
  const [title, setTitle] = useState('')
  const [code, setCode] = useState(sample)
  const [frame, setFrame] = useState<{
    palette: Theme.derive.Result
    tokens: Editor.Props['tokens']
  }>()
  const [annotations, setAnnotations] = useState<Editor.Props['types']>({})
  const [error, setError] = useState<Error>()

  // Tokens are the editor's colors, so this reruns on every edit as well as
  // every theme change. Shiki tokenizes synchronously once a theme is loaded.
  useEffect(() => {
    let active = true
    renderer.tokens({ code, lang: 'tsx', theme: settings.theme }).then(
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
  }, [code, settings.theme])

  // Types are painted in the theme's own colors rather than a flat foreground,
  // and their text does not change with the document, so they are tokenized
  // once per theme rather than on every keystroke.
  useEffect(() => {
    let active = true
    Promise.all(
      Object.entries(types).map(async ([name, type]) => {
        const result = await renderer.tokens({ code: type, lang: 'ts', theme: settings.theme })
        return [name, result.tokens] as const
      }),
    ).then((entries) => {
      if (active) setAnnotations(Object.fromEntries(entries))
    })
    return () => {
      active = false
    }
  }, [settings.theme])

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
      // connection gets the neighbours the arrows reach and nothing more.
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
      // Focus the side that fired, so the key press has somewhere to land,
      // and hold the press just long enough to read as one.
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
    return frame.palette.page
  })()

  return (
    <main {...stylex.props(styles.page, canvas ? styles.canvasColor(canvas) : null)}>
      {rect && (
        // With a backdrop the guides stop at the artwork; with nothing to
        // respect at that edge they run the full screen.
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
                width: Math.max(0, rect.left - 12),
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
                width: Math.max(0, rect.width - rect.right - 12),
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
        <ExportMenu />
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
                width={settings.width}
              >
                <Editor
                  code={code}
                  lineNumbers={settings.lineNumbers}
                  onCodeChange={setCode}
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
    // Without the frame there is nothing to crop, so the guides go with it
    // rather than framing whatever the error state renders instead.
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

/** Whether the connection asks callers to go easy on data. */
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
