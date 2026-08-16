/** Size and retention limits for shared links. */
export const limits = { size: 20_000, ttl: 60 * 60 * 24 * 90 } as const

/** Fixed social-card output dimensions in pixels, advertised by {@link page}. */
const output = { height: 630, width: 1200 } as const

/**
 * Canvas layout metrics in pixels.
 *
 * These mirror the renderer's own CSS in `src/internal/Document.ts`, which
 * holds the real values. Underestimating one clips the code the canvas carries.
 */
const canvas = {
  /** Advance of one code column, at 0.6em of the renderer's 14px code font. */
  column: 8.4,
  /** Code-window horizontal inset. */
  inset: 16,
  /** Code-line height. */
  line: 22,
  /** Narrowest canvas width. */
  narrowest: 800,
  /** Canvas space around the code window. */
  padding: 80,
  /** Canvas width increment. */
  step: 40,
  /** Widest canvas width. */
  widest: 1600,
  /** Code-window vertical padding, drawn without a title bar. */
  window: 40,
} as const

/**
 * Truncates code to what the widest canvas shows, then sizes a canvas to fit it.
 *
 * Width grows in fixed increments at the output ratio before scaling to the
 * output size, leaving a short snippet larger on the card than a long one.
 */
export function layout(code: string): layout.Result {
  const shown = excerpt(code)
  const measured = measure(codeLines(shown))
  let width = canvas.narrowest
  for (; width < canvas.widest; width += canvas.step)
    if (rows(measured, width) <= capacity(width)) break
  return {
    code: shown,
    height: height(width),
    padding: canvas.padding,
    scale: output.width / width,
    width,
  }
}

export declare namespace layout {
  type Result = {
    /** Source code, truncated to the rows the widest canvas shows. */
    code: string
    /** Canvas height in pixels, derived from `width` at the output ratio. */
    height: number
    /** Canvas space around the code window in pixels. */
    padding: number
    /** Device scale factor that maps the canvas to the output size. */
    scale: number
    /** Canvas width in pixels. */
    width: number
  }
}

/** Truncates code to the rows available at the widest canvas. */
function excerpt(code: string): string {
  const source = codeLines(code)
  const measured = measure(source)
  const limit = capacity(canvas.widest)
  if (rows(measured, canvas.widest) <= limit) return code
  const available = columns(canvas.widest)
  const shown: string[] = []
  let remaining = limit
  for (const [at, line] of source.entries()) {
    const needed = span(measured[at]!, available)
    if (needed > remaining) {
      if (remaining > 0) shown.push(takeColumns(line, remaining * available))
      break
    }
    shown.push(line)
    remaining -= needed
  }
  return `${shown.join('\n')}\n`
}

/** Splits code into lines, ignoring a single trailing newline. */
function codeLines(code: string): string[] {
  return code.replace(/\n$/, '').split('\n')
}

/**
 * Counts the display columns of each line.
 *
 * Measuring once keeps the width search in {@link layout} free of string work.
 */
function measure(source: readonly string[]): number[] {
  return source.map(columnCount)
}

/** Canvas height at a canvas width, held to the output ratio. */
function height(width: number): number {
  return (width * output.height) / output.width
}

/** Code columns available at a canvas width. */
function columns(width: number): number {
  return Math.max(1, Math.floor((width - canvas.padding * 2 - canvas.inset * 2) / canvas.column))
}

/** Code rows that fit within the padded canvas at a canvas width. */
function capacity(width: number): number {
  return Math.floor((height(width) - canvas.padding * 2 - canvas.window) / canvas.line)
}

/** Counts the rows measured lines occupy at a canvas width. */
function rows(measured: readonly number[], width: number): number {
  const available = columns(width)
  return measured.reduce((count, value) => count + span(value, available), 0)
}

/** Rows a line of the given display columns occupies at a column capacity. */
function span(count: number, available: number): number {
  return Math.max(1, Math.ceil(count / available))
}

/** Display columns a character occupies at a column offset. */
function advance(character: string, at: number): number {
  if (character === '\t') return 2 - (at % 2)
  return character.codePointAt(0)! > 127 ? 2 : 1
}

/** Counts display columns, including two-column tabs and non-ASCII characters. */
function columnCount(value: string): number {
  let count = 0
  for (const character of value) count += advance(character, count)
  return count
}

/** Returns the prefix that fits within the requested display columns. */
function takeColumns(value: string, limit: number): string {
  let count = 0
  let result = ''
  for (const character of value) {
    const next = count + advance(character, count)
    if (next > limit) break
    count = next
    result += character
  }
  return result
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
<meta property="og:image:width" content="${output.width}">
<meta property="og:image:height" content="${output.height}">
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
