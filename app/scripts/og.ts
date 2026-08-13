import { createRequire } from 'node:module'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Frame, Theme } from 'monoshot'
import puppeteer from 'puppeteer-core'

import { sample } from '../src/lib/sample.js'

/**
 * What a card is cropped to, and what it is drawn at.
 *
 * JPEG rather than PNG: a backdrop of smooth gradients costs a lossless format
 * near a megabyte, and at this quality the code's edges survive a compression
 * a reader never sees.
 */
const card = { height: 630, quality: 92, scale: 2, width: 1200 } as const

/** Where the frame starts, and how far it runs past the right edge. */
const frameAt = { bleed: 560, left: 628 } as const

/**
 * Draws the link preview: the wordmark, and the snippet the app opens on.
 *
 * The frame is cut off by the right edge rather than fitted inside it. A frame
 * small enough to sit in the space left over shows four lines at a size nobody
 * reads; running it off the edge buys the height back, and a window that
 * carries on past the crop reads as a view onto something larger.
 *
 * Written to `public` at build time rather than served from a route: a crawler
 * fetching this must not wait on a browser, and a Worker with none to launch
 * would answer nothing at all. Regenerate with `pnpm -C app gen:og` after
 * changing the snippet, the theme, or the wordmark.
 */
const require = createRequire(import.meta.url)
const font = await fs.readFile(
  require.resolve('@fontsource-variable/geist-mono/files/geist-mono-latin-wght-normal.woff2'),
)
// The wordmark paints its own black canvas, which would cover the backdrop
// drawn under it. Only the lettering is wanted here.
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
 * The backdrop this theme draws for a frame, drawn for the card instead:
 * the gradient it derives, with light gathered where the wordmark sits and
 * again behind the frame. Composed from the palette rather than sampled from
 * a picture, so the card is this package's own work.
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
/* A slow sweep across the corner, blurred past any edge of its own. */
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
  /* Translucent, so the backdrop carries under the code rather than stopping
     at the window's edge. */
  background: color-mix(in oklab, ${palette.window.background} 68%, transparent);
  border-radius: 12px;
  box-shadow: 0 0 0 1px ${palette.window.border}, 0 24px 48px -12px #00000059;
  left: ${frameAt.left}px;
  overflow: hidden;
  padding: 8px 16px;
  position: absolute;
  /* Centred on the card rather than hung from the top, so the frame sits with
     the wordmark rather than above it. */
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
// Cropped to the lettering by the browser rather than by hand: the wordmark is
// drawn on a canvas of its own, and centring that canvas leaves the text off
// centre by however much padding it carries.
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
