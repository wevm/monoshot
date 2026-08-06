import * as stylex from '@stylexjs/stylex'
import type { Theme } from 'monoshot'
import type { ReactNode } from 'react'

import { text } from '#/theme/text.js'
import { font, radius, shadow } from '../../theme/tokens.stylex.js'

/** Padding presets, in pixels. The single source for both the styles and the control. */
export const paddings = [16, 32, 64, 128] as const

export type Padding = (typeof paddings)[number]

const styles = stylex.create({
  // Backdrop and window colors are per-theme, so they arrive as CSS variables
  // set on the root rather than as static token references.
  palette: (palette: Palette) => ({
    '--backdrop-angle': `${palette.angle}deg`,
    '--backdrop-from': palette.from,
    '--backdrop-to': palette.to,
    '--window-background': palette.background,
    '--window-border': palette.border,
    '--window-title': palette.title,
  }),
  root: {
    backgroundImage:
      'linear-gradient(var(--backdrop-angle), var(--backdrop-from), var(--backdrop-to))',
    borderRadius: radius.fullscreen,
    display: 'flex',
    justifyContent: 'center',
  },
  padding16: { padding: 16 },
  padding32: { padding: 32 },
  padding64: { padding: 64 },
  padding128: { padding: 128 },
  window: {
    backgroundColor: 'var(--window-background)',
    borderRadius: radius.floating,
    boxShadow: '0 0 0 1px var(--window-border), var(--window-shadow)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    width: '100%',
  },
  windowShadow: { '--window-shadow': shadow.window },
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
    borderRadius: 4,
    borderStyle: 'none',
    color: 'var(--window-title)',
    outline: 'none',
    boxShadow: { default: null, ':focus-visible': shadow.focusRing },
    textAlign: 'center',
    width: '100%',
    '::placeholder': { color: 'var(--window-title)' },
  },
  body: { paddingBlock: 4, paddingInline: 16 },
})

const paddingStyles = {
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
        styles.palette({
          angle: palette.backdrop.angle,
          background: palette.window.background,
          border: palette.window.border,
          from: palette.backdrop.from,
          title: palette.window.title,
          to: palette.backdrop.to,
        }),
        paddingStyles[padding],
      )}
    >
      <div {...stylex.props(styles.window, styles.windowShadow)}>
        <div {...stylex.props(styles.titleBar)}>
          <div aria-hidden {...stylex.props(styles.lights)}>
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
    padding: Padding
    palette: Theme.derive.Result
    title: string
  }
}

type Palette = {
  angle: number
  background: string
  border: string
  from: string
  title: string
  to: string
}

export namespace Frame {
  /**
   * The highlighted code surface. Markup comes from shiki, which escapes the
   * source when it serializes, so arbitrary user code is safe to inject here.
   */
  export function Code(props: Code.Props) {
    return (
      <div
        data-line-numbers={props.lineNumbers || undefined}
        dangerouslySetInnerHTML={{ __html: props.html }}
        {...stylex.props(code.root)}
      />
    )
  }

  export declare namespace Code {
    type Props = {
      html: string
      lineNumbers?: boolean | undefined
    }
  }
}

const code = stylex.create({
  root: {
    fontFamily: font.mono,
    fontSize: 14,
    lineHeight: '22px',
    // Ligatures would break the 1:1 metrics the editor relies on later.
    fontVariantLigatures: 'none',
    overflowX: 'auto',
    paddingBlock: 12,
    tabSize: 2,
  },
})
