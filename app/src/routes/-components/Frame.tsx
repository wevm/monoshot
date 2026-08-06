import * as stylex from '@stylexjs/stylex'
import { MotionConfig, motion as m } from 'motion/react'
import type { Theme } from 'monoshot'
import type { ReactNode } from 'react'

import { text } from '#/theme/text.js'
import { font, motion, radius, shadow } from '../../theme/tokens.stylex.js'

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
  // Square by design: the artwork's edge is the image's edge, so only the
  // window inside it is rounded.
  root: {
    display: 'flex',
    justifyContent: 'center',
    transitionDuration: motion.medium,
    transitionProperty: 'padding, background-image',
    transitionTimingFunction: motion.out,
  },
  backdrop: {
    backgroundImage:
      'linear-gradient(var(--backdrop-angle), var(--backdrop-from), var(--backdrop-to))',
  },
  padding: (value: number) => ({ padding: value }),
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
  // Without the title bar the code needs its own breathing room at the top.
  bodyBare: { paddingBlock: 8 },
})

/** The exported artwork: a gradient backdrop around a themed code window. */
export function Frame(props: Frame.Props) {
  const { background, children, onTitleChange, padding, palette, title, titleBar } = props
  return (
    <MotionConfig reducedMotion="user">
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
          background && styles.backdrop,
          styles.padding(padding),
        )}
      >
        <m.div layout transition={spring} {...stylex.props(styles.window, styles.windowShadow)}>
          {titleBar && (
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
          )}
          <m.div
            layout
            transition={spring}
            {...stylex.props(styles.body, !titleBar && styles.bodyBare)}
          >
            {children}
          </m.div>
        </m.div>
      </div>
    </MotionConfig>
  )
}

/** Matches the toolbar, so the whole surface settles at one rate. */
const spring = { bounce: 0.18, duration: 0.4, type: 'spring' } as const

export declare namespace Frame {
  /** Props for {@link Frame}. */
  type Props = {
    /** Paints the gradient backdrop. Off exports the window alone. */
    background: boolean
    children: ReactNode
    onTitleChange: (title: string) => void
    /** Space around the window, in pixels. */
    padding: number
    palette: Theme.derive.Result
    /** Title-bar text. Empty shows the placeholder. */
    title: string
    /** Shows the window chrome: traffic lights and the title field. */
    titleBar: boolean
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
