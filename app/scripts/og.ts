import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as Headless from 'monoshot/headless'

/**
 * Its own snippet rather than the editor's: a card is read at a glance in a
 * timeline, and the sample is fifteen lines tall. Short lines, because a line
 * that wraps in the frame reads as a mistake, and a query, which is the thing
 * worth showing.
 */
const code = `import { codeToHtml } from 'shiki'

const html = await codeToHtml('const a = 1', {
  lang: 'ts',
  theme: 'nord',
})

html
// ^?
`

/**
 * Draws the link preview, rendered by the renderer the app ships.
 *
 * Written to `public` at build time rather than served from a route: a crawler
 * fetching this must not wait on a browser, and a Worker with none to launch
 * would answer nothing at all. Regenerate with `pnpm -C app gen:og` after
 * changing the snippet, the theme, or the frame.
 */
const png = await Headless.render({
  background: 'default',
  code,
  lang: 'ts',
  // Tuned together to land near the 1.91:1 a card is cropped to.
  padding: 88,
  scale: 1.5,
  theme: 'golden-gate-dark',
  // Stated rather than left to the renderer: a card is the frame, and window
  // chrome is not what a reader is being shown.
  titleBar: false,
  twoslash: true,
  width: 800,
})

const out = path.join(import.meta.dirname, '../public/og.png')
await fs.writeFile(out, png)
console.log(`${out} (${png.length} bytes)`)
