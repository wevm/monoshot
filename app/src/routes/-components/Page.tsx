import * as stylex from '@stylexjs/stylex'
import { useNavigate } from '@tanstack/react-router'
import { Codec, Frame as Core, Theme } from 'monoshot'
import { AnimatePresence, MotionConfig, motion as m } from 'motion/react'
import type { BundledLanguage } from 'shiki'
import { Toaster, toast } from 'sonner'
import { flushSync } from 'react-dom'
import type { Dispatch, SetStateAction } from 'react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import * as Backgrounds from '#/lib/backgrounds.js'
import { detect, languages, preferred } from '#/lib/detect.js'
import type { LanguageId } from '#/lib/detect.js'
import { bare } from '#/lib/editor/notations.js'
import * as Export from '#/lib/export.js'
import * as Links from '#/lib/links.js'
import * as Opening from '#/lib/opening.js'
import { sample } from '#/lib/sample.js'
import * as Themes from '#/lib/themes.js'
import * as Twoslash from '#/lib/twoslash/client.js'
import { dialects } from '#/lib/twoslash/options.js'
import * as Sample from '#/lib/twoslash/sample.gen.js'
import { without } from '#/lib/twoslash/protocol.js'
import * as Wallpapers from '#/lib/wallpapers.js'
import { text } from '#/theme/text.js'
import { Button } from '#/ui/Button.js'
import { Menu } from '#/ui/Menu.js'
import { Spinner } from '#/ui/Spinner.js'
import { color, crossfade, font, motion, radius, shadow } from '../../theme/tokens.stylex.js'
import { Drawer } from './Drawer.js'
import { Editor } from './Editor.js'
import { Frame } from './Frame.js'

const loadingReveal = stylex.keyframes({
  from: { clipPath: 'inset(0 100% 0 0)', opacity: 0.7 },
  to: { clipPath: 'inset(0)', opacity: 1 },
})

const styles = stylex.create({
  offscreen: {
    // In the document so it lays out at its real size, off the page so it is
    // never seen. Not `display: none`, which would give it no box at all.
    insetBlockStart: 0,
    insetInlineStart: 0,
    pointerEvents: 'none',
    position: 'fixed',
    transform: 'translateX(calc(-100% - 1px))',
    width: 'max-content',
  },
  page: {
    display: 'flex',
    flexDirection: 'column',
    fontFamily: font.mono,
    minHeight: '100dvh',
    transitionDuration: motion.medium,
    paddingInlineEnd: { default: 0, '@media (min-width: 800px)': 352 },
    transitionProperty: 'background-color, color',
    transitionTimingFunction: motion.out,
  },
  // The shell takes its colors from the artwork, so the app recedes behind it.
  canvasColor: (surface: { background: string; foreground: string }) => ({
    backgroundColor: surface.background,
    color: surface.foreground,
  }),
  // One full-page picture sits behind the transparent live artwork. Keeping a
  // single copy prevents the seams caused by independently covered boxes.
  canvasPicture: {
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
    insetBlock: 0,
    insetInlineStart: 0,
    insetInlineEnd: { default: 0, '@media (min-width: 800px)': 352 },
    pointerEvents: 'none',
    position: 'fixed',
    zIndex: 0,
  },
  canvasPictureSource: (source: string) => ({ backgroundImage: `url("${source}")` }),
  header: {
    alignItems: 'center',
    display: 'flex',
    height: { default: 64, '@media (min-width: 800px)': 56 },
    justifyContent: 'space-between',
    paddingInline: { default: 16, '@media (min-width: 800px)': 20 },
    position: 'relative',
    zIndex: 2,
  },
  wordmark: {
    backgroundColor: 'currentColor',
    blockSize: { default: 22, '@media (min-width: 800px)': 26 },
    display: 'block',
    inlineSize: { default: 86, '@media (min-width: 800px)': 101 },
    maskImage: 'url("/logo-light.svg")',
    maskPosition: 'center',
    maskRepeat: 'no-repeat',
    maskSize: 'contain',
  },
  toastAnchor: {
    height: 32,
    insetBlockStart: { default: 64, '@media (min-width: 800px)': 12 },
    insetInlineEnd: { default: 16, '@media (min-width: 800px)': 20 },
    maxWidth: 'calc(100vw - 32px)',
    pointerEvents: 'none',
    position: 'absolute',
    width: 356,
    zIndex: 6,
  },
  toast: {
    alignItems: 'center',
    backdropFilter: 'blur(32px) saturate(180%)',
    backgroundColor: {
      default: color.chromeTranslucent,
      '@media (prefers-reduced-transparency: reduce)': color.chrome,
    },
    borderRadius: radius.control,
    boxShadow: shadow.floating,
    color: color.onChrome,
    display: 'flex',
    fontFamily: font.mono,
    height: 32,
    paddingInline: 10,
  },
  stage: {
    alignItems: 'center',
    display: 'flex',
    flex: 1,
    justifyContent: 'safe center',
    minWidth: 0,
    overflowX: 'auto',
    paddingBlock: 24,
    paddingInline: { default: 10, '@media (min-width: 800px)': 24 },
    position: 'relative',
    zIndex: 2,
  },
  canvas: { flexShrink: 0, maxWidth: '100%' },
  mobileActions: {
    alignItems: 'center',
    display: { default: 'flex', '@media (min-width: 800px)': 'none' },
    insetBlockStart: 8,
    insetInlineEnd: 16,
    position: 'fixed',
    zIndex: 5,
  },
  mobileExport: { height: 48 },
  mobileToggle: {
    backgroundColor: {
      default: 'transparent',
      ':active': 'transparent',
      ':hover': 'transparent',
    },
  },
  mobileToggleIcon: {
    fill: 'none',
    height: 20,
    stroke: 'currentColor',
    strokeLinecap: 'round',
    strokeWidth: 1.75,
    width: 20,
  },
  scrim: { inset: 0, pointerEvents: 'none', position: 'fixed', zIndex: 0 },
  scrimBlock: (box: {
    color: string
    height: number
    left: number
    top: number
    width: number
  }) => ({
    backgroundColor: box.color,
    height: Math.max(0, box.height),
    left: box.left,
    position: 'absolute',
    top: box.top,
    width: Math.max(0, box.width),
  }),
  // Crop guides: dashed lines continuing the artwork's edges across the
  // viewport. Fixed and measured, so they never add to the page's own size.
  // The page stacks in three layers: guides over the artwork (a solid fill
  // would otherwise paint over them, which is exactly when the crop edge is
  // hardest to see), then the drawer.
  guides: { inset: 0, pointerEvents: 'none', position: 'fixed', zIndex: 1 },
  // A hairline drawn as a background rather than a border, so it stays exactly
  // one device-independent pixel and the dashes keep an even rhythm.
  guide: { opacity: 0.18, position: 'absolute' },
  guideRow: (edge: { from: number; to: number; top: number }) => ({
    backgroundImage: 'repeating-linear-gradient(to right, currentColor 0 4px, transparent 4px 8px)',
    height: 1,
    left: edge.from,
    top: edge.top,
    width: Math.max(0, edge.to - edge.from),
  }),
  guideColumn: (edge: { from: number; left: number; to: number }) => ({
    backgroundImage:
      'repeating-linear-gradient(to bottom, currentColor 0 4px, transparent 4px 8px)',
    height: Math.max(0, edge.to - edge.from),
    left: edge.left,
    top: edge.from,
    width: 1,
  }),
  // Reserves the frame's footprint so the first highlight does not shift the
  // page, and gives failures somewhere to speak.
  fallback: {
    alignItems: 'center',
    display: 'flex',
    justifyContent: 'center',
    minHeight: 320,
  },
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: color.background,
    color: color.gray1000,
    display: 'var(--loading-screen-display, flex)',
    inset: 0,
    justifyContent: 'center',
    opacity: 1,
    position: 'fixed',
    transitionDuration: motion.medium,
    transitionProperty: 'opacity',
    transitionTimingFunction: motion.out,
    zIndex: 100,
  },
  loadingScreenReady: { opacity: 0, pointerEvents: 'none' },
  loadingMark: { blockSize: 48, inlineSize: 184, position: 'relative' },
  loadingLogo: {
    backgroundColor: 'currentColor',
    inset: 0,
    maskImage: 'url("/logo-light.svg")',
    maskPosition: 'center',
    maskRepeat: 'no-repeat',
    maskSize: 'contain',
    position: 'absolute',
  },
  loadingLogoBase: { opacity: 0.16 },
  loadingLogoReveal: {
    animationDirection: 'alternate',
    animationDuration: motion.slow,
    animationIterationCount: 'infinite',
    animationName: loadingReveal,
    animationTimingFunction: motion.inOut,
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
      clipPath: 'inset(0)',
      opacity: 0.7,
    },
  },
})

/** Interactive editor initialized from an optional server-visible shared state. */
export function Page({ state }: { state?: string | undefined } = {}) {
  const { code, setCode, settings, setSettings, setTitle, title } = useDocumentState(state)
  const [syntaxPreview, setSyntaxPreview] = useState<Theme.Info['name']>()
  const [controlsOpen, setControlsOpen] = useState(false)
  const notice = useCallback((message: string | undefined) => {
    if (message) toast(message, { id: noticeId })
    else toast.dismiss(noticeId)
  }, [])
  const mobile = useMobile()
  const syntaxTheme = syntaxPreview ?? settings.theme
  const {
    annotations,
    complete,
    diagnostics,
    error,
    frame,
    ignored,
    language,
    resolved,
    setIgnored,
    typesPending,
  } = useCodeRendering({
    code,
    language: settings.language,
    syntaxTheme,
    types: settings.types,
  })

  const { image, picture, pictureReady, setImage, wallpaper } = useBackground({
    onError: notice,
    settings,
    setSettings,
  })
  const opening = useOpening({ error, frame, pictureReady })

  const { artwork, copyImage, copyUrl, exporting, save, stage } = useExports(
    { code, ignored, language, resolved, settings, title, wallpaper },
    notice,
  )

  const [measure, rect] = useEdges()
  const frameWidthMax = Math.max(360, (rect?.width ?? 1600) - (mobile ? 20 : 400))

  useEffect(() => {
    setSettings((current) => {
      const padding = Math.min(current.padding, mobile ? 16 : Frame.maxPadding(frameWidthMax))
      const width =
        current.width === undefined
          ? undefined
          : Math.min(frameWidthMax, Math.max(Frame.minWidth(padding), current.width))
      if (padding === current.padding && width === current.width) return current
      return { ...current, padding, width }
    })
  }, [frameWidthMax, mobile])

  // The wallpaper and its cutout enter together. Before the artwork has bounds,
  // showing the picture would briefly brighten the whole page without a scrim.
  const visibleWallpaper = rect ? wallpaper : undefined

  // Held in refs so a render never re-registers the listener below. Every
  // handler is redeclared each render, and the page renders on every keystroke.
  const exports = useRef({ copyImage, copyUrl, save })
  exports.current = { copyImage, copyUrl, save }

  // Override browser defaults for shortcuts advertised by the export controls.
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.altKey || !(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 's') {
        event.preventDefault()
        exports.current.save({
          scale: event.shiftKey ? 1 : 2,
          type: event.shiftKey ? 'svg' : 'png',
        })
      } else if (key === 'c' && event.shiftKey) {
        // ⌘ only, as the controls advertise it. Ctrl+Shift+C is the element
        // picker on Windows and Linux, which the page has no business taking.
        if (!event.metaKey) return
        event.preventDefault()
        exports.current.copyUrl()
      } else if (key === 'c' && !event.shiftKey && !copying(event)) {
        event.preventDefault()
        exports.current.copyImage()
      }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [])

  // A dark fill lands on the same near-black the shell mixes to, leaving no
  // visible artwork edge, so the guides carry the crop the whole way across.
  const customGradient = Backgrounds.gradient(settings.background)
  const bleed =
    settings.background === 'none' ||
    (settings.background.startsWith('#') && lightness(settings.background) < 0.2) ||
    (customGradient?.every((color) => lightness(color) < 0.2) ?? false)

  // With no backdrop the window is the whole artwork, so the shell takes the
  // window's own colors and the two read as one surface.
  const canvas = (() => {
    if (!frame) return undefined
    if (settings.background === 'none') return frame.palette.window
    // Whatever the backdrop leads with owns the surface, so the shell takes a
    // darkened cast of it rather than sitting against an unrelated hue: the
    // chosen color, the gradient's first stop, or the picture's strongest color.
    const tint = settings.background.startsWith('#')
      ? settings.background
      : (customGradient?.[0] ?? wallpaper?.color)
    if (!tint) return frame.palette.page
    return {
      background: `color-mix(in oklab, ${tint} 22%, #08080a)`,
      foreground: frame.palette.page.foreground,
    }
  })()
  const scrim =
    canvas && visibleWallpaper
      ? `color-mix(in oklab, ${canvas.background} 82%, transparent)`
      : undefined

  return (
    <MotionConfig reducedMotion="user">
      <main
        aria-busy={opening}
        {...stylex.props(styles.page, canvas ? styles.canvasColor(canvas) : null)}
      >
        <div
          aria-hidden
          data-loading-screen
          {...stylex.props(styles.loadingScreen, !opening && styles.loadingScreenReady)}
        >
          <div {...stylex.props(styles.loadingMark)}>
            <span {...stylex.props(styles.loadingLogo, styles.loadingLogoBase)} />
            <span {...stylex.props(styles.loadingLogo, styles.loadingLogoReveal)} />
          </div>
        </div>

        <AnimatePresence initial={false}>
          {visibleWallpaper && (
            <m.div
              animate={{ opacity: 1 }}
              aria-hidden
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key={visibleWallpaper.source}
              transition={crossfade}
              {...stylex.props(
                styles.canvasPicture,
                styles.canvasPictureSource(visibleWallpaper.source),
              )}
            />
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {rect && scrim && visibleWallpaper && (
            <m.div
              animate={{ opacity: 1 }}
              aria-hidden
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key={`${visibleWallpaper.source}:${scrim}`}
              transition={crossfade}
              {...stylex.props(styles.scrim)}
            >
              {[
                { height: rect.top, left: 0, top: 0, width: rect.width },
                {
                  height: rect.bottom - rect.top,
                  left: 0,
                  top: rect.top,
                  width: rect.left,
                },
                {
                  height: rect.bottom - rect.top,
                  left: rect.right,
                  top: rect.top,
                  width: rect.width - rect.right,
                },
                {
                  height: rect.height - rect.bottom,
                  left: 0,
                  top: rect.bottom,
                  width: rect.width,
                },
              ].map((box) => (
                <span
                  key={`${box.left}-${box.top}`}
                  {...stylex.props(styles.scrimBlock({ ...box, color: scrim }))}
                />
              ))}
            </m.div>
          )}
        </AnimatePresence>

        {rect && (
          // Constrain guides to artwork bounds when a backdrop defines visible edges.
          <div aria-hidden {...stylex.props(styles.guides)}>
            {[rect.top, rect.bottom].map((top) =>
              (bleed
                ? [{ from: 0, to: rect.width }]
                : [
                    { from: 0, to: rect.left },
                    { from: rect.right, to: rect.width },
                  ]
              ).map((span) => (
                <span
                  key={`row-${top}-${span.from}`}
                  {...stylex.props(styles.guide, styles.guideRow({ ...span, top }))}
                />
              )),
            )}
            {[rect.left, rect.right].map((left) =>
              (bleed
                ? [{ from: 0, to: rect.height }]
                : [
                    { from: 0, to: rect.top },
                    { from: rect.bottom, to: rect.height },
                  ]
              ).map((span) => (
                <span
                  key={`column-${left}-${span.from}`}
                  {...stylex.props(styles.guide, styles.guideColumn({ ...span, left }))}
                />
              )),
            )}
          </div>
        )}

        <header {...stylex.props(styles.header)}>
          <span aria-label="Monoshot" role="img" {...stylex.props(styles.wordmark)} />
          {/* Inert rather than `aria-hidden`: the copy carries a title field and
            the frame's handles, which stay tabbable while a capture runs. */}
          <div inert ref={stage} {...stylex.props(styles.offscreen)}>
            {artwork ? (
              <Frame
                background={artwork.settings.background}
                onPaddingChange={() => {}}
                onWidthChange={() => {}}
                padding={artwork.settings.padding}
                onRadiusChange={() => {}}
                palette={artwork.palette}
                radius={artwork.settings.radius}
                title={artwork.title}
                titleBar={artwork.settings.titleBar}
                wallpaper={
                  artwork.wallpaper ? { source: artwork.wallpaper, spread: 'artwork' } : undefined
                }
                width={artwork.settings.width}
              >
                <Frame.Code css={artwork.css} html={artwork.html} />
              </Frame>
            ) : null}
          </div>
          <div {...stylex.props(styles.toastAnchor)}>
            <Toaster
              position="top-right"
              style={{
                bottom: 'auto',
                left: 'auto',
                maxWidth: '100%',
                position: 'absolute',
                right: 0,
                top: 0,
                width: '100%',
              }}
              toastOptions={{
                classNames: {
                  toast: stylex.props(styles.toast, text.copy13).className ?? '',
                },
                style: { left: 'auto', maxWidth: '100%', right: 0, width: 'fit-content' },
                unstyled: true,
              }}
            />
          </div>
        </header>

        <div {...stylex.props(styles.stage)}>
          <div {...stylex.props(styles.canvas)}>
            {error ? (
              <div role="alert" {...stylex.props(styles.fallback, text.copy14)}>
                Could not highlight this snippet.
              </div>
            ) : frame ? (
              <div ref={measure}>
                <Frame
                  background={
                    wallpaper || (picture && !pictureReady) ? 'none' : settings.background
                  }
                  maxWidth={frameWidthMax}
                  onPaddingChange={(padding) =>
                    setSettings((current) => {
                      const width = Math.min(
                        current.width ?? (rect ? Math.round(rect.right - rect.left) : 808),
                        frameWidthMax,
                      )
                      const windowWidth = width - current.padding * 2
                      const next = Math.min(
                        padding,
                        mobile ? 16 : Number.POSITIVE_INFINITY,
                        Frame.maxPaddingFor(frameWidthMax, windowWidth),
                      )
                      return {
                        ...current,
                        padding: next,
                        width: width + (next - current.padding) * 2,
                      }
                    })
                  }
                  onTitleChange={setTitle}
                  onWidthChange={(width) => setSettings((current) => ({ ...current, width }))}
                  padding={settings.padding}
                  onRadiusChange={(radius) => setSettings((current) => ({ ...current, radius }))}
                  palette={frame.palette}
                  radius={settings.radius}
                  responsive
                  title={title}
                  titleBar={settings.titleBar}
                  width={settings.width}
                >
                  <Editor
                    code={code}
                    diagnostics={diagnostics}
                    language={language}
                    onCodeChange={setCode}
                    onIgnore={setIgnored}
                    // Return no completions for unsupported languages or before resolver creation.
                    onComplete={complete}
                    palette={frame.palette}
                    tokens={frame.tokens}
                    types={annotations}
                    typesPending={typesPending}
                  />
                </Frame>
              </div>
            ) : (
              <div {...stylex.props(styles.fallback)} />
            )}
          </div>
        </div>

        <Drawer
          exporting={exporting}
          image={image}
          maxWidth={frameWidthMax}
          mobile={mobile}
          open={!mobile || controlsOpen}
          onCopyImage={copyImage}
          onCopyUrl={copyUrl}
          onClose={() => setControlsOpen(false)}
          onImageChange={setImage}
          onSave={save}
          onSyntaxPreview={setSyntaxPreview}
          resolved={language}
          {...settings}
          width={Math.min(
            settings.width ?? (rect ? Math.round(rect.right - rect.left) : frameWidthMax),
            frameWidthMax,
          )}
          onChange={(next) =>
            setSettings((current) => {
              const syntax = next.syntax ?? current.syntax
              const background = next.background ?? current.background
              const theme =
                syntax === 'auto' && (next.background !== undefined || next.syntax === 'auto')
                  ? Backgrounds.syntax(background, background === 'image' ? wallpaper?.colors : [])
                  : next.theme
              return merged(current, { ...next, ...(theme ? { theme } : {}) })
            })
          }
        />
        {mobile && !controlsOpen && (
          <div {...stylex.props(styles.mobileActions)}>
            <Menu
              label={
                exporting.size ? (
                  <>
                    <Spinner /> Working
                  </>
                ) : (
                  'Export'
                )
              }
              style={styles.mobileExport}
            >
              <Menu.Item
                disabled={exporting.has('png')}
                hint={exporting.has('png') ? <Spinner /> : undefined}
                onClick={() => save({ scale: 6, type: 'png' })}
              >
                {exporting.has('png') ? 'Exporting' : 'PNG'}
              </Menu.Item>
              <Menu.Item
                disabled={exporting.has('svg')}
                hint={exporting.has('svg') ? <Spinner /> : undefined}
                onClick={() => save({ scale: 1, type: 'svg' })}
              >
                {exporting.has('svg') ? 'Exporting' : 'SVG'}
              </Menu.Item>
              <Menu.Item
                disabled={exporting.has('image')}
                hint={exporting.has('image') ? <Spinner /> : undefined}
                onClick={copyImage}
              >
                {exporting.has('image') ? 'Copying' : 'Copy image'}
              </Menu.Item>
              <Menu.Item
                disabled={exporting.has('url')}
                hint={exporting.has('url') ? <Spinner /> : undefined}
                onClick={copyUrl}
              >
                {exporting.has('url') ? 'Copying' : 'Copy URL'}
              </Menu.Item>
            </Menu>
            <Button
              aria-controls="editor-controls"
              aria-expanded={false}
              aria-label="Open controls"
              onClick={() => setControlsOpen(true)}
              size="large"
              square
              style={styles.mobileToggle}
              variant="tertiary"
            >
              <svg aria-hidden viewBox="0 0 24 24" {...stylex.props(styles.mobileToggleIcon)}>
                <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6" />
              </svg>
            </Button>
          </div>
        )}
      </main>
    </MotionConfig>
  )
}

/**
 * Tracks the artwork's viewport rect so the crop guides can follow its edges.
 * Takes the node through a callback ref: the frame mounts after the first
 * render, which a ref object alone would not tell us about.
 */
function useEdges() {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [rect, setRect] = useState<Edges>()

  useLayoutEffect(() => {
    // Remove crop guides when the frame is unavailable.
    if (!node) {
      setRect(undefined)
      return
    }
    const read = () => {
      const box = node.getBoundingClientRect()
      const next = {
        bottom: box.bottom,
        height: window.innerHeight,
        left: box.left,
        right: box.right,
        top: box.top,
        width: window.innerWidth,
      }
      // Momentum scrolling and a settled ResizeObserver both report edges that
      // have not moved. Keeping the previous object leaves the page unrendered.
      setRect((current) =>
        current && (Object.keys(next) as (keyof Edges)[]).every((key) => current[key] === next[key])
          ? current
          : next,
      )
    }
    // One read per frame: every listener below fires faster than the page can
    // paint, and each read forces layout.
    let frame: number | undefined
    const measure = () => {
      if (frame !== undefined) return
      frame = requestAnimationFrame(() => {
        frame = undefined
        read()
      })
    }
    read()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, { passive: true })
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure)
    }
  }, [node])

  return [setNode, rect] as const
}

type Edges = {
  bottom: number
  /** Viewport size, so a guide can span it without reading layout at render. */
  height: number
  left: number
  right: number
  top: number
  width: number
}

/**
 * Whether native copy behavior should handle this keypress.
 * Inputs, editable content, and active selections retain the platform behavior.
 */
function copying(event: KeyboardEvent) {
  const { target } = event
  if (target instanceof Element && target.closest('input, textarea, [contenteditable]')) return true
  return getSelection()?.isCollapsed === false
}

const derived = new Map<string, Theme.derive.Result>()

/**
 * The palette of a syntax theme, one object per theme for the run.
 *
 * `Theme.derive` is deterministic, and the editor reconfigures its theme
 * compartment whenever the palette's identity changes. Deriving afresh on every
 * edit appends another CodeMirror style module, which style-mod never releases.
 */
function palette(name: string, theme: Parameters<typeof Theme.derive>[0]) {
  const cached = derived.get(name)
  if (cached) return cached
  const built = Theme.derive(theme)
  derived.set(name, built)
  return built
}

/** Rough perceptual lightness of a `#rrggbb` color, from 0 to 1. */
function lightness(hex: string) {
  if (hex.length !== 7) return 1
  const value = Number.parseInt(hex.slice(1), 16)
  if (Number.isNaN(value)) return 1
  return (
    (0.299 * ((value >> 16) & 255) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255)) / 255
  )
}

type Settings = Drawer.State

type DocumentState = { code: string; settings: Settings; title: string }

type Artwork = {
  css: string | undefined
  html: string
  palette: Theme.derive.Result
  settings: Settings
  title: string
  wallpaper: string | undefined
}

type Capture = {
  code: string
  types: Twoslash.Resolved['types'] | undefined
  language: LanguageId
  options: Export.capture.Options
  settings: Settings
  title: string
  wallpaper: string | undefined
}

type ExportAction = Export.capture.Options['type'] | 'image' | 'url'

const fallback: Settings = {
  background: 'wallpaper:golden-gate-dark',
  language: 'auto',
  padding: 64,
  radius: 12,
  syntax: 'auto',
  theme: 'golden-gate-dark',
  titleBar: false,
  types: true,
}

const names = Theme.list().map((entry) => entry.name)
const bareSample = bare(sample)
const empty: Editor.Props['types'] = []
const emptyOffsets: readonly number[] = []
const quiet: Editor.Props['diagnostics'] = []
const renderer = Core.create({ langs: ['tsx'] })
const highlighterReady =
  typeof window === 'undefined'
    ? Promise.resolve()
    : renderer.load({ lang: 'tsx', theme: fallback.theme }).catch(() => undefined)
const noticeId = 'export-notice'

function restore(hash: string): DocumentState {
  const state = Codec.deserialize(hash)
  const theme = names.find((name) => name === state.theme) ?? fallback.theme
  const language =
    state.lang === 'auto'
      ? 'auto'
      : (languages.find((entry) => entry.id === state.lang)?.id ?? 'auto')
  return {
    code: state.code || sample,
    settings: {
      background: state.background,
      language,
      padding: state.padding,
      radius: state.radius,
      syntax: state.syntax,
      theme,
      titleBar: state.titleBar,
      types: state.types,
      width: state.width,
    },
    title: state.title,
  }
}

function merged(current: Settings, next: Partial<Settings>): Settings {
  const settings = { ...current, ...next }
  if (!next.theme || next.theme === current.theme) return settings
  return { ...settings, ...Themes.reframe(current.theme, next.theme) }
}

function backdrop(settings: Settings) {
  return Wallpapers.at(settings.background)
}

function share({ code, settings, title }: DocumentState) {
  return Codec.serialize({
    background: settings.background === 'image' ? 'default' : settings.background,
    code,
    lang: settings.language,
    padding: settings.padding,
    radius: settings.radius,
    syntax: settings.syntax,
    theme:
      settings.background === 'image' && settings.syntax === 'auto'
        ? Backgrounds.syntax('default')
        : settings.theme,
    title,
    titleBar: settings.titleBar,
    types: settings.types,
    width: settings.width,
  })
}

/** Owns the code, title, and settings that persist together in the URL. */
function useDocumentState(sharedState: string | undefined) {
  const navigate = useNavigate()
  const [documentState, setDocumentState] = useState<DocumentState>(() =>
    sharedState ? restore(sharedState) : { code: sample, settings: fallback, title: '' },
  )

  useLayoutEffect(() => {
    if (sharedState || !Codec.readable(window.location.hash)) return
    setDocumentState(restore(window.location.hash))
  }, [sharedState])

  useEffect(() => {
    const timer = setTimeout(() => {
      const hash = share(documentState)
      if (sharedState === hash) return
      void navigate({ to: '/', hash, replace: true, resetScroll: false })
    }, 500)
    return () => clearTimeout(timer)
  }, [documentState, navigate, sharedState])

  const setCode = useCallback(
    (code: string) => setDocumentState((current) => ({ ...current, code })),
    [],
  )
  const setSettings = useCallback(
    (update: SetStateAction<Settings>) =>
      setDocumentState((current) => ({
        ...current,
        settings: typeof update === 'function' ? update(current.settings) : update,
      })),
    [],
  )
  const setTitle = useCallback(
    (title: string) => setDocumentState((current) => ({ ...current, title })),
    [],
  )

  return {
    ...documentState,
    setCode,
    setSettings,
    setTitle,
  }
}

function subscribeMobile(change: () => void) {
  const query = matchMedia('(max-width: 799px)')
  query.addEventListener('change', change)
  return () => query.removeEventListener('change', change)
}

function readMobile() {
  return matchMedia('(max-width: 799px)').matches
}

/** Subscribes to the responsive breakpoint without duplicating browser state. */
function useMobile() {
  return useSyncExternalStore(subscribeMobile, readMobile, () => false)
}

function resolvedSample(): Twoslash.Resolved {
  return {
    document: sample,
    lang: Sample.lang,
    result: Sample.result,
    types: Sample.types,
  }
}

async function paint(
  theme: Settings['theme'],
  annotations: Twoslash.Result['hovers'],
): Promise<Editor.Props['types']> {
  const entries = await Promise.all(
    [...new Set(annotations.map((annotation) => annotation.text))].map(async (text) => {
      const result = await renderer.tokens({ code: text, lang: 'ts', theme })
      return [text, result.tokens] as const
    }),
  )
  const painted = new Map(entries)
  return annotations.map((annotation) => ({
    annotation: painted.get(annotation.text) ?? [],
    from: annotation.from,
    to: annotation.to,
  }))
}

/** Owns language detection, highlighting, and compiler-backed editor results. */
function useCodeRendering(parameters: {
  code: string
  language: Settings['language']
  syntaxTheme: Settings['theme']
  types: boolean
}) {
  const { code, syntaxTheme, types } = parameters
  const [detected, setDetected] = useState<BundledLanguage>(() => {
    const source = bare(code)
    return source === bareSample ? preferred(Sample.language) : (detect(source) ?? 'tsx')
  })
  const language = parameters.language !== 'auto' ? parameters.language : detected
  const [frame, setFrame] = useState<{
    palette: Theme.derive.Result
    tokens: Editor.Props['tokens']
  }>()
  const [error, setError] = useState<Error>()
  const [annotations, setAnnotations] = useState<Editor.Props['types']>(empty)
  const [diagnostics, setDiagnostics] = useState<Editor.Props['diagnostics']>(quiet)
  const [ignored, setIgnored] = useState<readonly number[]>(emptyOffsets)
  const [resolved, setResolved] = useState<Twoslash.Resolved | undefined>(() =>
    code === sample ? resolvedSample() : undefined,
  )
  const [typesPending, setTypesPending] = useState(() =>
    Boolean(types && dialects[language as keyof typeof dialects] && code !== sample),
  )
  const resolver = useRef<ReturnType<typeof Twoslash.create>>(null)

  useEffect(() => {
    if (parameters.language !== 'auto') return
    const source = bare(code)
    if (source === bareSample) {
      setDetected(preferred(Sample.language))
      return
    }
    const timer = setTimeout(() => setDetected((current) => detect(source) ?? current), 400)
    return () => clearTimeout(timer)
  }, [code, parameters.language])

  useEffect(() => {
    let active = true
    highlighterReady
      .then(() => renderer.tokens({ code, lang: language, theme: syntaxTheme }))
      .then(
        (result) => {
          if (!active) return
          setError(undefined)
          setFrame({ palette: palette(syntaxTheme, result.theme), tokens: result.tokens })
        },
        (cause: Error) => {
          if (active) setError(cause)
        },
      )
    return () => {
      active = false
    }
  }, [code, language, syntaxTheme])

  useEffect(() => {
    resolver.current?.invalidate()
    const dialect = types ? dialects[language as keyof typeof dialects] : undefined
    if (!dialect) {
      setResolved(undefined)
      setTypesPending(false)
      return
    }
    resolver.current ??= Twoslash.create({
      onError: (message) => {
        console.error('Type resolution failed.', message)
        setResolved(undefined)
        setTypesPending(false)
      },
      onResult: (result) => {
        setResolved(result)
      },
    })
    if (code === sample && dialect === Sample.lang) {
      setResolved(resolvedSample())
      setTypesPending(false)
      return
    }
    setTypesPending(true)
    const timer = setTimeout(() => resolver.current?.resolve(code, dialect), 300)
    return () => clearTimeout(timer)
  }, [code, language, types])

  useEffect(() => () => resolver.current?.dispose(), [])

  useEffect(() => {
    if (!resolved) {
      setAnnotations(empty)
      setDiagnostics(quiet)
      return
    }
    if (resolved.document !== code || resolved.lang !== dialects[language as keyof typeof dialects])
      return
    setDiagnostics(resolved.result.diagnostics)
    let active = true
    void paint(syntaxTheme, resolved.result.hovers).then((painted) => {
      if (!active) return
      setAnnotations(painted)
      setTypesPending(false)
    })
    return () => {
      active = false
    }
  }, [code, language, resolved, syntaxTheme])

  return {
    annotations,
    complete: (document: string, position: number) => {
      const dialect = types ? dialects[language as keyof typeof dialects] : undefined
      if (!dialect) return Promise.resolve([])
      return resolver.current?.complete(document, dialect, position) ?? Promise.resolve([])
    },
    diagnostics,
    error,
    frame,
    ignored,
    language: language as LanguageId,
    resolved,
    setIgnored,
    typesPending,
  }
}

/** Owns background loading and its automatic syntax-theme pairing. */
function useBackground(parameters: {
  onError: (message: string) => void
  settings: Settings
  setSettings: Dispatch<SetStateAction<Settings>>
}) {
  const { onError, settings, setSettings } = parameters
  const [wallpaper, setWallpaper] = useState<Wallpapers.Picture>()
  const [image, setImage] = useState<string>()
  const [pictureReady, setPictureReady] = useState(false)
  const picture = backdrop(settings)?.id

  useEffect(() => {
    if (settings.background === 'image') {
      setWallpaper(image ? { source: image } : undefined)
      setPictureReady(true)
      if (image) {
        let active = true
        void Wallpapers.analyze(image).then(
          (colors) => {
            if (!active) return
            setWallpaper({ color: colors[0], colors, source: image })
            setSettings((current) =>
              current.background === 'image' && current.syntax === 'auto'
                ? merged(current, { theme: Backgrounds.syntax('image', colors) })
                : current,
            )
          },
          () => {},
        )
        return () => {
          active = false
        }
      }
      return
    }
    setPictureReady(!picture)
    if (!picture) {
      setWallpaper(undefined)
      return
    }
    let active = true
    void Promise.all([Wallpapers.embed(picture), Wallpapers.palette(picture)]).then(
      ([source, colors]) => {
        if (!active) return
        setWallpaper({ color: colors[0], colors, source })
        setSettings((current) =>
          backdrop(current)?.id === picture && current.syntax === 'auto'
            ? merged(current, { theme: Backgrounds.syntax(current.background, colors) })
            : current,
        )
        setPictureReady(true)
      },
      (cause: Error) => {
        if (!active) return
        onError(cause.message)
        setPictureReady(true)
      },
    )
    return () => {
      active = false
    }
  }, [image, onError, picture, setSettings, settings.background])

  useEffect(() => {
    void Wallpapers.preload()
  }, [])

  return { image, picture, pictureReady, setImage, wallpaper }
}

/** Latches the initial loading screen closed once the visual assets are ready. */
function useOpening(parameters: {
  error: Error | undefined
  frame: unknown
  pictureReady: boolean
}) {
  const [fontsReady, setFontsReady] = useState(false)
  const [opening, setOpening] = useState(true)

  useEffect(() => {
    let active = true
    void document.fonts.ready.then(() => {
      if (active) setFontsReady(true)
    })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (
      !opening ||
      !fontsReady ||
      !(parameters.error || (parameters.frame && parameters.pictureReady))
    )
      return
    setOpening(false)
    Opening.remember()
  }, [fontsReady, opening, parameters.error, parameters.frame, parameters.pictureReady])

  return opening
}

/** Owns the serialized capture queue and export feedback. */
function useExports(
  parameters: {
    code: string
    ignored: readonly number[]
    language: LanguageId
    resolved: Twoslash.Resolved | undefined
    settings: Settings
    title: string
    wallpaper: Wallpapers.Picture | undefined
  },
  notice: (message: string | undefined) => void,
) {
  const { code, ignored, language, resolved, settings, title, wallpaper } = parameters
  const [exporting, setExporting] = useState<ReadonlySet<ExportAction>>(() => new Set())
  const [artwork, setArtwork] = useState<Artwork>()
  const stage = useRef<HTMLDivElement>(null)
  const pending = useRef<Promise<unknown> | undefined>(undefined)
  const attempt = useRef(0)
  const counts = useRef(new Map<ExportAction, number>())

  async function draw(capture: Capture) {
    const { code, language, options, settings, title, types, wallpaper } = capture
    const rendered = await renderer.render({
      code,
      lang: language,
      theme: settings.theme,
      ...(types ? { twoslash: types } : {}),
    })
    const named = backdrop(settings)
    const picture = wallpaper ?? (named ? await Wallpapers.embed(named.id) : undefined)
    flushSync(() =>
      setArtwork({
        css: rendered.css,
        html: rendered.html,
        palette: Theme.derive(rendered.theme),
        settings,
        title,
        wallpaper: picture,
      }),
    )
    try {
      const node = stage.current?.firstElementChild
      if (!node) throw new Error('The artwork is not ready.')
      await document.fonts.ready
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      for (const animation of node.getAnimations({ subtree: true }))
        if (animation.playState !== 'idle') animation.finish()
      const size = node.getBoundingClientRect()
      return await Export.capture(node, { ...options, scale: Export.fit(size, options) })
    } finally {
      setArtwork(undefined)
    }
  }

  function take(options: Export.capture.Options) {
    const id = (attempt.current += 1)
    notice(undefined)
    const found = resolved?.document === code ? resolved.types : undefined
    const types = found && without(found, ignored)
    const capture: Capture = {
      code,
      language,
      options,
      settings,
      title,
      types,
      wallpaper: wallpaper?.source,
    }
    const run = Promise.resolve(pending.current)
      .catch(() => {})
      .then(() => draw(capture))
    pending.current = run.catch(() => {})
    return {
      complete(message: string) {
        if (attempt.current === id) notice(message)
      },
      report(cause: Error) {
        if (attempt.current === id) notice(cause.message)
      },
      run,
    }
  }

  function track(action: ExportAction, task: Promise<unknown>) {
    const count = (counts.current.get(action) ?? 0) + 1
    counts.current.set(action, count)
    flushSync(() => setExporting((current) => new Set(current).add(action)))
    const finish = () => {
      const remaining = (counts.current.get(action) ?? 1) - 1
      if (remaining > 0) counts.current.set(action, remaining)
      else counts.current.delete(action)
      setExporting((current) => {
        if (remaining > 0) return current
        const next = new Set(current)
        next.delete(action)
        return next
      })
    }
    void task.then(finish, finish)
  }

  function save(options: Export.capture.Options) {
    const { complete, report, run } = take(options)
    const name = `${title || 'untitled'}.${options.type}`
    track(
      options.type,
      run
        .then((blob) => Export.download(blob, { name }))
        .then(() => complete(`${options.type.toUpperCase()} saved.`))
        .catch(report),
    )
  }

  function copyImage() {
    const { complete, report, run } = take({ scale: 2, type: 'png' })
    track(
      'image',
      Export.copy(run)
        .then(() => complete('Image copied.'))
        .catch(report),
    )
  }

  function copyUrl() {
    const id = (attempt.current += 1)
    notice(undefined)
    const state = share({ code, settings, title })
    const long = new URL(window.location.href)
    long.hash = state
    const text = Links.shorten(state).catch(() => long.toString())
    const rich =
      typeof ClipboardItem === 'function' && typeof navigator.clipboard.write === 'function'
    const written = rich
      ? navigator.clipboard
          .write([
            new ClipboardItem({
              'text/plain': text.then((value) => new Blob([value], { type: 'text/plain' })),
            }),
          ])
          .catch(async () => navigator.clipboard.writeText(await text))
      : text.then((value) => navigator.clipboard.writeText(value))
    track(
      'url',
      written
        .then(() => {
          if (attempt.current === id) notice('Link copied.')
        })
        .catch(() => {
          if (attempt.current === id) notice('The link could not be copied.')
        }),
    )
  }

  return { artwork, copyImage, copyUrl, exporting, save, stage }
}
