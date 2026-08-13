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
    await c.env.LINKS.put(id, JSON.stringify({ ...said, state: Codec.serialize(settings) }), {
      expirationTtl: Links.limits.ttl,
    })
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
    const kept = await c.env.LINKS?.get(c.req.param('id'))
    // Use the default application card when the shared state has expired.
    if (!kept) return c.redirect('/og.jpg', 302)
    const { state } = Links.read(kept)
    // Named rather than `caches.default`, which shares its keyspace with the
    // asset cache in front of this Worker.
    const cache = await caches.open('og')
    const hit = await cache.match(c.req.raw)
    if (hit) return hit

    if (!c.env.BROWSER) return c.redirect('/og.jpg', 302)
    const settings = Codec.deserialize(state)
    // Inline wallpaper data because the standalone renderer performs no requests.
    const named =
      Wallpapers.at(settings.background) ??
      (settings.background === 'default' ? Wallpapers.byId(settings.theme) : undefined)
    const picture = named ? await inlined(new URL(c.req.url).origin, named.id) : undefined
    // Render through the public image route to reuse its validation and output behavior.
    const drawn = await api.request(
      '/image',
      {
        body: JSON.stringify({
          // Replace wallpaper identifiers with the theme backdrop for standalone rendering.
          background: settings.background.startsWith('wallpaper:')
            ? 'default'
            : settings.background,
          // Limit code lines to keep text legible within the card dimensions.
          code: Links.excerpt(settings.code),
          // Resolve automatic language detection before invoking the renderer.
          lang: settings.lang === 'auto' ? (detect(settings.code) ?? 'typescript') : settings.lang,
          // Use card-specific padding to preserve content within the 1.91:1 crop.
          padding: 88,
          ...(picture ? { picture } : {}),
          // Apply the selected theme's frame radius override.
          radius: Themes.frame(settings.theme).radius ?? settings.radius,
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
    if (!drawn.ok) return c.redirect('/og.jpg', 302)

    const response = new Response(drawn.body, {
      // Shared state is immutable, so cached images require no revalidation.
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
 * Loads a Worker-served wallpaper as a data URL.
 *
 * The standalone renderer performs no external requests, so wallpaper data
 * must be embedded in the document.
 */
async function inlined(origin: string, id: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${origin}/wallpapers/${id}.webp`)
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
