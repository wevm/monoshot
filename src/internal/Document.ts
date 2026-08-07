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
  --window-background: ${palette.window.background};
  --window-border: ${palette.window.border};
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
  box-shadow: 0 0 0 1px var(--window-border);
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
  padding: ${titleBar ? '4px 16px' : '8px 16px'};
}
.shiki, .shiki code {
  background: transparent !important;
  font-family: var(--code-font-family);
  font-size: var(--code-font-size);
  font-variant-ligatures: none;
  line-height: var(--code-line-height);
  tab-size: var(--code-tab-size);
  white-space: pre-wrap;
}
.shiki { padding-block: 12px; }
${lineNumbers ? gutter(html) : ''}
.twoslash-block {
  display: flex;
  padding-block: 8px 4px;
  padding-inline-start: max(0px, calc(var(--twoslash-column) * 1ch - 8px));
}
.twoslash {
  background-color: color-mix(in oklab, currentColor 7%, var(--window-background));
  box-shadow: inset 0 0 0 1px var(--window-border);
  font-family: var(--code-font-family);
  font-size: var(--code-annotation-size);
  line-height: 1.5;
  padding: 6px 10px;
  position: relative;
  white-space: pre-wrap;
}
.twoslash::before {
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
 * The gutter, sized to the document rather than read from the DOM: there is no
 * script here to measure it. A wrapped line hangs its continuation under the
 * code instead of under the numbers.
 */
function gutter(html: string) {
  const lines = (html.match(/class="line"/g) ?? []).length
  const width = String(Math.max(lines, 10)).length
  return `.shiki code {
  /* Grid, not blocked lines: shiki puts a real newline between them, which a
     block would render as height on top of the line box. Whitespace between
     grid items makes no row. */
  display: grid;
}
.shiki .line {
  padding-left: calc(${width}ch + 20px);
  text-indent: calc(-1ch * ${width} - 20px);
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
