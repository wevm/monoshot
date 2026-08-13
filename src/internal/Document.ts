import * as Theme from '../Theme.js'

/** Font data embedded in the standalone document. */
export type Font = {
  /** Family name registered by the stylesheet and used by the code font stack. */
  family: string
  /** A `data:` URL holding the font itself. Any other URL is rejected. */
  source: string
  /** Defaults to `normal`. */
  style?: string | undefined
  /** A single weight or a variable range, such as `100 900`. */
  weight?: string | undefined
}

/** Everything the document needs beyond the highlighted markup. */
export type Options = {
  /**
   * `default` paints the theme's gradient, `none` leaves it transparent, a
   * `wallpaper:<id>` uses {@link picture} when provided and otherwise uses the
   * theme gradient. Any other value becomes the canvas CSS background.
   */
  background: string
  /** The code, already highlighted. */
  html: string
  /** Whether the html carries twoslash blocks, which need their own styles. */
  annotated?: boolean | undefined
  /** Space in pixels between the backdrop's edge and the window. */
  padding: number
  /**
   * Fixed canvas height in pixels. Centers the window and clips overflow.
   * Defaults to following the window's own height.
   */
  height?: number | undefined
  /** Embedded backdrop image as a data URL. Overrides {@link background}. */
  picture?: string | undefined
  /** Frame colors, derived from the theme the code was highlighted with. */
  palette: Theme.derive.Result
  /** Corner radius of the window, in pixels. */
  radius: number
  /** Window title. An empty title renders as `untitled`. */
  title: string
  /** Whether to draw the title bar above the code. */
  titleBar: boolean
  /** Width of the backdrop in pixels, padding included. */
  width: number
  /**
   * Fonts to embed. The first family listed leads the code font stack, so a
   * document renders the same anywhere. Defaults to none.
   */
  fonts?: readonly Font[] | undefined
}

/**
 * Builds a standalone document for a frame: no scripts, no requests, and every
 * font inlined. This is what a headless browser screenshots, so it is the one
 * contract the CLI and the image API share.
 *
 * Throws `UnsafeValueError` when `background` or a font field carries CSS that
 * would leave the stylesheet or fetch a resource.
 */
export function build(options: Options): string {
  const { background, html, padding, palette, radius, title, titleBar, width } = options
  const styles = options.annotated === true ? annotations(palette) : ''
  const fonts = options.fonts ?? []
  // Use the theme gradient when a wallpaper identifier has no embedded image.
  const named = background.startsWith('wallpaper:')
  const backdrop = options.picture
    ? `url("${source(options.picture, 'picture')}") center / cover`
    : background === 'none'
      ? 'transparent'
      : background === 'default' || named
        ? `linear-gradient(${palette.backdrop.angle}deg, ${palette.backdrop.from}, ${palette.backdrop.to})`
        : css(background, 'background')
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
${fontFaces(fonts)}
:root {
  --code-font-family: ${fontStack(fonts)};
  --code-font-size: 14px;
  --code-line-height: 22px;
  --code-tab-size: 2;
  --code-annotation-size: 12px;
  /* What the window insets its code by, so a marked line can reach past it. */
  --body-inset: 16px;
  --window-background: ${palette.window.background};
  --window-border: ${palette.window.border};
  --window-shadow: ${shadow[palette.type]};
  --window-title: ${palette.window.title};
}
* { box-sizing: border-box; margin: 0; }
body { -webkit-font-smoothing: antialiased; }
.canvas {
  align-items: center;
  background: ${backdrop};
  display: flex;
  ${options.height === undefined ? '' : `height: ${options.height}px;\n  overflow: hidden;`}
  padding: ${padding}px;
  width: ${width}px;
}
.window {
  background-color: var(--window-background);
  border-radius: ${radius}px;
  box-shadow: 0 0 0 1px var(--window-border), var(--window-shadow);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  width: 100%;
}
.title-bar {
  align-items: center;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  padding: 12px 16px;
}
.lights { display: flex; gap: 8px; }
.light {
  background-color: var(--window-border);
  border-radius: 999px;
  height: 12px;
  width: 12px;
}
.title {
  color: var(--window-title);
  font-family: var(--code-font-family);
  font-size: 13px;
  text-align: center;
}
.body {
  color: ${palette.window.foreground};
  padding: ${titleBar ? '4px' : '8px'} var(--body-inset);
}
.shiki, .shiki code {
  background: transparent !important;
  font-family: var(--code-font-family);
  font-size: var(--code-font-size);
  font-variant-ligatures: none;
  line-height: var(--code-line-height);
  /* Whitespace is the only break pre-wrap offers, and the window clips the
     rest: a long identifier or URL would run out of the image. */
  overflow-wrap: anywhere;
  tab-size: var(--code-tab-size);
  white-space: pre-wrap;
}
.shiki { padding-block: 12px; }
${marked(html) ? marks(palette) : ''}
${styles}
.twoslash-block {
  display: flex;
  padding-block: 8px 4px;
  padding-inline-start: max(0px, calc(var(--twoslash-column) * 1ch - 8px));
}
.twoslash-block > .twoslash {
  background-color: color-mix(in oklab, currentColor 7%, var(--window-background));
  box-shadow: inset 0 0 0 1px var(--window-border);
  font-family: var(--code-font-family);
  font-size: var(--code-annotation-size);
  line-height: 1.5;
  padding: 6px 10px;
  position: relative;
  white-space: pre-wrap;
}
.twoslash-block > .twoslash::before {
  background-color: inherit;
  border-left: 1px solid var(--window-border);
  border-top: 1px solid var(--window-border);
  content: '';
  height: 7px;
  left: 8px;
  position: absolute;
  top: -4px;
  transform: rotate(45deg);
  width: 7px;
}
</style>
</head>
<body>
<div class="canvas">
  <div class="window">
${titleBar ? titleBarMarkup(title) : ''}
    <div class="body">${html}</div>
  </div>
</div>
</body>
</html>`
}

/**
 * The window's depth, one arm per surface type. Mirrors the preview's
 * `shadow.window` token, resolved here because a standalone document sets no
 * `color-scheme` for `light-dark()` to read.
 */
const shadow = {
  dark: '0 24px 48px -12px #00000059',
  light: '0 24px 48px -12px #00000026',
} as const

/**
 * Styles for the blocks twoslash renders in place of a `^?` line. Only the
 * static shapes: the hover popovers in the upstream stylesheet need a pointer,
 * and an image has none.
 *
 * Exported for consumers that embed annotated `Frame.render` output without a
 * standalone document.
 */
export function annotations(palette: Theme.derive.Result): string {
  const surface = `color-mix(in oklab, ${palette.window.foreground} 7%, ${palette.window.background})`
  return `.twoslash-popup-container {
  /* Every identifier carries one of these for a pointer to open. An image has
     no pointer, so only the block a \`^?\` asked for is drawn. */
  display: none;
}
.twoslash-meta-line {
  display: flex;
}
/* Preformatted only where the line holds code: a message and a tag are prose,
   and prose reaching the window's edge wraps rather than running out of it. */
.twoslash-query-line,
.twoslash-popup-code {
  white-space: pre;
}
.twoslash-query-line .twoslash-popup-container {
  /* Composited onto the window rather than left translucent, so the arrow
     hanging off the surface does not show the code through itself. */
  background: ${surface};
  border-radius: 4px;
  box-shadow: inset 0 0 0 1px ${palette.window.border};
  display: block;
  font-size: var(--code-annotation-size);
  /* Room for the block, which sits below the line it points at. */
  margin-bottom: 0.7em;
  /* Real types run long, so they wrap at a readable measure rather than
     stretching the window. */
  max-width: 64ch;
  position: relative;
  transform: translateY(0.5em);
  white-space: pre-wrap;
}
.twoslash-query-line .twoslash-popup-arrow {
  background: ${surface};
  border-left: 1px solid ${palette.window.border};
  border-top: 1px solid ${palette.window.border};
  height: 6px;
  left: 1em;
  position: absolute;
  top: -4px;
  transform: rotate(45deg);
  width: 6px;
}
.twoslash-query-line .twoslash-popup-code {
  display: block;
  padding: 6px 10px;
}
`
}

/**
 * Styles source marks as full-width rows with an edge indicator. These rules
 * are emitted only when the snippet contains marks.
 */
export function marked(html: string): boolean {
  // Read off a class attribute rather than the whole document: a snippet is
  // free to contain the word `has-diff` as code, and that is not a mark.
  return /class="[^"]*(?:has-(?:diff|focused|highlighted)|twoslash-(?:tag|error)-line)/.test(html)
}

export function marks(palette: Theme.derive.Result) {
  /**
   * Marked rows extend across the window. Embedded markup can define
   * `--body-inset`; otherwise the code reserves space for diff indicators.
   *
   * A pixel past it, since the window clips on a rounded rect: an edge landing
   * exactly on that clip is antialiased into it, leaving the window showing
   * through as a hairline.
   */
  const row = `  margin-inline: calc(-1px - var(--body-inset, 0px));
  padding-inline-start: calc(1px + var(--body-inset, 0px) + var(--mark-gutter));
  padding-inline-end: calc(1px + var(--body-inset, 0px));`
  /** A row's bar and wash, from one Theme.marks. */
  const mark = (
    color: string,
    strength = 16,
  ) => `  background-color: color-mix(in oklab, ${color} ${strength}%, transparent);
  box-shadow: inset 3px 0 0 ${color};`
  /**
   * Prose in a mark's hue. Darkened on a light window, where a hue picked to
   * read against a dark one is too pale to read as small text.
   */
  const prose = (color: string) =>
    palette.type === 'light' ? `color-mix(in oklab, ${color} 74%, black)` : color
  return `.shiki {
  --mark-gutter: 0px;
}
/* Reserve indicator space for embedded diff markup without a window inset.
   Highlight-only markup retains the normal code position. */
.shiki.has-diff {
  --mark-gutter: max(0px, 15px - var(--body-inset, 0px));
}
.shiki code {
  /* Rows, so a mark reaches the window rather than the text on the line. */
  display: grid;
  /* A row wraps at the window rather than reaching past it: an auto column is
     as wide as its widest line, and a grid item carries a minimum of its own
     content. */
  grid-template-columns: minmax(0, 1fr);
}
.shiki .line {
  /* Preserve blank-line height when code lines become grid items. */
  min-height: var(--code-line-height, 1lh);
  /* What a diff marker sits in, so it lands in the window's own inset. */
  position: relative;
}
.shiki .line,
.twoslash-error-line,
.twoslash-tag-line {
${row}
}
.shiki .line.highlighted {
${mark(palette.window.foreground, 8)}
}
/* Dim unfocused lines while preserving explicit highlights and diff marks. */
.shiki.has-focused .line:not(.focused):not(.highlighted):not(.diff) {
  opacity: 0.4;
}
.shiki .line.diff.add {
${mark(Theme.marks.add)}
}
.shiki .line.diff.remove {
${mark(Theme.marks.remove)}
}
/* The code being replaced reads as code that is gone: its own colors would
   still be claiming it. Drained rather than recolored, so what the syntax made
   of the line survives as light and dark. */
.shiki .line.diff.remove span {
  filter: grayscale(1);
  opacity: 0.8;
}
.shiki .line.diff::after {
  left: 6px;
  position: absolute;
}
.shiki .line.diff.add::after {
  color: ${prose(Theme.marks.add)};
  content: '+';
}
.shiki .line.diff.remove::after {
  color: ${prose(Theme.marks.remove)};
  content: '-';
}
/* Mark the source range associated with a compiler diagnostic. */
.twoslash-error {
  text-decoration: underline wavy ${Theme.marks.remove};
  text-decoration-skip-ink: none;
  text-underline-offset: 3px;
}
/* Render annotation tags and compiler diagnostics as semantic prose rows. */
.twoslash-error-line,
.twoslash-tag-line {
  align-items: center;
  /* Separate annotation prose from the source line it describes. */
  margin-top: 6px;
  display: flex;
  font-size: var(--code-annotation-size);
  gap: 6px;
  line-height: var(--code-line-height);
  min-height: var(--code-line-height);
}
.twoslash-tag-icon {
  /* Color identifies the annotation type, so an additional glyph is redundant. */
  display: none;
}
.twoslash-tag-log-line {
  color: ${prose(Theme.marks.log)};
${mark(Theme.marks.log)}
}
.twoslash-error-line,
.twoslash-tag-error-line {
  color: ${prose(Theme.marks.remove)};
${mark(Theme.marks.remove)}
}
.twoslash-tag-warn-line {
  color: ${prose(Theme.marks.warn)};
${mark(Theme.marks.warn)}
}
.twoslash-tag-annotate-line {
  color: ${prose(Theme.marks.add)};
${mark(Theme.marks.add)}
}`
}

function titleBarMarkup(title: string) {
  return `    <div class="title-bar">
      <div class="lights"><span class="light"></span><span class="light"></span><span class="light"></span></div>
      <span class="title">${escape(title || 'untitled')}</span>
    </div>`
}

function fontFaces(fonts: readonly Font[]) {
  return fonts
    .map(
      (font) => `@font-face {
  font-family: '${css(font.family, 'fonts[].family')}';
  font-style: ${css(font.style ?? 'normal', 'fonts[].style')};
  font-weight: ${css(font.weight ?? 'normal', 'fonts[].weight')};
  src: url(${source(font.source, 'fonts[].source')});
}`,
    )
    .join('\n')
}

/**
 * Lists embedded font families before the host monospace fallback.
 */
function fontStack(fonts: readonly Font[]) {
  const families = [...new Set([...fonts.map((font) => font.family), 'Geist Mono Variable'])]
  return [
    ...families.map((family) => `'${css(family, 'fonts[].family')}'`),
    'ui-monospace',
    `'SF Mono'`,
    'Menlo',
    'monospace',
  ].join(', ')
}

/**
 * A caller's CSS lands in a raw-text `<style>` element, so `<` would start
 * markup and a fetching function would reach the network, breaking the
 * standalone, script-free document this module promises. Banning `:` and `\`
 * leaves no scheme and no escape to spell those function names another way.
 */
const unsafe = /[<>{};:@'"\\]|url\(|image-set\(|src\(/i

function css(value: string, field: string) {
  if (unsafe.test(value)) throw new UnsafeValueError({ field, value })
  return value
}

/** Validates an embedded data URL for use in CSS or HTML attributes. */
function source(value: string, field: string) {
  if (!/^data:[^\s<>'"()\\]+$/.test(value)) throw new UnsafeValueError({ field, value })
  return value
}

/** The title is the one place a caller's text reaches the markup unhighlighted. */
function escape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Thrown when an option would escape the stylesheet or fetch a resource. */
export class UnsafeValueError extends Error {
  override name = 'Document.UnsafeValueError'

  constructor(options: { field: string; value: string }) {
    super(`\`${options.field}\` is not a safe standalone CSS value: ${options.value}`)
  }
}
