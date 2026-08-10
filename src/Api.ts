import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'

import * as Codec from './Codec.js'
import * as Frame from './Frame.js'
import * as Theme from './Theme.js'

/** What a snippet may weigh, so one request cannot occupy an isolate. */
const limit = { code: 100_000, nodes: 20_000 }

/**
 * The request, described strictly. The codec falls back on every field so a
 * hand-edited link still opens something; a request that asked for a width no
 * frame has is a mistake, and is answered as one. The bounds are stated here
 * rather than read off the codec, which holds them as fallbacks.
 */
const fields = z
  .object({
    background: z
      .union([z.literal('default'), z.literal('none'), z.string().regex(/^#[0-9a-f]{6}$/i)])
      .optional()
      .openapi({ example: 'default' }),
    code: z.string().min(1).max(limit.code).openapi({ example: 'const a = 1\n' }),
    lang: z.string().openapi({ example: 'ts' }),
    lineNumbers: z.boolean().optional(),
    padding: z.number().int().min(0).max(256).optional(),
    radius: z.number().int().min(0).max(24).optional(),
    theme: z.string().optional().openapi({ example: 'vitesse-dark' }),
    title: z.string().max(200).optional(),
    titleBar: z.boolean().optional(),
    twoslash: z
      .object({ code: z.string().max(limit.code), nodes: z.array(z.unknown()).max(limit.nodes) })
      .optional(),
    width: z.number().int().min(320).max(1600).optional(),
  })
  .strict()

/** A body once its fields are known good, before they are read together. */
type Document = z.infer<typeof fields>

const document = fields.superRefine((body: Document, context: z.RefinementCtx) => {
  if (!body.twoslash) return
  // Twoslash cuts its notation lines out before compiling, so a run reports
  // the source without them. Anything else was resolved against other code,
  // and its offsets would land on this snippet in the wrong places.
  const compiled = body.code
    .split('\n')
    .filter((line: string) => !/^\s*\/\/\s*\^\?/.test(line))
    .join('\n')
  if (body.twoslash.code !== compiled && body.twoslash.code !== body.code)
    context.addIssue({
      code: 'custom',
      message: 'the resolved types belong to different code.',
      path: ['twoslash', 'code'],
    })
})

const document_route = createRoute({
  description:
    'Renders a snippet to a standalone document, which runs nothing and fetches nothing.',
  method: 'post',
  path: '/document',
  request: { body: { content: { 'application/json': { schema: document } }, required: true } },
  responses: {
    200: { content: { 'text/html': { schema: z.string() } }, description: 'The document.' },
    400: {
      content: { 'application/json': { schema: z.object({ error: z.string() }) } },
      description: 'The request described a frame that cannot be drawn.',
    },
  },
  summary: 'Render a document',
})

const themes_route = createRoute({
  description: 'Lists the themes `theme` accepts, and which scheme each one suits.',
  method: 'get',
  path: '/themes',
  request: {
    query: z.object({
      type: z
        .union([z.literal('dark'), z.literal('light')])
        .optional()
        .openapi({ example: 'dark' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: z.array(
            z.object({
              displayName: z.string(),
              name: z.string(),
              type: z.union([z.literal('dark'), z.literal('light')]),
            }),
          ),
        },
      },
      description: 'The bundled themes.',
    },
  },
  summary: 'List themes',
})

/**
 * Creates the routes that render a frame over HTTP.
 *
 * Mount on any Hono app, or serve as a Worker's own handler. Holds a renderer
 * for its lifetime, so an isolate pays for the grammars it loads once, and
 * serves its own description at `/openapi.json`.
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

  const app = new OpenAPIHono({
    // One shape for every rejection, whichever check raised it.
    defaultHook: (result, c) => {
      if (result.success) return undefined
      const issue = result.error.issues[0]
      const at = issue?.path.join('.')
      return c.json({ error: `${at ? `${at}: ` : ''}${issue?.message ?? 'Invalid request.'}` }, 400)
    },
  })

  app.openapi(document_route, async (c) => {
    const body = c.req.valid('json')
    // Defaults come from the codec, so a request, a link, and the editor draw
    // the same frame from a field nobody set.
    const state = { ...Codec.schema.parse({}), ...body }
    if (state.lang === 'auto') return c.json({ error: 'lang: name the language to render.' }, 400)
    const theme = Theme.info(state.theme)
    if (!theme) return c.json({ error: `theme: \`${state.theme}\` is not bundled.` }, 400)

    const html = await (async () => {
      try {
        return await frame.toDocument({
          ...state,
          ...(body.twoslash ? { twoslash: body.twoslash as Frame.render.Types } : {}),
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
  })

  app.openapi(themes_route, (c) => {
    const { type } = c.req.valid('query')
    return c.json(Theme.list().filter((theme) => !type || theme.type === type))
  })

  app.doc('/openapi.json', { info: { title: 'monoshot', version: '1' }, openapi: '3.1.0' })
  return app
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

  type ReturnType = OpenAPIHono
}
