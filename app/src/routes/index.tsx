import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'
import { Frame as Core, Theme } from 'monoshot'
import { useEffect, useMemo, useState } from 'react'

import { sample } from '#/lib/sample.js'
import { text } from '#/theme/text.js'
import { Segmented } from '#/ui/Segmented.js'
import { Switch } from '#/ui/Switch.js'
import { color, font } from '../theme/tokens.stylex.js'
import { ExportMenu } from './-components/ExportMenu.js'
import { Frame, paddings } from './-components/Frame.js'
import type { Padding } from './-components/Frame.js'
import { ThemePicker } from './-components/ThemePicker.js'

export const Route = createFileRoute('/')({
  component: Page,
})

const styles = stylex.create({
  page: {
    backgroundColor: color.backgroundSecondary,
    color: color.gray1000,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: font.sans,
    minHeight: '100dvh',
  },
  header: {
    alignItems: 'center',
    display: 'flex',
    height: 56,
    justifyContent: 'space-between',
    paddingInline: 20,
  },
  brand: { alignItems: 'baseline', display: 'flex', gap: 8 },
  wordmark: { fontFamily: font.mono },
  tagline: { color: color.gray900 },
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
    borderRadius: 16,
    color: color.gray900,
    display: 'flex',
    justifyContent: 'center',
    minHeight: 320,
  },
  skeleton: { backgroundColor: color.grayAlpha100 },
  controls: {
    alignItems: 'center',
    display: 'flex',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'center',
    paddingBlock: 20,
    paddingInline: 20,
  },
  control: { alignItems: 'center', display: 'flex', gap: 8 },
  controlLabel: { color: color.gray900 },
})

const paddingOptions = paddings.map((value) => ({ label: String(value), value }))

function Page() {
  const [padding, setPadding] = useState<Padding>(64)
  const [lineNumbers, setLineNumbers] = useState(false)
  const [theme, setTheme] = useState<Theme.Info['name']>('vitesse-dark')
  const [title, setTitle] = useState('')
  const [frame, setFrame] = useState<{ html: string; palette: Theme.derive.Result }>()
  const [error, setError] = useState<Error>()

  // One renderer per mount: it caches the themes and languages already loaded.
  const renderer = useMemo(() => Core.create({ langs: ['tsx'] }), [])

  useEffect(() => {
    let active = true
    renderer.render({ code: sample, lang: 'tsx', theme }).then(
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
  }, [renderer, theme])

  return (
    <main {...stylex.props(styles.page)}>
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
            <Frame onTitleChange={setTitle} padding={padding} palette={frame.palette} title={title}>
              <Frame.Code html={frame.html} lineNumbers={lineNumbers} />
            </Frame>
          ) : (
            <div {...stylex.props(styles.fallback, styles.skeleton)} />
          )}
        </div>
      </div>

      <div {...stylex.props(styles.controls)}>
        <div {...stylex.props(styles.control)}>
          <span {...stylex.props(styles.controlLabel, text.label13)}>Theme</span>
          <ThemePicker onChange={setTheme} value={theme} />
        </div>
        <div {...stylex.props(styles.control)}>
          <span {...stylex.props(styles.controlLabel, text.label13)}>Padding</span>
          <Segmented
            label="Padding"
            onChange={setPadding}
            options={paddingOptions}
            value={padding}
          />
        </div>
        <div {...stylex.props(styles.control)}>
          <span {...stylex.props(styles.controlLabel, text.label13)}>Line numbers</span>
          <Switch
            aria-label="Line numbers"
            checked={lineNumbers}
            onCheckedChange={setLineNumbers}
          />
        </div>
      </div>
    </main>
  )
}
