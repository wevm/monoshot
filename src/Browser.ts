import * as Raster from './internal/Raster.js'

export { fit } from './internal/Raster.js'

/** Browser Rendering binding that implements `fetch`. */
export type Endpoint = { fetch: typeof fetch }

/** Screenshots a standalone frame through Cloudflare Browser Rendering. */
export async function screenshot(
  endpoint: Endpoint,
  options: screenshot.Options,
): Promise<screenshot.ReturnType> {
  const { html, scale } = options
  const puppeteer = await import('@cloudflare/puppeteer').catch(() => {
    throw new Error('Image rendering requires `@cloudflare/puppeteer`.')
  })
  const browser = await open(puppeteer, endpoint)
  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: 'load' })
    // The document embeds its fonts, so this resolves without the network.
    await page.evaluate(() => document.fonts.ready)
    const canvas = await page.$('.canvas')
    if (!canvas) throw new Error('The document rendered no frame.')
    const box = await canvas.boundingBox()
    await page.setViewport({
      deviceScaleFactor: Raster.fit(box, scale),
      height: Math.ceil(box?.height ?? 1),
      width: Math.ceil(box?.width ?? 1),
    })
    return await canvas.screenshot({ omitBackground: true, type: 'png' })
  } finally {
    // Disconnected rather than closed because the session outlives this request.
    await browser.disconnect()
  }
}

export declare namespace screenshot {
  type Options = {
    /**
     * The standalone document to capture. It is loaded with no network access
     * of its own, so everything it draws has to be embedded in it.
     */
    html: string
    /**
     * Device scale factor the capture is taken at. Held to what the browser
     * will rasterize by {@link fit}, so a large frame comes back smaller
     * rather than blank.
     */
    scale: number
  }

  /** The frame as PNG bytes, with the canvas background left transparent. */
  type ReturnType = Uint8Array
}

/** Returns an available browser session or launches one. */
async function open(
  puppeteer: typeof import('@cloudflare/puppeteer'),
  endpoint: Endpoint,
): Promise<Awaited<ReturnType<typeof puppeteer.launch>>> {
  const free = await puppeteer
    .sessions(endpoint)
    .then((all) => all.find((session) => !session.connectionId))
    .catch(() => undefined)
  if (free) {
    const reused = await puppeteer.connect(endpoint, free.sessionId).catch(() => undefined)
    if (reused) return reused
  }
  return puppeteer.launch(endpoint)
}
