import type { Browser } from 'puppeteer-core'

import * as Frame from './Frame.js'
import * as Raster from './internal/Raster.js'

/**
 * Creates a renderer that owns a browser for its lifetime.
 *
 * Chrome startup takes substantially longer than rendering. Applications that
 * produce multiple images should reuse a renderer instead of calling
 * {@link render}, which starts and stops a browser for every call.
 *
 * Provide a Chrome or Chromium executable through `executable` or
 * `PUPPETEER_EXECUTABLE_PATH`. `puppeteer-core` does not download a browser.
 *
 * Pass `fonts` to every render that must match across machines. Without them
 * the code falls back to whatever monospace the host has, which changes glyph
 * metrics, wrapping, and the image's size.
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
  const { args, executable, frame = Frame.create() } = options
  // A frame passed in belongs to the caller, so only one made here is released.
  const owned = !options.frame
  // Kept as a promise so concurrent renders share one launch rather than
  // racing to start a browser each.
  let browser: Promise<Browser> | undefined

  // Remove failed or disconnected browsers from the cache so later renders can
  // launch a replacement.
  function start(): Promise<Browser> {
    const pending: Promise<Browser> = launch({ args, executable }).then(
      (instance) => {
        instance.once('disconnected', () => forget(pending))
        return instance
      },
      (cause: unknown) => {
        forget(pending)
        throw cause
      },
    )
    return pending
  }

  function forget(pending: Promise<Browser>) {
    if (browser === pending) browser = undefined
  }

  return {
    async dispose() {
      const instance = browser
      browser = undefined
      await instance?.then((value) => value.close()).catch(() => {})
      if (owned) await frame.dispose()
    },
    async render(parameters) {
      const { scale = 3, ...rest } = parameters
      const html = await frame.toDocument({ ...defaults, ...rest })
      // Read once: the browser can drop out of the cache while this waits.
      const pending = (browser ??= start())
      return capture(await pending, { html, scale })
    },
  }
}

export declare namespace create {
  type Options = {
    /**
     * Extra flags for the browser, passed through as given. A container
     * running as root needs `--no-sandbox`; a small `/dev/shm` needs
     * `--disable-dev-shm-usage`. Defaults to none.
     */
    args?: readonly string[] | undefined
    /**
     * Path to a Chrome or Chromium binary. Falls back to
     * `PUPPETEER_EXECUTABLE_PATH`, then to a Chrome installed on this machine.
     */
    executable?: string | undefined
    /**
     * Frame renderer used for highlighting. By default this renderer creates
     * and releases one. Pass an existing renderer to share loaded resources.
     */
    frame?: Frame.create.ReturnType | undefined
  }

  type ReturnType = {
    /**
     * Closes the browser and any frame renderer created by this instance. A
     * subsequent render starts a new browser.
     */
    dispose: () => Promise<void>
    /** Renders a frame to a PNG. */
    render: (options: Options_render) => Promise<Uint8Array>
  }
}

/**
 * Renders one frame to an image, in a browser started and stopped for it.
 *
 * Use {@link create} for multiple images to reuse one browser and highlighter.
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
  const { args, executable, frame, ...rest } = options
  const renderer = create({ args, executable, frame })
  try {
    return await renderer.render(rest)
  } finally {
    await renderer.dispose()
  }
}

/** Default frame options for image rendering. */
const defaults = {
  background: 'default',
  padding: 64,
  radius: 12,
  title: '',
  titleBar: false,
  width: 640,
} as const satisfies render.Defaults

/** Captures the rendered frame from a standalone document. */
async function capture(
  browser: Browser,
  options: { html: string; scale: number },
): Promise<Uint8Array> {
  const { html, scale } = options
  const page = await browser.newPage()
  try {
    // The document carries everything it needs, so nothing here should run or
    // arrive: a script could rewrite the frame and a request could fail late,
    // and either would change the image. Enforced rather than assumed, because
    // the caller supplies the options the document is built from.
    await page.setJavaScriptEnabled(false)
    await page.setRequestInterception(true)
    page.on('request', (request) => {
      // A `data:` URL never leaves the process. Anything else would.
      if (request.url().startsWith('data:')) void request.continue()
      else void request.abort()
    })
    await page.setContent(html, { waitUntil: 'load' })
    // Still available with scripts disabled: this runs through the debugger,
    // not as page script.
    await page.evaluate(() => document.fonts.ready)
    const canvas = await page.$('.canvas')
    if (!canvas) throw new ChromeError('The document rendered no frame.')
    const box = await canvas.boundingBox()
    await page.setViewport({
      deviceScaleFactor: Raster.fit(box, scale),
      height: Math.ceil(box?.height ?? 1),
      width: Math.ceil(box?.width ?? 1),
    })
    return await canvas.screenshot({ omitBackground: true, type: 'png' })
  } finally {
    await page.close()
  }
}

/** Image render options excluding browser configuration. */
type Options_render = Omit<Frame.toDocument.Options, keyof render.Defaults> &
  Partial<render.Defaults> & {
    /** Frame scale multiplier. Defaults to 3. */
    scale?: number | undefined
  }

export declare namespace render {
  type Options = Options_render & create.Options

  /** Default frame options applied by {@link render}. */
  type Defaults = Pick<
    Frame.toDocument.Options,
    'background' | 'padding' | 'radius' | 'title' | 'titleBar' | 'width'
  >
}

async function launch(options: {
  args: readonly string[] | undefined
  executable: string | undefined
}): Promise<Browser> {
  const { args, executable } = options
  // Loaded here rather than at the top, so a runtime that bundles the document
  // side of this package never pulls a browser driver in with it.
  const puppeteer = await import('puppeteer-core').catch(() => {
    throw new ChromeError('Could not load `puppeteer-core`. Reinstall monoshot.')
  })
  const path = executable ?? process.env['PUPPETEER_EXECUTABLE_PATH']
  try {
    return await puppeteer.launch({
      ...(args ? { args: [...args] } : {}),
      // Prefer the explicit path; otherwise use an installed Chrome release.
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

/** Indicates that Chrome is unavailable or failed to start. */
export class ChromeError extends Error {
  override name = 'Headless.ChromeError'
}
