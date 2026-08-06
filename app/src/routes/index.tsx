import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'
import { Frame as Core, Theme } from 'monoshot'
import { useEffect, useLayoutEffect, useState } from 'react'

import { sample } from '#/lib/sample.js'
import { text } from '#/theme/text.js'
import { font, motion } from '../theme/tokens.stylex.js'
import { ExportMenu } from './-components/ExportMenu.js'
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
  canvas: { maxWidth: 720, width: '100%' },
  // Crop guides: dashed lines continuing the artwork's edges across the
  // viewport. Fixed and measured, so they never add to the page's own size.
  guides: { inset: 0, pointerEvents: 'none', position: 'fixed' },
  // A hairline drawn as a background rather than a border, so it stays exactly
  // one device-independent pixel and the dashes keep an even rhythm.
  guide: { opacity: 0.2, position: 'absolute' },
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
  // Floats over the artwork so opening a taller panel never reflows the page.
  controls: {
    bottom: 24,
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

function Page() {
  const [settings, setSettings] = useState<Toolbar.State>({
    background: 'default',
    lineNumbers: false,
    padding: 64,
    theme: 'vitesse-dark',
    titleBar: true,
  })
  const [title, setTitle] = useState('')
  const [frame, setFrame] = useState<{ html: string; palette: Theme.derive.Result }>()
  const [error, setError] = useState<Error>()

  useEffect(() => {
    let active = true
    renderer.render({ code: sample, lang: 'tsx', theme: settings.theme }).then(
      (result) => {
        if (!active) return
        setError(undefined)
        setFrame({ html: result.html, palette: Theme.derive(result.theme) })
      },
      (cause: Error) => {
        if (active) setError(cause)
      },
    )
    return () => {
      active = false
    }
  }, [settings.theme])

  const [measure, rect] = useEdges()

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
        // With a backdrop the guides stop at the artwork; with a transparent
        // frame there is no edge to respect, so they run the full screen.
        <div aria-hidden {...stylex.props(styles.guides)}>
          {[rect.top, rect.bottom].map((top) =>
            (settings.background === 'none'
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
            (settings.background === 'none'
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
                onTitleChange={setTitle}
                padding={settings.padding}
                palette={frame.palette}
                title={title}
                titleBar={settings.titleBar}
              >
                <Frame.Code html={frame.html} lineNumbers={settings.lineNumbers} />
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
    if (!node) return
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
