import handler from '@tanstack/react-start/server-entry'
import { Hono } from 'hono'
import { Api } from 'monoshot'
import * as z from 'zod'

import * as Registry from './registry.js'

// Registered rather than left to the default: the bundler drops the locale
// zod reaches for otherwise, and every rejection reads `Invalid input`.
z.config(z.locales.en())

const api = new Hono<{ Bindings: Cloudflare.Env }>()
  .get('/health', (c) => c.json({ status: 'ok' }))
  // Renders a frame to the standalone document a browser screenshots. The
  // library owns the routes, so the CLI, this app, and any other consumer
  // draw from one description of a frame.
  .route('/', Api.route)
  // A whole package's declarations in one response. The editor resolves types
  // in the browser, where fetching them file by file from a CDN costs hundreds
  // of round trips for a package like `shiki`.
  .get('/types/*', async (c) => {
    const spec = decodeURIComponent(c.req.path.replace(/^\/api\/types\//, ''))
    const { name, version } = parse(spec)
    if (!name) return c.json({ error: 'Name a package to read types for.' }, 400)

    // `package@version` never changes, so a hit needs no revalidation. Only an
    // exact version earns that: a tag points somewhere new on every release.
    const exact = version !== 'latest'
    // Named rather than `caches.default`, which shares its keyspace with the
    // asset cache in front of this Worker.
    const cache = await caches.open('types')
    const hit = await cache.match(c.req.raw)
    if (hit) return hit

    const result = await (async () => {
      try {
        return await Registry.types({ name, version })
      } catch (cause) {
        return cause instanceof Error ? cause : new Error(String(cause))
      }
    })()
    if (result instanceof Error)
      return c.json({ error: result.message }, result instanceof Registry.RegistryError ? 404 : 502)

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
  // Unmatched requests fall through to TanStack Start (SSR shell + assets).
  .all('*', (c) => handler.fetch(c.req.raw))

export default app

/**
 * Splits `shiki@4.4.2` into its parts, leaving a scope's own `@` alone.
 * A spec with no version asks for whatever is current.
 */
function parse(spec: string) {
  const at = spec.lastIndexOf('@')
  if (at <= 0) return { name: spec, version: 'latest' }
  return { name: spec.slice(0, at), version: spec.slice(at + 1) }
}
