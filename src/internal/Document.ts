import type * as Theme from '../Theme.js'

/** A font to embed, so the document asks the network for nothing. */
export type Font = {
  /** The family name the stylesheet registers and the code font stack asks for. */
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
   * `default` paints the theme's gradient, `none` leaves it transparent, and
   * any other value is used as the CSS `background` of the canvas.
   */
  background: string
  /** The code, already highlighted. */
  html: string
  /** Whether the html carries twoslash blocks, which need their own styles. */
  annotated?: boolean | undefined
  /** Whether to draw a line-number gutter beside the code. */
  lineNumbers: boolean
  /** Space in pixels between the backdrop's edge and the window. */
  padding: number
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
  const { background, html, lineNumbers, padding, palette, radius, title, titleBar, width } =
    options
  const styles = options.annotated === true ? annotations(palette) : ''
  const fonts = options.fonts ?? []
  const backdrop =
    background === 'none'
      ? 'transparent'
      : background === 'default'
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
  background: ${backdrop};
  display: flex;
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
${lineNumbers ? gutter(html) : ''}
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
 * The gutter, sized to the document rather than read from the DOM: there is no
 * script here to measure it. A wrapped line hangs its continuation under the
 * code instead of under the numbers.
 */
function gutter(html: string) {
  // The numbering the render already did, rather than a bare `class="line"`:
  // a marked line carries its mark in the same attribute.
  const lines = (html.match(/data-line="/g) ?? []).length
  const width = String(Math.max(lines, 10)).length
  return `.shiki code {
  /* Grid, not blocked lines: shiki puts a real newline between them, which a
     block would render as height on top of the line box. Whitespace between
     grid items makes no row. */
  display: grid;
}
.shiki {
  /* Read back by a marked line, which insets its text by the gutter as well. */
  --gutter-inset: calc(${width}ch + 20px);
}
.shiki .line {
  padding-left: var(--gutter-inset);
  text-indent: calc(-1ch * ${width} - 20px);
}
.shiki .twoslash-meta-line {
  padding-left: calc(${width}ch + 20px);
}
.shiki .line::before {
  content: attr(data-line);
  display: inline-block;
  margin-right: 20px;
  opacity: 0.4;
  overflow: hidden;
  text-align: right;
  vertical-align: top;
  width: ${width}ch;
}`
}

/**
 * Styles for the blocks twoslash renders in place of a `^?` line. Only the
 * static shapes: the hover popovers in the upstream stylesheet need a pointer,
 * and an image has none.
 *
 * Exported because annotated markup is unreadable without them, and a caller
 * holding `Frame.render` output rather than a whole document still has to put
 * them somewhere.
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
.twoslash-error-line {
  color: ${palette.window.foreground};
  font-size: var(--code-annotation-size);
  opacity: 0.75;
  padding-bottom: 4px;
  white-space: pre-wrap;
}`
}

/** The hues a mark carries, which mean what they mean whatever the theme. */
const hue = {
  add: 'oklch(66% 0.15 150)',
  log: 'oklch(64% 0.15 250)',
  remove: 'oklch(62% 0.19 20)',
  warn: 'oklch(74% 0.14 80)',
} as const

/**
 * The marks a snippet carries, drawn as rows reaching the window's edges with
 * a bar down the side they start on. Present only when something is marked:
 * the rules turn the code into rows, which a snippet with nothing to mark has
 * no reason to become.
 */
export function marked(html: string): boolean {
  return /has-(diff|focused|highlighted)|twoslash-tag-line/.test(html)
}

export function marks(palette: Theme.derive.Result) {
  /**
   * A row: full width, past the inset the window holds its code at. A caller
   * embedding the markup declares `--body-inset` to say what that inset is;
   * without one the row reaches the code's own edges.
   */
  const row = `  margin-inline: calc(-1 * var(--body-inset, 0px));
  padding-inline-start: calc(var(--body-inset, 0px) + var(--gutter-inset, 0px));
  padding-inline-end: var(--body-inset, 0px);`
  /** A row's bar and wash, from one hue. */
  const mark = (
    color: string,
  ) => `  background-color: color-mix(in oklab, ${color} 16%, transparent);
  box-shadow: inset 3px 0 0 ${color};`
  return `.shiki code {
  /* Rows, so a mark reaches the window rather than the text on the line. */
  display: grid;
}
.shiki .line {
  /* A row holding nothing is still a line of the snippet: as a grid item an
     empty one would take no height, and the blank lines would close up. */
  min-height: var(--code-line-height);
  /* What a diff marker sits in, so it lands in the window's own inset. */
  position: relative;
}
.shiki .line,
.twoslash-tag-line {
${row}
}
.shiki .line.highlighted {
${mark(palette.window.foreground)}
}
/* Focus says which lines matter, so the rest recede rather than being marked. */
.shiki.has-focused .line:not(.focused) {
  opacity: 0.4;
}
.shiki .line.diff.add {
${mark(hue.add)}
}
.shiki .line.diff.remove {
${mark(hue.remove)}
  opacity: 0.7;
}
/* Its own pseudo-element: the one before it draws a line number, which a diff
   line has too when the gutter is on. */
.shiki .line.diff::after {
  left: 6px;
  opacity: 0.8;
  position: absolute;
  /* The gutter indents the line's first box, which this is not part of. */
  text-indent: 0;
}
.shiki .line.diff.add::after {
  content: '+';
}
.shiki .line.diff.remove::after {
  content: '-';
}
/* A tag is prose the snippet carries, so it reads in the hue it was tagged
   with rather than in the code's own colors. */
.twoslash-tag-line {
  align-items: center;
  display: flex;
  font-size: var(--code-annotation-size);
  gap: 6px;
  line-height: var(--code-line-height);
  min-height: var(--code-line-height);
}
.twoslash-tag-icon {
  /* Sized here, since the renderer ships the glyph without dimensions and an
     SVG left to itself fills whatever row it lands in. */
  display: block;
  flex: none;
  height: 1.1em;
  width: 1.1em;
}
.twoslash-tag-icon svg {
  display: block;
  height: 100%;
  width: 100%;
}
.twoslash-tag-log-line {
  color: ${hue.log};
${mark(hue.log)}
}
.twoslash-tag-error-line {
  color: ${hue.remove};
${mark(hue.remove)}
}
.twoslash-tag-warn-line {
  color: ${hue.warn};
${mark(hue.warn)}
}
.twoslash-tag-annotate-line {
  color: ${hue.add};
${mark(hue.add)}
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
  src: url(${source(font.source)});
}`,
    )
    .join('\n')
}

/**
 * Embedded families lead, so the document asks for the face it carries rather
 * than whatever monospace the host happens to have.
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

/** Font data is embedded, never fetched, so only a `data:` URL is a font here. */
function source(value: string) {
  if (!/^data:[^\s<>'"()\\]+$/.test(value))
    throw new UnsafeValueError({ field: 'fonts[].source', value })
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
