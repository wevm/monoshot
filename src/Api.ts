import { zValidator } from '@hono/zod-validator'
import { Hono, type Handler } from 'hono'
import { bundledLanguages } from 'shiki'
import * as z from 'zod'

import * as Browser from './Browser.js'
import * as Codec from './Codec.js'
import * as Frame from './Frame.js'
import * as Languages from './internal/Languages.js'
import * as Theme from './Theme.js'

/** Maximum request field sizes. */
const limit = { code: 100_000, nodes: 20_000, picture: 4_000_000, text: 10_000 }

/** Names and aliases of every bundled Shiki grammar. */
const languageNames = Object.keys(bundledLanguages) as [string, ...string[]]

/** Request and response schemas. */
namespace schema {
  /**
   * A resolved Twoslash run. Removal ranges verify that the run matches the
   * submitted source.
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
   * Validates a frame request without applying shared-link fallbacks. Numeric
   * limits come from `Codec.strict`.
   */
  export const document = z
    .object({
      // API requests embed pictures instead of naming deployment assets.
      background: z
        .union([
          z.enum(['default', 'none']),
          z.string().regex(/^#[0-9a-f]{6}$/i),
          z.string().regex(/^gradient:#[0-9a-f]{6}:#[0-9a-f]{6}$/i),
        ])
        .optional(),
      code: z.string().min(1).max(limit.code),
      // Keep the error short because the generated schema lists every grammar.
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
      /** Fades the bottom edge when the source has been truncated. */
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
   * Verifies that a Twoslash run matches the submitted source. Applying its
   * removal ranges must reproduce the compiled code.
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

  /** Frame request with an optional image scale. */
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
      /** Whether the theme includes artwork. */
      artwork: z.boolean().optional(),
      displayName: z.string(),
      name: z.string(),
      /** Window radius declared by the theme. */
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
   * Builds the standalone document shared by the image and document routes.
   * Returns an error response when rendering fails.
   */
  async function frame_document(
    context: picture.Context,
    request: schema.Document,
  ): Promise<Response | string> {
    // Apply codec defaults so requests, links, and the editor render omitted
    // fields consistently.
    const state = Codec.schema.parse(request)
    try {
      // The package stores theme colors, while the deployment stores theme
      // artwork. Load that artwork only for the default backdrop.
      const picture =
        request.picture ??
        (Theme.info(state.theme)?.artwork &&
        (request.background === undefined || request.background === 'default')
          ? await options.picture?.({ context, theme: state.theme })
          : undefined)
      return await frame.toDocument({
        ...state,
        // Keep an omitted request radius unset so the theme radius can apply.
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
        // `Response` accepts image bytes directly, while `c.body` does not.
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
     * Resolves the Browser Rendering binding for each request. Without one,
     * `/image` returns `503`; other routes still work.
     */
    browser?: ((context: { env: unknown }) => Browser.Endpoint | undefined) | undefined
    /**
     * Frame renderer. Defaults to Shiki's JavaScript engine. Pass an existing
     * renderer to share loaded grammars or select another engine.
     */
    frame?: Frame.create.ReturnType | undefined
    /**
     * Resolves theme artwork as a `data:` URL. Called only for the default
     * backdrop when the request omits `picture`.
     *
     * Without this option, themes use their generated gradients.
     */
    picture?:
      | ((options: picture.Options) => Promise<string | undefined> | string | undefined)
      | undefined
  }
}

export declare namespace picture {
  /** Request context available to binding resolvers. */
  type Context = { env: unknown; req: { url: string } }

  /** Theme name and request context for artwork resolution. */
  type Options = { context: Context; theme: string }
}

/**
 * Builds OpenAPI metadata from route validation schemas.
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
   * Formats validation failures as one field-specific error response.
   */
  const reject: Parameters<typeof zValidator>[2] = (result, c) => {
    if (result.success) return undefined
    const issue = result.error.issues[0]
    const at = issue?.path.map(String).join('.')
    return c.json({ error: `${at ? `${at}: ` : ''}${issue?.message ?? 'Invalid request.'}` }, 400)
  }

  /**
   * Attaches the validation schema and OpenAPI metadata to route middleware.
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
   * Builds OpenAPI paths from registered route metadata. The supplied prefix
   * preserves paths when the app is mounted below the root.
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

/** Schema alias available inside `OpenApi`. */
const schema_failure = schema.failure

/**
 * Ready-to-mount routes with a private renderer. Use {@link create} to share a
 * renderer or select another engine.
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
