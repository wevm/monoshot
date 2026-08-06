import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'
import { Frame as Core, Theme } from 'monoshot'
import { useEffect, useState } from 'react'

import { sample } from '#/lib/sample.js'
import { text } from '#/theme/text.js'
import { Segmented } from '#/ui/Segmented.js'
import { Switch } from '#/ui/Switch.js'
import { color, font } from '../theme/tokens.stylex.js'
import { ExportMenu } from './-components/ExportMenu.js'
import { Frame, frameStyles } from './-components/Frame.js'
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

const paddings = [
  { label: '16', value: '16' },
  { label: '32', value: '32' },
  { label: '64', value: '64' },
  { label: '128', value: '128' },
] as const

function Page() {
  const [padding, setPadding] = useState<(typeof paddings)[number]['value']>('64')
  const [lineNumbers, setLineNumbers] = useState(false)
  const [theme, setTheme] = useState('vitesse-dark')
  const [title, setTitle] = useState('')
  const [frame, setFrame] = useState<{ html: string; palette: Theme.derive.Result }>()

  useEffect(() => {
    let active = true
    Core.render({ code: sample, lang: 'tsx', theme: theme as never }).then((result) => {
      if (active) setFrame({ html: result.html, palette: Theme.derive(result.theme) })
    })
    return () => {
      active = false
    }
  }, [theme])

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
          {frame && (
            <Frame
              onTitleChange={setTitle}
              padding={Number(padding) as 16 | 32 | 64 | 128}
              palette={frame.palette}
              title={title}
            >
              <div
                data-line-numbers={lineNumbers || undefined}
                // Highlighted markup comes from shiki in the library, not user input.
                dangerouslySetInnerHTML={{ __html: frame.html }}
                {...stylex.props(frameStyles.code)}
              />
            </Frame>
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
          <Segmented label="Padding" onChange={setPadding} options={paddings} value={padding} />
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
