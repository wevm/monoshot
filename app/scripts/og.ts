import { createRequire } from 'node:module'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Frame, Theme } from 'monoshot'
import puppeteer from 'puppeteer-core'

import { sample } from '../src/lib/sample.js'

/** What a card is cropped to, and what it is drawn at. */
const card = { height: 630, scale: 2, width: 1200 } as const

/** Where the frame starts, and how far it runs past the right edge. */
const frameAt = { bleed: 320, left: 596 } as const

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
const wordmark = await fs.readFile(path.join(import.meta.dirname, 'og-wordmark.svg'), 'utf8')

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
  background: #000;
  height: ${card.height}px;
  overflow: hidden;
  position: relative;
  width: ${card.width}px;
}
.wordmark { inset: 0; position: absolute; }
.wordmark svg { height: 100%; width: 100%; }
.window {
  background: ${palette.window.background};
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
  font-size: 17px;
  font-variant-ligatures: none;
  line-height: 27px;
  tab-size: 2;
  white-space: pre;
}
.shiki { padding-block: 12px; }
${rendered.css ?? ''}
</style>
</head>
<body>
<div class="wordmark">${wordmark}</div>
<div class="window">${rendered.html}</div>
</body>
</html>
`

const browser = await puppeteer.launch({ channel: 'chrome', headless: true })
const tab = await browser.newPage()
await tab.setViewport({ deviceScaleFactor: card.scale, height: card.height, width: card.width })
await tab.setContent(page, { waitUntil: 'load' })
await tab.evaluate(() => document.fonts.ready)
const png = await tab.screenshot({ type: 'png' })
await browser.close()

const out = path.join(import.meta.dirname, '../public/og.png')
await fs.writeFile(out, png)
console.log(`${out} (${png.length} bytes)`)
