import handler from '@tanstack/react-start/server-entry'
import { Hono } from 'hono'
import { Api, Codec, Twoslash } from 'monoshot'
import * as z from 'zod'

import { detect } from '../src/lib/detect.js'
import * as Themes from '../src/lib/themes.js'
import * as Wallpapers from '../src/lib/wallpapers.js'
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
    // Refused before it is read: a body past the cap is one this would reject
    // anyway, and parsing it first is what an unauthenticated caller would use
    // to spend the isolate's memory.
    const declared = Number(c.req.header('content-length') ?? 0)
    if (declared > Links.limits.size * 2)
      return c.json({ error: 'That snippet is too large to share.' }, 413)
    // Nothing here asks who is calling, and every call writes a key kept for
    // ninety days and draws an image on request. Held per address, high enough
    // that nobody sharing snippets meets it.
    const caller = c.req.header('cf-connecting-ip') ?? 'anonymous'
    if (!(await c.env.SHARE_RATE.limit({ key: caller })).success)
      return c.json({ error: 'Too many links from here. Try again shortly.' }, 429)
    const body = await c.req.json<{ state?: unknown }>().catch(() => ({ state: undefined }))
    const state = typeof body.state === 'string' ? body.state : ''
    if (state.length > Links.limits.size)
      return c.json({ error: 'That snippet is too large to share.' }, 413)
    // Read back before it is kept: a fragment the decoder rejects opens an
    // empty editor, and a link to nothing is worth refusing at the source.
    if (!state || !Codec.readable(state))
      return c.json({ error: 'That is not a snippet this can open.' }, 400)

    const id = Links.id()
    // Written back out rather than kept as it arrived. The decoder stops at
    // the end of what it can read and ignores whatever follows, so a valid
    // fragment can carry a payload through `readable`; re-encoding leaves only
    // the state itself.
    const canonical = Codec.serialize(Codec.deserialize(state))
    await c.env.LINKS.put(id, canonical, { expirationTtl: Links.limits.ttl })
    // The card is drawn now, while the sharer still holds the link, and kept
    // where every colo reads it: a crawler follows within seconds of a paste,
    // and a browser launched on its clock is a preview it gave up on.
    if (c.env.BROWSER)
      c.executionCtx.waitUntil(
        card(c.env, c.executionCtx, new URL(c.req.url).origin, canonical).then((drawn) =>
          drawn ? keep(c.env, id, drawn) : undefined,
        ),
      )
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
    const id = c.req.param('id')
    const state = await c.env.LINKS?.get(id)
    // A link that expired still has a card, which is the app's own.
    if (!state) return c.redirect('/og.jpg', 302)
    // Named rather than `caches.default`, which shares its keyspace with the
    // asset cache in front of this Worker.
    const cache = await caches.open('og')
    const hit = await cache.match(c.req.raw)
    if (hit) return hit

    // The copy the share drew, kept where every colo can read it: this cache
    // is colo-local, and a crawler rarely lands where the sharer did.
    const kept = await c.env.LINKS?.get(`og:${id}`, 'arrayBuffer')
    if (kept) {
      const response = pictured(kept)
      c.executionCtx.waitUntil(cache.put(c.req.raw, response.clone()))
      return response
    }

    if (!c.env.BROWSER) return c.redirect('/og.jpg', 302)
    const drawn = await card(c.env, c.executionCtx, new URL(c.req.url).origin, state)
    if (!drawn) return c.redirect('/og.jpg', 302)
    const response = pictured(drawn)
    c.executionCtx.waitUntil(cache.put(c.req.raw, response.clone()))
    c.executionCtx.waitUntil(keep(c.env, id, drawn))
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
        description: `A ${settings.lang === 'auto' ? (detect(settings.code) ?? 'code') : settings.lang} snippet, rendered by monoshot.`,
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

/** How a link's card is drawn: the card's own shape, never the editor's. */
const shape = { height: 420, padding: 88, scale: 1.5, width: 800 } as const

/**
 * A link's card, drawn from its state.
 *
 * Drawn through the image route rather than beside it, so a preview and a
 * caller asking for the same frame get the same image from the same
 * validation. Answers nothing rather than throwing: every caller has a
 * fallback card to serve.
 */
async function card(
  env: Cloudflare.Env,
  // Hono's own idea of the context, which is what `api.request` accepts.
  ctx: Parameters<typeof api.request>[3],
  origin: string,
  state: string,
): Promise<ArrayBuffer | undefined> {
  const settings = Codec.deserialize(state)
  // The picture the frame stands on, carried rather than named: the renderer
  // fetches nothing, so a backdrop reaches it as data or not at all.
  const named =
    Wallpapers.at(settings.background) ??
    (settings.background === 'default' ? Wallpapers.byId(settings.theme) : undefined)
  const picture = named ? await inlined(env, origin, named.id) : undefined
  const drawn = await api.request(
    '/image',
    {
      body: JSON.stringify({
        // A wallpaper reaches the renderer as `picture`; the name it goes by
        // here means nothing there.
        background: settings.background.startsWith('wallpaper:') ? 'default' : settings.background,
        // Bounded rather than whole: the canvas holds one card of lines, and
        // a hundred more would only be cut.
        code: Links.excerpt(settings.code),
        // The card's own shape: a canvas following a one-line snippet is a
        // sliver no preview shows well.
        height: shape.height,
        // `auto` is the editor asking to be told, which it answers in the
        // browser. The renderer takes a language shiki bundles or nothing.
        lang: settings.lang === 'auto' ? (detect(settings.code) ?? 'typescript') : settings.lang,
        padding: shape.padding,
        ...(picture ? { picture } : {}),
        // The frame a theme asks for, which is what the app draws it in.
        radius: Themes.frame(settings.theme).radius ?? settings.radius,
        scale: shape.scale,
        theme: settings.theme,
        titleBar: false,
        width: shape.width,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
    env,
    ctx,
  )
  if (!drawn.ok) return undefined
  return drawn.arrayBuffer()
}

/** The card as a response. The state behind an id never changes. */
function pictured(bytes: ArrayBuffer): Response {
  return new Response(bytes, {
    headers: {
      'cache-control': 'public, max-age=31536000, immutable',
      'content-type': 'image/png',
    },
  })
}

/** Keeps a drawn card beside its link, and gone with it. */
function keep(env: Cloudflare.Env, id: string, bytes: ArrayBuffer): Promise<void> {
  return env.LINKS.put(`og:${id}`, bytes, { expirationTtl: Links.limits.ttl })
}

/**
 * A wallpaper as a `data:` URL, read from the assets this Worker serves.
 *
 * Through the assets binding rather than this Worker's own URL, which is a
 * request back into this Worker: the platform refuses the recursion, and the
 * card silently loses its backdrop. Inlined because the page a capture loads
 * makes no requests of its own.
 */
async function inlined(
  env: Cloudflare.Env,
  origin: string,
  id: string,
): Promise<string | undefined> {
  try {
    // The Worker's own URL, resolved by the binding rather than the network:
    // the binding takes the path from it, and refuses a host that is not ours.
    const response = await env.ASSETS.fetch(new URL(`/wallpapers/${id}.webp`, origin))
    if (!response.ok) return undefined
    const bytes = new Uint8Array(await response.arrayBuffer())
    let binary = ''
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return `data:image/webp;base64,${btoa(binary)}`
  } catch {
    // A backdrop that cannot be read leaves the frame on the theme's own.
    return undefined
  }
}

/**
 * Splits `shiki@4.4.2` into package and version components while preserving
 * scoped package prefixes. Missing versions default to `latest`.
 */
function parse(spec: string) {
  const at = spec.lastIndexOf('@')
  if (at <= 0) return { name: spec, version: 'latest' }
  return { name: spec.slice(0, at), version: spec.slice(at + 1) }
}
