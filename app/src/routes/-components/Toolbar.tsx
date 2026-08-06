import { Slider } from '@base-ui/react/slider'
import * as stylex from '@stylexjs/stylex'
import { AnimatePresence, MotionConfig, motion as m } from 'motion/react'
import { Theme } from 'monoshot'
import { useState } from 'react'
import { TextMorph } from 'torph/react'

import { text } from '#/theme/text.js'
import { color, motion, shadow } from '../../theme/tokens.stylex.js'

const themes = Theme.list()

const styles = stylex.create({
  root: {
    alignItems: 'stretch',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    maxWidth: 'min(720px, 100%)',
    // The bar sizes the stack, so a panel above it matches its width.
    width: 'max-content',
  },
  surface: {
    backgroundColor: color.chrome,
    // Square, like the artwork it controls.
    borderRadius: 0,
    boxShadow: shadow.menu,
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
    transitionDuration: motion.fast,
    transitionProperty: 'background-color',
    transitionTimingFunction: motion.out,
    whiteSpace: 'nowrap',
  },
  itemOpen: { backgroundColor: color.chromeActive },
  itemTitle: { color: color.onChromeSecondary },
  itemValue: { color: color.onChrome },
  divider: { backgroundColor: color.chromeHover, flexShrink: 0, marginBlock: 8, width: 1 },
  sliderRow: { alignItems: 'center', display: 'flex', gap: 16, padding: 16 },
  slider: { display: 'flex', flex: 1 },
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
    borderRadius: 999,
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
  const selected = Theme.info(theme)

  // Clicking the open control closes it, so the bar is its own dismiss target.
  const toggle = (next: Panel) => setPanel((current) => (current === next ? undefined : next))

  return (
    <MotionConfig reducedMotion="user">
      <div {...stylex.props(styles.root)}>
        <AnimatePresence initial={false}>
          {panel && (
            <m.div
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              initial={{ height: 0, opacity: 0 }}
              key={panel}
              transition={spring}
              {...stylex.props(styles.surface)}
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
                  <span {...stylex.props(styles.value, text.copy13)}>{padding}</span>
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
            value={selected?.displayName ?? theme}
          />
          <Item
            onClick={() => toggle('padding')}
            open={panel === 'padding'}
            title="Padding"
            value={String(padding)}
          />
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

type Panel = 'theme' | 'padding' | undefined

/** Settles quickly without overshooting into wobble. */
const spring = { bounce: 0.18, duration: 0.4, type: 'spring' } as const

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
  onClick: () => void
  open?: boolean
  pressed?: boolean
  title: string
  value: string
}) {
  const { onClick, open, pressed, title, value } = props
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
      <TextMorph
        duration={0.22}
        ease={{ damping: 26, stiffness: 320 }}
        {...stylex.props(styles.itemValue, text.button14)}
      >
        {value}
      </TextMorph>
    </m.button>
  )
}
