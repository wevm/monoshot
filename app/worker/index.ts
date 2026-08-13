import handler from '@tanstack/react-start/server-entry'
import { Hono, type Context } from 'hono'
import { accepts } from 'hono/accepts'
import { bodyLimit } from 'hono/body-limit'
import { Api, Codec, Twoslash } from 'monoshot'
import * as z from 'zod'

import * as Browser from '../../src/internal/Browser.js'
import { detect } from '../src/lib/detect.js'
import * as Themes from '../src/lib/themes.js'
import * as Wallpapers from '../src/lib/wallpapers.js'
import * as Links from './links.js'
import * as Packages from './Packages.js'

// Register the English locale explicitly to preserve field-specific validation messages.
z.config(z.locales.en())

const renderer = Api.create({ browser: (c) => (c.env as Cloudflare.Env).BROWSER })
const renderLimit = bodyLimit({
  maxSize: 5 * 1024 * 1024,
  onError: (c) => c.json({ error: 'The request body is too large.' }, 413),
})
const shareLimit = bodyLimit({
  maxSize: Links.limits.size * 2,
  onError: (c) => c.json({ error: 'That snippet is too large to share.' }, 413),
})

const api = new Hono<{ Bindings: Cloudflare.Env }>()
  .get('/health', (c) => c.json({ status: 'ok' }))
  .post('/document', renderLimit, (c) => apiRender(c, '/document'))
  .post('/image', renderLimit, (c) => apiRender(c, '/image'))
  // Use the shared API routes so every consumer applies the same frame validation.
  .route('/', renderer)
  // Store snippet state so the server can generate link-preview metadata.
  .post('/share', shareLimit, async (c) => {
    if (!c.env.LINKS)
      return c.json({ error: 'Sharing is not configured for this deployment.' }, 503)
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
    // Render and store the card during sharing to reduce latency for preview clients.
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
    const spec = (() => {
      try {
        return decodeURIComponent(c.req.path.replace(/^\/api\/types\//, ''))
      } catch {
        return undefined
      }
    })()
    if (spec === undefined) return c.json({ error: 'Name a valid package to read types for.' }, 400)
    const { name, version } = Packages.parse(spec)
    if (!name) return c.json({ error: 'Name a package to read types for.' }, 400)

    // Exact package versions are immutable and need no revalidation. Tags may
    // resolve to a different version after a release.
    const exact = Packages.exact(version)
    // Named rather than `caches.default`, which shares its keyspace with the
    // asset cache in front of this Worker.
    const cache = await caches.open('types')
    const key = Packages.key(c.req.url, { name, version })
    const hit = await cache.match(key)
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
    c.executionCtx.waitUntil(cache.put(key, response.clone()))
    return response
  })

const app = new Hono<{ Bindings: Cloudflare.Env }>()
  .use('*', async (c, next) => {
    await next()
    c.header(
      'content-security-policy',
      "default-src 'self'; base-uri 'self'; connect-src 'self' https://cloudflareinsights.com; font-src 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:",
    )
    c.header('permissions-policy', 'camera=(), geolocation=(), microphone=()')
    c.header('referrer-policy', 'strict-origin-when-cross-origin')
    c.header('strict-transport-security', 'max-age=31536000; includeSubDomains')
    c.header('x-content-type-options', 'nosniff')
    c.header('x-frame-options', 'DENY')
  })
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

    // Read from KV because the Cache API entry may exist only in another data center.
    const held = await c.env.LINKS?.get(`og:${Links.card.version}:${id}`, 'arrayBuffer')
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
  .get('/', async (c) => {
    const type = accepts(c, {
      default: 'text/html',
      header: 'Accept',
      supports: ['text/html', 'text/markdown'],
    })
    const userAgent = c.req.header('user-agent') ?? ''
    const response =
      type === 'text/markdown' || markdownUserAgents.some((agent) => userAgent.includes(agent))
        ? await agentAsset(c.env, c.req.url, skillPath, 'text/markdown; charset=utf-8')
        : await handler.fetch(c.req.raw)
    return varied(response)
  })
  .on(['GET', 'HEAD'], ['/SKILL.md', '/md', '/skill', '/llms.txt'], (c) =>
    agentAsset(c.env, c.req.url, skillPath, 'text/markdown; charset=utf-8'),
  )
  .on(['GET', 'HEAD'], ['/skills', '/.well-known/agent-skills'], (c) =>
    agentAsset(c.env, c.req.url, skillIndexPath, 'application/json; charset=utf-8'),
  )
  .on(
    ['GET', 'HEAD'],
    ['/.well-known/agent-skills/monoshot', '/.well-known/skills/monoshot'],
    (c) => agentAsset(c.env, c.req.url, skillPath, 'text/markdown; charset=utf-8'),
  )
  // Keep the earlier discovery path available for clients that still use it.
  .on(['GET', 'HEAD'], '/.well-known/skills', (c) =>
    agentAsset(c.env, c.req.url, skillIndexPath, 'application/json; charset=utf-8'),
  )
  // Unmatched requests fall through to TanStack Start (SSR shell + assets).
  .all('*', (c) => handler.fetch(c.req.raw))

export default app

const skillPath = '/.well-known/agent-skills/monoshot/SKILL.md'
const skillIndexPath = '/.well-known/agent-skills/index.json'
const markdownUserAgents = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ChatGPT-User/2.0',
  'Claude-User',
  'anthropic-ai',
  'ClaudeBot',
  'claude-web',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'FacebookBot',
  'meta-externalagent',
  'meta-externalfetcher',
  'Bytespider',
  'cohere-ai',
  'AI2Bot',
  'CCBot',
  'Diffbot',
  'DuckAssistBot',
  'omgili',
  'Timpibot',
  'MistralAI-User',
  'GoogleAgent-Mariner',
  'curl/',
  'Wget/',
  'HTTPie/',
  'httpie-go/',
  'xh/',
]

async function apiRender(
  c: Context<{ Bindings: Cloudflare.Env }>,
  path: '/document' | '/image',
): Promise<Response> {
  const text = await c.req.text()
  const headers = new Headers(c.req.raw.headers)
  headers.delete('content-length')
  const send = (body: string) =>
    renderer.request(path, { body, headers, method: 'POST' }, c.env, c.executionCtx)

  let request: unknown
  try {
    request = JSON.parse(text)
  } catch {
    return send(text)
  }
  if (!request || typeof request !== 'object' || Array.isArray(request)) return send(text)

  const input = request as Record<string, unknown>
  const theme = typeof input['theme'] === 'string' ? input['theme'] : ''
  const frame = Themes.frame(theme)
  const wallpaper =
    input['background'] === undefined || input['background'] === 'default'
      ? Wallpapers.byId(theme)
      : undefined
  const picture =
    wallpaper && input['picture'] === undefined
      ? await inlined(c.env, new URL(c.req.url).origin, wallpaper.id)
      : undefined
  return send(
    JSON.stringify({
      ...input,
      ...(picture ? { picture } : {}),
      ...(input['radius'] === undefined && frame.radius !== undefined
        ? { radius: frame.radius }
        : {}),
    }),
  )
}

/** Reads an agent resource from the deployed static assets. */
async function agentAsset(
  env: Cloudflare.Env,
  url: string,
  path: string,
  contentType: string,
): Promise<Response> {
  const response = await env.ASSETS.fetch(new URL(path, url))
  const headers = new Headers(response.headers)
  headers.set('access-control-allow-origin', '*')
  headers.set('cache-control', 'public, max-age=300')
  headers.set('content-type', contentType)
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

/** Marks the root response as dependent on request negotiation. */
function varied(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.append('vary', 'Accept, User-Agent')
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

/**
 * Renders a shared-link card from encoded editor state.
 *
 * Uses the image route to share validation and rendering behavior. Returns
 * `undefined` when rendering fails so callers can serve the default card.
 */
async function card(
  env: Cloudflare.Env,
  // Pass the Hono execution context required by `api.request`.
  ctx: Parameters<typeof api.request>[3],
  origin: string,
  state: string,
): Promise<ArrayBuffer | undefined> {
  const settings = Codec.deserialize(state)
  // Embed wallpaper data because the standalone renderer performs no requests.
  const named =
    Wallpapers.at(settings.background) ??
    (settings.background === 'default' ? Wallpapers.byId(settings.theme) : undefined)
  const picture = named ? await inlined(env, origin, named.id) : undefined
  // Limit source to a fixed viewport so dense snippets remain readable.
  const shown = Links.excerpt(settings.code)
  const drawn = await api.request(
    '/document',
    {
      body: JSON.stringify({
        // Pass wallpaper content through `picture`, not the application identifier.
        background: settings.background.startsWith('wallpaper:') ? 'default' : settings.background,
        code: shown.code,
        height: Links.card.height,
        // Resolve automatic language detection before invoking the renderer.
        lang: settings.lang === 'auto' ? (detect(settings.code) ?? 'typescript') : settings.lang,
        padding: Links.card.padding,
        ...(picture ? { picture } : {}),
        // Apply the selected theme's frame radius override.
        radius: Themes.frame(settings.theme).radius ?? settings.radius,
        theme: settings.theme,
        titleBar: false,
        width: Links.card.width,
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    },
    env,
    ctx,
  )
  if (!drawn.ok) return undefined
  try {
    const png = await Browser.screenshot(env.BROWSER, {
      html: Links.fade(await drawn.text(), shown.overflow),
      scale: Links.card.scale,
    })
    return png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer
  } catch {
    return undefined
  }
}

/** Creates an immutable PNG response from rendered card data. */
function pictured(bytes: ArrayBuffer): Response {
  return new Response(bytes, {
    headers: {
      'cache-control': 'public, max-age=31536000, immutable',
      'content-type': 'image/png',
    },
  })
}

/** Stores a rendered card with the same retention period as its shared link. */
function keep(env: Cloudflare.Env, id: string, bytes: ArrayBuffer): Promise<void> {
  return env.LINKS.put(`og:${Links.card.version}:${id}`, bytes, {
    expirationTtl: Links.limits.ttl,
  })
}

/**
 * Loads a Worker-served wallpaper as a data URL.
 *
 * The standalone renderer performs no external requests, so wallpaper data
 * must be embedded in the document. The assets binding avoids a recursive
 * request to the Worker's public URL.
 */
async function inlined(
  env: Cloudflare.Env,
  origin: string,
  id: string,
): Promise<string | undefined> {
  try {
    // Resolve the local asset path through the binding instead of the network.
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
