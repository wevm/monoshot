import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'
import { Frame as Core, Theme } from 'monoshot'
import { useEffect, useState } from 'react'

import { sample } from '#/lib/sample.js'
import { text } from '#/theme/text.js'
import { font } from '../theme/tokens.stylex.js'
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
    fontFamily: font.sans,
    minHeight: '100dvh',
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
  brand: { alignItems: 'baseline', display: 'flex', gap: 8 },
  wordmark: { fontFamily: font.mono },
  tagline: { opacity: 0.6 },
  stage: {
    alignItems: 'center',
    display: 'flex',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  canvas: { maxWidth: 720, width: '100%' },
  // Reserves the frame's footprint so the first highlight does not shift the
  // page, and gives failures somewhere to speak.
  fallback: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
    minHeight: 320,
  },
  controls: { display: 'flex', justifyContent: 'center', paddingBlock: 20, paddingInline: 20 },
})

// One renderer for the page: it caches the themes and languages already loaded.
const renderer = Core.create({ langs: ['tsx'] })

function Page() {
  const [settings, setSettings] = useState<Toolbar.State>({
    background: true,
    lineNumbers: false,
    padding: 64,
    theme: 'vitesse-dark',
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

  // With the backdrop off the window is the whole artwork, so the shell takes
  // the window's own colors and the two read as one surface.
  const canvas = settings.background ? frame?.palette.page : frame?.palette.window

  return (
    <main {...stylex.props(styles.page, canvas ? styles.canvasColor(canvas) : null)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.brand)}>
          <span {...stylex.props(styles.wordmark, text.heading16)}>monoshot</span>
          <span {...stylex.props(styles.tagline, text.copy13)}>code images with types</span>
        </div>
        <ExportMenu />
      </header>

      <div {...stylex.props(styles.stage)}>
        <div {...stylex.props(styles.canvas)}>
          {error ? (
            <div role="alert" {...stylex.props(styles.fallback, text.copy14)}>
              Could not highlight this snippet.
            </div>
          ) : frame ? (
            <Frame
              background={settings.background}
              onTitleChange={setTitle}
              padding={settings.padding}
              palette={frame.palette}
              title={title}
            >
              <Frame.Code html={frame.html} lineNumbers={settings.lineNumbers} />
            </Frame>
          ) : (
            <div {...stylex.props(styles.fallback)} />
          )}
        </div>
      </div>

      <div {...stylex.props(styles.controls)}>
        <Toolbar
          {...settings}
          onChange={(next) => setSettings((current) => ({ ...current, ...next }))}
        />
      </div>
    </main>
  )
}
