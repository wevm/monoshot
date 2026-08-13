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

/**
 * The model that reads a snippet. Small and quick: this runs while a reader
 * waits for their link, and the answer is two short lines.
 */
const model = '@cf/meta/llama-3.2-3b-instruct'

/**
 * How much of a snippet the model is shown, how long an answer may be, and how
 * long the reading may take.
 */
const reading = { code: 4_000, description: 180, timeout: 5_000, title: 60 } as const

/**
 * Reads a snippet and names it, for the preview a link carries.
 *
 * Answers `undefined` rather than throwing: a link whose snippet could not be
 * read still opens, under the heading its first line gives it.
 *
 * The snippet is a stranger's text, and text that asks the model for something
 * else is text it may follow. Nothing here acts on the answer, and the page
 * escapes it, so the worst a crafted snippet buys is its own bad heading.
 */
export async function describe(
  ai: describe.Model,
  code: string,
): Promise<describe.Result | undefined> {
  try {
    const answer = await Promise.race([
      ai.run(
        model,
        {
          max_tokens: 120,
          messages: [
            {
              content:
                'You label a code snippet for a link preview. Answer with exactly two lines and nothing else. First line: a name for the snippet, at most 5 words, no quotes and no full stop. Second line: what the code does, as one short phrase completing "A code snippet of ...". Describe the behaviour, never the language or library on its own.',
              role: 'system',
            },
            { content: code.slice(0, reading.code), role: 'user' },
          ],
          temperature: 0.2,
        },
        // Cancels the inference where the binding honours it. The race below
        // is what bounds the wait, because a signal that goes unread leaves
        // the caller holding a promise that never settles.
        { signal: AbortSignal.timeout(reading.timeout) },
      ),
      elapsed(reading.timeout),
    ])
    const [title, subject] = lines(answer)
    if (!title || !subject) return undefined
    return { description: `A code snippet of ${subject}`, title }
  } catch {
    // The model is not what a link is for. A reader still gets their preview.
    return undefined
  }
}

/** Nothing, after a wait. Loses the race a reading has to win. */
function elapsed(ms: number): Promise<undefined> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * The two lines of an answer, however the model wrapped them.
 *
 * Chat models answer in the shape the endpoint gives them, and the same
 * binding has returned both an OpenAI-style envelope and a bare `response`.
 * Labels are stripped where the model used them and forgiven where it did not,
 * along with the opening the second line is asked to complete: this decides
 * the phrasing rather than the model.
 */
function lines(answer: unknown): readonly (string | undefined)[] {
  const held = (answer ?? {}) as Record<string, unknown>
  const choice = Array.isArray(held['choices']) ? held['choices'][0] : undefined
  const message = (choice as { message?: { content?: unknown } } | undefined)?.message?.content
  const said = typeof message === 'string' ? message : held['response']
  if (typeof said !== 'string') return []
  return said
    .split('\n')
    .map((entry) =>
      entry
        .replace(/^\s*(?:title|subject|summary)\s*:\s*/i, '')
        .replace(/^\s*(?:a\s+)?code snippet (?:of|that|which)\s+/i, '')
        .replace(/^[-*\s]+/, '')
        .replace(/^["\'`]|["\'`.]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((entry) => entry.length > 0)
    .slice(0, 2)
    .map((entry, at) => {
      const limit = at === 0 ? reading.title : reading.description
      return entry.length > limit ? `${entry.slice(0, limit - 1)}…` : entry
    })
}

export declare namespace describe {
  /**
   * The one capability read from a Workers AI binding, which the binding
   * itself satisfies. Named this narrowly so a reading can be exercised
   * against an adapter that answers from memory.
   */
  type Model = {
    run(
      model: string,
      inputs: {
        max_tokens?: number | undefined
        messages: { content: string; role: string }[]
        temperature?: number | undefined
      },
      options?: { signal?: AbortSignal | undefined } | undefined,
    ): Promise<unknown>
  }

  /** What a snippet is called, and what it is said to be. */
  type Result = {
    /** What the code does, as the sentence a preview shows beneath the title. */
    description: string
    /** A name for the snippet, at most five words. */
    title: string
  }
}

/**
 * A kept link, however it was kept.
 *
 * Links written before a snippet was ever read hold the fragment alone, and a
 * link is worth more than the heading it lacks: those open under the heading
 * their first line gives them.
 */
export function read(kept: string): read.Link {
  try {
    const parsed: unknown = JSON.parse(kept)
    if (typeof parsed !== 'object' || parsed === null) return { state: kept }
    const { description, state, title } = parsed as Record<string, unknown>
    if (typeof state !== 'string') return { state: kept }
    return {
      ...(typeof description === 'string' ? { description } : {}),
      ...(typeof title === 'string' ? { title } : {}),
      state,
    }
  } catch {
    return { state: kept }
  }
}

export declare namespace read {
  /** The fragment a link carries, and what was made of it when it was shared. */
  type Link = {
    /** What the snippet was read to do, absent on a link written before it was read. */
    description?: string | undefined
    /** The encoded state the editor opens. */
    state: string
    /** What the snippet was named, absent on a link written before it was read. */
    title?: string | undefined
  }
}
