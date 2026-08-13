import handler from '@tanstack/react-start/server-entry'
import { Hono } from 'hono'
import { Api, Codec, Twoslash } from 'monoshot'
import * as z from 'zod'

import { detect } from '../src/lib/detect.js'
import * as Themes from '../src/lib/themes.js'
import * as Wallpapers from '../src/lib/wallpapers.js'
import * as Links from './links.js'

// Register the English locale explicitly to preserve field-specific validation messages.
z.config(z.locales.en())

const api = new Hono<{ Bindings: Cloudflare.Env }>()
  .get('/health', (c) => c.json({ status: 'ok' }))
  // Use the shared API routes so every consumer applies the same frame validation.
  // Resolve the browser binding per request from the Worker environment.
  .route('/', Api.create({ browser: (c) => (c.env as Cloudflare.Env).BROWSER }))
  // Store snippet state so the server can generate link-preview metadata.
  .post('/share', async (c) => {
    if (!c.env.LINKS)
      return c.json({ error: 'Sharing is not configured for this deployment.' }, 503)
    // Reject oversized bodies before parsing to limit memory use by unauthenticated requests.
    const declared = Number(c.req.header('content-length') ?? 0)
    if (declared > Links.limits.size * 2)
      return c.json({ error: 'That snippet is too large to share.' }, 413)
    // Limit writes per client address because each share persists for 90 days.
    const caller = c.req.header('cf-connecting-ip') ?? 'anonymous'
    if (!(await c.env.SHARE_RATE.limit({ key: caller })).success)
      return c.json({ error: 'Too many links from here. Try again shortly.' }, 429)
    const body = await c.req.json<{ state?: unknown }>().catch(() => ({ state: undefined }))
    const state = typeof body.state === 'string' ? body.state : ''
    if (state.length > Links.limits.size)
      return c.json({ error: 'That snippet is too large to share.' }, 413)
    // Validate encoded state before storage to prevent links that open an empty editor.
    if (!state || !Codec.readable(state))
      return c.json({ error: 'That is not a snippet this can open.' }, 400)

    const id = Links.id()
    // Generate metadata once during sharing instead of delaying every preview request.
    const settings = Codec.deserialize(state)
    const said = c.env.AI ? await Links.describe(c.env.AI, settings.code) : undefined
    // Re-encode validated settings to remove trailing data ignored by the decoder.
    const canonical = Codec.serialize(settings)
    await c.env.LINKS.put(id, JSON.stringify({ ...said, state: canonical }), {
      expirationTtl: Links.limits.ttl,
    })
    // Draw the card now, while the sharer still holds the link, and keep it
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
  // Render server-side preview images before the application fall-through routes.
  .get('/s/:id/og.png', async (c) => {
    const id = c.req.param('id')
    const kept = await c.env.LINKS?.get(id)
    // Use the default application card when the shared state has expired.
    if (!kept) return c.redirect('/og.jpg', 302)
    // Named rather than `caches.default`, which shares its keyspace with the
    // asset cache in front of this Worker.
    const cache = await caches.open('og')
    const hit = await cache.match(c.req.raw)
    if (hit) return hit

    // The copy the share drew, kept where every colo can read it: this cache
    // is colo-local, and a crawler rarely lands where the sharer did.
    const held = await c.env.LINKS?.get(`og:${id}`, 'arrayBuffer')
    if (held) {
      const response = pictured(held)
      c.executionCtx.waitUntil(cache.put(c.req.raw, response.clone()))
      return response
    }

    if (!c.env.BROWSER) return c.redirect('/og.jpg', 302)
    const { state } = Links.read(kept)
    const drawn = await card(c.env, c.executionCtx, new URL(c.req.url).origin, state)
    if (!drawn) return c.redirect('/og.jpg', 302)
    const response = pictured(drawn)
    c.executionCtx.waitUntil(cache.put(c.req.raw, response.clone()))
    c.executionCtx.waitUntil(keep(c.env, id, drawn))
    return response
  })
  .get('/s/:id', async (c) => {
    const id = c.req.param('id')
    const kept = await c.env.LINKS?.get(id)
    // Redirect expired links to an empty editor instead of returning an error page.
    if (!kept) return c.redirect('/', 302)
    const link = Links.read(kept)
    const settings = Codec.deserialize(link.state)
    const language = settings.lang === 'auto' ? (detect(settings.code) ?? 'code') : settings.lang
    return c.html(
      Links.page({
        // Fall back to deterministic metadata when model-generated metadata is absent.
        description: link.description ?? `A ${language} snippet, rendered by monoshot.`,
        id,
        origin: new URL(c.req.url).origin,
        state: link.state,
        title: link.title ?? Links.summarize(settings.code, 'A snippet on monoshot'),
      }),
    )
  })
  // Unmatched requests fall through to TanStack Start (SSR shell + assets).
  .all('*', (c) => handler.fetch(c.req.raw))

export default app

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
  // Bounded rather than whole: past what the widest canvas holds, the rest of
  // a snippet is cut.
  const shown = Links.excerpt(settings.code)
  // The canvas grows with the snippet and the screenshot scales it back, so
  // every line is on the card and every card is one shape.
  const shape = Links.geometry(shown)
  const drawn = await api.request(
    '/image',
    {
      body: JSON.stringify({
        // A wallpaper reaches the renderer as `picture`; the name it goes by
        // here means nothing there.
        background: settings.background.startsWith('wallpaper:') ? 'default' : settings.background,
        code: shown,
        height: shape.height,
        // `auto` is the editor asking to be told, which it answers in the
        // browser. The renderer takes a language shiki bundles or nothing.
        lang: settings.lang === 'auto' ? (detect(settings.code) ?? 'typescript') : settings.lang,
        padding: 88,
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
 * Loads a Worker-served wallpaper as a data URL.
 *
 * The standalone renderer performs no external requests, so wallpaper data
 * must be embedded in the document. Read through the assets binding: a fetch
 * of this Worker's own URL is refused by the platform as recursion.
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
    // Omit the picture when the wallpaper cannot be loaded.
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
