/**
 * What a shared link may carry, and how long it is kept.
 *
 * The size cap is the codec's own fragment limit: a state larger than that is
 * one the reader could not have opened anyway. Ninety days because a link
 * pasted into a chat is read within days, and a store that never expires only
 * grows. Twelve lines is what a card shows before it crops.
 */
export const limits = { lines: 12, size: 20_000, ttl: 60 * 60 * 24 * 90 } as const

/**
 * A short, unguessable name for a snippet.
 *
 * Twelve characters of a 32-symbol alphabet, which is exactly 60 bits: a link
 * is not found by trying, and two are not drawn alike before the store is
 * larger than this will ever hold. Nothing checks for a name already taken,
 * so the space is what keeps one share from landing on another.
 *
 * A byte is taken only when it lands in a whole number of alphabet lengths, so
 * every symbol is as likely as the rest; `%` alone would favour the first few.
 */
export function id(): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyz2345678'
  const limit = 256 - (256 % alphabet.length)
  let name = ''
  while (name.length < 12) {
    for (const byte of crypto.getRandomValues(new Uint8Array(12))) {
      if (byte >= limit) continue
      name += alphabet[byte % alphabet.length]
      if (name.length === 12) break
    }
  }
  return name
}

/**
 * The page a crawler reads and a reader is sent on from.
 *
 * Served rather than handed to the app: the app renders its head in the
 * browser, and a crawler runs no JavaScript, so a link's own preview has to be
 * in the first response. A reader lands on the editor with the state in the
 * fragment, which is where every other link carries it.
 */
export function page(options: page.Options): string {
  const { description, id, origin, state, title } = options
  const target = `${origin}/#${state}`
  const image = `${origin}/s/${id}/og.png`
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="description" content="${escape(description)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="monoshot">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${escape(`${origin}/s/${id}`)}">
<meta property="og:image" content="${escape(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escape(title)}">
<meta name="twitter:description" content="${escape(description)}">
<meta name="twitter:image" content="${escape(image)}">
<link rel="canonical" href="${escape(target)}">
<meta http-equiv="refresh" content="0; url=${escape(target)}">
</head>
<body>
<p>Opening <a href="${escape(target)}">this snippet</a>.</p>
<script>location.replace(${script(target)})</script>
</body>
</html>
`
}

export declare namespace page {
  type Options = {
    /** What the snippet is, in a sentence a preview can show. */
    description: string
    /** The link's own name, which the image route is hung off. */
    id: string
    /** Absolute origin, because a crawler resolves nothing relative. */
    origin: string
    /** The fragment the editor reads the snippet back out of. */
    state: string
    /** The link's title, shown as the preview's heading. */
    title: string
  }
}

/**
 * As much of a snippet as a card can hold.
 *
 * A frame is as tall as its code is long, and a preview is cropped to roughly
 * 1.91:1, so a hundred lines arrive as an unreadable sliver of their own
 * middle. Cut at a line rather than scaled down, which leaves what is shown
 * legible.
 */
export function excerpt(code: string): string {
  const lines = code.split('\n')
  return lines.length <= limits.lines ? code : `${lines.slice(0, limits.lines).join('\n')}\n`
}

/**
 * A line of the snippet worth showing as the preview's title, which is the
 * first that carries anything. Trimmed to what a card shows before it cuts.
 */
export function summarize(code: string, fallback: string): string {
  const line = code.split('\n').find((entry) => entry.trim().length > 0)
  if (!line) return fallback
  const trimmed = line.trim()
  return trimmed.length > 72 ? `${trimmed.slice(0, 71)}…` : trimmed
}

/**
 * A string for an inline script, with the one sequence that would end the
 * element early written as an escape. `JSON.stringify` leaves `</script>`
 * alone, and a state carrying one would otherwise run as markup.
 */
function script(value: string) {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

/** Escapes a value for an attribute or a text node. */
function escape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
