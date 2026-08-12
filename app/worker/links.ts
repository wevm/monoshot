/**
 * What a shared link may carry, and how long it is kept.
 *
 * The cap is the codec's own fragment limit: a state larger than that is one
 * the reader could not have opened anyway. Ninety days because a link pasted
 * into a chat is read within days, and a store that never expires only grows.
 */
export const limits = { size: 20_000, ttl: 60 * 60 * 24 * 90 } as const

/**
 * A short, unguessable name for a snippet.
 *
 * Ten characters of a URL-safe alphabet, which is 59 bits: enough that a link
 * is not found by trying, and short enough to paste.
 */
export function id(): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('')
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
<script>location.replace(${JSON.stringify(target)})</script>
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
 * A line of the snippet worth showing as the preview's title, which is the
 * first that carries anything. Trimmed to what a card shows before it cuts.
 */
export function summarize(code: string, fallback: string): string {
  const line = code.split('\n').find((entry) => entry.trim().length > 0)
  if (!line) return fallback
  const trimmed = line.trim()
  return trimmed.length > 72 ? `${trimmed.slice(0, 71)}…` : trimmed
}

/** Escapes a value for an attribute or a text node. */
function escape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
