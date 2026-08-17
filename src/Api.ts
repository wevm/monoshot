import { zValidator } from '@hono/zod-validator'
import { Hono, type Handler } from 'hono'
import { bundledLanguages } from 'shiki'
import * as z from 'zod'

import * as Browser from './Browser.js'
import * as Codec from './Codec.js'
import * as Frame from './Frame.js'
import * as Languages from './internal/Languages.js'
import * as Theme from './Theme.js'

/** What a request may weigh, so one of them cannot occupy an isolate. */
const limit = { code: 100_000, nodes: 20_000, picture: 4_000_000, text: 10_000 }

/** Every grammar shiki bundles, by each name it accepts for one. */
const languageNames = Object.keys(bundledLanguages) as [string, ...string[]]

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
   * frame has is a mistake, and is answered as one. The bounds come from
   * `Codec.strict`, which is where a frame's field states what it accepts.
   */
  export const document = z
    .object({
      // Narrower than the codec's: a `wallpaper:` identifier names a picture
      // the deployment holds, and a request carries one through `picture`.
      background: z
        .union([
          z.enum(['default', 'none']),
          z.string().regex(/^#[0-9a-f]{6}$/i),
          z.string().regex(/^gradient:#[0-9a-f]{6}:#[0-9a-f]{6}$/i),
        ])
        .optional(),
      code: z.string().min(1).max(limit.code),
      // Named rather than listed, as `theme` is: the enum describes itself to a
      // generated client, and its own message would spell out every grammar.
      lang: z.enum(languageNames, {
        error: (issue) => `\`${String(issue.input)}\` is not bundled.`,
      }),
      /** Fixed canvas height in pixels. By default, the canvas follows the content height. */
      height: z.number().int().min(120).max(2160).optional(),
      padding: Codec.strict.shape.padding.optional(),
      /** Embedded backdrop image for the request-free renderer. */
      picture: z
        .string()
        .max(limit.picture)
        .regex(/^data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+$/)
        .optional(),
      radius: Codec.strict.shape.radius.optional(),
      // Named rather than listed: the enum's own message spells out
      // two dozen names, and `/themes` is where they are read from.
      theme: z
        .enum(Theme.names, { error: (issue) => `unknown value \`${String(issue.input)}\`.` })
        .optional(),
      title: z.string().max(200).optional(),
      titleBar: z.boolean().optional(),
      /** Fades the window's bottom edge, for source cut short of its snippet. */
      truncated: z.boolean().optional(),
      twoslash: z
        .union([z.boolean(), run])
        .optional()
        .describe(
          'Whether to resolve Twoslash annotations, or a pre-resolved run. Defaults to enabled for JavaScript and TypeScript.',
        ),
      width: Codec.strict.shape.width,
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
    if (!request.twoslash || typeof request.twoslash === 'boolean') return
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
      /** Present on a theme composed from artwork it also owns. */
      artwork: z.boolean().optional(),
      displayName: z.string(),
      name: z.string(),
      /** The radius a theme's artwork asks for, when it asks for one. */
      radius: Codec.strict.shape.radius.optional(),
      type: z.union([z.literal('dark'), z.literal('light')]),
    }),
  )

  /** Response returned by `/health`. */
  export const health = z.object({ status: z.literal('ok') })
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
  async function frame_document(
    context: picture.Context,
    request: schema.Document,
  ): Promise<Response | string> {
    // Apply codec defaults so requests, links, and the editor render omitted
    // fields consistently.
    const state = Codec.schema.parse(request)
    try {
      // A theme composed from artwork owns a picture this cannot read: the
      // library holds the colors it was composed from, not the file they came
      // from. Only the default backdrop is the theme's to fill. Inside the
      // boundary, so a loader that cannot reach its asset answers as a failed
      // render rather than escaping the route.
      const picture =
        request.picture ??
        (Theme.info(state.theme)?.artwork &&
        (request.background === undefined || request.background === 'default')
          ? await options.picture?.({ context, theme: state.theme })
          : undefined)
      return await frame.toDocument({
        ...state,
        // The codec fills a radius for every link. A request that named none
        // leaves the theme free to state the geometry its artwork wants.
        radius: request.radius,
        // Asserted through `unknown`: the run is validated structurally here,
        // and the renderer's node union declares positions this neither reads
        // nor requires a caller to send.
        twoslash:
          typeof request.twoslash === 'object'
            ? (request.twoslash as unknown as Frame.render.Types)
            : (request.twoslash ?? Languages.languages.has(state.lang)),
        ...(request.height === undefined ? {} : { height: request.height }),
        ...(picture === undefined ? {} : { picture }),
        ...(request.truncated === undefined ? {} : { truncated: request.truncated }),
        lang: state.lang as Parameters<typeof frame.toDocument>[0]['lang'],
      })
    } catch (cause) {
      // Not a rejection: the request was understood, and drawing it failed.
      const message = cause instanceof Error ? cause.message : String(cause)
      return Response.json({ error: message }, { status: 500 })
    }
  }

  const app = new Hono()
    .get(
      '/health',
      OpenApi.operation((c) => c.json({ status: 'ok' } as const), {
        description: 'Reports whether the API process can serve requests.',
        responses: { 200: { description: 'The API is available.', schema: schema.health } },
        summary: 'Check API health',
      }),
    )
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
        const drawn = await frame_document(c, c.req.valid('json'))
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
        const drawn = await frame_document(c, request)
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
    /**
     * The artwork a composed theme was made from, as a `data:` URL, read off
     * each request the way {@link browser} is.
     *
     * Called only for a theme that owns artwork, on a request that named no
     * picture of its own and left the backdrop at `default`. The colors a theme
     * was composed from ship with this package; the picture they were read off
     * does not, so whoever can reach it hands it over. Without one, such a
     * frame draws the theme's gradient.
     */
    picture?:
      | ((options: picture.Options) => Promise<string | undefined> | string | undefined)
      | undefined
  }
}

export declare namespace picture {
  /** What a route hands a reader: the request, and what it reaches bindings by. */
  type Context = { env: unknown; req: { url: string } }

  /** The theme whose artwork is wanted, and the request asking for it. */
  type Options = { context: Context; theme: string }
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
    schema?: z.ZodType | undefined
    summary: string
    target?: 'json' | 'query' | undefined
  }

  /** Attaches OpenAPI metadata to a route that has no request parameters. */
  export function operation<handler extends Handler>(
    handler: handler,
    described: Omit<Described, 'schema' | 'target'>,
  ): handler {
    return Object.assign(handler, described)
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
      if (!described.description || !described.responses || !described.summary) continue
      const request = described.schema
        ? (z.toJSONSchema(described.schema) as {
            properties?: Record<string, unknown>
            required?: string[]
          })
        : undefined
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
          ...(request
            ? {
                400: content({
                  description: 'The request was not understood.',
                  schema: schema_failure,
                }),
              }
            : {}),
        },
        summary: described.summary,
        ...(request
          ? described.target === 'json'
            ? {
                requestBody: {
                  content: { 'application/json': { schema: request } },
                  required: true,
                },
              }
            : {
                parameters: Object.entries(request.properties ?? {}).map(([name, property]) => ({
                  in: 'query',
                  name,
                  required: request.required?.includes(name) ?? false,
                  schema: property,
                })),
              }
          : {}),
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
