import * as stylex from '@stylexjs/stylex'
import { AnimatePresence, MotionConfig, motion as m } from 'motion/react'
import { Theme } from 'monoshot'
import type { BundledLanguage } from 'shiki'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'

import * as detect from '#/lib/detect.js'
import { text } from '#/theme/text.js'
import { color, motion, shadow } from '../../theme/tokens.stylex.js'

const themes = Theme.list()

/** The key that reaches each control from anywhere on the page. */
const shortcuts = {
  background: 'b',
  language: 'a',
  lineNumbers: 'l',
  theme: 't',
  titleBar: 'w',
} as const

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
  // The color row is a fixed set of chips, so it sizes to them and centers on
  // the bar. Matching the bar would stretch or squeeze it every time the theme
  // name changes length.
  panelFit: {
    insetInline: 'auto auto',
    left: '50%',
    maxWidth: 'calc(100vw - 40px)',
    transform: 'translateX(-50%)',
    width: 'max-content',
  },
  surface: {
    backdropFilter: 'blur(32px) saturate(180%)',
    backgroundColor: {
      default: color.chromeTranslucent,
      '@media (prefers-reduced-transparency: reduce)': color.chrome,
    },
    // Square, like the artwork it controls.
    borderRadius: 0,
    boxShadow: shadow.floating,
    overflow: 'hidden',
  },
  // The items keep their min-content widths, so a phone-width bar scrolls
  // rather than pushing its trailing controls past the viewport.
  bar: {
    alignItems: 'center',
    display: 'flex',
    gap: 2,
    maxWidth: '100%',
    overflowX: 'auto',
    padding: 6,
    scrollbarWidth: 'none',
  },
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
  itemOpen: { backgroundColor: color.chromeHover },
  itemHeading: { alignItems: 'center', display: 'flex', gap: 6 },
  itemTitle: { color: color.onChromeSecondary },
  // The key that reaches this control, in the same cap the theme arrows use.
  itemKey: {
    alignItems: 'center',
    backgroundColor: 'color-mix(in oklab, currentColor 14%, transparent)',
    borderColor: 'color-mix(in oklab, currentColor 30%, transparent)',
    borderStyle: 'solid',
    borderWidth: 1,
    color: color.onChromeSecondary,
    display: 'flex',
    height: 13,
    justifyContent: 'center',
    minWidth: 13,
    paddingInline: 2,
    textTransform: 'uppercase',
  },
  itemValue: { color: color.onChrome },
  // The row is exactly one line tall and clips, so a rolling character can
  // never ride up over the label above it.
  rollRow: { display: 'flex', lineHeight: 1.4, overflow: 'hidden', position: 'relative' },
  // One cell per character; both the outgoing and incoming glyph share it, so
  // the row keeps its width while a character changes.
  rollCell: { display: 'grid', justifyItems: 'center', position: 'relative' },
  rollGlyph: { gridArea: '1 / 1', whiteSpace: 'pre' },
  divider: { backgroundColor: color.chromeHover, flexShrink: 0, marginBlock: 8, width: 1 },
  colorRow: { alignItems: 'center', display: 'flex', gap: 5, overflowX: 'auto', padding: 12 },
  swatchButton: {
    borderStyle: 'none',
    borderRadius: 6,
    // A hairline edge, so a near-black chip still reads against the panel.
    boxShadow: {
      default: 'inset 0 0 0 1px rgb(255 255 255 / 0.14)',
      ':focus-visible': shadow.focusRing,
    },
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
    boxShadow: `0 0 0 2px ${color.onChrome}`,
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
    // The input inside is transparent, so the label carries its focus ring.
    boxShadow: { default: null, ':focus-within': shadow.focusRing },
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
  list: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 260,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    paddingBlock: 6,
  },
  option: {
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
    transform: { default: 'scale(1)', ':active': 'scale(0.97)' },
    transitionDuration: motion.fast,
    transitionProperty: 'background-color, color, transform',
    transitionTimingFunction: motion.out,
    whiteSpace: 'nowrap',
  },
  optionSelected: { backgroundColor: color.chromeActive, color: color.onChrome },
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
  const { background, language, lineNumbers, onChange, resolved, theme, titleBar } = props
  const [panel, setPanel] = useState<Panel>()
  // A hex the palette does not carry belongs to the custom picker.
  const custom = background.startsWith('#') && !backgrounds.includes(background as never)
  const swatchIndex = backgroundIndex(background)
  const previousSwatchIndex = usePrevious(swatchIndex)
  const travel = Math.abs(swatchIndex - previousSwatchIndex) * swatchStride
  const themeIndex = themes.findIndex((entry) => entry.name === theme)
  const previousThemeIndex = usePrevious(themeIndex)
  const selected = Theme.info(theme)

  // Clicking the open control closes it, so the bar is its own dismiss target.
  const toggle = (next: Panel) => setPanel((current) => (current === next ? undefined : next))

  const surface = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)

  // Standard dismissal for a panel that is not a Base UI popup: Escape from
  // anywhere, and a press that lands outside the toolbar.
  useEffect(() => {
    if (!panel) return
    function dismiss(event: Event) {
      if (event.target instanceof Node && root.current?.contains(event.target)) return
      setPanel(undefined)
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') setPanel(undefined)
    }
    window.addEventListener('keydown', escape)
    window.addEventListener('pointerdown', dismiss)
    return () => {
      window.removeEventListener('keydown', escape)
      window.removeEventListener('pointerdown', dismiss)
    }
  }, [panel])

  // Reaching a control by key should leave the keyboard where the work is, so
  // opening a panel moves focus onto the option already in effect.
  useEffect(() => {
    if (!panel) return
    const options = surface.current?.querySelectorAll<HTMLElement>('[data-option]')
    if (!options?.length) return
    const current = [...options].find((option) => option.dataset['option'] === 'selected')
    ;(current ?? options[0])?.focus()
  }, [panel])

  // The panel owns the arrow keys while it is open, so the page's own theme
  // stepping never fires underneath it.
  function navigate(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      setPanel(undefined)
      // Hand the keyboard back to the control that opened the panel.
      if (panel)
        bar.current
          ?.querySelector<HTMLElement>(`[aria-keyshortcuts="${shortcuts[panel]}"]`)
          ?.focus()
      return
    }
    const step =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? -1
          : 0
    const options = [...(surface.current?.querySelectorAll<HTMLElement>('[data-option]') ?? [])]
    const index = options.indexOf(document.activeElement as HTMLElement)
    if (!step || index < 0) return
    event.preventDefault()
    event.stopPropagation()
    options[(index + step + options.length) % options.length]?.focus()
  }

  useEffect(() => {
    function press(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (
        event.target instanceof Element &&
        event.target.closest('input, textarea, [contenteditable]')
      )
        return
      const shortcut = event.key.toLowerCase()
      if (shortcut === shortcuts.theme) toggle('theme')
      else if (shortcut === shortcuts.background) toggle('background')
      else if (shortcut === shortcuts.language) toggle('language')
      else if (shortcut === shortcuts.lineNumbers) onChange({ lineNumbers: !lineNumbers })
      else if (shortcut === shortcuts.titleBar) onChange({ titleBar: !titleBar })
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', press)
    return () => window.removeEventListener('keydown', press)
  })

  return (
    <MotionConfig reducedMotion="user">
      <div ref={root} {...stylex.props(styles.root)}>
        <AnimatePresence initial={false}>
          {panel && (
            <m.div
              animate={{ filter: 'blur(0px)', height: 'auto', opacity: 1 }}
              exit={{ filter: 'blur(6px)', height: 0, opacity: 0 }}
              initial={{ filter: 'blur(6px)', height: 0, opacity: 0 }}
              key={panel}
              onKeyDown={navigate}
              ref={surface}
              // Height keeps the spring so the bar is pushed rather than
              // revealed; the blur and fade resolve faster than the movement.
              transition={{ ...spring, filter: fade, opacity: fade }}
              {...stylex.props(
                styles.panel,
                panel === 'background' && styles.panelFit,
                styles.surface,
              )}
            >
              {panel === 'theme' ? (
                <div {...stylex.props(styles.list)}>
                  {themes.map((entry) => (
                    <button
                      aria-pressed={entry.name === theme}
                      data-option={entry.name === theme ? 'selected' : ''}
                      key={entry.name}
                      onClick={() => onChange({ theme: entry.name })}
                      onFocus={() => onChange({ theme: entry.name })}
                      ref={entry.name === theme ? reveal : null}
                      type="button"
                      {...stylex.props(
                        styles.option,
                        text.copy13,
                        entry.name === theme && styles.optionSelected,
                      )}
                    >
                      <span {...stylex.props(styles.swatch(swatches[entry.type]))} />
                      {entry.displayName}
                    </button>
                  ))}
                </div>
              ) : panel === 'language' ? (
                <div {...stylex.props(styles.list)}>
                  <button
                    aria-pressed={language === 'auto'}
                    data-option={language === 'auto' ? 'selected' : ''}
                    onClick={() => onChange({ language: 'auto' })}
                    onFocus={() => onChange({ language: 'auto' })}
                    type="button"
                    {...stylex.props(
                      styles.option,
                      text.copy13,
                      language === 'auto' && styles.optionSelected,
                    )}
                  >
                    Auto
                  </button>
                  {detect.languages.map((entry) => (
                    <button
                      aria-pressed={entry.id === language}
                      data-option={entry.id === language ? 'selected' : ''}
                      key={entry.id}
                      onClick={() => onChange({ language: entry.id })}
                      onFocus={() => onChange({ language: entry.id })}
                      ref={entry.id === language ? reveal : null}
                      type="button"
                      {...stylex.props(
                        styles.option,
                        text.copy13,
                        entry.id === language && styles.optionSelected,
                      )}
                    >
                      {entry.title}
                    </button>
                  ))}
                </div>
              ) : panel === 'background' ? (
                <div {...stylex.props(styles.colorRow)}>
                  <button
                    aria-pressed={background === 'default'}
                    data-option={background === 'default' ? 'selected' : ''}
                    onClick={() => onChange({ background: 'default' })}
                    onFocus={() => onChange({ background: 'default' })}
                    type="button"
                    {...stylex.props(styles.swatchButton, styles.swatchDefault)}
                  >
                    <span {...stylex.props(styles.srOnly)}>Default</span>
                    {background === 'default' && <Ring travel={travel} />}
                  </button>
                  <button
                    aria-pressed={background === 'none'}
                    data-option={background === 'none' ? 'selected' : ''}
                    onClick={() => onChange({ background: 'none' })}
                    onFocus={() => onChange({ background: 'none' })}
                    type="button"
                    {...stylex.props(styles.swatchButton, styles.swatchNone)}
                  >
                    <span {...stylex.props(styles.srOnly)}>None</span>
                    {background === 'none' && <Ring travel={travel} />}
                  </button>
                  <div {...stylex.props(styles.divider)} />
                  {backgrounds.map((value) => (
                    <button
                      aria-pressed={background === value}
                      data-option={background === value ? 'selected' : ''}
                      key={value}
                      onClick={() => onChange({ background: value })}
                      onFocus={() => onChange({ background: value })}
                      type="button"
                      {...stylex.props(styles.swatchButton, styles.swatchColor(value))}
                    >
                      <span {...stylex.props(styles.srOnly)}>{value}</span>
                      {background === value && <Ring travel={travel} />}
                    </button>
                  ))}
                  <div {...stylex.props(styles.divider)} />
                  <label {...stylex.props(styles.swatchButton, styles.swatchCustom)}>
                    <span {...stylex.props(styles.srOnly)}>Custom color</span>
                    <input
                      aria-pressed={custom}
                      data-option={custom ? 'selected' : ''}
                      onChange={(event) => onChange({ background: event.target.value })}
                      onFocus={(event) => onChange({ background: event.target.value })}
                      type="color"
                      value={background.startsWith('#') ? background : '#3b82d6'}
                      {...stylex.props(styles.colorInput)}
                    />
                    {custom && <Ring travel={travel} />}
                  </label>
                </div>
              ) : null}
            </m.div>
          )}
        </AnimatePresence>

        <m.div layout ref={bar} transition={morph} {...stylex.props(styles.surface, styles.bar)}>
          <Item
            onClick={() => toggle('theme')}
            open={panel === 'theme'}
            shortcut={shortcuts.theme}
            title="Theme"
            up={themeIndex <= previousThemeIndex}
            value={selected?.displayName ?? theme}
          />
          <Item
            onClick={() => toggle('language')}
            open={panel === 'language'}
            shortcut={shortcuts.language}
            title="Language"
            up
            value={detect.title(resolved)}
          />
          <div {...stylex.props(styles.divider)} />
          <Item
            onClick={() => toggle('background')}
            open={panel === 'background'}
            shortcut={shortcuts.background}
            title="Background"
            up
            value={backgroundLabel(background)}
          />
          <Item
            onClick={() => onChange({ lineNumbers: !lineNumbers })}
            pressed={lineNumbers}
            shortcut={shortcuts.lineNumbers}
            up
            title="Line numbers"
            value={lineNumbers ? 'On' : 'Off'}
          />
          <Item
            onClick={() => onChange({ titleBar: !titleBar })}
            pressed={titleBar}
            shortcut={shortcuts.titleBar}
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
    /** The language actually in use, which under `auto` is the detected one. */
    resolved: BundledLanguage
  }

  /** Everything the toolbar can change. */
  type State = {
    /** `default`, `none`, or a hex color for the frame's backdrop. */
    background: string
    /** A pinned language, or `auto` to read it from the code. */
    language: BundledLanguage | 'auto'
    lineNumbers: boolean
    theme: Theme.Info['name']
    /** Whether the window shows its title bar. */
    titleBar: boolean
  }
}

type Panel = 'theme' | 'background' | 'language' | undefined

/** `default` paints the theme's gradient; `none` exports a transparent frame. */
export const backgrounds = [
  '#000000',
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

/** Where a background sits in the color row, for measuring the ring's travel. */
function backgroundIndex(background: string) {
  if (background === 'default') return 0
  if (background === 'none') return 1
  const index = backgrounds.indexOf(background as (typeof backgrounds)[number])
  // A custom color lands on the picker at the end of the row.
  return index === -1 ? backgrounds.length + 2 : index + 2
}

/** Reads a background value as the label shown on the bar. */
function backgroundLabel(background: string) {
  if (background === 'default') return 'Default'
  if (background === 'none') return 'None'
  return background.toUpperCase()
}

/** Settles quickly without overshooting into wobble. */
const spring = { bounce: 0.18, duration: 0.4, type: 'spring' } as const

// The bar moving between two known widths is not a gesture with momentum, so
// it settles without overshoot; bounce here reads as the surface flexing.
const morph = { bounce: 0, duration: 0.3, type: 'spring' } as const

/** Strong ease-out: the panel resolves early instead of drifting into focus. */
const fade = { duration: seconds(motion.fast), ease: bezier(motion.out) } as const

/** Reads a `motion` duration const as the seconds Motion expects. */
function seconds(value: string): number {
  return Number.parseFloat(value) / (value.endsWith('ms') ? 1000 : 1)
}

/** Reads a `motion` curve const as the control points Motion expects. */
function bezier(value: string): [number, number, number, number] {
  return value.slice('cubic-bezier('.length, -1).split(',').map(Number) as never
}

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
function Ring(props: { travel: number }) {
  return (
    <m.span
      layoutId="swatch-ring"
      transition={ring(props.travel)}
      {...stylex.props(styles.swatchRing)}
    />
  )
}

/** One swatch plus its gap: the distance the ring covers per position. */
const swatchStride = 29

/**
 * The ring overshoots its target and settles back.
 *
 * A spring's overshoot is a fraction of the distance it travels, so a single
 * bounce either disappears on a short hop or throws a swatch-width past the
 * target on a long one. Scaling it by the travel keeps the overshoot at a
 * roughly constant few pixels wherever the ring lands.
 */
function ring(travel: number) {
  // A spring's overshoot is a fraction of its travel, so a short hop needs a
  // large bounce to register at all. The floor keeps a long slide from landing
  // flat; the ceiling keeps a one-swatch hop from flinging past its target.
  const bounce = Math.min(0.5, Math.max(0.24, 8 / Math.max(travel, 1) / 0.4))
  return { bounce, duration: 0.45, type: 'spring' } as const
}

/** Short and firm: the value should land, not float. */
const roll = { damping: 30, stiffness: 420, type: 'spring' } as const

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
  /** Key that reaches this control from anywhere. */
  shortcut: string
  title: string
  /** Direction the value rolls: up for a larger or enabled value. */
  up: boolean
  value: string
}) {
  const { digits, onClick, open, pressed, shortcut, title, up, value } = props
  return (
    <m.button
      // Two stacked spans would otherwise read as one run-together name.
      aria-expanded={open}
      aria-keyshortcuts={shortcut}
      aria-label={`${title}: ${value}`}
      aria-pressed={pressed}
      layout
      onClick={onClick}
      transition={morph}
      type="button"
      {...stylex.props(styles.item, open && styles.itemOpen)}
    >
      <span {...stylex.props(styles.itemHeading)}>
        <span {...stylex.props(styles.itemTitle, text.label12)}>{title}</span>
        <kbd {...stylex.props(styles.itemKey, text.label10)}>{shortcut}</kbd>
      </span>
      <Roll digits={digits} style={[styles.itemValue, text.button14]} up={up} value={value} />
    </m.button>
  )
}
