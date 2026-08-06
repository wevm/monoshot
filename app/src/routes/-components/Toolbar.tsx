import { Slider } from '@base-ui/react/slider'
import * as stylex from '@stylexjs/stylex'
import { AnimatePresence, MotionConfig, motion as m } from 'motion/react'
import { Theme } from 'monoshot'
import { useEffect, useRef, useState } from 'react'

import { text } from '#/theme/text.js'
import { color, motion, shadow } from '../../theme/tokens.stylex.js'

const themes = Theme.list()

const styles = stylex.create({
  root: {
    display: 'flex',
    maxWidth: 'min(720px, 100%)',
    // The bar alone sizes the stack; the panel is anchored to it, so a long
    // row of colors scrolls inside that width instead of stretching it.
    position: 'relative',
    width: 'max-content',
  },
  panel: { bottom: 'calc(100% + 8px)', insetInline: 0, position: 'absolute' },
  surface: {
    backgroundColor: color.chrome,
    // Square, like the artwork it controls.
    borderRadius: 0,
    boxShadow: shadow.floating,
    overflow: 'hidden',
  },
  bar: { alignItems: 'center', display: 'flex', gap: 2, padding: 6 },
  // Two lines: what the control is, and what it is set to.
  item: {
    alignItems: 'flex-start',
    backgroundColor: { default: 'transparent', ':hover': color.chromeHover },
    borderStyle: 'none',
    borderRadius: 0,
    boxShadow: { default: null, ':focus-visible': shadow.focusRing },
    color: color.onChrome,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    outline: 'none',
    paddingBlock: 8,
    paddingInline: 14,
    textAlign: 'start',
    transform: { default: 'scale(1)', ':active': 'scale(0.97)' },
    transitionDuration: motion.fast,
    transitionProperty: 'background-color, transform',
    transitionTimingFunction: motion.out,
    whiteSpace: 'nowrap',
  },
  itemOpen: { backgroundColor: color.chromeActive },
  itemTitle: { color: color.onChromeSecondary },
  itemValue: { color: color.onChrome },
  // The row is exactly one line tall and clips, so a rolling character can
  // never ride up over the label above it.
  rollRow: { display: 'flex', lineHeight: 1.4, overflow: 'hidden', position: 'relative' },
  // One cell per character; both the outgoing and incoming glyph share it, so
  // the row keeps its width while a character changes.
  rollCell: { display: 'grid', justifyItems: 'center', position: 'relative' },
  rollGlyph: { gridArea: '1 / 1', whiteSpace: 'pre' },
  divider: { backgroundColor: color.chromeHover, flexShrink: 0, marginBlock: 8, width: 1 },
  sliderRow: { alignItems: 'center', display: 'flex', gap: 16, padding: 16 },
  colorRow: { alignItems: 'center', display: 'flex', gap: 5, overflowX: 'auto', padding: 12 },
  swatchButton: {
    borderStyle: 'none',
    borderRadius: 6,
    boxShadow: { default: null, ':focus-visible': shadow.focusRing },
    cursor: 'pointer',
    flexShrink: 0,
    height: 24,
    outline: 'none',
    padding: 0,
    position: 'relative',
    // Touch reports a hover on tap, so the grow is pointer-gated.
    transform: {
      default: 'scale(1)',
      '@media (hover: hover) and (pointer: fine)': { default: 'scale(1)', ':hover': 'scale(1.14)' },
      ':active': 'scale(0.96)',
    },
    transitionDuration: motion.fast,
    transitionProperty: 'transform',
    transitionTimingFunction: motion.out,
    width: 24,
  },
  // Sits outside the swatch so the color underneath stays unobscured.
  swatchRing: {
    borderRadius: 8,
    boxShadow: '0 0 0 2px #f5f5f7',
    inset: -3,
    pointerEvents: 'none',
    position: 'absolute',
  },
  swatchColor: (value: string) => ({ backgroundColor: value }),
  // Stands for the theme's own gradient rather than a flat color.
  swatchDefault: { backgroundImage: 'linear-gradient(140deg, #6f5233, #2a1c0f)' },
  // The transparency checker, drawn rather than imported.
  swatchNone: {
    backgroundColor: '#ffffff',
    backgroundImage:
      'linear-gradient(45deg, #b0b0b0 25%, transparent 25% 75%, #b0b0b0 75%), linear-gradient(45deg, #b0b0b0 25%, transparent 25% 75%, #b0b0b0 75%)',
    backgroundPosition: '0 0, 7px 7px',
    backgroundSize: '14px 14px',
  },
  swatchCustom: {
    backgroundImage:
      'conic-gradient(#d64541, #e8a33a, #f2d04b, #4caf6a, #2f9ec4, #4258d6, #a855c7, #d64541)',
    display: 'grid',
    placeItems: 'center',
  },
  colorInput: { height: '100%', inset: 0, opacity: 0, position: 'absolute', width: '100%' },
  srOnly: {
    clipPath: 'inset(50%)',
    height: 1,
    overflow: 'hidden',
    position: 'absolute',
    whiteSpace: 'nowrap',
    width: 1,
  },
  slider: { display: 'flex', flex: 1 },
  track: { backgroundColor: color.chromeHover, height: 4, width: '100%' },
  indicator: { backgroundColor: color.onChrome },
  thumb: {
    backgroundColor: color.onChrome,
    // Round, like the physical control it stands in for.
    borderRadius: 999,
    boxShadow: { default: shadow.thumb, ':focus-visible': shadow.focusRing },
    height: 16,
    outline: 'none',
    transform: {
      default: 'scale(1)',
      '@media (hover: hover) and (pointer: fine)': { default: 'scale(1)', ':hover': 'scale(1.15)' },
      ':active': 'scale(1.25)',
    },
    transitionDuration: motion.fast,
    transitionProperty: 'transform',
    transitionTimingFunction: motion.out,
    width: 16,
  },
  value: { color: color.onChrome, minWidth: 40, textAlign: 'right' },
  label: { color: color.onChromeSecondary },
  themeList: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 260,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    paddingBlock: 6,
  },
  theme: {
    alignItems: 'center',
    backgroundColor: { default: 'transparent', ':hover': color.chromeHover },
    borderStyle: 'none',
    borderRadius: 0,
    boxShadow: { default: null, ':focus-visible': shadow.focusRing },
    color: color.onChromeSecondary,
    cursor: 'pointer',
    display: 'flex',
    gap: 10,
    outline: 'none',
    paddingBlock: 8,
    paddingInline: 16,
    textAlign: 'start',
    transitionDuration: motion.fast,
    transitionProperty: 'background-color, color',
    transitionTimingFunction: motion.out,
    whiteSpace: 'nowrap',
  },
  themeSelected: { backgroundColor: color.chromeActive, color: color.onChrome },
  swatch: (background: string) => ({
    backgroundColor: background,
    borderRadius: 0,
    boxShadow: '0 0 0 1px #ffffff24',
    flexShrink: 0,
    height: 12,
    width: 12,
  }),
})

/**
 * The control surface, in the shape of Apple's markup bar: the bar stays put
 * and a panel opens above it, spanning its width.
 */
export function Toolbar(props: Toolbar.Props) {
  const { background, lineNumbers, onChange, padding, theme, titleBar } = props
  const [panel, setPanel] = useState<Panel>()
  // A dragged value changes many times a second. Morphing every step reads as
  // flicker, so the label follows a slower sample of it.
  const shownPadding = useThrottled(padding, 140)
  const previousPadding = usePrevious(shownPadding)
  const themeIndex = themes.findIndex((entry) => entry.name === theme)
  const previousThemeIndex = usePrevious(themeIndex)
  const selected = Theme.info(theme)

  // Clicking the open control closes it, so the bar is its own dismiss target.
  const toggle = (next: Panel) => setPanel((current) => (current === next ? undefined : next))

  return (
    <MotionConfig reducedMotion="user">
      <div {...stylex.props(styles.root)}>
        <AnimatePresence initial={false}>
          {panel && (
            <m.div
              animate={{ filter: 'blur(0px)', height: 'auto', opacity: 1 }}
              exit={{ filter: 'blur(6px)', height: 0, opacity: 0 }}
              initial={{ filter: 'blur(6px)', height: 0, opacity: 0 }}
              key={panel}
              // Height keeps the spring so the bar is pushed rather than
              // revealed; the blur and fade resolve faster than the movement.
              transition={{ ...spring, filter: fade, opacity: fade }}
              {...stylex.props(styles.panel, styles.surface)}
            >
              {panel === 'theme' ? (
                <div {...stylex.props(styles.themeList)}>
                  {themes.map((entry) => (
                    <button
                      key={entry.name}
                      onClick={() => onChange({ theme: entry.name })}
                      ref={entry.name === theme ? reveal : null}
                      type="button"
                      {...stylex.props(
                        styles.theme,
                        text.copy13,
                        entry.name === theme && styles.themeSelected,
                      )}
                    >
                      <span {...stylex.props(styles.swatch(swatches[entry.type]))} />
                      {entry.displayName}
                    </button>
                  ))}
                </div>
              ) : panel === 'background' ? (
                <div {...stylex.props(styles.colorRow)}>
                  <button
                    onClick={() => onChange({ background: 'default' })}
                    type="button"
                    {...stylex.props(styles.swatchButton, styles.swatchDefault)}
                  >
                    <span {...stylex.props(styles.srOnly)}>Default</span>
                    {background === 'default' && <Ring />}
                  </button>
                  <button
                    onClick={() => onChange({ background: 'none' })}
                    type="button"
                    {...stylex.props(styles.swatchButton, styles.swatchNone)}
                  >
                    <span {...stylex.props(styles.srOnly)}>None</span>
                    {background === 'none' && <Ring />}
                  </button>
                  <div {...stylex.props(styles.divider)} />
                  {backgrounds.map((value) => (
                    <button
                      key={value}
                      onClick={() => onChange({ background: value })}
                      type="button"
                      {...stylex.props(styles.swatchButton, styles.swatchColor(value))}
                    >
                      <span {...stylex.props(styles.srOnly)}>{value}</span>
                      {background === value && <Ring />}
                    </button>
                  ))}
                  <div {...stylex.props(styles.divider)} />
                  <label {...stylex.props(styles.swatchButton, styles.swatchCustom)}>
                    <span {...stylex.props(styles.srOnly)}>Custom color</span>
                    <input
                      onChange={(event) => onChange({ background: event.target.value })}
                      type="color"
                      value={background.startsWith('#') ? background : '#3b82d6'}
                      {...stylex.props(styles.colorInput)}
                    />
                  </label>
                </div>
              ) : (
                <div {...stylex.props(styles.sliderRow)}>
                  <span {...stylex.props(styles.label, text.label13)}>Padding</span>
                  <Slider.Root
                    max={160}
                    min={0}
                    onValueChange={(value) => onChange({ padding: value as number })}
                    step={2}
                    value={padding}
                    {...stylex.props(styles.slider)}
                  >
                    <Slider.Control {...stylex.props(styles.slider)}>
                      <Slider.Track {...stylex.props(styles.track)}>
                        <Slider.Indicator {...stylex.props(styles.indicator)} />
                        <Slider.Thumb {...stylex.props(styles.thumb)} />
                      </Slider.Track>
                    </Slider.Control>
                  </Slider.Root>
                  <Roll
                    digits
                    style={[styles.value, text.copy13]}
                    up={shownPadding >= previousPadding}
                    value={String(shownPadding)}
                  />
                </div>
              )}
            </m.div>
          )}
        </AnimatePresence>

        <m.div layout transition={spring} {...stylex.props(styles.surface, styles.bar)}>
          <Item
            onClick={() => toggle('theme')}
            open={panel === 'theme'}
            title="Theme"
            up={themeIndex <= previousThemeIndex}
            value={selected?.displayName ?? theme}
          />
          <Item
            digits
            onClick={() => toggle('padding')}
            open={panel === 'padding'}
            title="Padding"
            up={shownPadding >= previousPadding}
            value={String(shownPadding)}
          />
          <div {...stylex.props(styles.divider)} />
          <Item
            onClick={() => onChange({ lineNumbers: !lineNumbers })}
            pressed={lineNumbers}
            up
            title="Line numbers"
            value={lineNumbers ? 'On' : 'Off'}
          />
          <Item
            onClick={() => toggle('background')}
            open={panel === 'background'}
            title="Background"
            up
            value={backgroundLabel(background)}
          />
          <Item
            onClick={() => onChange({ titleBar: !titleBar })}
            pressed={titleBar}
            up
            title="Title bar"
            value={titleBar ? 'On' : 'Off'}
          />
        </m.div>
      </div>
    </MotionConfig>
  )
}

export declare namespace Toolbar {
  /** Props for {@link Toolbar}. */
  type Props = State & {
    /** Receives only the settings that changed. */
    onChange: (next: Partial<State>) => void
  }

  /** Everything the toolbar can change. */
  type State = {
    /** `default`, `none`, or a hex color for the frame's backdrop. */
    background: string
    lineNumbers: boolean
    /** Frame padding, in pixels. */
    padding: number
    theme: Theme.Info['name']
    /** Whether the window shows its title bar. */
    titleBar: boolean
  }
}

type Panel = 'theme' | 'padding' | 'background' | undefined

/** `default` paints the theme's gradient; `none` exports a transparent frame. */
export const backgrounds = [
  '#1c1c1e',
  '#8e8e93',
  '#ffffff',
  '#8e3a34',
  '#d64541',
  '#e8833a',
  '#e8a33a',
  '#f2d04b',
  '#4caf6a',
  '#3aab8f',
  '#3b82d6',
  '#4258d6',
  '#a855c7',
  '#d6478f',
] as const

/** Reads a background value as the label shown on the bar. */
function backgroundLabel(background: string) {
  if (background === 'default') return 'Default'
  if (background === 'none') return 'None'
  return background.toUpperCase()
}

/** Settles quickly without overshooting into wobble. */
const spring = { bounce: 0.18, duration: 0.4, type: 'spring' } as const

/** Strong ease-out: the panel resolves early instead of drifting into focus. */
const fade = { duration: 0.18, ease: [0.23, 1, 0.32, 1] } as const

/** Keeps the last value so a change knows which way to roll. */
function usePrevious<value>(value: value): value {
  const previous = useRef(value)
  useEffect(() => {
    previous.current = value
  }, [value])
  return previous.current
}

/**
 * A value that rolls out of view while its replacement rolls in behind it.
 *
 * `digits` splits the value so each position animates only when its own
 * character changes, the way an odometer leaves settled digits alone. Words
 * roll whole: a shared letter staying put would break the wheel.
 */
function Roll(props: {
  digits?: boolean | undefined
  style: stylex.StyleXStyles[]
  up: boolean
  value: string
}) {
  const { digits, style, up, value } = props
  const offset = up ? '-100%' : '100%'
  const from = up ? '100%' : '-100%'
  // Every change gets a fresh key, so a value returning while its predecessor
  // is still leaving enters as a new glyph from below instead of reversing the
  // one in flight. Digits keep their character as the key: an unchanged digit
  // has nothing to animate.
  const [seen, setSeen] = useState({ count: 0, value })
  if (seen.value !== value) setSeen({ count: seen.count + 1, value })
  return (
    <span {...stylex.props(styles.rollRow, style)}>
      {(digits ? [...value] : [value]).map((character, index) => (
        // Position is the identity here: the character is the animating key.
        // eslint-disable-next-line react/no-array-index-key
        <span key={index} {...stylex.props(styles.rollCell)}>
          <AnimatePresence initial={false} mode="popLayout">
            <m.span
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: offset }}
              initial={{ opacity: 0, y: from }}
              key={digits ? character : `${character}-${seen.count}`}
              transition={roll}
              {...stylex.props(styles.rollGlyph)}
            >
              {character}
            </m.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  )
}

/**
 * The selection ring. One element shared across every swatch, so choosing a
 * color slides it from the old swatch to the new rather than blinking across.
 */
function Ring() {
  return <m.span layoutId="swatch-ring" transition={ring} {...stylex.props(styles.swatchRing)} />
}

/**
 * The ring overshoots its target and settles back. The travel is the whole
 * point of a shared indicator, so it is allowed the follow-through that other
 * surfaces here deliberately avoid.
 */
const ring = { bounce: 0.42, duration: 0.55, type: 'spring' } as const

/** Short and firm: the value should land, not float. */
const roll = { damping: 30, stiffness: 420, type: 'spring' } as const

/**
 * Samples a fast-changing value on an interval so each morph can finish. The
 * trailing update always runs, so the label settles on the real value.
 */
function useThrottled<value>(value: value, ms: number): value {
  const [shown, setShown] = useState(value)
  const last = useRef(0)

  useEffect(() => {
    const elapsed = Date.now() - last.current
    if (elapsed >= ms) {
      last.current = Date.now()
      setShown(value)
      return
    }
    const timer = setTimeout(() => {
      last.current = Date.now()
      setShown(value)
    }, ms - elapsed)
    return () => clearTimeout(timer)
  }, [ms, value])

  return shown
}

/**
 * Centers the selected theme in the list. Sets `scrollTop` directly because
 * `scrollIntoView` walks up and scrolls the page too.
 */
function reveal(node: HTMLButtonElement | null) {
  const scroller = node?.parentElement
  if (!node || !scroller) return
  scroller.scrollTop = node.offsetTop - scroller.clientHeight / 2 + node.clientHeight / 2
}

const swatches = { dark: '#1c1c1c', light: '#f5f5f5' }

function Item(props: {
  /** Rolls each character on its own, for values that read as a number. */
  digits?: boolean | undefined
  onClick: () => void
  open?: boolean
  pressed?: boolean
  title: string
  /** Direction the value rolls: up for a larger or enabled value. */
  up: boolean
  value: string
}) {
  const { digits, onClick, open, pressed, title, up, value } = props
  return (
    <m.button
      // Two stacked spans would otherwise read as one run-together name.
      aria-expanded={open}
      aria-label={`${title}: ${value}`}
      aria-pressed={pressed}
      layout
      onClick={onClick}
      transition={spring}
      type="button"
      {...stylex.props(styles.item, open && styles.itemOpen)}
    >
      <span {...stylex.props(styles.itemTitle, text.label12)}>{title}</span>
      <Roll digits={digits} style={[styles.itemValue, text.button14]} up={up} value={value} />
    </m.button>
  )
}
