import type { Browser } from 'puppeteer-core'

import * as Frame from './Frame.js'

/**
 * Chromium refuses to rasterize past this on either side, and fails by
 * returning a blank image rather than by throwing.
 */
const side = 16_384

/**
 * Renders a frame to an image, by screenshotting the standalone document in a
 * real browser.
 *
 * `puppeteer-core` is an optional peer: a consumer that only builds documents
 * never installs a browser. Bring your own Chrome, either through `executable`
 * or `PUPPETEER_EXECUTABLE_PATH`.
 *
 * @example
 * ```ts twoslash
 * import { Headless } from 'monoshot/headless'
 *
 * const png = await Headless.render({
 *   code: 'const a = 1',
 *   lang: 'ts',
 *   theme: 'vitesse-dark',
 * })
 * ```
 */
export async function render(options: render.Options): Promise<Uint8Array> {
  const { executable, scale = 2, ...rest } = options
  const html = await frame().toDocument({
    background: 'default',
    lineNumbers: false,
    padding: 64,
    radius: 12,
    title: '',
    titleBar: true,
    width: 640,
    ...rest,
  })
  const browser = await launch(executable)
  try {
    const page = await browser.newPage()
    // No network: the document carries everything, so nothing can arrive late
    // and change the image.
    await page.setContent(html, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    const canvas = await page.$('.canvas')
    if (!canvas) throw new ChromeError('The document rendered no frame.')
    const box = await canvas.boundingBox()
    await page.setViewport({
      deviceScaleFactor: fit(box, scale),
      height: Math.ceil(box?.height ?? 1),
      width: Math.ceil(box?.width ?? 1),
    })
    return await canvas.screenshot({ omitBackground: true, type: 'png' })
  } finally {
    await browser.close()
  }
}

export declare namespace render {
  type Options = Omit<Frame.toDocument.Options, keyof Defaults> &
    Partial<Defaults> & {
      /**
       * Path to a Chrome or Chromium binary. Falls back to
       * `PUPPETEER_EXECUTABLE_PATH`, then to a Chrome installed on this machine.
       */
      executable?: string | undefined
      /** Multiplier on the frame's own size. Defaults to 2. */
      scale?: number | undefined
    }

  /** What a caller can leave out, and what it gets instead. */
  type Defaults = Pick<
    Frame.toDocument.Options,
    'background' | 'lineNumbers' | 'padding' | 'radius' | 'title' | 'titleBar' | 'width'
  >
}

/** The largest scale that still rasterizes, at or below the one asked for. */
export function fit(box: { height: number; width: number } | null, scale: number): number {
  if (!box?.height || !box.width) return scale
  return Math.max(1, Math.min(scale, side / box.width, side / box.height))
}

let renderer: ReturnType<typeof Frame.create> | undefined

/** One highlighter per process, so a batch of renders shares loaded grammars. */
function frame() {
  renderer ??= Frame.create()
  return renderer
}

async function launch(executable: string | undefined): Promise<Browser> {
  const puppeteer = await import('puppeteer-core').catch(() => {
    throw new ChromeError('Rendering needs `puppeteer-core` installed alongside monoshot.')
  })
  const path = executable ?? process.env['PUPPETEER_EXECUTABLE_PATH']
  try {
    return await puppeteer.launch({
      // A path wins; otherwise puppeteer finds a Chrome already on the machine
      // rather than downloading one.
      ...(path ? { executablePath: path } : { channel: 'chrome' }),
      headless: true,
    })
  } catch (cause) {
    throw new ChromeError(
      'Could not start Chrome. Install it, or point `executable` at a binary.',
      { cause },
    )
  }
}

/** Thrown when the browser this needs is missing or will not start. */
export class ChromeError extends Error {
  override name = 'Headless.ChromeError'
}
