import handler from '@tanstack/react-start/server-entry'
import { Hono } from 'hono'

const api = new Hono<{ Bindings: Cloudflare.Env }>().get('/health', (c) => c.json({ status: 'ok' }))

const app = new Hono<{ Bindings: Cloudflare.Env }>()
  .route('/api', api)
  // Unmatched requests fall through to TanStack Start (SSR shell + assets).
  .all('*', (c) => handler.fetch(c.req.raw))

export default app
