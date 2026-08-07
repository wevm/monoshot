import type * as Theme from '../Theme.js'

/** A font to embed, so the document asks the network for nothing. */
export type Font = {
  /** The family name the stylesheet refers to. */
  family: string
  /** A `data:` URL holding the font itself. */
  source: string
  /** Defaults to `normal`. */
  style?: string | undefined
  /** A single weight or a variable range, such as `100 900`. */
  weight?: string | undefined
}

/** Everything the document needs beyond the highlighted markup. */
export type Options = {
  /** `default` paints the theme's gradient, `none` leaves it transparent. */
  background: string
  /** The code, already highlighted. */
  html: string
  lineNumbers: boolean
  padding: number
  palette: Theme.derive.Result
  radius: number
  title: string
  titleBar: boolean
  width: number
  fonts?: readonly Font[] | undefined
}

/**
 * Builds a standalone document for a frame: no scripts, no requests, and every
 * font inlined. This is what a headless browser screenshots, so it is the one
 * contract the CLI and the image API share.
 */
export function build(options: Options): string {
  const { background, html, lineNumbers, padding, palette, radius, title, titleBar, width } =
    options
  const backdrop =
    background === 'none'
      ? 'transparent'
      : background === 'default'
        ? `linear-gradient(${palette.backdrop.angle}deg, ${palette.backdrop.from}, ${palette.backdrop.to})`
        : background
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<style>
${fontFaces(options.fonts ?? [])}
:root {
  --code-font-family: 'Geist Mono Variable', ui-monospace, 'SF Mono', Menlo, monospace;
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
  font-family: '${font.family}';
  font-style: ${font.style ?? 'normal'};
  font-weight: ${font.weight ?? 'normal'};
  src: url(${font.source});
}`,
    )
    .join('\n')
}

/** The title is the one place a caller's text reaches the markup unhighlighted. */
function escape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
