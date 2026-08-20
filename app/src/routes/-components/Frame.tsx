import * as stylex from '@stylexjs/stylex'
import { AnimatePresence, MotionConfig, motion as m } from 'motion/react'
import { Codec, Theme } from 'monoshot'
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from 'react'
import { createContext, useEffect, useLayoutEffect, useRef, useState } from 'react'

import * as Backgrounds from '#/lib/backgrounds.js'
import { ignore } from '#/lib/export.js'
import * as Wallpapers from '#/lib/wallpapers.js'
import { text } from '#/theme/text.js'
import { Tooltip } from '#/ui/Tooltip.js'
import {
  code as metrics,
  color,
  crossfade,
  font,
  motion,
  shadow,
} from '../../theme/tokens.stylex.js'

const styles = stylex.create({
  // Backdrop and window colors are per-theme, so they arrive as CSS variables
  // set on the root rather than as static token references.
  palette: (palette: Palette) => ({
    '--window-background': palette.background,
    '--window-border': palette.border,
    '--window-title': palette.title,
  }),
  // Reveal resize handles across the frame because their 20px edge targets are
  // difficult to discover directly. Emphasize only the active handle.
  root: {
    '--handle-opacity': { default: 0, ':hover': 0.45 },
    position: 'relative',
  },
  responsive: {
    maxWidth: {
      default: 'calc(100vw - 20px)',
      '@media (min-width: 800px)': 'calc(100vw - 400px)',
    },
  },
  intrinsic: {
    '--code-annotation-max-width': 'none',
    minWidth: 320,
    width: 'max-content',
  },
  responsiveIntrinsic: { minWidth: 'min(360px, calc(100vw - 20px))' },
  // Grips take the opposite polarity from the artwork, so they read on a light
  // theme as well as a dark one, with a hairline in the other direction to
  // hold them against a backdrop of similar lightness.
  // The strip of controls beside the code, which sits outside the window: the
  // window clips, so a control inside it could never reach past its edge.
  // Above the theme arrows, whose hit area reaches across the artwork's margin
  // and would otherwise swallow the controls standing in it.
  aside: { inset: 0, pointerEvents: 'none', position: 'absolute', zIndex: 3 },
  // Read by the controls, which are drawn outside the canvas the palette is set
  // on and so cannot inherit it from there.
  asidePalette: (palette: { background: string; border: string; foreground: string }) => ({
    // The mark hues come from the library, so the controls beside a line, the
    // decorations in the editor, and the exported image cannot disagree.
    '--mark-add': Theme.marks.add,
    '--mark-remove': Theme.marks.remove,
    '--window-border': palette.border,
    '--window-foreground': palette.foreground,
    '--window-surface': palette.background,
  }),
  gripPalette: (light: boolean) => ({
    '--grip': light ? color.chrome : color.onChrome,
    '--grip-edge': light ? 'rgb(255 255 255 / 0.5)' : 'rgb(0 0 0 / 0.5)',
  }),
  // Two pairs of grips, each centered on the edge it moves: the artwork's top
  // and bottom edges open the space around the window, and the window's left
  // and right edges size the artwork. The inner pair tracks the padding, which
  // is exactly where the window's edges sit inside the canvas.
  handles: { pointerEvents: 'none', position: 'absolute' },
  handlesOuter: { insetBlock: -10, insetInline: 0 },
  handlesInner: (padding: number) => ({ insetBlock: padding, insetInline: padding - 10 }),
  // The width pair overhangs the window by half a grip; the corner grip needs
  // the window's own box to sit the same distance from both edges.
  handlesWindow: (padding: number) => ({ insetBlock: padding, insetInline: padding }),
  // Square by design: the artwork's edge is the image's edge, so only the
  // window inside it is rounded.
  canvas: {
    alignItems: 'center',
    display: 'grid',
    justifyItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  // A drag has to land on the pointer, not ease toward it: the easing would
  // trail every move and leave the handles off their edges mid-gesture.
  dragging: { transitionDuration: '0s' },
  width: (value: number) => ({ width: value }),
  widthLimit: (value: number) => ({ maxWidth: value }),
  // Resize targets remain transparent until hovered or focused.
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
  handleCorner: { bottom: 0, cursor: 'nwse-resize', height: 30, right: 0, width: 30 },
  // The cross-axis inset above already pins the other pair, so naming both
  // sides here keeps one rule working for either orientation.
  handleStart: { left: 0, top: 0 },
  handleEnd: { bottom: 0, right: 0 },
  grip: {
    backgroundColor: 'var(--grip)',
    borderRadius: 999,
    filter: 'drop-shadow(0 0 1px var(--grip-edge))',
  },
  gripX: { height: 40, width: 3 },
  gripY: { height: 3, width: 40 },
  // A right angle tracing the corner it sets: the bracket's own curve follows
  // the radius, so the control shows the value it holds.
  gripCorner: (value: number) => ({
    // Without this the 3px borders sit outside the box and the bracket lands
    // off the corner it is supposed to trace.
    boxSizing: 'border-box',
    borderBottomStyle: 'solid',
    // The same stroke the bar grips use, so the set reads as one family.
    borderBottomWidth: 3,
    borderColor: 'var(--grip)',
    borderEndEndRadius: value,
    borderRightStyle: 'solid',
    borderRightWidth: 3,
    filter: 'drop-shadow(0 0 1px var(--grip-edge))',
    height: '100%',
    width: '100%',
  }),
  backgroundLayer: { inset: 0, pointerEvents: 'none', position: 'absolute' },
  backdrop: (palette: { angle: number; from: string; to: string }) => ({
    backgroundImage: `linear-gradient(${palette.angle}deg, ${palette.from}, ${palette.to})`,
  }),
  // Crop and center the image within the artwork bounds.
  wallpaper: (picture: { attachment: 'fixed' | 'scroll'; source: string }) => ({
    backgroundAttachment: picture.attachment,
    backgroundImage: `url("${picture.source}")`,
    backgroundPosition: 'center',
    backgroundSize: 'cover',
  }),
  padding: (value: number) => ({ padding: value }),
  window: {
    backgroundColor: 'var(--window-background)',
    boxShadow: '0 0 0 1px var(--window-border), var(--window-shadow)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    position: 'relative',
    width: '100%',
  },
  radius: (value: number) => ({ borderRadius: value }),
  windowShadow: { '--window-shadow': shadow.window },
  // Hide overflow so the window height tracks the animated title bar.
  titleBarShell: { overflow: 'hidden' },
  titleBar: {
    alignItems: 'center',
    display: 'grid',
    gridTemplateColumns: '64px minmax(0, 1fr) 64px',
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
    minWidth: 0,
    outline: 'none',
    overflow: 'hidden',
    textAlign: 'center',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    width: '100%',
    '::placeholder': { color: 'var(--window-title)' },
  },
  body: { paddingBlock: 4, paddingInline: 'var(--editor-inset)' },
  // Reserve top padding for code when the title bar is hidden.
  bodyBare: { paddingBlock: 8 },
})

/** The exported artwork: a gradient backdrop around a themed code window. */
export function Frame(props: Frame.Props) {
  const {
    background,
    children,
    onPaddingChange,
    onRadiusChange,
    onTitleChange,
    onWidthChange,
    padding,
    palette,
    radius,
    responsive,
    maxWidth,
    title,
    titleBar,
    wallpaper,
    width,
  } = props

  const [dragging, setDragging] = useState(false)
  // Held in state rather than a ref: what draws into it is a child, which has to
  // render again once the element exists.
  const [aside, setAside] = useState<HTMLDivElement | null>(null)
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const [measured, setMeasured] = useState(Frame.minWidth(padding))

  // The editor itself keeps the same dimensions when padding moves its rail
  // host, so CodeMirror has no geometry change from which to remeasure it.
  useLayoutEffect(() => {
    aside?.dispatchEvent(new Event('framegeometrychange'))
  }, [aside, padding, width])

  // Intrinsic width remains state rather than becoming a saved setting. The
  // frame can then keep following the longest line until a handle fixes it.
  useLayoutEffect(() => {
    if (!root) return
    const measure = () => setMeasured(root.getBoundingClientRect().width)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [root])

  // Fixed widths share the codec's ceiling. Intrinsic frames follow the
  // longest line until the live stage bound, then pin there on first resize.
  const value = Math.min(width ?? measured, maxWidth ?? widthCeiling, widthCeiling)

  // Leave the theme arrows and their labels a gutter, but never let a narrow
  // viewport drag the artwork smaller than it already is. Route components are
  // client-only, so the server branch is a fallback rather than a real case.
  const widthMax =
    maxWidth ??
    (typeof window === 'undefined'
      ? 1280
      : Math.max(value, Math.min(1280, window.innerWidth - 320)))
  const paddingMax = maxWidth
    ? Frame.maxPaddingFor(maxWidth, value - padding * 2)
    : Frame.maxPadding(value)
  const widthMin = Frame.minWidth(padding)
  const customGradient = Backgrounds.gradient(background)
  const backgroundKey = customGradient
    ? 'gradient'
    : background.startsWith('#')
      ? 'color'
      : wallpaper
        ? `${background}:${wallpaper.source}`
        : background === 'default' || Wallpapers.names(background)
          ? `${background}:${palette.backdrop.angle}:${palette.backdrop.from}:${palette.backdrop.to}`
          : background
  const backgroundAnimation = customGradient
    ? {
        backgroundImage: `linear-gradient(135deg, ${customGradient[0]}, ${customGradient[1]})`,
        opacity: 1,
      }
    : background.startsWith('#')
      ? { backgroundColor: background, opacity: 1 }
      : { opacity: 1 }

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={setRoot}
        {...stylex.props(
          styles.root,
          styles.asidePalette({
            background: palette.window.background,
            border: palette.window.border,
            foreground: palette.window.foreground,
          }),
          styles.gripPalette(palette.type === 'light'),
          responsive && styles.responsive,
          width === undefined ? styles.intrinsic : styles.width(value),
          maxWidth !== undefined && styles.widthLimit(maxWidth),
          responsive && width === undefined && styles.responsiveIntrinsic,
        )}
      >
        <div
          {...stylex.props(
            styles.canvas,
            dragging && styles.dragging,
            styles.palette({
              background: palette.window.background,
              border: palette.window.border,
              title: palette.window.title,
            }),
            styles.padding(padding),
          )}
        >
          <AnimatePresence initial={false}>
            <m.div
              animate={backgroundAnimation}
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key={backgroundKey}
              transition={crossfade}
              {...stylex.props(
                styles.backgroundLayer,
                // Use the theme backdrop while an image loads. Every named
                // picture, including one that disappeared, gets this fallback.
                !wallpaper && (background === 'default' || Wallpapers.names(background))
                  ? styles.backdrop(palette.backdrop)
                  : null,
                wallpaper
                  ? styles.wallpaper({
                      attachment: wallpaper.spread === 'viewport' ? 'fixed' : 'scroll',
                      source: wallpaper.source,
                    })
                  : null,
              )}
            />
          </AnimatePresence>
          <div {...stylex.props(styles.window, styles.radius(radius), styles.windowShadow)}>
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
                    {/* Read-only without a handler, so the copy an export
                        serializes carries the title rather than a field the
                        viewer of a saved SVG can type into. */}
                    <input
                      aria-label="Title"
                      onChange={(event) => onTitleChange?.(event.target.value)}
                      placeholder="untitled"
                      readOnly={!onTitleChange}
                      spellCheck={false}
                      tabIndex={onTitleChange ? undefined : -1}
                      value={title}
                      {...stylex.props(styles.title, text.label13)}
                    />
                  </div>
                </m.div>
              )}
            </AnimatePresence>
            <div {...stylex.props(styles.body, !titleBar && styles.bodyBare)}>
              <Frame.Aside.Provider value={aside}>{children}</Frame.Aside.Provider>
            </div>
          </div>
        </div>
        <div ref={setAside} {...stylex.props(styles.aside)} />
        {/* Padding grows on every side at once, so the artwork's own edge
            keeps pace with the pointer. */}
        <div {...{ [ignore]: '' }} {...stylex.props(styles.handles, styles.handlesOuter)}>
          <Handle
            axis="y"
            edge="start"
            factor={-1}
            hint="Padding"
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
            hint="Padding"
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
        <div {...{ [ignore]: '' }} {...stylex.props(styles.handles, styles.handlesInner(padding))}>
          <Handle
            axis="x"
            edge="start"
            factor={-2}
            hint="Width"
            label="Frame width, left edge"
            onDragging={setDragging}
            max={widthMax}
            min={widthMin}
            onChange={onWidthChange}
            step={16}
            value={value}
          />
          <Handle
            axis="x"
            edge="end"
            factor={2}
            hint="Width"
            label="Frame width, right edge"
            onDragging={setDragging}
            max={widthMax}
            min={widthMin}
            onChange={onWidthChange}
            step={16}
            value={value}
          />
        </div>
        <div {...{ [ignore]: '' }} {...stylex.props(styles.handles, styles.handlesWindow(padding))}>
          <Handle
            axis="xy"
            edge="end"
            factor={-2}
            hint="Radius"
            label="Corner radius"
            max={24}
            min={0}
            onChange={onRadiusChange}
            onDragging={setDragging}
            step={4}
            value={radius}
          />
        </div>
      </div>
    </MotionConfig>
  )
}

/** One draggable edge, setting a value from pointer travel along one axis. */
function Handle(props: Handle.Props) {
  const { axis, edge, factor, hint, label, max, min, onChange, onDragging, step, value } = props

  const clamp = (next: number) => Math.round(Math.min(max, Math.max(min, next)))
  // The corner grip travels on the diagonal, so it averages both axes.
  const along = (event: { clientX: number; clientY: number }) =>
    axis === 'x'
      ? event.clientX
      : axis === 'y'
        ? event.clientY
        : (event.clientX + event.clientY) / 2

  // A drag outlives the events that started it, so its listeners have to come
  // off if the handle is unmounted mid-gesture.
  const release = useRef<(() => void) | undefined>(undefined)
  useEffect(() => () => release.current?.(), [])

  // Pointer capture keeps the drag alive past the handle's own bounds.
  function begin(event: ReactPointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    onDragging(true)
    const start = along(event)
    const move = (next: PointerEvent) => onChange(clamp(value + (along(next) - start) * factor))
    const end = () => {
      release.current = undefined
      onDragging(false)
      window.removeEventListener('pointercancel', end)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
    }
    release.current = end
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
    <Tooltip label={hint ?? label}>
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
          axis === 'xy' ? styles.handleCorner : null,
          axis === 'x' ? styles.handleX : axis === 'y' ? styles.handleY : null,
          axis === 'xy' ? null : edge === 'start' ? styles.handleStart : styles.handleEnd,
        )}
      >
        <span
          {...stylex.props(
            axis === 'xy' ? styles.gripCorner(value) : styles.grip,
            axis === 'x' ? styles.gripX : axis === 'y' ? styles.gripY : null,
          )}
        />
      </button>
    </Tooltip>
  )
}

declare namespace Handle {
  type Props = {
    /** Axis the handle travels along; `xy` is the corner diagonal. */
    axis: 'x' | 'y' | 'xy'
    edge: 'start' | 'end'
    /** Value change per pixel of pointer travel, signed by which edge moves. */
    factor: number
    /** Accessible name identifying the resized edge and region. */
    label: string
    /** Short tooltip label when the accessible name requires more detail. */
    hint?: string | undefined
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

/** Spring settings shared with the toolbar. */
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
    /** Receives the typed title. Left out, the title field is read-only. */
    onTitleChange?: ((title: string) => void) | undefined
    /** Receives the dragged width, in pixels. */
    onWidthChange: (width: number) => void
    /** Space around the window, in pixels. */
    padding: number
    palette: Theme.derive.Result
    /** Receives the dragged corner radius, in pixels. */
    onRadiusChange: (radius: number) => void
    /** Corner radius of the code window, in pixels. */
    radius: number
    /** Largest artwork width that fits in the live editor stage. */
    maxWidth?: number | undefined
    /** Constrains the live editor to the viewport. Export frames remain at their requested width. */
    responsive?: boolean | undefined
    /** Title-bar text. Empty shows the placeholder. */
    title: string
    /** Shows the window chrome: traffic lights and the title field. */
    titleBar: boolean
    /**
     * Loaded picture for a `wallpaper:` background. `viewport` aligns it with
     * the page background; `artwork` limits it to the exported frame.
     */
    wallpaper?: { source: string; spread: 'artwork' | 'viewport' } | undefined
    /** Artwork width in pixels, or intrinsic to the longest line when omitted. */
    width?: number | undefined
  }
}

type Palette = {
  background: string
  border: string
  title: string
}

/** The most padding the frame takes, however wide the artwork is. */
const paddingCeiling = 160

/** Largest fixed width the shared frame codec accepts. */
const widthCeiling = Codec.bounds.width.max

export namespace Frame {
  /**
   * Portal target for controls that sit outside the clipped code window.
   */
  export const Aside = createContext<HTMLElement | null>(null)

  /** The largest padding that still leaves the window a usable width. */
  export function maxPadding(width: number) {
    return Math.min(paddingCeiling, Math.max(0, Math.floor((width - 240) / 2)))
  }

  /** The largest padding that preserves a window width within an outer bound. */
  export function maxPaddingFor(width: number, windowWidth: number) {
    return Math.min(paddingCeiling, Math.max(0, Math.floor((width - windowWidth) / 2)))
  }

  /** The narrowest artwork the window stays usable in, at this padding. */
  export function minWidth(padding: number) {
    return Math.max(360, padding * 2 + 240)
  }

  /**
   * Returns renderable frame dimensions. If padding leaves insufficient code
   * width, this function increases the artwork width.
   */
  export function fit(size: { padding: number; width: number }) {
    const padding = Math.min(paddingCeiling, Math.max(0, size.padding))
    return { padding, width: Math.max(size.width, minWidth(padding)) }
  }

  /**
   * Renders highlighted markup from Shiki, which escapes source text before
   * serialization. The markup and optional CSS already contain annotations.
   */
  export function Code(props: Code.Props) {
    const { css, html } = props

    return (
      <div
        ref={(node) => {
          if (!node) return
          // Resolve the custom property because exports serialize computed styles
          // without resolving nested custom-property references.
          const inset = getComputedStyle(node).getPropertyValue('--editor-inset')
          node.style.setProperty('--body-inset', inset)
        }}
        {...stylex.props(code.root)}
      >
        {css ? <style>{css}</style> : null}
        {/* eslint-disable-next-line */}
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    )
  }

  export declare namespace Code {
    type Props = {
      /** Styles the annotated markup needs, when the render produced any. */
      css?: string | undefined
      html: string
    }
  }
}

// Exported frames use fixed metrics. Editor custom properties shrink on mobile,
// but exports must remain device-independent.
const code = stylex.create({
  root: {
    fontFamily: font.mono,
    fontSize: metrics.size,
    lineHeight: metrics.line,
    // Ligatures would break the 1:1 metrics the editor relies on later.
    fontVariantLigatures: 'none',
    // The frame owns overflow: fixed widths wrap, while an intrinsic frame
    // expands to the longest line without adding a scrollbar to the picture.
    paddingBlock: metrics.padding,
    tabSize: metrics.tab,
  },
})
