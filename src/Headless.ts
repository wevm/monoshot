import type { Browser, Page } from 'puppeteer-core'

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
 * Pass `fonts` to every render that must match across machines. Otherwise, the
 * host's monospace font can change glyph metrics, wrapping, and image size.
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
      const { scale = 3, type = 'png', ...rest } = parameters
      const html = await frame.toDocument({ ...defaults, ...rest })
      // Read once: the browser can drop out of the cache while this waits.
      const pending = (browser ??= start())
      return capture(await pending, { html, scale, type })
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

/** Captures the rendered frame from a standalone document, as PNG or SVG. */
async function capture(
  browser: Browser,
  options: { html: string; scale: number; type: 'png' | 'svg' },
): Promise<Uint8Array> {
  const { html, scale, type } = options
  const page = await browser.newPage()
  try {
    // Disable scripts and external requests to keep rendering deterministic for
    // caller-provided frame content.
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
    if (type === 'svg') return new TextEncoder().encode(await vector(page, scale))
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

/**
 * Serializes the rendered frame as SVG, wrapping its markup in a
 * `foreignObject`.
 *
 * Serialized in the page rather than assembled from the document's HTML: an
 * SVG file is parsed as XML, where Shiki's markup and a stray entity are both
 * fatal, and `XMLSerializer` guarantees well-formed output. Runs through the
 * debugger, so page scripts stay disabled.
 */
function vector(page: Page, scale: number): Promise<string> {
  return page.evaluate((factor: number) => {
    const canvas = document.querySelector('.canvas')
    if (!canvas) throw new Error('The document rendered no frame.')
    const { height, width } = canvas.getBoundingClientRect()
    const styles = [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules].map((rule) => rule.cssText))
      .join('\n')
    // Writes the XHTML namespace on its root, which tells a reader the markup
    // inside a `foreignObject` is HTML rather than SVG.
    const body = new XMLSerializer().serializeToString(canvas)
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width * factor}" height="${height * factor}" viewBox="0 0 ${width} ${height}">`,
      // The document's rules travel with it. A `foreignObject` is styled by
      // what the file carries, and this file links no stylesheet.
      `<style>${styles}</style>`,
      `<foreignObject x="0" y="0" width="${width}" height="${height}">${body}</foreignObject>`,
      '</svg>',
    ].join('')
  }, scale)
}

/** Image render options excluding browser configuration. */
type Options_render = Omit<Frame.toDocument.Options, keyof render.Defaults> &
  Partial<render.Defaults> & {
    /** Frame scale multiplier. Defaults to 3. */
    scale?: number | undefined
    /**
     * Image format. A PNG is rasterized and bound by what the browser can
     * draw; an SVG carries the frame's markup and scales without loss.
     * Defaults to `png`.
     */
    type?: 'png' | 'svg' | undefined
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
