/**
 * Size, retention, and preview limits for shared links. The line limit fits
 * within the maximum canvas dimensions returned by {@link geometry}.
 */
export const limits = { lines: 29, size: 20_000, ttl: 60 * 60 * 24 * 90 } as const

/** Card output dimensions and canvas layout constants. */
const card = {
  /** Fixed output dimensions in pixels. */
  height: 630,
  width: 1200,
  /** Canvas width limits in pixels. */
  narrowest: 800,
  widest: 1600,
  /** Canvas space around the code window in pixels. */
  padding: 88,
  /** Window chrome and code-line heights in pixels. */
  chrome: 26,
  line: 22,
} as const

/**
 * Computes canvas dimensions and scale from the rendered line count.
 *
 * Width grows at the 40:21 aspect ratio in 40-pixel increments, then scales to
 * the fixed 1200x630 output.
 */
export function geometry(code: string): geometry.Result {
  const lines = Math.max(1, code.replace(/\n$/, '').split('\n').length)
  const window = lines * card.line + card.chrome
  const needed = ((window + card.padding * 2) * card.width) / card.height
  const width = Math.min(card.widest, Math.max(card.narrowest, Math.ceil(needed / 40) * 40))
  return {
    height: (width * card.height) / card.width,
    scale: card.width / width,
    width,
  }
}

export declare namespace geometry {
  type Result = {
    /** Canvas height in pixels, derived from `width` at the card ratio. */
    height: number
    /** Device scale factor that maps the canvas to the output size. */
    scale: number
    /** Canvas width in pixels. */
    width: number
  }
}

/**
 * Generates a 12-character identifier with 60 bits of entropy.
 *
 * Rejection sampling avoids modulo bias. Callers do not check for collisions.
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
 * Generates link-preview metadata and redirects to the editor.
 *
 * Metadata is included in the initial response for clients that do not execute JavaScript.
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
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escape(title)}">
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
    /** Preview description of the snippet. */
    description: string
    /** Shared-link identifier used by the image route. */
    id: string
    /** Absolute deployment origin. */
    origin: string
    /** Encoded editor state. */
    state: string
    /** Preview title of the snippet. */
    title: string
  }
}

/** Truncates code by line count to keep social-card text legible. */
export function excerpt(code: string): string {
  const lines = code.split('\n')
  return lines.length <= limits.lines ? code : `${lines.slice(0, limits.lines).join('\n')}\n`
}

/** Returns the first non-empty line, truncated for use as a preview title. */
export function summarize(code: string, fallback: string): string {
  const line = code.split('\n').find((entry) => entry.trim().length > 0)
  if (!line) return fallback
  const trimmed = line.trim()
  return trimmed.length > 72 ? `${trimmed.slice(0, 71)}…` : trimmed
}

/** Serializes a value for an inline script and escapes HTML-opening characters. */
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

/** Workers AI model used to generate snippet metadata. */
const model = '@cf/meta/llama-3.2-3b-instruct'

/** Input, output, and timeout limits for metadata generation. */
const reading = { code: 4_000, description: 180, timeout: 5_000, title: 60 } as const

/**
 * Generates preview metadata from source code.
 *
 * Source code is untrusted prompt content. Escaped model output is used only
 * as metadata, and failures return `undefined` for deterministic fallback.
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
        // Request cancellation when supported; the Promise race enforces the timeout.
        { signal: AbortSignal.timeout(reading.timeout) },
      ),
      elapsed(reading.timeout),
    ])
    const [title, subject] = lines(answer)
    if (!title || !subject) return undefined
    return { description: `A code snippet of ${subject}`, title }
  } catch {
    // Preserve link creation when metadata generation fails.
    return undefined
  }
}

/** Resolves after the metadata-generation timeout. */
function elapsed(ms: number): Promise<undefined> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Extracts title and description lines from supported Workers AI responses.
 *
 * Accepts OpenAI-compatible and bare response envelopes, then removes optional labels and sentence prefixes.
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
  /** Minimal Workers AI binding interface required for metadata generation. */
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

  /** Generated preview metadata. */
  type Result = {
    /** Preview description of the code behavior. */
    description: string
    /** A name for the snippet, at most five words. */
    title: string
  }
}

/** Parses current and legacy shared-link records. */
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
  /** Stored editor state and optional generated metadata. */
  type Link = {
    /** Generated description, absent from legacy records. */
    description?: string | undefined
    /** The encoded state the editor opens. */
    state: string
    /** Generated title, absent from legacy records. */
    title?: string | undefined
  }
}
