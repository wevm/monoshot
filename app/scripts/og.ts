import { createRequire } from 'node:module'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Frame, Theme } from 'monoshot'
import puppeteer from 'puppeteer-core'

import { sample } from '../src/lib/sample.js'

/** Social card dimensions and rendering settings. */
const card = { height: 630, quality: 92, scale: 2, width: 1200 } as const

/** Horizontal frame position and overflow beyond the card boundary. */
const frameAt = { bleed: 560, left: 628 } as const

/**
 * Generates the default social card with the wordmark and sample code.
 *
 * The frame extends beyond the right boundary to preserve readable code size.
 * Run `pnpm -C app gen:og` after changing the content or layout.
 */
const require = createRequire(import.meta.url)
const font = await fs.readFile(
  require.resolve('@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2'),
)
// Remove the wordmark background so the card backdrop remains visible.
const wordmark = (
  await fs.readFile(path.join(import.meta.dirname, 'og-wordmark.svg'), 'utf8')
).replace(/<rect[^>]*fill="black"[^>]*\/>/, '')

const frame = Frame.create()
const rendered = await frame.render({
  code: sample,
  lang: 'tsx',
  theme: 'golden-gate-dark',
  twoslash: true,
})
await frame.dispose()
const palette = Theme.derive(rendered.theme)

const page = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
@font-face {
  font-family: 'Geist Mono';
  font-style: normal;
  font-weight: 100 900;
  src: url(data:font/woff2;base64,${font.toString('base64')}) format('woff2');
}
* { box-sizing: border-box; margin: 0; }
body {
  -webkit-font-smoothing: antialiased;
  background: ${palette.window.background};
  height: ${card.height}px;
  overflow: hidden;
  position: relative;
  width: ${card.width}px;
}
/*
 * Derive the card background from the theme palette, with highlights behind
 * the wordmark and code frame.
 */
.backdrop {
  background:
    radial-gradient(60% 70% at 22% 42%, ${palette.backdrop.from} 0%, transparent 70%),
    radial-gradient(55% 80% at 88% 18%, ${palette.backdrop.to} 0%, transparent 72%),
    radial-gradient(90% 120% at 50% 120%, ${palette.window.background} 30%, transparent 100%),
    linear-gradient(${palette.backdrop.angle}deg, ${palette.backdrop.from}, ${palette.backdrop.to});
  inset: 0;
  position: absolute;
}
/* Add a broad highlight across the upper-right corner. */
.sweep {
  background: linear-gradient(
    118deg,
    transparent 34%,
    color-mix(in oklab, ${palette.window.foreground} 22%, transparent) 50%,
    transparent 62%
  );
  filter: blur(38px);
  inset: -20%;
  opacity: 0.5;
  position: absolute;
}
.wordmark {
  align-items: center;
  bottom: 0;
  display: flex;
  justify-content: center;
  left: 0;
  position: absolute;
  top: 0;
  width: ${frameAt.left}px;
}
.wordmark svg { width: 68%; }
.window {
  /* Preserve the backdrop beneath the translucent code window. */
  background: color-mix(in oklab, ${palette.window.background} 40%, transparent);
  border-radius: 12px;
  box-shadow: 0 0 0 1px ${palette.window.border}, 0 24px 48px -12px #00000059;
  left: ${frameAt.left}px;
  overflow: hidden;
  padding: 8px 16px;
  position: absolute;
  /* Vertically align the code frame with the wordmark. */
  top: 50%;
  transform: translateY(-50%);
  width: ${card.width - frameAt.left + frameAt.bleed}px;
}
.shiki, .shiki code {
  background: transparent !important;
  color: ${palette.window.foreground};
  font-family: 'Geist Mono', ui-monospace, monospace;
  font-size: 21px;
  font-variant-ligatures: none;
  line-height: 33px;
  tab-size: 2;
  white-space: pre;
}
.shiki { padding-block: 12px; }
${rendered.css ?? ''}
</style>
</head>
<body>
<div class="backdrop"></div>
<div class="sweep"></div>
<div class="wordmark">${wordmark}</div>
<div class="window">${rendered.html}</div>
</body>
</html>
`

const browser = await puppeteer.launch({ channel: 'chrome', headless: true })
const tab = await browser.newPage()
await tab.setViewport({ deviceScaleFactor: card.scale, height: card.height, width: card.width })
await tab.setContent(page, { waitUntil: 'load' })
// Crop the SVG view box to the wordmark lettering before centering it.
await tab.evaluate(() => {
  const svg = document.querySelector('.wordmark svg')
  if (!(svg instanceof SVGSVGElement)) return
  const box = (svg.firstElementChild?.parentElement ?? svg) as unknown as SVGGraphicsElement
  const bounds = box.getBBox()
  svg.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`)
  svg.removeAttribute('height')
  svg.setAttribute('width', '100%')
})
await tab.evaluate(() => document.fonts.ready)
const image = await tab.screenshot({ quality: card.quality, type: 'jpeg' })
await browser.close()

const out = path.join(import.meta.dirname, '../public/og.jpg')
await fs.writeFile(out, image)
console.log(`${out} (${image.length} bytes)`)
