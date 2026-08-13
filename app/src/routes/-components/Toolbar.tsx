import { Popover } from '@base-ui/react/popover'
import * as stylex from '@stylexjs/stylex'
import { MotionConfig, motion as m } from 'motion/react'
import { Theme } from 'monoshot'
import type { BundledLanguage } from 'shiki'
import type { ComponentPropsWithoutRef, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'

import * as Language from '#/lib/language.js'
import * as Themes from '#/lib/themes.js'
import { dialects } from '#/lib/twoslash/options.js'
import * as Wallpapers from '#/lib/wallpapers.js'
import * as Shortcut from '#/lib/shortcut.js'
import { text } from '#/theme/text.js'
import { Roll } from '#/ui/Roll.js'
import { Tooltip } from '#/ui/Tooltip.js'
import { color, motion, radius, shadow } from '../../theme/tokens.stylex.js'

const themes = Theme.list()

/** The key that reaches each control while focus is in the toolbar. */
const shortcuts = {
  background: 'b',
  language: 'a',
  theme: 't',
  titleBar: 'w',
  types: 'y',
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
  panel: { maxWidth: 'calc(100vw - 40px)' },
  // The color row is a fixed set of chips, so it sizes to them and centers on
  // the bar. Matching the bar would stretch or squeeze it every time the theme
  // name changes length.
  // Use a fixed panel width so selection-label changes do not reflow the grid.
  panelThemes: { width: 520 },
  panelFit: {
    maxWidth: 'calc(100vw - 40px)',
    width: 'max-content',
  },
  surface: {
    backdropFilter: 'blur(32px) saturate(180%)',
    backgroundColor: {
      default: color.chromeTranslucent,
      '@media (prefers-reduced-transparency: reduce)': color.chrome,
    },
    borderRadius: radius.floating,
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
    borderRadius: radius.control,
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
  // Keep the value legible while indicating that the control is unavailable.
  itemDisabled: {
    backgroundColor: 'transparent',
    cursor: 'default',
    opacity: 0.45,
    transform: 'scale(1)',
  },
  itemHeading: { alignItems: 'center', display: 'flex', gap: 6 },
  itemTitle: { color: color.onChromeSecondary },
  // The key that reaches this control, in the same cap the theme arrows use.
  itemKey: {
    alignItems: 'center',
    backgroundColor: 'color-mix(in oklab, currentColor 14%, transparent)',
    borderColor: 'color-mix(in oklab, currentColor 30%, transparent)',
    borderRadius: 4,
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
  divider: { backgroundColor: color.chromeHover, flexShrink: 0, marginBlock: 8, width: 1 },
  rows: { display: 'flex', flexDirection: 'column', gap: 4, padding: 4 },
  // Started where the row below it starts: the rows take different insets, and a
  // label set to one of them hangs off the other.
  rowTitle: (inset: number) => ({ color: color.onChromeSecondary, paddingInline: inset }),
  // Reserve scroll padding for the selection ring and hover scaling outside a
  // swatch's layout box.
  colorRow: {
    alignItems: 'center',
    display: 'flex',
    gap: 5,
    overflowX: 'auto',
    overflowY: 'hidden',
    padding: 10,
  },
  // Distribute picture swatches evenly and allow horizontal scrolling on narrow viewports.
  pictureRow: {
    display: 'flex',
    gap: 5,
    overflowX: 'auto',
    overflowY: 'hidden',
    padding: 10,
  },
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
  // Use landscape previews to show more identifying image content.
  swatchPicture: (source: string) => ({
    backgroundImage: `url("${source}")`,
    backgroundPosition: 'center',
    backgroundSize: 'cover',
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    height: 28,
    minWidth: 28,
    width: 'auto',
  }),
  // Preview the theme's gradient instead of a flat color.
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
    // Separate options visually so each reads as an individual control.
    gap: 2,
    maxHeight: 260,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    // Even, so an item's corner is the surface's own less what surrounds it.
    padding: 6,
  },
  option: {
    alignItems: 'center',
    backgroundColor: { default: 'transparent', ':hover': color.chromeHover },
    borderStyle: 'none',
    borderRadius: radius.control,
    boxShadow: { default: null, ':focus-visible': shadow.focusRing },
    color: color.onChromeSecondary,
    cursor: 'pointer',
    display: 'flex',
    gap: 10,
    outline: 'none',
    paddingBlock: 8,
    paddingInline: 10,
    textAlign: 'start',
    transform: { default: 'scale(1)', ':active': 'scale(0.97)' },
    transitionDuration: motion.fast,
    transitionProperty: 'background-color, color, transform',
    transitionTimingFunction: motion.out,
    whiteSpace: 'nowrap',
  },
  optionSelected: { backgroundColor: color.chromeActive, color: color.onChrome },
  // Wide enough that three colors read as a palette rather than as a smudge,
  // and small enough that two dozen themes are one panel rather than a scroll.
  themeGrid: {
    display: 'grid',
    gap: 6,
    gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))',
    padding: 6,
  },
  // The artwork in miniature: the backdrop a theme draws, with the colors it
  // paints code in standing on it.
  themeBox: (backdrop: string) => ({
    // Longhands: a shorthand carrying a value this shape is dropped, and the
    // panel's own surface reads through where the backdrop should be.
    backgroundImage: backdrop,
    backgroundPosition: 'center',
    backgroundSize: 'cover',
    borderRadius: 8,
    borderStyle: 'none',
    // A hairline edge, so a near-black backdrop still reads against the panel.
    boxShadow: {
      default: 'inset 0 0 0 1px rgb(255 255 255 / 0.14)',
      ':focus-visible': shadow.focusRing,
    },
    cursor: 'pointer',
    display: 'grid',
    height: 34,
    outline: 'none',
    // Room for the backdrop to read as the picture or gradient it is, rather
    // than as a hairline around the colors.
    padding: 7,
    placeItems: 'center',
    position: 'relative',
    transform: {
      default: 'scale(1)',
      '@media (hover: hover) and (pointer: fine)': { default: 'scale(1)', ':hover': 'scale(1.14)' },
      ':active': 'scale(0.97)',
    },
    transitionDuration: motion.fast,
    transitionProperty: 'transform',
    transitionTimingFunction: motion.out,
  }),
  themeStripes: {
    display: 'grid',
    gap: 4,
    gridAutoColumns: '1fr',
    gridAutoFlow: 'column',
    height: '100%',
    width: '100%',
  },
  // A white hairline holds each bar off the picture behind it, the same on every
  // swatch: an edge taken from a theme's own colors reads on some pictures and
  // vanishes on others.
  themeStroke: (paint: string) => ({
    backgroundColor: paint,
    borderRadius: 3,
    boxShadow: `0 0 0 1px ${color.onArtwork}`,
  }),
  swatch: (background: string) => ({
    backgroundColor: background,
    borderRadius: 4,
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
  const { background, language, onChange, resolved, theme, titleBar, types } = props
  // Only a language the compiler reads can be checked, so for anything else the
  // control says what is true of it rather than offering a setting it has no
  // meaning for.
  const checkable = resolved in dialects
  const [panel, setPanel] = useState<Panel>()
  const popup = useMemo(() => Popover.createHandle<Exclude<Panel, undefined>>(), [])
  // A hex the palette does not carry belongs to the custom picker.
  const custom = background.startsWith('#') && !backgrounds.includes(background as never)
  const swatchIndex = backgroundIndex(background)
  const previousSwatchIndex = usePrevious(swatchIndex)
  const travel = Math.abs(swatchIndex - previousSwatchIndex) * swatchStride
  const themeIndex = themes.findIndex((entry) => entry.name === theme)
  const previousThemeIndex = usePrevious(themeIndex)
  // Measured as the colors below are: how far the ring has to go, so its
  // overshoot stays the same few pixels wherever in the grid it lands.
  const themeTravel = Math.abs(themeIndex - previousThemeIndex) * themeStride
  const selected = Theme.info(theme)
  const sections = [
    { entries: themes.filter((entry) => Themes.curated(entry.name)), title: 'Curated' },
    { entries: themes.filter((entry) => !Themes.curated(entry.name)), title: 'Other' },
  ]

  // Detached triggers share one popup while Base UI owns dismissal and focus.
  const toggle = (next: Exclude<Panel, undefined>) =>
    panel === next ? popup.close() : popup.open(`toolbar-${next}`)

  const surface = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)

  // The panel owns the arrow keys while it is open, so the page's own theme
  // stepping never fires underneath it.
  function navigate(event: ReactKeyboardEvent<HTMLDivElement>) {
    const along = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    const down = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
    const options = [...(surface.current?.querySelectorAll<HTMLElement>('[data-option]') ?? [])]
    const index = options.indexOf(document.activeElement as HTMLElement)
    if ((!along && !down) || index < 0) return
    event.preventDefault()
    event.stopPropagation()
    const landed = down
      ? below(options, index, down)
      : (index + along + options.length) % options.length
    options[landed]?.focus()
  }

  useEffect(() => {
    function press(event: KeyboardEvent) {
      const target = event.target
      const shortcut = Shortcut.scoped(event, {
        active: target instanceof Node && root.current?.contains(target) === true,
        editable: target instanceof Element && target.closest('input, textarea') !== null,
      })
      if (shortcut === shortcuts.theme) toggle('theme')
      else if (shortcut === shortcuts.background) toggle('background')
      else if (shortcut === shortcuts.language) toggle('language')
      else if (shortcut === shortcuts.titleBar) onChange({ titleBar: !titleBar })
      else if (shortcut === shortcuts.types) {
        if (checkable) onChange({ types: !types })
      } else return
      event.preventDefault()
    }
    window.addEventListener('keydown', press)
    return () => window.removeEventListener('keydown', press)
  })

  return (
    <MotionConfig reducedMotion="user">
      <div ref={root} {...stylex.props(styles.root)}>
        <Popover.Root
          handle={popup}
          onOpenChange={(open, details) => {
            if (!open) {
              setPanel(undefined)
              return
            }
            const next = details.trigger?.id.replace('toolbar-', '')
            if (next === 'background' || next === 'language' || next === 'theme') setPanel(next)
          }}
          open={panel !== undefined}
        >
          {({ payload }) =>
            panel && payload ? (
              <Popover.Portal>
                <Popover.Positioner align="center" side="top" sideOffset={8}>
                  <Popover.Popup
                    initialFocus={() =>
                      surface.current?.querySelector<HTMLElement>('[data-option="selected"]') ??
                      true
                    }
                    render={
                      <m.div
                        animate={{ filter: 'blur(0px)', height: 'auto', opacity: 1 }}
                        initial={{ filter: 'blur(6px)', height: 0, opacity: 0 }}
                        key={payload}
                        onKeyDown={navigate}
                        ref={surface}
                        // Height keeps the spring so the bar is pushed rather than
                        // revealed; the blur and fade resolve faster than the movement.
                        transition={{ ...spring, filter: fade, opacity: fade }}
                        {...stylex.props(
                          styles.panel,
                          (panel === 'background' || panel === 'theme') && styles.panelFit,
                          panel === 'theme' && styles.panelThemes,
                          styles.surface,
                        )}
                      />
                    }
                  >
                    {panel === 'theme' ? (
                      <div aria-label="Theme" role="radiogroup" {...stylex.props(styles.rows)}>
                        {sections.map((section) => (
                          <div key={section.title}>
                            <span {...stylex.props(styles.rowTitle(6), text.label12)}>
                              {section.title}
                            </span>
                            <div {...stylex.props(styles.themeGrid)}>
                              {section.entries.map((entry) => {
                                const shown = Themes.swatch(entry.name)
                                return (
                                  <Tooltip key={entry.name} label={entry.displayName}>
                                    <button
                                      aria-checked={entry.name === theme}
                                      data-option={entry.name === theme ? 'selected' : ''}
                                      onClick={() => onChange({ theme: entry.name })}
                                      ref={entry.name === theme ? reveal : null}
                                      role="radio"
                                      tabIndex={entry.name === theme ? 0 : -1}
                                      type="button"
                                      {...stylex.props(styles.themeBox(shown.backdrop))}
                                    >
                                      <span {...stylex.props(styles.srOnly)}>
                                        {entry.displayName}
                                      </span>
                                      <span {...stylex.props(styles.themeStripes)}>
                                        {shown.colors.map((paint) => (
                                          <span
                                            key={paint}
                                            {...stylex.props(styles.themeStroke(paint))}
                                          />
                                        ))}
                                      </span>
                                      {entry.name === theme && (
                                        <Ring row="themes" travel={themeTravel} />
                                      )}
                                    </button>
                                  </Tooltip>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : panel === 'language' ? (
                      <div aria-label="Language" role="radiogroup" {...stylex.props(styles.list)}>
                        <button
                          aria-checked={language === 'auto'}
                          data-option={language === 'auto' ? 'selected' : ''}
                          onClick={() => onChange({ language: 'auto' })}
                          role="radio"
                          tabIndex={language === 'auto' ? 0 : -1}
                          type="button"
                          {...stylex.props(
                            styles.option,
                            text.copy13,
                            language === 'auto' && styles.optionSelected,
                          )}
                        >
                          Auto
                        </button>
                        {Language.list.map((entry) => (
                          <button
                            aria-checked={entry.id === language}
                            data-option={entry.id === language ? 'selected' : ''}
                            key={entry.id}
                            onClick={() => onChange({ language: entry.id })}
                            ref={entry.id === language ? reveal : null}
                            role="radio"
                            tabIndex={entry.id === language ? 0 : -1}
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
                      <div aria-label="Background" role="radiogroup" {...stylex.props(styles.rows)}>
                        <div>
                          <span {...stylex.props(styles.rowTitle(10), text.label12)}>
                            Wallpapers
                          </span>
                          <div {...stylex.props(styles.pictureRow)}>
                            {Wallpapers.offered.map((wallpaper) => {
                              const value = Wallpapers.background(wallpaper.id)
                              return (
                                <Tooltip key={wallpaper.id} label={wallpaper.name}>
                                  <button
                                    aria-checked={background === value}
                                    data-option={background === value ? 'selected' : ''}
                                    onClick={() => onChange({ background: value })}
                                    role="radio"
                                    tabIndex={background === value ? 0 : -1}
                                    type="button"
                                    {...stylex.props(
                                      styles.swatchButton,
                                      styles.swatchPicture(Wallpapers.thumbnail(wallpaper.id)),
                                    )}
                                  >
                                    <span {...stylex.props(styles.srOnly)}>{wallpaper.name}</span>
                                    {background === value && (
                                      <Ring row="backgrounds" travel={travel} />
                                    )}
                                  </button>
                                </Tooltip>
                              )
                            })}
                          </div>
                        </div>
                        <span {...stylex.props(styles.rowTitle(10), text.label12)}>Colors</span>
                        <div {...stylex.props(styles.colorRow)}>
                          <Tooltip label="Default">
                            <button
                              aria-checked={background === 'default'}
                              data-option={background === 'default' ? 'selected' : ''}
                              onClick={() => onChange({ background: 'default' })}
                              role="radio"
                              tabIndex={background === 'default' ? 0 : -1}
                              type="button"
                              {...stylex.props(styles.swatchButton, styles.swatchDefault)}
                            >
                              <span {...stylex.props(styles.srOnly)}>Default</span>
                              {background === 'default' && (
                                <Ring row="backgrounds" travel={travel} />
                              )}
                            </button>
                          </Tooltip>
                          <Tooltip label="None">
                            <button
                              aria-checked={background === 'none'}
                              data-option={background === 'none' ? 'selected' : ''}
                              onClick={() => onChange({ background: 'none' })}
                              role="radio"
                              tabIndex={background === 'none' ? 0 : -1}
                              type="button"
                              {...stylex.props(styles.swatchButton, styles.swatchNone)}
                            >
                              <span {...stylex.props(styles.srOnly)}>None</span>
                              {background === 'none' && <Ring row="backgrounds" travel={travel} />}
                            </button>
                          </Tooltip>
                          <div {...stylex.props(styles.divider)} />
                          {backgrounds.map((value) => (
                            <Tooltip key={value} label={value}>
                              <button
                                aria-checked={background === value}
                                data-option={background === value ? 'selected' : ''}
                                onClick={() => onChange({ background: value })}
                                role="radio"
                                tabIndex={background === value ? 0 : -1}
                                type="button"
                                {...stylex.props(styles.swatchButton, styles.swatchColor(value))}
                              >
                                <span {...stylex.props(styles.srOnly)}>{value}</span>
                                {background === value && <Ring row="backgrounds" travel={travel} />}
                              </button>
                            </Tooltip>
                          ))}
                          <div {...stylex.props(styles.divider)} />
                          <Tooltip label="Custom color">
                            <label {...stylex.props(styles.swatchButton, styles.swatchCustom)}>
                              <span {...stylex.props(styles.srOnly)}>Custom color</span>
                              <input
                                aria-checked={custom}
                                data-option={custom ? 'selected' : ''}
                                onChange={(event) => onChange({ background: event.target.value })}
                                role="radio"
                                tabIndex={custom ? 0 : -1}
                                type="color"
                                value={background.startsWith('#') ? background : '#3b82d6'}
                                {...stylex.props(styles.colorInput)}
                              />
                              {custom && <Ring row="backgrounds" travel={travel} />}
                            </label>
                          </Tooltip>
                        </div>
                      </div>
                    ) : null}
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            ) : null
          }
        </Popover.Root>

        <m.div layout transition={morph} {...stylex.props(styles.surface, styles.bar)}>
          <Popover.Trigger
            handle={popup}
            id="toolbar-theme"
            payload="theme"
            render={
              <Item
                open={panel === 'theme'}
                shortcut={shortcuts.theme}
                title="Theme"
                up={themeIndex <= previousThemeIndex}
                value={selected?.displayName ?? theme}
              />
            }
          />
          <Popover.Trigger
            handle={popup}
            id="toolbar-language"
            payload="language"
            render={
              <Item
                open={panel === 'language'}
                shortcut={shortcuts.language}
                title="Language"
                up
                value={Language.title(resolved)}
              />
            }
          />
          <div {...stylex.props(styles.divider)} />
          <Popover.Trigger
            handle={popup}
            id="toolbar-background"
            payload="background"
            render={
              <Item
                open={panel === 'background'}
                shortcut={shortcuts.background}
                title="Background"
                up
                value={backgroundLabel(background)}
              />
            }
          />
          <Item
            onClick={() => onChange({ titleBar: !titleBar })}
            pressed={titleBar}
            shortcut={shortcuts.titleBar}
            up
            title="Title bar"
            value={titleBar ? 'On' : 'Off'}
          />
          <Item
            disabled={!checkable}
            onClick={() => onChange({ types: !types })}
            pressed={checkable && types}
            shortcut={shortcuts.types}
            up
            title="Types"
            value={checkable && types ? 'On' : 'Off'}
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
    /** Resolved language; under `auto`, this is the detected language. */
    resolved: BundledLanguage
  }

  /** Everything the toolbar can change. */
  type State = {
    /** `default`, `none`, or a hex color for the frame's backdrop. */
    background: string
    /** A pinned language, or `auto` to read it from the code. */
    language: BundledLanguage | 'auto'
    /** A bundled theme's name, or one of the themes composed in the library. */
    theme: Theme.Info['name']
    /** Whether the window shows its title bar. */
    titleBar: boolean
    /** Whether the snippet is type checked, which only a TypeScript one can be. */
    types: boolean
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

/** Returns a background's position in the picker for indicator placement. */
function backgroundIndex(background: string) {
  const picture = Wallpapers.offered.findIndex(
    (wallpaper) => Wallpapers.background(wallpaper.id) === background,
  )
  if (picture !== -1) return picture
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
  return Wallpapers.at(background)?.name ?? background.toUpperCase()
}

/** Spring transition with limited overshoot. */
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

/** Retains the previous value to determine transition direction. */
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
/**
 * The selection ring. One element shared across every swatch, so choosing a
 * color slides it from the old swatch to the new rather than blinking across.
 */
function Ring(props: { row: string; travel: number }) {
  return (
    <m.span
      // One ring per row: it travels between the swatches of a row, and a jump
      // between rows is a selection moving from one kind of backdrop to
      // another rather than a distance to cover.
      layoutId={`swatch-ring-${props.row}`}
      transition={ring(props.travel)}
      {...stylex.props(styles.swatchRing)}
    />
  )
}

/** One swatch plus its gap: the distance the ring covers per position. */
const swatchStride = 29

/**
 * The option a row up or down from this one, by where the two are drawn rather
 * than by how far apart they are in the list: the themes wrap into a grid, and
 * the one after this one is beside it.
 *
 * Focusing an option picks it, so a key that reads as down has to land below.
 */
function below(options: readonly HTMLElement[], index: number, direction: number): number {
  const from = options[index]?.getBoundingClientRect()
  if (!from) return index
  const rows = options
    .map((option, at) => ({ at, box: option.getBoundingClientRect() }))
    // Anything sharing this one's row is beside it, whichever way it is drawn.
    .filter(({ box }) => (direction > 0 ? box.top > from.top + 1 : box.top < from.top - 1))
  if (!rows.length) return (index + direction + options.length) % options.length
  const next =
    direction > 0
      ? Math.min(...rows.map((row) => row.box.top))
      : Math.max(...rows.map((row) => row.box.top))
  const row = rows.filter(({ box }) => Math.abs(box.top - next) < 1)
  // Nearest along the row, so the column is kept where the grid allows it.
  return row.reduce((nearest, entry) =>
    Math.abs(entry.box.left - from.left) < Math.abs(nearest.box.left - from.left) ? entry : nearest,
  ).at
}

/** One theme box plus its gap: the distance the ring covers per position. */
const themeStride = 58

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

type ItemProps = Omit<ComponentPropsWithoutRef<typeof m.button>, 'children' | 'title'> & {
  /** Rolls each character on its own, for values that read as a number. */
  digits?: boolean | undefined
  /** Set when the setting has no meaning for what is on screen. */
  disabled?: boolean | undefined
  open?: boolean
  pressed?: boolean
  /** Key that reaches this control while focus is in the toolbar. */
  shortcut: string
  title: string
  /** Direction the value rolls: up for a larger or enabled value. */
  up: boolean
  value: string
}

const Item = forwardRef<HTMLButtonElement, ItemProps>(function Item(props, ref) {
  const { digits, disabled, open, pressed, shortcut, title, up, value, ...button } = props
  return (
    <m.button
      {...button}
      // Two stacked spans would otherwise read as one run-together name.
      aria-expanded={open}
      aria-keyshortcuts={shortcut}
      aria-label={`${title}: ${value}`}
      aria-pressed={pressed}
      disabled={disabled}
      layout
      ref={ref}
      transition={morph}
      type="button"
      {...stylex.props(styles.item, open && styles.itemOpen, disabled && styles.itemDisabled)}
    >
      <span {...stylex.props(styles.itemHeading)}>
        <span {...stylex.props(styles.itemTitle, text.label12)}>{title}</span>
        <kbd {...stylex.props(styles.itemKey, text.label10)}>{shortcut}</kbd>
      </span>
      <Roll digits={digits} style={[styles.itemValue, text.button14]} up={up} value={value} />
    </m.button>
  )
})
