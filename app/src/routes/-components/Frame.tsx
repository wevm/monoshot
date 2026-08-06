import * as stylex from '@stylexjs/stylex'
import type { Theme } from 'monoshot'
import type { ReactNode } from 'react'

import { text } from '#/theme/text.js'
import { color, font, radius } from '../../theme/tokens.stylex.js'

const styles = stylex.create({
  // The backdrop and window colors are per-theme, so they arrive as CSS
  // variables set on the root rather than as static token references.
  backdrop: (palette: Palette) => ({
    '--backdrop-from': palette.from,
    '--backdrop-to': palette.to,
    '--window-background': palette.background,
    '--window-border': palette.border,
    '--window-foreground': palette.foreground,
    '--window-title': palette.title,
  }),
  root: {
    backgroundImage: 'linear-gradient(140deg, var(--backdrop-from), var(--backdrop-to))',
    borderRadius: radius.fullscreen,
    display: 'flex',
    justifyContent: 'center',
    transitionDuration: '150ms',
    transitionProperty: 'padding',
  },
  padding16: { padding: 16 },
  padding32: { padding: 32 },
  padding64: { padding: 64 },
  padding128: { padding: 128 },
  window: {
    backgroundColor: 'var(--window-background)',
    borderRadius: radius.floating,
    boxShadow: '0 0 0 1px var(--window-border), 0 24px 48px -12px #00000040',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    width: '100%',
  },
  titleBar: {
    alignItems: 'center',
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    paddingBlock: 12,
    paddingInline: 16,
  },
  lights: { display: 'flex', gap: 8 },
  light: {
    backgroundColor: 'var(--window-border)',
    borderRadius: 999,
    height: 12,
    width: 12,
  },
  title: {
    backgroundColor: 'transparent',
    borderStyle: 'none',
    color: 'var(--window-title)',
    outline: 'none',
    textAlign: 'center',
    width: '100%',
    '::placeholder': { color: 'var(--window-title)' },
  },
  body: { paddingBlock: 4, paddingInline: 16 },
})

const paddings = {
  16: styles.padding16,
  32: styles.padding32,
  64: styles.padding64,
  128: styles.padding128,
}

/** The exported artwork: a gradient backdrop around a themed code window. */
export function Frame(props: Frame.Props) {
  const { children, onTitleChange, padding, palette, title } = props
  return (
    <div
      {...stylex.props(
        styles.root,
        styles.backdrop({
          background: palette.window.background,
          border: palette.window.border,
          foreground: palette.window.foreground,
          from: palette.backdrop.from,
          title: palette.window.title,
          to: palette.backdrop.to,
        }),
        paddings[padding],
      )}
    >
      <div {...stylex.props(styles.window)}>
        <div {...stylex.props(styles.titleBar)}>
          <div {...stylex.props(styles.lights)}>
            <span {...stylex.props(styles.light)} />
            <span {...stylex.props(styles.light)} />
            <span {...stylex.props(styles.light)} />
          </div>
          <input
            aria-label="Title"
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="untitled"
            spellCheck={false}
            value={title}
            {...stylex.props(styles.title, text.label13)}
          />
        </div>
        <div {...stylex.props(styles.body)}>{children}</div>
      </div>
    </div>
  )
}

export declare namespace Frame {
  type Props = {
    children: ReactNode
    onTitleChange: (title: string) => void
    padding: 16 | 32 | 64 | 128
    palette: Theme.derive.Result
    title: string
  }
}

type Palette = {
  background: string
  border: string
  foreground: string
  from: string
  title: string
  to: string
}

export const frameStyles = stylex.create({
  code: {
    fontFamily: font.mono,
    fontSize: 14,
    lineHeight: '22px',
    // Ligatures would break the 1:1 metrics the editor relies on later.
    fontVariantLigatures: 'none',
    overflowX: 'auto',
    paddingBlock: 12,
    tabSize: 2,
  },
  placeholder: { color: color.gray700 },
})
