/**
 * Trades a snippet's fragment for a link that carries it.
 *
 * The fragment holds everything already, so this is not what makes a link
 * work: it is what lets one preview itself. A fragment never reaches a server,
 * so nothing else can draw the snippet a link points at.
 *
 * Rejects rather than falling back, so a caller decides whether a long link
 * will do.
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
