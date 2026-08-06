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
  guide: {
    borderColor: 'currentColor',
    borderStyle: 'dashed',
    opacity: 0.15,
    position: 'absolute',
  },
  guideRow: (top: number) => ({ borderTopWidth: 1, insetInline: 0, top }),
  guideColumn: (left: number) => ({ borderLeftWidth: 1, insetBlock: 0, left }),
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
    background: true,
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

  // With the backdrop off the window is the whole artwork, so the shell takes
  // the window's own colors and the two read as one surface.
  const canvas = settings.background ? frame?.palette.page : frame?.palette.window

  return (
    <main {...stylex.props(styles.page, canvas ? styles.canvasColor(canvas) : null)}>
      {rect && (
        <div aria-hidden {...stylex.props(styles.guides)}>
          <span {...stylex.props(styles.guide, styles.guideRow(rect.top))} />
          <span {...stylex.props(styles.guide, styles.guideRow(rect.bottom))} />
          <span {...stylex.props(styles.guide, styles.guideColumn(rect.left))} />
          <span {...stylex.props(styles.guide, styles.guideColumn(rect.right))} />
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
  const [rect, setRect] = useState<{ bottom: number; left: number; right: number; top: number }>()

  useLayoutEffect(() => {
    if (!node) return
    const measure = () => {
      const box = node.getBoundingClientRect()
      setRect({ bottom: box.bottom, left: box.left, right: box.right, top: box.top })
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
