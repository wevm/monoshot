import type { Browser } from 'puppeteer-core'

import * as Frame from './Frame.js'

/**
 * Chromium refuses to rasterize past this on either side, and fails by
 * returning a blank image rather than by throwing.
 */
const side = 16_384

/**
 * Creates a renderer that owns a browser for its lifetime.
 *
 * Launching Chrome costs seconds and rendering costs milliseconds, so anything
 * producing more than one image should hold a renderer rather than call
 * {@link render}, which starts and stops a browser per call.
 *
 * `puppeteer-core` is an optional peer: a consumer that only builds documents
 * never installs a browser. Bring your own Chrome, either through `executable`
 * or `PUPPETEER_EXECUTABLE_PATH`.
 *
 * @example
 * ```ts twoslash
 * import * as Headless from 'monoshot/headless'
 *
 * const renderer = Headless.create()
 * const png = await renderer.render({ code: 'const a = 1', lang: 'ts', theme: 'vitesse-dark' })
 * await renderer.dispose()
 * ```
 */
export function create(options: create.Options = {}): create.ReturnType {
  const { executable } = options
  // Kept as a promise so concurrent renders share one launch rather than
  // racing to start a browser each.
  let browser: Promise<Browser> | undefined

  return {
    async dispose() {
      const instance = browser
      browser = undefined
      await instance?.then((value) => value.close()).catch(() => {})
    },
    async render(parameters) {
      // A rejected launch must not be cached, or one transient failure would
      // poison every later render on this renderer.
      browser ??= launch(executable).catch((cause: unknown) => {
        browser = undefined
        throw cause
      })
      return capture(await browser, parameters)
    },
  }
}

export declare namespace create {
  type Options = {
    /**
     * Path to a Chrome or Chromium binary. Falls back to
     * `PUPPETEER_EXECUTABLE_PATH`, then to a Chrome installed on this machine.
     */
    executable?: string | undefined
  }

  type ReturnType = {
    /** Closes the browser. The renderer stays usable: the next render starts a fresh one. */
    dispose: () => Promise<void>
    /** Renders a frame to a PNG. */
    render: (options: Options_render) => Promise<Uint8Array>
  }
}

/**
 * Renders one frame to an image, in a browser started and stopped for it.
 *
 * Convenient for a single image; use {@link create} for more than one, which
 * pays for the browser once rather than per render.
 *
 * @example
 * ```ts twoslash
 * import * as Headless from 'monoshot/headless'
 *
 * const png = await Headless.render({
 *   code: 'const a = 1',
 *   lang: 'ts',
 *   theme: 'vitesse-dark',
 * })
 * ```
 */
export async function render(options: render.Options): Promise<Uint8Array> {
  const { executable, ...rest } = options
  const renderer = create({ executable })
  try {
    return await renderer.render(rest)
  } finally {
    await renderer.dispose()
  }
}

/** Screenshots the frame a document draws. */
async function capture(browser: Browser, options: Options_render): Promise<Uint8Array> {
  const { scale = 2, ...rest } = options
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
  const page = await browser.newPage()
  try {
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
    await page.close()
  }
}

/** What a render needs, less the browser it runs in. */
type Options_render = Omit<Frame.toDocument.Options, keyof render.Defaults> &
  Partial<render.Defaults> & {
    /** Multiplier on the frame's own size. Defaults to 2. */
    scale?: number | undefined
  }

export declare namespace render {
  type Options = Options_render & create.Options

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
