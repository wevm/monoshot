import * as stylex from '@stylexjs/stylex'
import { Slider } from '@base-ui/react/slider'
import { MotionConfig, motion as m } from 'motion/react'
import { Codec, Theme } from 'monoshot'
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import * as Backgrounds from '#/lib/backgrounds.js'
import * as detect from '#/lib/detect.js'
import type { capture } from '#/lib/export.js'
import * as Themes from '#/lib/themes.js'
import { dialects } from '#/lib/twoslash/options.js'
import * as Wallpapers from '#/lib/wallpapers.js'
import { text } from '#/theme/text.js'
import { Button } from '#/ui/Button.js'
import { Input } from '#/ui/Input.js'
import { PaletteSelect } from '#/ui/PaletteSelect.js'
import { Spinner } from '#/ui/Spinner.js'
import { Switch } from '#/ui/Switch.js'
import { color, font, motion, shadow } from '../../theme/tokens.stylex.js'
import { Frame } from './Frame.js'
import { LanguageSelect } from './LanguageSelect.js'

const modes = ['wallpaper', 'gradient', 'color', 'image'] as const
type Mode = (typeof modes)[number]
const defaultGradient = ['#3F37C9', '#8C87DF'] as const
const syntaxThemes = Theme.list()
/** A short, flat spring keeps the selection ring attached during rapid tab changes. */
const tabSlide = { bounce: 0, duration: 0.22, type: 'spring' } as const

/** The key that reaches each setting from anywhere on the page. */
const shortcuts = {
  background: 'b',
  export: 'e',
  language: 'a',
  padding: 'p',
  radius: 'r',
  syntax: 's',
  titleBar: 't',
  types: 'y',
  width: 'w',
} as const
type Shortcut = (typeof shortcuts)[keyof typeof shortcuts]
type PressedKey = Shortcut | 'arrowleft' | 'arrowright'

/** The settings the arrow keys step once their shortcut has opened them. */
const arrowShortcuts = [
  shortcuts.background,
  shortcuts.export,
  shortcuts.padding,
  shortcuts.radius,
  shortcuts.width,
] as const
type ArrowShortcut = (typeof arrowShortcuts)[number]

function arrows(key: string): key is ArrowShortcut {
  return arrowShortcuts.includes(key as ArrowShortcut)
}

const styles = stylex.create({
  root: {
    bottom: 0,
    display: 'flex',
    fontFamily: font.mono,
    maxWidth: '100vw',
    position: 'fixed',
    right: 0,
    top: 0,
    transitionDuration: {
      default: motion.medium,
      '@media (prefers-reduced-motion: reduce)': '0s',
    },
    transitionProperty: 'opacity, transform, visibility',
    transitionTimingFunction: motion.out,
    width: { default: '100vw', '@media (min-width: 800px)': 352 },
    zIndex: 4,
  },
  rootClosed: {
    opacity: { default: 0, '@media (min-width: 800px)': 1 },
    pointerEvents: { default: 'none', '@media (min-width: 800px)': 'auto' },
    transform: {
      default: 'translateX(100%)',
      '@media (prefers-reduced-motion: reduce)': 'none',
      '@media (min-width: 800px)': 'none',
    },
    visibility: { default: 'hidden', '@media (min-width: 800px)': 'visible' },
  },
  surface: {
    backdropFilter: 'blur(32px) saturate(180%)',
    backgroundColor: {
      default: color.chromeTranslucent,
      '@media (prefers-reduced-transparency: reduce)': color.chrome,
    },
    boxShadow: shadow.floating,
    color: color.onChrome,
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    minWidth: 0,
    overflow: 'hidden',
  },
  mobileHeader: {
    alignItems: 'center',
    display: { default: 'flex', '@media (min-width: 800px)': 'none' },
    flexShrink: 0,
    height: 64,
    justifyContent: 'space-between',
    paddingInline: 16,
  },
  mobileWordmark: {
    backgroundColor: 'currentColor',
    blockSize: 22,
    inlineSize: 86,
    maskImage: 'url("/logo-light.svg")',
    maskPosition: 'center',
    maskRepeat: 'no-repeat',
    maskSize: 'contain',
  },
  mobileIcon: {
    fill: 'none',
    height: 20,
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeWidth: 1.75,
    width: 20,
  },
  mobileButton: {
    backgroundColor: {
      default: 'transparent',
      ':active': 'transparent',
      ':hover': 'transparent',
    },
  },
  scroll: {
    display: 'flex',
    flex: 1,
    flexDirection: 'column',
    gap: 22,
    minHeight: 0,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    padding: 16,
    scrollbarWidth: 'thin',
  },
  scrollMask: (top: boolean, bottom: boolean) => ({
    maskImage:
      top && bottom
        ? 'linear-gradient(to bottom, transparent, black 48px, black calc(100% - 48px), transparent)'
        : top
          ? 'linear-gradient(to bottom, transparent, black 48px)'
          : bottom
            ? 'linear-gradient(to bottom, black calc(100% - 48px), transparent)'
            : 'none',
  }),
  section: { display: 'flex', flexDirection: 'column', gap: 10, scrollMarginTop: 16 },
  desktopSection: { display: { default: 'none', '@media (min-width: 800px)': 'flex' } },
  sectionHeading: {
    alignItems: 'center',
    color: color.onChromeSecondary,
    display: 'flex',
    justifyContent: 'space-between',
  },
  key: {
    borderColor: 'color-mix(in oklab, currentColor 30%, transparent)',
    borderRadius: 4,
    borderStyle: 'solid',
    borderWidth: 1,
    color: color.onChromeSecondary,
    fontSize: 10,
    lineHeight: '14px',
    minWidth: 16,
    paddingInline: 3,
    textAlign: 'center',
    textTransform: 'uppercase',
    transitionDuration: motion.fast,
    transitionProperty: 'border-color, color',
    transitionTimingFunction: motion.out,
  },
  keyActive: { borderColor: color.onChrome, color: color.onChrome },
  keyGroup: { display: 'inline-flex', gap: 3 },
  tabs: {
    display: 'grid',
    gap: 10,
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  },
  panel: { paddingTop: 8 },
  tab: { isolation: 'isolate', position: 'relative' },
  tabSelected: { backgroundColor: color.chromeHover },
  selectionRing: {
    borderRadius: 'inherit',
    boxShadow: `0 0 0 2px ${color.chrome}, 0 0 0 4px ${color.onChrome}`,
    inset: 0,
    pointerEvents: 'none',
    position: 'absolute',
  },
  tabLabel: { position: 'relative' },
  optionGrid: { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' },
  option: (backdrop: string) => ({
    aspectRatio: '1',
    backgroundImage: backdrop,
    backgroundPosition: 'center',
    backgroundSize: 'cover',
    borderRadius: 9,
    borderStyle: 'none',
    boxShadow: {
      default: 'inset 0 0 0 1px rgb(255 255 255 / 0.14)',
      ':focus-visible': shadow.focusRing,
    },
    cursor: 'pointer',
    outline: 'none',
    padding: 0,
    position: 'relative',
    transform: { default: 'scale(1)', ':active': 'scale(0.97)' },
  }),
  gradientFields: { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
  gradientField: {
    alignItems: 'center',
    display: 'grid',
    gap: 6,
    gridTemplateColumns: '44px minmax(0, 1fr)',
  },
  gradientPicker: { borderRadius: 8 },
  gradientInput: { backgroundColor: color.chromeHover, color: color.onChrome, minWidth: 0 },
  presets: { marginTop: 10 },
  colorGrid: { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' },
  swatch: {
    aspectRatio: '1',
    borderRadius: 6,
    borderStyle: 'none',
    boxShadow: {
      default: 'inset 0 0 0 1px rgb(255 255 255 / 0.14)',
      ':focus-visible': shadow.focusRing,
    },
    cursor: 'pointer',
    outline: 'none',
    padding: 0,
    position: 'relative',
    width: '100%',
  },
  swatchColor: (value: string) => ({ backgroundColor: value }),
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
    boxShadow: { default: null, ':focus-within': shadow.focusRing },
  },
  colorInput: { height: '100%', inset: 0, opacity: 0, position: 'absolute', width: '100%' },
  imageDrop: (source?: string) => ({
    alignItems: 'center',
    aspectRatio: '16 / 9',
    backgroundColor: color.chromeHover,
    backgroundImage: source ? `linear-gradient(#0006, #0006), url("${source}")` : null,
    backgroundPosition: 'center',
    backgroundSize: 'cover',
    borderColor: 'rgb(255 255 255 / 0.12)',
    borderRadius: 8,
    borderStyle: 'solid',
    borderWidth: 1,
    boxShadow: { default: null, ':focus-visible': shadow.focusRing },
    color: color.onChromeSecondary,
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    justifyContent: 'center',
    outline: 'none',
    padding: 20,
    textAlign: 'center',
  }),
  imageDropActive: { borderColor: color.onChrome, color: color.onChrome },
  imageIcon: { fill: 'none', height: 28, stroke: 'currentColor', strokeWidth: 1.5, width: 28 },
  imageInput: { display: 'none' },
  imageError: { color: '#ff8b8b' },
  toggleRow: {
    alignItems: 'center',
    color: color.onChrome,
    display: 'flex',
    justifyContent: 'space-between',
    minHeight: 32,
  },
  toggleText: { alignItems: 'center', display: 'flex', gap: 8 },
  switch: {
    backgroundColor: {
      default: 'rgb(255 255 255 / 0.2)',
      ':is([data-checked])': color.onChrome,
    },
  },
  sliders: { display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 },
  slider: { display: 'flex', flexDirection: 'column', gap: 6 },
  sliderLabel: { alignItems: 'center', display: 'flex', justifyContent: 'space-between' },
  sliderControl: { alignItems: 'center', display: 'flex', height: 20 },
  sliderTrack: {
    backgroundColor: 'rgb(255 255 255 / 0.12)',
    borderRadius: 999,
    height: 4,
    position: 'relative',
    width: '100%',
  },
  sliderIndicator: {
    backgroundColor: color.onChrome,
    borderRadius: 'inherit',
    height: '100%',
  },
  sliderThumb: {
    backgroundColor: color.onChrome,
    borderRadius: '50%',
    boxShadow: { default: shadow.chromeBorder, ':focus-visible': shadow.focusRing },
    height: 16,
    outline: 'none',
    width: 16,
  },
  exports: { display: 'grid', gap: 6, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
})

/** A slide-away settings drawer that keeps every editor control beside the artwork. */
export function Drawer(props: Drawer.Props) {
  const {
    background,
    image,
    language,
    maxWidth,
    mobile,
    open,
    exporting,
    onChange,
    onClose,
    onCopyImage,
    onCopyUrl,
    onImageChange,
    onSave,
    onSyntaxPreview,
    padding,
    radius: windowRadius,
    resolved,
    syntax,
    theme,
    titleBar,
    types,
    width,
  } = props
  const checkable = resolved in dialects
  const scroll = useRef<HTMLDivElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const frameWidth = width ?? 808
  const windowWidth = frameWidth - padding * 2
  const custom = background.startsWith('#') && !backgrounds.includes(background as never)
  const automaticSwatch = Themes.swatch(theme)
  const syntaxItems = [
    {
      background: automaticSwatch.background,
      colors: automaticSwatch.colors,
      label: `Auto (${Theme.info(theme)?.displayName ?? theme})`,
      value: 'auto',
    },
    ...syntaxThemes.map((entry) => {
      const swatch = Themes.swatch(entry.name)
      return {
        background: swatch.background,
        colors: swatch.colors,
        label: entry.displayName,
        value: entry.name,
      }
    }),
  ]
  function selectSyntax(value: string) {
    const syntax = value as Drawer.State['syntax']
    onChange(syntax === 'auto' ? { syntax } : { syntax, theme: syntax })
  }
  function previewSyntax(value: string | undefined) {
    const syntax = value as Drawer.State['syntax'] | undefined
    onSyntaxPreview(syntax === 'auto' ? theme : syntax)
  }
  const [mode, setMode] = useState<Mode>(() => modeFor(background))
  const [gradientColors, setGradientColors] = useState<[string, string]>(
    () => gradientStops(background) ?? [...defaultGradient],
  )
  const [activeShortcut, setActiveShortcut] = useState<ArrowShortcut>()
  const [pressedKey, setPressedKey] = useState<PressedKey>()
  const [scrollFade, setScrollFade] = useState({ bottom: false, top: false })
  const [imageHover, setImageHover] = useState(false)
  const [imageError, setImageError] = useState<string>()

  useEffect(() => setMode(modeFor(background)), [background])
  useEffect(() => {
    const colors = gradientStops(background)
    if (colors) setGradientColors(colors)
  }, [background])

  function setGradientColor(index: number, value: string) {
    const next = [...gradientColors] as [string, string]
    next[index] = value.toUpperCase()
    setGradientColors(next)
    if (next.every((color) => /^#[0-9A-F]{6}$/.test(color)))
      onChange({ background: Backgrounds.value(next) })
  }

  const selectImage = useCallback(
    (file: File | undefined) => {
      if (!file) return
      if (!file.type.startsWith('image/')) {
        setImageError('Choose an image file.')
        return
      }
      const reader = new FileReader()
      reader.onerror = () => setImageError('The image could not be read.')
      reader.onload = () => {
        setImageError(undefined)
        onImageChange(String(reader.result))
        onChange({ background: 'image' })
      }
      reader.readAsDataURL(file)
    },
    [onChange, onImageChange],
  )

  useEffect(() => {
    if (!imageHover || mode !== 'image') return
    function paste(event: ClipboardEvent) {
      const file = [...(event.clipboardData?.files ?? [])].find((entry) =>
        entry.type.startsWith('image/'),
      )
      if (!file) return
      event.preventDefault()
      selectImage(file)
    }
    window.addEventListener('paste', paste)
    return () => window.removeEventListener('paste', paste)
  }, [imageHover, mode, selectImage])

  useEffect(() => {
    const element = scroll.current
    if (!element) return
    const update = () => {
      const top = element.scrollTop > 1
      const bottom = element.scrollTop + element.clientHeight < element.scrollHeight - 1
      setScrollFade((current) =>
        current.top === top && current.bottom === bottom ? current : { bottom, top },
      )
    }
    const observer = new ResizeObserver(update)
    observer.observe(element)
    for (const child of element.children) observer.observe(child)
    element.addEventListener('scroll', update, { passive: true })
    update()
    return () => {
      observer.disconnect()
      element.removeEventListener('scroll', update)
    }
  }, [])

  useEffect(() => {
    function press(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (event.key === 'Escape' && activeShortcut) {
        setActiveShortcut(undefined)
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        return
      }
      if (
        event.target instanceof Element &&
        event.target.closest('input:not([type="range"]), textarea, select, [contenteditable]')
      )
        return
      const shortcut = event.key.toLowerCase()
      if (mobile && shortcut === shortcuts.export) return
      const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      if (direction && activeShortcut) setPressedKey(shortcut as PressedKey)

      if (direction && activeShortcut === shortcuts.background) {
        const panel = scroll.current?.querySelector<HTMLElement>(`#background-${mode}`)
        const options = [
          ...(panel?.querySelectorAll<HTMLElement>('button, label[tabindex="0"]') ?? []),
        ]
        const selected = options.findIndex(
          (option) =>
            option === document.activeElement || option.getAttribute('aria-pressed') === 'true',
        )
        const next = options[selected + direction]
        if (next) selectBackgroundOption(next)
        else {
          const nextMode = modes[(modes.indexOf(mode) + direction + modes.length) % modes.length]
          if (!nextMode) return
          setMode(nextMode)
          requestAnimationFrame(() => {
            const nextPanel = scroll.current?.querySelector<HTMLElement>(`#background-${nextMode}`)
            const nextOptions = [
              ...(nextPanel?.querySelectorAll<HTMLElement>('button, label[tabindex="0"]') ?? []),
            ]
            const option = direction > 0 ? nextOptions[0] : nextOptions.at(-1)
            if (option) selectBackgroundOption(option)
          })
        }
        event.preventDefault()
        return
      }

      if (direction && activeShortcut === shortcuts.export) {
        const buttons = [
          ...(scroll.current?.querySelectorAll<HTMLButtonElement>(
            `[data-shortcut="${shortcuts.export}"] button`,
          ) ?? []),
        ]
        const selected = buttons.indexOf(document.activeElement as HTMLButtonElement)
        buttons[(selected + direction + buttons.length) % buttons.length]?.focus()
        event.preventDefault()
        return
      }

      if (shortcut === shortcuts.types && checkable) {
        setPressedKey(shortcut)
        onChange({ types: !types })
      } else if (shortcut === shortcuts.titleBar) {
        setPressedKey(shortcut)
        onChange({ titleBar: !titleBar })
      } else if (shortcut === shortcuts.background) {
        activate(shortcut)
        requestAnimationFrame(() => {
          const panel = scroll.current?.querySelector<HTMLElement>(`#background-${mode}`)
          const option =
            panel?.querySelector<HTMLElement>('[aria-pressed="true"]') ??
            panel?.querySelector<HTMLElement>('button, label[tabindex="0"]')
          option?.focus()
        })
      } else if (shortcut === shortcuts.language || shortcut === shortcuts.syntax) {
        activate(shortcut)
        const label = shortcut === shortcuts.language ? 'Language' : 'Syntax theme'
        requestAnimationFrame(() => {
          scroll.current
            ?.querySelector<HTMLElement>(`[data-section="${shortcut}"] [role="combobox"]`)
            ?.click()
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLInputElement>(`[aria-label="Search ${label.toLowerCase()}"]`)
              ?.focus(),
          )
        })
      } else if (arrows(shortcut)) {
        // `background` is the one arrow-driven shortcut handled above, so what
        // reaches here is the export menu and the three sliders.
        activate(shortcut)
        requestAnimationFrame(() => {
          const selector = shortcut === shortcuts.export ? 'button' : 'input[type="range"]'
          const control = scroll.current?.querySelector<HTMLElement>(
            `[data-shortcut="${shortcut}"] ${selector}`,
          )
          control?.focus()
        })
      } else return
      event.preventDefault()
    }

    function activate(shortcut: Shortcut) {
      setPressedKey(shortcut)
      setActiveShortcut(arrows(shortcut) ? shortcut : undefined)
      requestAnimationFrame(() => {
        scroll.current
          ?.querySelector<HTMLElement>(`[data-section="${shortcut}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }

    function release(event: KeyboardEvent) {
      const key = event.key.toLowerCase()
      setPressedKey((current) => (current === key ? undefined : current))
    }

    function selectBackgroundOption(option: HTMLElement) {
      option.focus()
      if (option instanceof HTMLButtonElement) option.click()
    }

    window.addEventListener('keydown', press)
    window.addEventListener('keyup', release)
    window.addEventListener('blur', clearPressedKey)
    return () => {
      window.removeEventListener('keydown', press)
      window.removeEventListener('keyup', release)
      window.removeEventListener('blur', clearPressedKey)
    }

    function clearPressedKey() {
      setPressedKey(undefined)
    }
  }, [activeShortcut, checkable, mobile, mode, onChange, titleBar, types])

  useEffect(() => {
    if (!activeShortcut) return
    function pointer(event: PointerEvent) {
      if (
        event.target instanceof Element &&
        event.target.closest(`[data-shortcut="${activeShortcut}"]`)
      )
        return
      setActiveShortcut(undefined)
    }
    window.addEventListener('pointerdown', pointer)
    return () => window.removeEventListener('pointerdown', pointer)
  }, [activeShortcut])

  return (
    <aside
      aria-hidden={!open}
      aria-label="Editor controls"
      id="editor-controls"
      inert={!open}
      {...stylex.props(styles.root, !open && styles.rootClosed)}
    >
      <div {...stylex.props(styles.surface)}>
        <header {...stylex.props(styles.mobileHeader)}>
          <span aria-label="Monoshot" role="img" {...stylex.props(styles.mobileWordmark)} />
          <Button
            aria-label="Close controls"
            onClick={onClose}
            size="large"
            square
            style={styles.mobileButton}
            variant="tertiary"
          >
            <svg aria-hidden viewBox="0 0 24 24" {...stylex.props(styles.mobileIcon)}>
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </Button>
        </header>
        <div
          ref={scroll}
          {...stylex.props(styles.scroll, styles.scrollMask(scrollFade.top, scrollFade.bottom))}
        >
          <section
            data-section={shortcuts.export}
            data-shortcut={shortcuts.export}
            {...stylex.props(styles.section, styles.desktopSection)}
          >
            <SectionHeading
              active={activeShortcut === shortcuts.export}
              pressed={pressedKey}
              shortcut={shortcuts.export}
            >
              Export
            </SectionHeading>
            <div {...stylex.props(styles.exports)}>
              <Button
                aria-busy={exporting.has('png')}
                disabled={exporting.has('png')}
                onClick={() => onSave({ scale: 6, type: 'png' })}
                size="small"
                variant="chrome"
              >
                {exporting.has('png') && <Spinner />}
                {exporting.has('png') ? 'Exporting' : 'PNG'}
              </Button>
              <Button
                aria-busy={exporting.has('svg')}
                disabled={exporting.has('svg')}
                onClick={() => onSave({ scale: 1, type: 'svg' })}
                size="small"
                variant="chrome"
              >
                {exporting.has('svg') && <Spinner />}
                {exporting.has('svg') ? 'Exporting' : 'SVG'}
              </Button>
              <Button
                aria-busy={exporting.has('image')}
                disabled={exporting.has('image')}
                onClick={onCopyImage}
                size="small"
                variant="chrome"
              >
                {exporting.has('image') && <Spinner />}
                {exporting.has('image') ? 'Copying' : 'Copy image'}
              </Button>
              <Button
                aria-busy={exporting.has('url')}
                disabled={exporting.has('url')}
                onClick={onCopyUrl}
                size="small"
                variant="chrome"
              >
                {exporting.has('url') && <Spinner />}
                {exporting.has('url') ? 'Copying' : 'Copy URL'}
              </Button>
            </div>
          </section>

          <section
            data-section={shortcuts.background}
            data-shortcut={shortcuts.background}
            {...stylex.props(styles.section)}
          >
            <SectionHeading
              active={activeShortcut === shortcuts.background}
              pressed={pressedKey}
              shortcut={shortcuts.background}
            >
              Theme
            </SectionHeading>
            <MotionConfig reducedMotion="user">
              <div aria-label="Background type" role="tablist" {...stylex.props(styles.tabs)}>
                {modes.map((entry) => {
                  const selected = mode === entry
                  return (
                    <Button
                      aria-selected={selected}
                      key={entry}
                      onClick={() => setMode(entry)}
                      role="tab"
                      size="small"
                      style={[styles.tab, selected && styles.tabSelected]}
                      variant="chrome"
                    >
                      {selected && <SelectionRing row="tabs" />}
                      <span {...stylex.props(styles.tabLabel)}>
                        {entry[0]?.toUpperCase()}
                        {entry.slice(1)}
                      </span>
                    </Button>
                  )
                })}
              </div>
            </MotionConfig>

            <MotionConfig reducedMotion="user">
              <div
                aria-label={`${mode[0]?.toUpperCase()}${mode.slice(1)} backgrounds`}
                id={`background-${mode}`}
                role="tabpanel"
                {...stylex.props(styles.panel)}
              >
                {mode === 'wallpaper' ? (
                  <div {...stylex.props(styles.optionGrid)}>
                    {Wallpapers.list.map((wallpaper) => {
                      const value = Wallpapers.background(wallpaper.id)
                      const selected = background === value
                      return (
                        <button
                          aria-label={wallpaper.name}
                          aria-pressed={selected}
                          key={wallpaper.id}
                          onClick={() => onChange({ background: value })}
                          type="button"
                          {...stylex.props(
                            styles.option(`url("${Wallpapers.thumbnail(wallpaper.id)}")`),
                          )}
                        >
                          {selected && <SelectionRing row="wallpaper" />}
                        </button>
                      )
                    })}
                  </div>
                ) : mode === 'gradient' ? (
                  <>
                    <div {...stylex.props(styles.gradientFields)}>
                      {gradientColors.map((value, index) => (
                        <div key={index} {...stylex.props(styles.gradientField)}>
                          <label
                            aria-label={`Gradient color ${index + 1}`}
                            {...stylex.props(
                              styles.swatch,
                              styles.gradientPicker,
                              styles.swatchColor(value),
                            )}
                          >
                            <input
                              onChange={(event) => setGradientColor(index, event.target.value)}
                              type="color"
                              value={/^#[0-9A-F]{6}$/.test(value) ? value : defaultGradient[index]}
                              {...stylex.props(styles.colorInput)}
                            />
                          </label>
                          <Input
                            aria-label={`Gradient color ${index + 1} hex`}
                            onChange={(event) => setGradientColor(index, event.target.value)}
                            size="small"
                            style={styles.gradientInput}
                            value={value}
                          />
                        </div>
                      ))}
                    </div>
                    <div {...stylex.props(styles.optionGrid, styles.presets)}>
                      {Backgrounds.gradients.map((preset) => {
                        const value = Backgrounds.value(preset.colors)
                        const selected = background.toLowerCase() === value.toLowerCase()
                        return (
                          <button
                            aria-label={`${preset.name} gradient`}
                            aria-pressed={selected}
                            key={preset.name}
                            onClick={() => onChange({ background: value })}
                            type="button"
                            {...stylex.props(
                              styles.option(
                                `linear-gradient(135deg, ${preset.colors[0]}, ${preset.colors[1]})`,
                              ),
                            )}
                          >
                            {selected && <SelectionRing row="gradient" />}
                          </button>
                        )
                      })}
                    </div>
                  </>
                ) : mode === 'color' ? (
                  <>
                    <div {...stylex.props(styles.colorGrid)}>
                      <Swatch
                        label="Transparent"
                        onClick={() => onChange({ background: 'none' })}
                        selected={background === 'none'}
                        style={styles.swatchNone}
                      />
                      {backgrounds.map((value) => (
                        <Swatch
                          key={value}
                          label={value}
                          onClick={() => onChange({ background: value })}
                          selected={background === value}
                          style={styles.swatchColor(value)}
                        />
                      ))}
                      <label
                        aria-label="Custom color"
                        {...stylex.props(styles.swatch, styles.swatchCustom)}
                      >
                        <input
                          onChange={(event) => onChange({ background: event.target.value })}
                          type="color"
                          value={background.startsWith('#') ? background : '#3b82d6'}
                          {...stylex.props(styles.colorInput)}
                        />
                        {custom && <SelectionRing row="color" />}
                      </label>
                    </div>
                  </>
                ) : (
                  <>
                    <label
                      onDragEnter={() => setImageHover(true)}
                      onDragLeave={() => setImageHover(false)}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault()
                        setImageHover(false)
                        selectImage(event.dataTransfer.files[0])
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        imageInput.current?.click()
                      }}
                      onPointerEnter={() => setImageHover(true)}
                      onPointerLeave={() => setImageHover(false)}
                      tabIndex={0}
                      {...stylex.props(
                        styles.imageDrop(image),
                        imageHover && styles.imageDropActive,
                        text.copy13,
                      )}
                    >
                      <input
                        accept="image/*"
                        onChange={(event) => selectImage(event.target.files?.[0])}
                        ref={imageInput}
                        type="file"
                        {...stylex.props(styles.imageInput)}
                      />
                      <svg aria-hidden viewBox="0 0 24 24" {...stylex.props(styles.imageIcon)}>
                        <rect height="18" rx="2" width="18" x="3" y="3" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="m4 18 5-5 3 3 2-2 6 6" />
                      </svg>
                      <span>Click to select, drop image, or press ⌘V while hovering.</span>
                      {imageError && (
                        <span role="alert" {...stylex.props(styles.imageError, text.label10)}>
                          {imageError}
                        </span>
                      )}
                    </label>
                  </>
                )}
              </div>
            </MotionConfig>
          </section>

          <section data-section={shortcuts.syntax} {...stylex.props(styles.section)}>
            <SectionHeading pressed={pressedKey} shortcut={shortcuts.syntax}>
              Syntax
            </SectionHeading>
            <PaletteSelect
              aria-label="Syntax theme"
              items={syntaxItems}
              onItemHighlighted={selectSyntax}
              onItemPreview={previewSyntax}
              onValueChange={selectSyntax}
              value={syntax}
            />
          </section>

          <section data-section={shortcuts.language} {...stylex.props(styles.section)}>
            <SectionHeading pressed={pressedKey} shortcut={shortcuts.language}>
              Language
            </SectionHeading>
            <LanguageSelect
              onValueChange={(language) => onChange({ language })}
              resolved={resolved}
              value={language}
            />
          </section>

          <section {...stylex.props(styles.section)}>
            <SectionHeading>Window</SectionHeading>
            <div {...stylex.props(styles.sliders)}>
              <SliderField
                active={activeShortcut === shortcuts.padding}
                label="Padding"
                max={Math.min(
                  mobile ? 16 : Number.POSITIVE_INFINITY,
                  Frame.maxPaddingFor(maxWidth, windowWidth),
                )}
                min={0}
                onChange={(value) =>
                  onChange({ padding: value, width: frameWidth + (value - padding) * 2 })
                }
                pressed={pressedKey}
                shortcut={shortcuts.padding}
                step={1}
                value={padding}
              />
              <SliderField
                active={activeShortcut === shortcuts.radius}
                label="Radius"
                max={Codec.bounds.radius.max}
                min={Codec.bounds.radius.min}
                onChange={(value) => onChange({ radius: value })}
                pressed={pressedKey}
                shortcut={shortcuts.radius}
                step={1}
                value={windowRadius}
              />
              <SliderField
                active={activeShortcut === shortcuts.width}
                label="Width"
                max={maxWidth - padding * 2}
                min={Frame.minWidth(padding) - padding * 2}
                onChange={(value) => onChange({ width: value + padding * 2 })}
                pressed={pressedKey}
                shortcut={shortcuts.width}
                step={1}
                value={windowWidth}
              />
            </div>
            <label {...stylex.props(styles.toggleRow, text.copy13)}>
              <span {...stylex.props(styles.toggleText)}>
                Title bar
                <ShortcutHint pressed={pressedKey} shortcut={shortcuts.titleBar} />
              </span>
              <Switch
                aria-label="Title bar"
                checked={titleBar}
                onCheckedChange={(checked) => onChange({ titleBar: checked })}
                style={styles.switch}
              />
            </label>
            <label {...stylex.props(styles.toggleRow, text.copy13)}>
              <span {...stylex.props(styles.toggleText)}>
                Types
                <ShortcutHint pressed={pressedKey} shortcut={shortcuts.types} />
              </span>
              <Switch
                aria-label="Types"
                checked={checkable && types}
                disabled={!checkable}
                onCheckedChange={(checked) => onChange({ types: checked })}
                style={styles.switch}
              />
            </label>
          </section>
        </div>
      </div>
    </aside>
  )
}

function SectionHeading(props: {
  active?: boolean | undefined
  children: string
  pressed?: PressedKey | undefined
  shortcut?: string | undefined
}) {
  return (
    <h3 {...stylex.props(styles.sectionHeading, text.label12)}>
      {props.children}
      {props.shortcut && (
        <ShortcutHint active={props.active} pressed={props.pressed} shortcut={props.shortcut} />
      )}
    </h3>
  )
}

function ShortcutHint(props: {
  active?: boolean | undefined
  pressed?: PressedKey | undefined
  shortcut: string
}) {
  if (!props.active)
    return (
      <kbd {...stylex.props(styles.key, props.pressed === props.shortcut && styles.keyActive)}>
        {props.shortcut}
      </kbd>
    )
  return (
    <span aria-label="Use Left or Right Arrow" {...stylex.props(styles.keyGroup)}>
      <kbd {...stylex.props(styles.key, props.pressed === 'arrowleft' && styles.keyActive)}>←</kbd>
      <kbd {...stylex.props(styles.key, props.pressed === 'arrowright' && styles.keyActive)}>→</kbd>
    </span>
  )
}

function SliderField(props: {
  active: boolean
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  pressed?: PressedKey | undefined
  shortcut: string
  step: number
  value: number
}) {
  const [value, setValue] = useState(props.value)
  const frame = useRef<number | undefined>(undefined)
  const interacting = useRef(false)
  const keyboardDirection = useRef(0)
  const keyboardFrame = useRef<number | undefined>(undefined)
  const keyboardValue = useRef(props.value)
  const latest = useRef(props.value)
  const lastSent = useRef(props.value)

  useEffect(() => {
    lastSent.current = props.value
    if (interacting.current) return
    keyboardValue.current = props.value
    latest.current = props.value
    setValue(props.value)
  }, [props.value])

  useEffect(
    () => () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
      if (keyboardFrame.current !== undefined) cancelAnimationFrame(keyboardFrame.current)
    },
    [],
  )

  const send = useCallback(
    (next: number) => {
      if (next === lastSent.current) return
      lastSent.current = next
      props.onChange(next)
    },
    [props.onChange],
  )

  function nudge(event: ReactKeyboardEvent) {
    const direction =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -1
          : 0
    if (!direction) return
    event.preventDefault()
    if (keyboardFrame.current !== undefined && keyboardDirection.current === direction) return

    stopScrub()
    keyboardDirection.current = direction
    keyboardValue.current = latest.current
    const range = props.max - props.min
    const tap = Math.max(props.step * 2, Math.round(range / 40 / props.step) * props.step)
    stepKeyboard(direction, tap)
    const started = performance.now()
    const velocity = Math.max(props.step * 30, range * 0.6)
    let previous = started
    function scrub(now: number) {
      const elapsed = now - started
      const delta = Math.min(now - previous, 32) / 1_000
      previous = now
      if (elapsed >= 80) stepKeyboard(direction, velocity * delta)
      keyboardFrame.current = requestAnimationFrame(scrub)
    }
    keyboardFrame.current = requestAnimationFrame(scrub)
  }

  function stepKeyboard(direction: number, distance: number) {
    keyboardValue.current = Math.min(
      props.max,
      Math.max(props.min, keyboardValue.current + direction * distance),
    )
    const next = Math.round(keyboardValue.current / props.step) * props.step
    latest.current = next
    setValue(next)
    send(next)
  }

  function stopScrub() {
    if (keyboardFrame.current === undefined) return
    cancelAnimationFrame(keyboardFrame.current)
    keyboardFrame.current = undefined
    keyboardDirection.current = 0
  }

  return (
    <Slider.Root
      data-section={props.shortcut}
      data-shortcut={props.shortcut}
      max={props.max}
      min={props.min}
      onValueChange={(next) => {
        interacting.current = true
        keyboardValue.current = next
        latest.current = next
        setValue(next)
        if (frame.current !== undefined) return
        frame.current = requestAnimationFrame(() => {
          frame.current = undefined
          send(latest.current)
        })
      }}
      onValueCommitted={(next) => {
        interacting.current = false
        keyboardValue.current = next
        latest.current = next
        setValue(next)
        if (frame.current !== undefined) {
          cancelAnimationFrame(frame.current)
          frame.current = undefined
        }
        send(next)
      }}
      step={props.step}
      thumbAlignment="edge"
      value={value}
      {...stylex.props(styles.slider)}
    >
      <Slider.Label {...stylex.props(styles.sliderLabel, text.copy13)}>
        {props.label}
        <ShortcutHint active={props.active} pressed={props.pressed} shortcut={props.shortcut} />
      </Slider.Label>
      <Slider.Control {...stylex.props(styles.sliderControl)}>
        <Slider.Track {...stylex.props(styles.sliderTrack)}>
          <Slider.Indicator {...stylex.props(styles.sliderIndicator)} />
          <Slider.Thumb
            onBlur={stopScrub}
            onKeyDown={nudge}
            onKeyUp={stopScrub}
            {...stylex.props(styles.sliderThumb)}
          />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  )
}

/** One outline shared by the selected item in a row, so it moves instead of blinking. */
function SelectionRing(props: { row: 'color' | 'gradient' | 'tabs' | 'wallpaper' }) {
  return (
    <m.span
      aria-hidden
      layoutId={`theme-${props.row}-ring`}
      transition={tabSlide}
      {...stylex.props(styles.selectionRing)}
    />
  )
}

function Swatch(props: {
  label: string
  onClick: () => void
  selected: boolean
  style: stylex.StyleXStyles
}) {
  return (
    <button
      aria-label={props.label}
      aria-pressed={props.selected}
      onClick={props.onClick}
      type="button"
      {...stylex.props(styles.swatch, props.style)}
    >
      {props.selected && <SelectionRing row="color" />}
    </button>
  )
}

export declare namespace Drawer {
  /** Props for {@link Drawer}. */
  type Props = State & {
    /** Custom image currently used as the artwork backdrop. */
    image?: string | undefined
    /** Whether the editor is using its compact mobile constraints. */
    mobile: boolean
    /** Whether the controls are visible. */
    open: boolean
    /** Export actions currently in progress. */
    exporting: ReadonlySet<'image' | 'png' | 'svg' | 'url'>
    /** Receives only the settings that changed. */
    onChange: (next: Partial<State>) => void
    /** Hides the controls on compact screens. */
    onClose: () => void
    /** Puts the artwork on the clipboard as a PNG. */
    onCopyImage: () => void
    /** Puts a link to the state on screen on the clipboard. */
    onCopyUrl: () => void
    /** Replaces the local custom image backdrop. */
    onImageChange: (source: string) => void
    /** Largest artwork width that fits in the editor stage. */
    maxWidth: number
    /** Saves the artwork to the user's downloads. */
    onSave: (options: capture.Options) => void
    /** Temporarily previews syntax colors without changing the selected theme. */
    onSyntaxPreview: (theme: Theme.Info['name'] | undefined) => void
    /** Resolved language; under `auto`, this is the detected language. */
    resolved: detect.LanguageId
  }

  /** Everything the drawer can change. */
  type State = {
    /** Theme gradient, transparent, color, wallpaper, or local image backdrop. */
    background: string
    /** A pinned language, or `auto` to read it from the code. */
    language: detect.LanguageId | 'auto'
    /** Space around the code window, in pixels. */
    padding: number
    /** Code window corner radius, in pixels. */
    radius: number
    /** A bundled theme's name, or one of the themes composed in the library. */
    theme: Theme.Info['name']
    /** Automatic backdrop-matched syntax, or a manually pinned theme. */
    syntax: 'auto' | Theme.Info['name']
    /** Whether the window shows its title bar. */
    titleBar: boolean
    /** Whether the snippet is type checked, which only a TypeScript one can be. */
    types: boolean
    /** Fixed artwork width in pixels, or intrinsic width when omitted. */
    width?: number | undefined
  }
}

/** `default` paints the theme's gradient; `none` exports a transparent frame. */
export const backgrounds = [...Backgrounds.colors] as const

function modeFor(background: string): Mode {
  if (background === 'image') return 'image'
  if (Wallpapers.names(background)) return 'wallpaper'
  if (background.startsWith('gradient:')) return 'gradient'
  if (background === 'none' || background.startsWith('#')) return 'color'
  return 'gradient'
}

/**
 * Gradient stops in the case the hex inputs hold them. `setGradientColor`
 * uppercases what it writes, and validates against an uppercase pattern.
 */
function gradientStops(background: string): [string, string] | undefined {
  const stops = Backgrounds.gradient(background)
  return stops && [stops[0].toUpperCase(), stops[1].toUpperCase()]
}
