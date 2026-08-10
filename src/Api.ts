import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import * as z from 'zod'

import * as Codec from './Codec.js'
import * as Frame from './Frame.js'
import * as Theme from './Theme.js'

/** What a snippet may weigh, so one request cannot occupy an isolate. */
const limit = { code: 100_000, nodes: 20_000 }

/**
 * The frame to draw, described strictly. The codec falls back on every field
 * so a hand-edited link still opens something; a request naming a width no
 * frame has is a mistake, and is answered as one. The bounds are stated here
 * rather than read off the codec, which holds them as fallbacks.
 */
const document = z
  .object({
    background: z
      .union([z.literal('default'), z.literal('none'), z.string().regex(/^#[0-9a-f]{6}$/i)])
      .optional(),
    code: z.string().min(1).max(limit.code),
    lang: z.string(),
    lineNumbers: z.boolean().optional(),
    padding: z.number().int().min(0).max(256).optional(),
    radius: z.number().int().min(0).max(24).optional(),
    theme: z.string().optional(),
    title: z.string().max(200).optional(),
    titleBar: z.boolean().optional(),
    twoslash: z
      .object({ code: z.string().max(limit.code), nodes: z.array(z.unknown()).max(limit.nodes) })
      .optional(),
    width: z.number().int().min(320).max(1600).optional(),
  })
  .strict()

/** A body once its fields are known good, before they are read together. */
type Document = z.infer<typeof document>

const body = document.superRefine((request: Document, context: z.RefinementCtx) => {
  if (!request.twoslash) return
  // Twoslash cuts its notation lines out before compiling, so a run reports
  // the source without them. Anything else was resolved against other code,
  // and its offsets would land on this snippet in the wrong places.
  const compiled = request.code
    .split('\n')
    .filter((line: string) => !/^\s*\/\/\s*\^\?/.test(line))
    .join('\n')
  if (request.twoslash.code !== compiled && request.twoslash.code !== request.code)
    context.addIssue({
      code: 'custom',
      message: 'the resolved types belong to different code.',
      path: ['twoslash', 'code'],
    })
})

/** Which themes to list. */
const filter = z.object({ type: z.union([z.literal('dark'), z.literal('light')]).optional() })

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

/** What a route says about itself, carried on the middleware that guards it. */
type Described = {
  description: string
  responses: Record<number, { content?: Record<string, unknown>; description: string }>
  schema: z.ZodType
  summary: string
  target: 'json' | 'query'
}

/**
 * Validates a request, and remembers what it validated. The description is
 * read back off the routes, so a route and what it accepts cannot drift.
 */
function validate<schema extends z.ZodType, const target extends 'json' | 'query'>(
  target: target,
  schema: schema,
  described: Omit<Described, 'schema' | 'target'>,
) {
  return Object.assign(zValidator(target, schema, reject), { ...described, schema, target })
}

/** The routes as OpenAPI, built from the middleware guarding each one. */
function describe(app: Hono): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const route of app.routes) {
    const described = route.handler as Partial<Described>
    if (!described.schema) continue
    const schema = z.toJSONSchema(described.schema) as {
      properties?: Record<string, unknown>
      required?: string[]
    }
    const path = (paths[route.path] ??= {})
    path[route.method.toLowerCase()] = {
      description: described.description,
      responses: described.responses,
      summary: described.summary,
      ...(described.target === 'json'
        ? {
            requestBody: {
              content: { 'application/json': { schema } },
              required: true,
            },
          }
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

/**
 * Creates the routes that render a frame over HTTP.
 *
 * Mount on any Hono app, or serve as a Worker's own handler. Holds a renderer
 * for its lifetime, so an isolate pays for the grammars it loads once, and
 * describes itself at `/openapi.json`.
 *
 * @example
 * ```ts twoslash
 * import { Hono } from 'hono'
 * import { Api, Frame } from 'monoshot'
 *
 * const app = new Hono().route('/v1', Api.create({ frame: Frame.create() }))
 * ```
 */
export function create(options: create.Options = {}): create.ReturnType {
  // The JavaScript engine by default: shiki's own compiles WebAssembly at
  // runtime, which a Worker refuses, and a Worker is what this is for.
  const frame = options.frame ?? Frame.create({ engine: 'javascript' })

  const app = new Hono()
    .post(
      '/document',
      validate('json', body, {
        description: 'Renders a snippet to a standalone document, which runs and fetches nothing.',
        responses: {
          200: { content: { 'text/html': {} }, description: 'The document.' },
          400: { description: 'The request described a frame that cannot be drawn.' },
        },
        summary: 'Render a document',
      }),
      async (c) => {
        const request = c.req.valid('json')
        // Read back through the codec, which holds what every field falls back
        // to: a request, a link, and the editor then draw the same frame from a
        // field nobody set.
        const state = Codec.schema.parse(request)
        if (state.lang === 'auto')
          return c.json({ error: 'lang: name the language to render.' }, 400)
        const theme = Theme.info(state.theme)
        if (!theme) return c.json({ error: `theme: \`${state.theme}\` is not bundled.` }, 400)

        const html = await (async () => {
          try {
            return await frame.toDocument({
              ...state,
              ...(request.twoslash ? { twoslash: request.twoslash as Frame.render.Types } : {}),
              lang: state.lang as Parameters<typeof frame.toDocument>[0]['lang'],
              theme: theme.name,
            })
          } catch (cause) {
            return cause instanceof Error ? cause : new Error(String(cause))
          }
        })()
        if (html instanceof Error) return c.json({ error: html.message }, 400)

        // No cache header: a shared cache keys on the URL, which says nothing
        // about the body each of these renders from.
        return c.body(html, 200, { 'content-type': 'text/html; charset=utf-8' })
      },
    )
    .get(
      '/themes',
      validate('query', filter, {
        description: 'Lists the themes `theme` accepts, and which scheme each one suits.',
        responses: { 200: { description: 'The bundled themes.' } },
        summary: 'List themes',
      }),
      (c) => {
        const { type } = c.req.valid('query')
        return c.json(Theme.list().filter((theme) => !type || theme.type === type))
      },
    )

  // Read when asked rather than when built, so every route is registered.
  return app.get('/openapi.json', (c) => c.json(describe(app)))
}

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
export const route: create.ReturnType = create()

export declare namespace create {
  type Options = {
    /**
     * Renderer to draw with. Defaults to one holding shiki's JavaScript
     * engine. Pass one to share loaded grammars, or to choose the engine.
     */
    frame?: Frame.create.ReturnType | undefined
  }

  type ReturnType = Hono
}
