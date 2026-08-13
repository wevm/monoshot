import { createServerFn } from '@tanstack/react-start'
import * as z from 'zod'

import * as Shared from './shared.server.js'

/** Loads a shared editor route without exposing its KV binding to the client. */
export const load = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string().min(1).max(64) }))
  .handler(({ data }) => Shared.load(data.id))
