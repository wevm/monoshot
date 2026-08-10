import { Hono } from 'hono'

import * as Codec from './Codec.js'
import * as Frame from './Frame.js'
import * as Theme from './Theme.js'

/**
 * Creates the routes that render a frame over HTTP.
 *
 * Mount on any Hono app, or serve as a Worker's own handler. Holds a renderer
 * for its lifetime, so an isolate pays for the grammars it loads once.
 *
 * @example
 * ```ts twoslash
 * import { Hono } from 'hono'
 * import * as Api from 'monoshot/api'
 *
 * const app = new Hono().route('/v1', Api.create())
 * ```
 */
export function create(options: create.Options = {}): create.ReturnType {
  // The JavaScript engine by default: shiki's own compiles WebAssembly at
  // runtime, which a Worker refuses, and a Worker is what this is for.
  const frame = options.frame ?? Frame.create({ engine: 'javascript' })

  return new Hono().post('/document', async (c) => {
    const body = await c.req.json<Record<string, unknown>>().catch(() => undefined)
    if (!body) return c.json({ error: 'Send a JSON body.' }, 400)

    const state = Codec.schema.parse(body)
    // The codec falls back rather than failing, which a half-edited link needs
    // and a request does not: a field that was replaced was never understood.
    const replaced = Object.keys(state).filter(
      (key) =>
        key !== 'code' &&
        (body as Record<string, unknown>)[key] !== undefined &&
        (body as Record<string, unknown>)[key] !== (state as Record<string, unknown>)[key],
    )
    if (replaced.length > 0)
      return c.json({ error: `Out of range: ${replaced.join(', ')}.`, fields: replaced }, 400)

    if (state.code === '') return c.json({ error: 'Send the code to render.' }, 400)
    if (state.lang === 'auto') return c.json({ error: 'Name the language to render.' }, 400)
    const theme = Theme.info(state.theme)
    if (!theme) return c.json({ error: `\`${state.theme}\` is not a bundled theme.` }, 400)

    const html = await (async () => {
      try {
        return await frame.toDocument({
          ...state,
          // Types resolved by the caller, drawn as given. Resolving them here
          // would put a compiler in the request path.
          ...(isRun(body['twoslash']) ? { twoslash: body['twoslash'] } : {}),
          lang: state.lang as Parameters<typeof frame.toDocument>[0]['lang'],
          theme: theme.name,
        })
      } catch (cause) {
        return cause instanceof Error ? cause : new Error(String(cause))
      }
    })()
    if (html instanceof Error) return c.json({ error: html.message }, 400)

    return c.body(html, 200, {
      // The document is derived entirely from the request, so a shared cache
      // may keep it against that body.
      'cache-control': 'public, max-age=31536000, immutable',
      'content-type': 'text/html; charset=utf-8',
    })
  })
}

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

/** Whether a body carries a twoslash run rather than something else. */
function isRun(value: unknown): value is Frame.render.Types {
  if (typeof value !== 'object' || value === null) return false
  const run = value as Record<string, unknown>
  return typeof run['code'] === 'string' && Array.isArray(run['nodes'])
}
