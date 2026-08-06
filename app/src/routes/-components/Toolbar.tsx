import { Slider } from '@base-ui/react/slider'
import * as stylex from '@stylexjs/stylex'
import { AnimatePresence, MotionConfig, motion as m } from 'motion/react'
import { Theme } from 'monoshot'
import { useState } from 'react'

import { text } from '#/theme/text.js'
import type { ReactNode } from 'react'

import { color, motion, shadow } from '../../theme/tokens.stylex.js'

const themes = Theme.list()

const styles = stylex.create({
  root: {
    alignItems: 'stretch',
    backgroundColor: color.chrome,
    boxShadow: shadow.menu,
    display: 'flex',
    // Square, like the artwork it controls.
    borderRadius: 0,
    maxWidth: 'min(720px, 100%)',
    overflow: 'hidden',
    // Motion drives the resize: `interpolate-size` is Chromium-only, and a
    // spring is what makes the change feel like one object.
    width: 'max-content',
  },
  panel: { alignItems: 'center', display: 'flex', gap: 2, padding: 6 },
  column: { alignItems: 'stretch', flexDirection: 'column', gap: 0 },
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
    transitionDuration: motion.fast,
    transitionProperty: 'background-color',
    transitionTimingFunction: motion.out,
    whiteSpace: 'nowrap',
  },
  itemTitle: { color: color.onChromeSecondary },
  itemValue: { color: color.onChrome },
  back: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingInline: 12,
  },
  divider: { backgroundColor: color.chromeHover, flexShrink: 0, marginBlock: 8, width: 1 },
  slider: { display: 'flex', flex: 1, minWidth: 160 },
  sliderRow: { alignItems: 'center', display: 'flex', flex: 1, gap: 12, paddingInline: 8 },
  track: { backgroundColor: color.chromeHover, height: 4, width: '100%' },
  indicator: { backgroundColor: color.onChrome },
  thumb: {
    backgroundColor: color.onChrome,
    borderRadius: 999,
    boxShadow: { default: shadow.thumb, ':focus-visible': shadow.focusRing },
    height: 16,
    outline: 'none',
    width: 16,
  },
  value: { color: color.onChrome, minWidth: 40, textAlign: 'right' },
  label: { color: color.onChromeSecondary },
  // The theme list runs down the pill, so long names stay readable.
  themeScroller: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 260,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    width: 260,
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
    paddingInline: 12,
    textAlign: 'start',
    transitionDuration: motion.fast,
    transitionProperty: 'background-color, color',
    transitionTimingFunction: motion.out,
    whiteSpace: 'nowrap',
  },
  themeSelected: { backgroundColor: color.chromeActive, color: color.onChrome },
  swatch: (background: string) => ({
    backgroundColor: background,
    borderRadius: 999,
    boxShadow: '0 0 0 1px #ffffff24',
    flexShrink: 0,
    height: 12,
    width: 12,
  }),
})

/**
 * The single control surface, in the shape of Apple's markup bar: picking a
 * control swaps the pill's contents in place instead of opening a panel.
 */
export function Toolbar(props: Toolbar.Props) {
  const { background, lineNumbers, onChange, padding, theme, titleBar } = props
  const [mode, setMode] = useState<Mode>('root')
  const selected = Theme.info(theme)

  if (mode === 'theme')
    return (
      <Shell>
        <Panel key="theme" style={[styles.panel, styles.column]}>
          <Back onClick={() => setMode('root')} />
          <div {...stylex.props(styles.themeScroller)}>
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
        </Panel>
      </Shell>
    )

  if (mode === 'padding')
    return (
      <Shell>
        <Panel key="padding" style={styles.panel}>
          <Back onClick={() => setMode('root')} />
          <div {...stylex.props(styles.divider)} />
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
            <span {...stylex.props(styles.value, text.copy13)}>{padding}</span>
          </div>
        </Panel>
      </Shell>
    )

  return (
    <Shell>
      <Panel key="root" style={styles.panel}>
        <Item
          onClick={() => setMode('theme')}
          title="Theme"
          value={selected?.displayName ?? theme}
        />
        <Item onClick={() => setMode('padding')} title="Padding" value={String(padding)} />
        <div {...stylex.props(styles.divider)} />
        <Item
          onClick={() => onChange({ lineNumbers: !lineNumbers })}
          pressed={lineNumbers}
          title="Line numbers"
          value={lineNumbers ? 'On' : 'Off'}
        />
        <Item
          onClick={() => onChange({ background: !background })}
          pressed={background}
          title="Background"
          value={background ? 'On' : 'Off'}
        />
        <Item
          onClick={() => onChange({ titleBar: !titleBar })}
          pressed={titleBar}
          title="Title bar"
          value={titleBar ? 'On' : 'Off'}
        />
      </Panel>
    </Shell>
  )
}

/** The pill itself: one element that resizes as its contents change. */
function Shell(props: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <m.div layout transition={spring} {...stylex.props(styles.root)}>
        <AnimatePresence initial={false} mode="wait">
          {props.children}
        </AnimatePresence>
      </m.div>
    </MotionConfig>
  )
}

/** One mode's contents, fading through as the pill resizes around it. */
function Panel(props: { children: ReactNode; style: stylex.StyleXStyles | stylex.StyleXStyles[] }) {
  return (
    <m.div
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      transition={{ duration: 0.12, ease: [0.19, 1, 0.22, 1] }}
      {...stylex.props(props.style)}
    >
      {props.children}
    </m.div>
  )
}

/** Settles quickly without overshooting into wobble. */
const spring = { bounce: 0.18, duration: 0.45, type: 'spring' } as const

export declare namespace Toolbar {
  /** Props for {@link Toolbar}. */
  type Props = State & {
    /** Receives only the settings that changed. */
    onChange: (next: Partial<State>) => void
  }

  /** Everything the toolbar can change. */
  type State = {
    /** Whether the frame paints its gradient backdrop. */
    background: boolean
    lineNumbers: boolean
    /** Frame padding, in pixels. */
    padding: number
    theme: Theme.Info['name']
    /** Whether the window shows its title bar. */
    titleBar: boolean
  }
}

type Mode = 'root' | 'theme' | 'padding'

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

function Item(props: { onClick: () => void; pressed?: boolean; title: string; value: string }) {
  const { onClick, pressed, title, value } = props
  return (
    <button aria-pressed={pressed} onClick={onClick} type="button" {...stylex.props(styles.item)}>
      <span {...stylex.props(styles.itemTitle, text.label12)}>{title}</span>
      <span {...stylex.props(styles.itemValue, text.button14)}>{value}</span>
    </button>
  )
}

function Back(props: { onClick: () => void }) {
  return (
    <button
      aria-label="Back"
      onClick={props.onClick}
      type="button"
      {...stylex.props(styles.item, styles.back)}
    >
      <svg aria-hidden fill="none" height="16" viewBox="0 0 16 16" width="16">
        <path
          d="M10 3.5 5.5 8l4.5 4.5"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
        />
      </svg>
    </button>
  )
}
