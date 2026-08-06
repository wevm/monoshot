import * as stylex from '@stylexjs/stylex'
import { AnimatePresence, MotionConfig, motion as m } from 'motion/react'
import type { Theme } from 'monoshot'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import { useEffect, useRef, useState } from 'react'

import { text } from '#/theme/text.js'
import { color, font, motion, radius, shadow } from '../../theme/tokens.stylex.js'

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
  // Holds the canvas and its resize handles, and reveals them on approach:
  // a 20px strip is too small to find by hovering it directly. They surface
  // faintly over the whole frame and come up to full only for the one being
  // reached for, so the artwork stays the thing you are looking at.
  root: {
    '--handle-opacity': { default: 0, ':hover': 0.45 },
    position: 'relative',
  },
  // Two pairs of grips, each centered on the edge it moves: the artwork's top
  // and bottom edges open the space around the window, and the window's left
  // and right edges size the artwork. The inner pair tracks the padding, which
  // is exactly where the window's edges sit inside the canvas.
  handles: { pointerEvents: 'none', position: 'absolute' },
  handlesOuter: { insetBlock: -10, insetInline: 0 },
  handlesInner: (padding: number) => ({ insetBlock: padding, insetInline: padding - 10 }),
  // Square by design: the artwork's edge is the image's edge, so only the
  // window inside it is rounded.
  canvas: {
    alignItems: 'center',
    display: 'grid',
    justifyItems: 'center',
    overflow: 'hidden',
    transitionDuration: motion.medium,
    transitionProperty: 'padding, background-image, background-color',
    transitionTimingFunction: motion.out,
    // `MotionConfig` governs Motion components, not this CSS transition, so
    // the preference has to be honored here too.
    '@media (prefers-reduced-motion: reduce)': { transitionDuration: '0s' },
  },
  // A drag has to land on the pointer, not ease toward it: the easing would
  // trail every move and leave the handles off their edges mid-gesture.
  dragging: { transitionDuration: '0s' },
  width: (value: number) => ({ width: value }),
  // Grab targets sit on the edge and stay out of the way until pointed at.
  handle: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderStyle: 'none',
    display: 'flex',
    justifyContent: 'center',
    opacity: { default: 'var(--handle-opacity)', ':hover': 1, ':focus-visible': 1 },
    outline: 'none',
    padding: 0,
    pointerEvents: 'auto',
    position: 'absolute',
    touchAction: 'none',
    transitionDuration: motion.fast,
    transitionProperty: 'opacity',
    transitionTimingFunction: motion.out,
  },
  handleX: { cursor: 'ew-resize', insetBlock: 0, width: 20 },
  handleY: { cursor: 'ns-resize', height: 20, insetInline: 0 },
  // The cross-axis inset above already pins the other pair, so naming both
  // sides here keeps one rule working for either orientation.
  handleStart: { left: 0, top: 0 },
  handleEnd: { bottom: 0, right: 0 },
  // Reads against any theme's backdrop, so it takes the fixed chrome color
  // rather than a scheme-dependent one.
  grip: {
    backgroundColor: color.onChrome,
    borderRadius: 999,
    boxShadow: shadow.floating,
  },
  gripX: { height: 40, width: 4 },
  gripY: { height: 4, width: 40 },
  backdrop: {
    backgroundImage:
      'linear-gradient(var(--backdrop-angle), var(--backdrop-from), var(--backdrop-to))',
  },
  fill: (value: string) => ({ backgroundColor: value }),
  padding: (value: number) => ({ padding: value }),
  window: {
    backgroundColor: 'var(--window-background)',
    borderRadius: radius.code,
    boxShadow: '0 0 0 1px var(--window-border), var(--window-shadow)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    width: '100%',
  },
  windowShadow: { '--window-shadow': shadow.window },
  // Collapses to nothing, so the window height follows it continuously.
  titleBarShell: { overflow: 'hidden' },
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
    // Round, as window controls are everywhere else.
    borderRadius: 999,
    height: 12,
    width: 12,
  },
  title: {
    backgroundColor: 'transparent',
    borderRadius: 0,
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
  const {
    background,
    children,
    onPaddingChange,
    onTitleChange,
    onWidthChange,
    padding,
    palette,
    title,
    titleBar,
    width,
  } = props

  const [dragging, setDragging] = useState(false)

  // Leave the theme arrows and their labels a gutter, but never let a narrow
  // viewport drag the artwork smaller than it already is. Route components are
  // client-only, so the server branch is a fallback rather than a real case.
  const widthMax =
    typeof window === 'undefined' ? 1280 : Math.max(width, Math.min(1280, window.innerWidth - 320))
  // The window keeps a usable width whatever the artwork is sized to. Both
  // bounds move together, so neither handle can squeeze the code away.
  const paddingMax = Math.min(160, Math.max(0, Math.floor((width - 240) / 2)))
  const widthMin = Math.max(360, padding * 2 + 240)

  return (
    <MotionConfig reducedMotion="user">
      <div {...stylex.props(styles.root, styles.width(width))}>
        <div
          {...stylex.props(
            styles.canvas,
            dragging && styles.dragging,
            styles.palette({
              angle: palette.backdrop.angle,
              background: palette.window.background,
              border: palette.window.border,
              from: palette.backdrop.from,
              title: palette.window.title,
              to: palette.backdrop.to,
            }),
            background === 'default' ? styles.backdrop : null,
            background.startsWith('#') ? styles.fill(background) : null,
            styles.padding(padding),
          )}
        >
          <div {...stylex.props(styles.window, styles.windowShadow)}>
            <AnimatePresence initial={false}>
              {titleBar && (
                <m.div
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  initial={{ height: 0, opacity: 0 }}
                  transition={spring}
                  {...stylex.props(styles.titleBarShell)}
                >
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
                </m.div>
              )}
            </AnimatePresence>
            <div {...stylex.props(styles.body, !titleBar && styles.bodyBare)}>{children}</div>
          </div>
        </div>
        {/* Padding grows on every side at once, so the artwork's own edge
            keeps pace with the pointer. */}
        <div {...stylex.props(styles.handles, styles.handlesOuter)}>
          <Handle
            axis="y"
            edge="start"
            factor={-1}
            label="Padding, top edge"
            onDragging={setDragging}
            max={paddingMax}
            min={0}
            onChange={onPaddingChange}
            step={8}
            value={padding}
          />
          <Handle
            axis="y"
            edge="end"
            factor={1}
            label="Padding, bottom edge"
            onDragging={setDragging}
            max={paddingMax}
            min={0}
            onChange={onPaddingChange}
            step={8}
            value={padding}
          />
        </div>
        {/* Both window edges move together, so the artwork stays centered
            under the pointer and grows at twice its pace. */}
        <div {...stylex.props(styles.handles, styles.handlesInner(padding))}>
          <Handle
            axis="x"
            edge="start"
            factor={-2}
            label="Frame width, left edge"
            onDragging={setDragging}
            max={widthMax}
            min={widthMin}
            onChange={onWidthChange}
            step={16}
            value={width}
          />
          <Handle
            axis="x"
            edge="end"
            factor={2}
            label="Frame width, right edge"
            onDragging={setDragging}
            max={widthMax}
            min={widthMin}
            onChange={onWidthChange}
            step={16}
            value={width}
          />
        </div>
      </div>
    </MotionConfig>
  )
}

/** One draggable edge, setting a value from pointer travel along one axis. */
function Handle(props: Handle.Props) {
  const { axis, edge, factor, label, max, min, onChange, onDragging, step, value } = props

  const clamp = (next: number) => Math.round(Math.min(max, Math.max(min, next)))
  const along = (event: { clientX: number; clientY: number }) =>
    axis === 'x' ? event.clientX : event.clientY

  // Pointer capture keeps the drag alive past the handle's own bounds.
  function begin(event: ReactPointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    onDragging(true)
    const start = along(event)
    const move = (next: PointerEvent) => onChange(clamp(value + (along(next) - start) * factor))
    const end = () => {
      onDragging(false)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
    }
    window.addEventListener('pointercancel', end)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
  }

  // A pointer-only handle strands keyboard users, so the pair doubles as a
  // slider: right and up raise the value whichever edge holds focus.
  function nudge(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      onChange(event.key === 'Home' ? min : max)
      return
    }
    const direction =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -1
          : 0
    if (!direction) return
    event.preventDefault()
    onChange(clamp(value + direction * step))
  }

  return (
    <button
      aria-label={label}
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      onKeyDown={nudge}
      onPointerDown={begin}
      aria-orientation={axis === 'x' ? 'horizontal' : 'vertical'}
      role="slider"
      type="button"
      {...stylex.props(
        styles.handle,
        axis === 'x' ? styles.handleX : styles.handleY,
        edge === 'start' ? styles.handleStart : styles.handleEnd,
      )}
    >
      <span {...stylex.props(styles.grip, axis === 'x' ? styles.gripX : styles.gripY)} />
    </button>
  )
}

declare namespace Handle {
  type Props = {
    /** Axis the handle travels along. */
    axis: 'x' | 'y'
    edge: 'start' | 'end'
    /** Value change per pixel of pointer travel, signed by which edge moves. */
    factor: number
    label: string
    max: number
    min: number
    onChange: (value: number) => void
    /** Reports whether a pointer drag is in progress. */
    onDragging: (dragging: boolean) => void
    /** Keyboard increment. */
    step: number
    value: number
  }
}

/** Matches the toolbar, so the whole surface settles at one rate. */
const spring = { bounce: 0.18, duration: 0.4, type: 'spring' } as const

export declare namespace Frame {
  /** Props for {@link Frame}. */
  type Props = {
    /**
     * `default` paints the theme's gradient, `none` leaves the frame
     * transparent, and a hex color fills it flat.
     */
    background: string
    children: ReactNode
    /** Receives the dragged padding, in pixels. */
    onPaddingChange: (padding: number) => void
    onTitleChange: (title: string) => void
    /** Receives the dragged width, in pixels. */
    onWidthChange: (width: number) => void
    /** Space around the window, in pixels. */
    padding: number
    palette: Theme.derive.Result
    /** Title-bar text. Empty shows the placeholder. */
    title: string
    /** Shows the window chrome: traffic lights and the title field. */
    titleBar: boolean
    /** Artwork width, in pixels. */
    width: number
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
    const { html, lineNumbers, query } = props
    const root = useRef<HTMLDivElement>(null)

    // The `^?` line is not code: twoslash drops it and puts the type in its
    // place. Rebuilding the line in the DOM keeps that block in flow, so it
    // lands in an export exactly as it reads here.
    useEffect(() => {
      let consumed = 0
      let last = 0
      for (const line of root.current?.querySelectorAll<HTMLElement>('.line') ?? []) {
        const caret = /^(\s*\/\/\s*)\^\?\s*$/.exec(line.textContent ?? '')
        if (!caret) {
          // Every consumed query line shifts the numbering of the rest up.
          // A converted line has no number left to read, and the effect runs
          // twice in development.
          const number = Number(line.dataset['line'])
          if (!Number.isFinite(number)) continue
          if (consumed) line.dataset['line'] = String(number - consumed)
          last = Math.max(last, number - consumed)
          continue
        }
        consumed += 1
        line.classList.add('twoslash-query')
        // The block takes no line number: the query was never code.
        line.removeAttribute('data-line')
        line.style.setProperty('--twoslash-column', String(caret[1]?.length ?? 0))
        line.textContent = ''
        const body = document.createElement('span')
        body.textContent = query
        line.appendChild(body)
      }
      // A fixed two-character gutter clips the leading digit past line 99.
      root.current?.style.setProperty('--gutter', `${String(Math.max(last, 10)).length}ch`)
    }, [html, query])

    return (
      <div
        data-line-numbers={lineNumbers || undefined}
        dangerouslySetInnerHTML={{ __html: html }}
        ref={root}
        {...stylex.props(code.root)}
      />
    )
  }

  export declare namespace Code {
    type Props = {
      html: string
      lineNumbers?: boolean | undefined
      /** Type the snippet's `^?` query resolves to. */
      query: string
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
