import { ScrollArea } from '@base-ui/react/scroll-area'
import { Slider } from '@base-ui/react/slider'
import * as stylex from '@stylexjs/stylex'
import { Theme } from 'monoshot'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { text } from '#/theme/text.js'
import { color, radius, shadow } from '../../theme/tokens.stylex.js'

const themes = Theme.list()

const styles = stylex.create({
  root: {
    alignItems: 'center',
    backgroundColor: color.chrome,
    borderRadius: 999,
    boxShadow: shadow.menu,
    display: 'flex',
    gap: 4,
    height: 56,
    // Stays a contained pill rather than stretching with its contents; the
    // theme list scrolls inside it.
    maxWidth: 'min(720px, 100%)',
    paddingInline: 8,
  },
  // The pill keeps one shape while its contents swap, which is what makes the
  // change read as the same object rather than a new one.
  item: {
    alignItems: 'center',
    backgroundColor: { default: 'transparent', ':hover': color.chromeHover },
    borderStyle: 'none',
    borderRadius: 999,
    boxShadow: { default: null, ':focus-visible': shadow.focusRing },
    color: color.onChrome,
    cursor: 'pointer',
    display: 'flex',
    gap: 6,
    height: 40,
    justifyContent: 'center',
    outline: 'none',
    paddingInline: 14,
    whiteSpace: 'nowrap',
  },
  back: { paddingInline: 0, width: 40 },
  divider: {
    backgroundColor: color.chromeHover,
    flexShrink: 0,
    height: 20,
    marginInline: 4,
    width: 1,
  },
  panel: { alignItems: 'center', display: 'flex', flex: 1, gap: 12, minWidth: 0 },
  label: { color: color.onChromeSecondary, whiteSpace: 'nowrap' },
  value: { color: color.onChrome, minWidth: 44, textAlign: 'right' },
  slider: { display: 'flex', flex: 1, minWidth: 120 },
  track: {
    backgroundColor: color.chromeHover,
    borderRadius: 999,
    height: 6,
    width: '100%',
  },
  indicator: { backgroundColor: color.onChrome, borderRadius: 999 },
  thumb: {
    backgroundColor: color.onChrome,
    borderRadius: 999,
    boxShadow: { default: shadow.thumb, ':focus-visible': shadow.focusRing },
    height: 18,
    outline: 'none',
    width: 18,
  },
  scroller: { display: 'flex', flex: 1, minWidth: 0 },
  viewport: { overscrollBehaviorX: 'contain' },
  themes: { display: 'flex', gap: 4, paddingBlock: 2 },
  theme: {
    alignItems: 'center',
    backgroundColor: { default: 'transparent', ':hover': color.chromeHover },
    borderStyle: 'none',
    borderRadius: radius.control,
    boxShadow: { default: null, ':focus-visible': shadow.focusRing },
    color: color.onChromeSecondary,
    cursor: 'pointer',
    display: 'flex',
    gap: 8,
    height: 36,
    outline: 'none',
    paddingInline: 10,
    whiteSpace: 'nowrap',
  },
  themeSelected: { backgroundColor: color.chromeActive, color: color.onChrome },
  swatch: (background: string) => ({
    backgroundColor: background,
    borderRadius: 999,
    boxShadow: '0 0 0 1px #ffffff24',
    height: 16,
    width: 16,
  }),
})

/**
 * The single control surface, in the shape of Apple's markup bar: picking a
 * control swaps the pill's contents in place instead of opening a panel.
 */
export function Toolbar(props: Toolbar.Props) {
  const { background, lineNumbers, onChange, padding, theme } = props
  const [mode, setMode] = useState<Mode>('root')

  if (mode === 'theme')
    return (
      <div {...stylex.props(styles.root)}>
        <Back onClick={() => setMode('root')} />
        <ScrollArea.Root {...stylex.props(styles.scroller)}>
          <ScrollArea.Viewport {...stylex.props(styles.viewport)}>
            <div {...stylex.props(styles.themes)}>
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
          </ScrollArea.Viewport>
        </ScrollArea.Root>
      </div>
    )

  if (mode === 'padding')
    return (
      <div {...stylex.props(styles.root)}>
        <Back onClick={() => setMode('root')} />
        <div {...stylex.props(styles.divider)} />
        <div {...stylex.props(styles.panel)}>
          <span {...stylex.props(styles.label, text.label13)}>Padding</span>
          <Slider.Root
            max={160}
            min={0}
            onValueChange={(value) => onChange({ padding: value as number })}
            step={4}
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
      </div>
    )

  return (
    <div {...stylex.props(styles.root)}>
      <button
        onClick={() => setMode('theme')}
        type="button"
        {...stylex.props(styles.item, text.button14)}
      >
        Theme
      </button>
      <button
        onClick={() => setMode('padding')}
        type="button"
        {...stylex.props(styles.item, text.button14)}
      >
        Padding
      </button>
      <div {...stylex.props(styles.divider)} />
      <button
        aria-pressed={lineNumbers}
        onClick={() => onChange({ lineNumbers: !lineNumbers })}
        type="button"
        {...stylex.props(styles.item, text.button14)}
      >
        Line numbers {lineNumbers ? 'on' : 'off'}
      </button>
      <button
        aria-pressed={background}
        onClick={() => onChange({ background: !background })}
        type="button"
        {...stylex.props(styles.item, text.button14)}
      >
        Background {background ? 'on' : 'off'}
      </button>
    </div>
  )
}

export declare namespace Toolbar {
  /** Props for {@link Toolbar}. */
  type Props = {
    /** Whether the frame paints its gradient backdrop. */
    background: boolean
    lineNumbers: boolean
    /** Receives only the settings that changed. */
    onChange: (next: Partial<State>) => void
    /** Frame padding, in pixels. */
    padding: number
    theme: Theme.Info['name']
  }

  /** Everything the toolbar can change. */
  type State = {
    background: boolean
    lineNumbers: boolean
    padding: number
    theme: Theme.Info['name']
  }
}

type Mode = 'root' | 'theme' | 'padding'

/** Brings the selected theme into view when the list opens. */
function reveal(node: HTMLButtonElement | null) {
  node?.scrollIntoView({ block: 'nearest', inline: 'center' })
}

const swatches = { dark: '#1c1c1c', light: '#f5f5f5' }

function Back(props: { onClick: () => void }) {
  return (
    <button
      aria-label="Back"
      onClick={props.onClick}
      type="button"
      {...stylex.props(styles.item, styles.back)}
    >
      <Chevron />
    </button>
  )
}

function Chevron(): ReactNode {
  return (
    <svg aria-hidden fill="none" height="16" viewBox="0 0 16 16" width="16">
      <path
        d="M10 3.5 5.5 8l4.5 4.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  )
}
