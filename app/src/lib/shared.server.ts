import { env } from 'cloudflare:workers'
import { Codec } from 'monoshot'

import { detect } from './detect.js'
import * as Shared from './shared.js'

/** Stored state and metadata for a shared editor route. */
export type Link = {
  /** Preview description of the snippet. */
  description: string
  /** Encoded editor state. */
  state: string
  /** Preview title of the snippet. */
  title: string
}

/** Reads one shared link from the deployment's KV binding. */
export async function load(id: string): Promise<Link | undefined> {
  const kept = await env.LINKS?.get(id)
  if (!kept) return undefined
  const link = Shared.read(kept)
  const settings = Codec.deserialize(link.state)
  const language = settings.lang === 'auto' ? (detect(settings.code) ?? 'code') : settings.lang
  return {
    description: link.description ?? `A ${language} snippet, rendered by monoshot.`,
    state: link.state,
    title: link.title ?? Shared.summarize(settings.code, 'A snippet on monoshot'),
  }
}
