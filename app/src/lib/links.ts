/**
 * Stores encoded snippet state and returns its short URL.
 *
 * Server-side storage enables per-snippet previews because URL fragments are
 * not included in HTTP requests. Rejects when the request fails.
 */
export async function shorten(state: string): Promise<string> {
  const response = await fetch('/api/share', {
    body: JSON.stringify({ state }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
  if (!response.ok) throw new Error('The snippet could not be shared.')
  const body = (await response.json()) as { url?: unknown }
  if (typeof body.url !== 'string') throw new Error('The snippet could not be shared.')
  return body.url
}
