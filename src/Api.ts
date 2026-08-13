import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { bundledLanguages } from 'shiki'
import * as z from 'zod'

import * as Codec from './Codec.js'
import * as Frame from './Frame.js'
import * as Raster from './internal/Raster.js'
import * as Theme from './Theme.js'

/** What a request may weigh, so one of them cannot occupy an isolate. */
const limit = { code: 100_000, nodes: 20_000, picture: 4_000_000, text: 10_000 }

/** Every shape a request is read through, and the types they describe. */
namespace schema {
  /**
   * A resolved twoslash run, as twoslash produced it. The cuts come with it:
   * they are what proves the run describes this snippet rather than another.
   */
  const run = z.object({
    code: z.string().max(limit.code),
    meta: z.object({ removals: z.array(z.tuple([z.number(), z.number()])).max(limit.nodes) }),
    nodes: z
      .array(
        // Accept additional Twoslash fields but limit rendered text.
        z.looseObject({
          length: z.number(),
          start: z.number(),
          text: z.string().max(limit.text).optional(),
          type: z.string(),
        }),
      )
      .max(limit.nodes),
  })

  /**
   * The frame to draw, described strictly. The codec falls back on every field
   * so a hand-edited link still opens something; a request naming a width no
   * frame has is a mistake, and is answered as one. The bounds are stated here
   * rather than read off the codec, which holds them as fallbacks.
   */
  export const document = z
    .object({
      background: z
        .union([z.enum(['default', 'none']), z.string().regex(/^#[0-9a-f]{6}$/i)])
        .optional(),
      code: z.string().min(1).max(limit.code),
      lang: z.string(),
      /** Fixed canvas height in pixels. By default, the canvas follows the content height. */
      height: z.number().int().min(120).max(2160).optional(),
      padding: z.number().int().min(0).max(256).optional(),
      /** Embedded backdrop image for the request-free renderer. */
      picture: z
        .string()
        .max(limit.picture)
        .regex(/^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+$/)
        .optional(),
      radius: z.number().int().min(0).max(24).optional(),
      // Named rather than listed: the enum's own message spells out
      // two dozen names, and `/themes` is where they are read from.
      theme: z
        .enum(Theme.names, { error: (issue) => `unknown value \`${String(issue.input)}\`.` })
        .optional(),
      title: z.string().max(200).optional(),
      titleBar: z.boolean().optional(),
      twoslash: run.optional(),
      width: z.number().int().min(320).max(1600).optional(),
    })
    .strict()

  /** A body once its fields are known good, before they are read together. */
  export type Document = z.infer<typeof document>

  /**
   * Whether a run describes the code it arrived with. Twoslash cuts its
   * notations out before compiling and reports where, so cutting the same
   * ranges brings the run's own code back. Anything else was resolved against
   * other code, and its offsets would land in the wrong places here.
   */
  function resolved(request: Document, context: z.RefinementCtx) {
    if (!request.twoslash) return
    const cuts = [...request.twoslash.meta.removals].sort((a, b) => a[0] - b[0])
    let compiled = ''
    let at = 0
    for (const [start, end] of cuts) {
      compiled += request.code.slice(at, start)
      at = end
    }
    compiled += request.code.slice(at)
    if (request.twoslash.code !== compiled)
      context.addIssue({
        code: 'custom',
        message: 'the resolved types belong to different code.',
        path: ['twoslash', 'code'],
      })
  }

  export const body = document.superRefine(resolved)

  /** A frame to draw as an image, which is the frame plus how large to draw it. */
  export const picture = document
    .extend({ scale: z.number().positive().max(6).optional() })
    .strict()
    .superRefine(resolved)

  /** Which themes to list. */
  export const filter = z.object({
    type: z.enum(['dark', 'light']).optional(),
  })

  /** Error response returned when a route rejects a request. */
  export const failure = z.object({ error: z.string() })

  /** Response returned by `/themes`. */
  export const themes = z.array(
    z.object({
      displayName: z.string(),
      name: z.string(),
      type: z.union([z.literal('dark'), z.literal('light')]),
    }),
  )
}

/**
 * Creates the routes that render a frame over HTTP.
 *
 * Mount the routes on a Hono app or use them as a Worker handler. The route
 * instance reuses loaded grammars and serves its schema at `/openapi.json`.
 *
 * @example
 * ```ts twoslash
 * import { Hono } from 'hono'
 * import { Api, Frame } from 'monoshot'
 *
 * const app = new Hono().route('/v1', Api.create({ frame: Frame.create() }))
 * ```
 */
export function create(options: create.Options = {}) {
  // The JavaScript engine by default: shiki's own compiles WebAssembly at
  // runtime, which a Worker refuses, and a Worker is what this is for.
  const frame = options.frame ?? Frame.create({ engine: 'javascript' })

  /**
   * The document a request describes, or the response refusing it. Both render
   * routes read a request the same way; only what they do with the document
   * afterwards differs.
   */
  async function frame_document(request: schema.Document): Promise<Response | string> {
    // Apply codec defaults so requests, links, and the editor render omitted
    // fields consistently.
    const state = Codec.schema.parse(request)
    if (!(state.lang in bundledLanguages))
      return Response.json({ error: `lang: \`${state.lang}\` is not bundled.` }, { status: 400 })
    try {
      return await frame.toDocument({
        ...state,
        // Asserted through `unknown`: the run is validated structurally here,
        // and the renderer's node union declares positions this neither reads
        // nor requires a caller to send.
        ...(request.twoslash
          ? { twoslash: request.twoslash as unknown as Frame.render.Types }
          : {}),
        ...(request.height === undefined ? {} : { height: request.height }),
        ...(request.picture === undefined ? {} : { picture: request.picture }),
        lang: state.lang as Parameters<typeof frame.toDocument>[0]['lang'],
      })
    } catch (cause) {
      // Not a rejection: the request was understood, and drawing it failed.
      const message = cause instanceof Error ? cause.message : String(cause)
      return Response.json({ error: message }, { status: 500 })
    }
  }

  const app = new Hono()
    .post(
      '/document',
      OpenApi.validate('json', schema.body, {
        description:
          'Renders a snippet as a standalone document without scripts or external requests.',
        responses: {
          200: { description: 'The document.', media: 'text/html', schema: z.string() },
          500: { description: 'The frame could not be drawn.', schema: schema.failure },
        },
        summary: 'Render a document',
      }),
      async (c) => {
        const drawn = await frame_document(c.req.valid('json'))
        if (drawn instanceof Response) return drawn
        // Do not cache by URL because the response depends on the request body.
        return c.body(drawn, 200, { 'content-type': 'text/html; charset=utf-8' })
      },
    )
    .post(
      '/image',
      OpenApi.validate('json', schema.picture, {
        description:
          'Renders a snippet as a PNG by capturing the document with a Browser Rendering binding.',
        responses: {
          200: { description: 'The image.', media: 'image/png', schema: z.string() },
          500: { description: 'The frame could not be drawn.', schema: schema.failure },
          503: {
            description: 'Browser Rendering is not configured for this deployment.',
            schema: schema.failure,
          },
        },
        summary: 'Render an image',
      }),
      async (c) => {
        const browser = options.browser?.(c)
        if (!browser)
          return c.json({ error: 'Browser Rendering is not configured for this deployment.' }, 503)
        const request = c.req.valid('json')
        const drawn = await frame_document(request)
        if (drawn instanceof Response) return drawn
        const png = await (async () => {
          try {
            return await Browser.screenshot(browser, {
              html: drawn,
              scale: request.scale ?? 3,
            })
          } catch (cause) {
            return cause instanceof Error ? cause : new Error(String(cause))
          }
        })()
        if (png instanceof Error) return c.json({ error: png.message }, 500)
        // The bytes as they are: `c.body` takes a stream or a string, and an
        // image is neither.
        return new Response(png as unknown as BodyInit, {
          headers: { 'content-type': 'image/png' },
          status: 200,
        })
      },
    )
    .get(
      '/themes',
      OpenApi.validate('query', schema.filter, {
        description: 'Lists accepted `theme` values and the color scheme of each theme.',
        responses: { 200: { description: 'Every theme.', schema: schema.themes } },
        summary: 'List themes',
      }),
      (c) => {
        const { type } = c.req.valid('query')
        return c.json(Theme.list().filter((theme) => !type || theme.type === type))
      },
    )

  // Build the schema on request after all routes are registered, using the
  // mounted path prefix from the current request.
  return app.get('/openapi.json', (c) =>
    c.json(OpenApi.describe(app, c.req.path.replace(/\/openapi\.json$/, ''))),
  )
}

export declare namespace create {
  type Options = {
    /**
     * The browser to screenshot in, read off each request. A binding reaches a
     * Worker through its environment rather than its module scope, so this
     * takes a reader rather than the binding itself. Without one, `/image`
     * returns `503`. Other routes do not require a browser.
     */
    browser?: ((context: { env: unknown }) => Browser.Endpoint | undefined) | undefined
    /**
     * Renderer to draw with. Defaults to one holding shiki's JavaScript
     * engine. Pass one to share loaded grammars, or to choose the engine.
     */
    frame?: Frame.create.ReturnType | undefined
  }
}

/**
 * Captures screenshots through Cloudflare Browser Rendering. The binding
 * provides an existing browser without starting a local process.
 */
namespace Browser {
  /** Browser Rendering binding that implements `fetch`. */
  export type Endpoint = { fetch: typeof fetch }

  /**
   * Screenshots the frame a document draws.
   *
   * Imported here rather than at the top of the module: `@cloudflare/puppeteer`
   * only resolves inside a Worker, and this module is what a Node consumer
   * reaches through the root entrypoint.
   */
  export async function screenshot(
    endpoint: Endpoint,
    options: { html: string; scale: number },
  ): Promise<Uint8Array> {
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
      // Disconnected rather than closed: the session outlives this request, so
      // the next one skips a launch that costs seconds.
      await browser.disconnect()
    }
  }

  /**
   * A browser to draw in: one already running where there is one, since a
   * launch is the expensive part and a session is reusable.
   */
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
    return await puppeteer.launch(endpoint)
  }
}

/**
 * The description a route carries, and the reading of it. A route states what
 * it accepts and returns one response through the enforcing middleware.
 */
namespace OpenApi {
  /** OpenAPI metadata attached to route validation middleware. */
  export type Described = {
    description: string
    responses: Record<number, { description: string; media?: string; schema?: z.ZodType }>
    schema: z.ZodType
    summary: string
    target: 'json' | 'query'
  }

  /**
   * One shape for every rejection, whichever route and whichever check raised
   * it: a caller reads which field was wrong and what was wrong with it.
   */
  const reject: Parameters<typeof zValidator>[2] = (result, c) => {
    if (result.success) return undefined
    const issue = result.error.issues[0]
    const at = issue?.path.map(String).join('.')
    return c.json({ error: `${at ? `${at}: ` : ''}${issue?.message ?? 'Invalid request.'}` }, 400)
  }

  /**
   * Validates a request, and remembers what it validated. The description is
   * read back off the routes, so a route and what it accepts cannot drift.
   */
  export function validate<schema extends z.ZodType, const target extends 'json' | 'query'>(
    target: target,
    schema: schema,
    described: Omit<Described, 'schema' | 'target'>,
  ) {
    return Object.assign(zValidator(target, schema, reject), { ...described, schema, target })
  }

  /** One response, as OpenAPI content. */
  function content(response: Described['responses'][number]) {
    if (!response.schema) return { description: response.description }
    return {
      content: {
        [response.media ?? 'application/json']: { schema: z.toJSONSchema(response.schema) },
      },
      description: response.description,
    }
  }

  /**
   * The routes as OpenAPI, built from the middleware guarding each one. Paths
   * include the prefix where they are served, so a document read from a mounted app
   * names the URLs a caller can reach.
   */
  export function describe(app: Hono, prefix = ''): Record<string, unknown> {
    const paths: Record<string, Record<string, unknown>> = {}
    for (const route of app.routes) {
      const described = route.handler as Partial<Described>
      if (!described.schema) continue
      const schema = z.toJSONSchema(described.schema) as {
        properties?: Record<string, unknown>
        required?: string[]
      }
      const path = (paths[`${prefix}${route.path}`] ??= {})
      path[route.method.toLowerCase()] = {
        description: described.description,
        responses: {
          ...Object.fromEntries(
            Object.entries(described.responses ?? {}).map(([status, response]) => [
              status,
              content(response),
            ]),
          ),
          // Every validated route can turn a request away, so every one of
          // subsequent middleware returns this response.
          400: content({ description: 'The request was not understood.', schema: schema_failure }),
        },
        summary: described.summary,
        ...(described.target === 'json'
          ? { requestBody: { content: { 'application/json': { schema } }, required: true } }
          : {
              parameters: Object.entries(schema.properties ?? {}).map(([name, property]) => ({
                in: 'query',
                name,
                required: schema.required?.includes(name) ?? false,
                schema: property,
              })),
            }),
      }
    }
    return { info: { title: 'monoshot', version: '1' }, openapi: '3.1.0', paths }
  }
}

/** Read inside the namespace, which cannot reach the other one by name. */
const schema_failure = schema.failure

/**
 * The routes, ready to mount. Holds a renderer of its own; reach for
 * {@link create} to share one or to choose the engine.
 *
 * @example
 * ```ts twoslash
 * import { Hono } from 'hono'
 * import { Api } from 'monoshot'
 *
 * const app = new Hono().route('/v1', Api.route)
 * ```
 */
export const route = create()
