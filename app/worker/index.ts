import handler from '@tanstack/react-start/server-entry'
import { Hono } from 'hono'
import { Api, Codec, Twoslash } from 'monoshot'
import * as z from 'zod'

import * as Links from './links.js'

// Registered rather than left to the default: the bundler drops the locale
// Preserve field-specific errors instead of Zod's generic `Invalid input` message.
z.config(z.locales.en())

const api = new Hono<{ Bindings: Cloudflare.Env }>()
  .get('/health', (c) => c.json({ status: 'ok' }))
  // Renders a frame to the standalone document a browser screenshots. The
  // library owns the routes, so the CLI, this app, and any other consumer
  // draw from one description of a frame.
  // The binding reaches a Worker through its environment, so the routes read
  // it off each request rather than holding it.
  .route('/', Api.create({ browser: (c) => (c.env as Cloudflare.Env).BROWSER }))
  // Keeps a snippet so a link can carry it. Sharing is the one moment code
  // leaves the browser: every other link holds it in the fragment, which a
  // server never sees.
  .post('/share', async (c) => {
    if (!c.env.LINKS)
      return c.json({ error: 'Sharing is not configured for this deployment.' }, 503)
    const body = await c.req.json<{ state?: unknown }>().catch(() => ({ state: undefined }))
    const state = typeof body.state === 'string' ? body.state : ''
    // Read back before it is kept: a fragment the decoder rejects opens an
    // empty editor, and a link to nothing is worth refusing at the source.
    if (!state || !Codec.readable(state))
      return c.json({ error: 'That is not a snippet this can open.' }, 400)
    if (state.length > Links.limits.size)
      return c.json({ error: 'That snippet is too large to share.' }, 413)

    const id = Links.id()
    await c.env.LINKS.put(id, state, { expirationTtl: Links.limits.ttl })
    return c.json({ id, url: `${new URL(c.req.url).origin}/s/${id}` }, 201)
  })
  // A whole package's declarations in one response. The editor resolves types
  // in the browser, where fetching them file by file from a CDN costs hundreds
  // of round trips for a package like `shiki`.
  .get('/types/*', async (c) => {
    const spec = decodeURIComponent(c.req.path.replace(/^\/api\/types\//, ''))
    const { name, version } = parse(spec)
    if (!name) return c.json({ error: 'Name a package to read types for.' }, 400)

    // Exact package versions are immutable and need no revalidation. Tags may
    // resolve to a different version after a release.
    const exact = version !== 'latest'
    // Named rather than `caches.default`, which shares its keyspace with the
    // asset cache in front of this Worker.
    const cache = await caches.open('types')
    const hit = await cache.match(c.req.raw)
    if (hit) return hit

    const result = await (async () => {
      try {
        return await Twoslash.Registry.types({ name, version })
      } catch (cause) {
        return cause instanceof Error ? cause : new Error(String(cause))
      }
    })()
    if (result instanceof Error) {
      // Return 404 only for missing declarations. Registry failures are
      // upstream service errors.
      const absent = result instanceof Twoslash.Registry.RegistryError && result.absent
      return c.json({ error: result.message }, absent ? 404 : 502)
    }

    const response = Response.json(result, {
      headers: {
        'cache-control': exact
          ? 'public, max-age=31536000, immutable'
          : // Long enough to absorb a burst of visitors, short enough that a
            // release is picked up the same day.
            'public, max-age=300',
      },
    })
    c.executionCtx.waitUntil(cache.put(c.req.raw, response.clone()))
    return response
  })

const app = new Hono<{ Bindings: Cloudflare.Env }>()
  .route('/api', api)
  // The preview a link carries, drawn from the snippet it names. Rendered
  // before the page is answered, because the crawler reading it runs no
  // JavaScript. Registered ahead of the fall-through, which would otherwise
  // hand both of these to the app.
  .get('/s/:id/og.png', async (c) => {
    const state = await c.env.LINKS?.get(c.req.param('id'))
    // A link that expired still has a card, which is the app's own.
    if (!state) return c.redirect('/og.png', 302)
    // Named rather than `caches.default`, which shares its keyspace with the
    // asset cache in front of this Worker.
    const cache = await caches.open('og')
    const hit = await cache.match(c.req.raw)
    if (hit) return hit

    if (!c.env.BROWSER) return c.redirect('/og.png', 302)
    const settings = Codec.deserialize(state)
    // Drawn through the route rather than beside it, so a preview and a caller
    // asking for the same frame get the same image from the same validation.
    const drawn = await api.request(
      '/image',
      {
        body: JSON.stringify({
          background: settings.background,
          code: settings.code,
          lang: settings.lang,
          // The card's shape rather than the editor's: a preview is cropped to
          // 1.91:1, and a frame as tall as the editor draws loses its middle.
          padding: 88,
          radius: settings.radius,
          scale: 1.5,
          theme: settings.theme,
          titleBar: false,
          width: 800,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
      c.env,
      c.executionCtx,
    )
    if (!drawn.ok) return c.redirect('/og.png', 302)

    const response = new Response(drawn.body, {
      // The state behind an id never changes, so a hit needs no revalidation.
      headers: {
        'cache-control': 'public, max-age=31536000, immutable',
        'content-type': 'image/png',
      },
    })
    c.executionCtx.waitUntil(cache.put(c.req.raw, response.clone()))
    return response
  })
  .get('/s/:id', async (c) => {
    const id = c.req.param('id')
    const state = await c.env.LINKS?.get(id)
    // Nothing to open, so the reader lands on an empty editor rather than on
    // an error page for a link that merely expired.
    if (!state) return c.redirect('/', 302)
    const settings = Codec.deserialize(state)
    return c.html(
      Links.page({
        description: `A ${settings.lang} snippet, rendered by monoshot.`,
        id,
        origin: new URL(c.req.url).origin,
        state,
        title: Links.summarize(settings.code, 'A snippet on monoshot'),
      }),
    )
  })
  // Unmatched requests fall through to TanStack Start (SSR shell + assets).
  .all('*', (c) => handler.fetch(c.req.raw))

export default app

/**
 * Splits `shiki@4.4.2` into package and version components while preserving
 * scoped package prefixes. Missing versions default to `latest`.
 */
function parse(spec: string) {
  const at = spec.lastIndexOf('@')
  if (at <= 0) return { name: spec, version: 'latest' }
  return { name: spec.slice(0, at), version: spec.slice(at + 1) }
}
