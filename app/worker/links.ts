import * as Shared from '../src/lib/shared.js'

/** Size, retention, and preview limits for shared links. */
export const limits = {
  columns: 72,
  rows: 10,
  size: 20_000,
  ttl: 60 * 60 * 24 * 90,
} as const

/** Fixed social-card canvas dimensions and cache version. */
export const card = Shared.card

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

/** Limits code to the readable social-card viewport and reports clipped axes. */
export function excerpt(code: string): excerpt.Result {
  const lines = code.replace(/\n$/, '').split('\n')
  let horizontal = false
  const shown = lines.slice(0, limits.rows).map((line) => {
    if (columnCount(line) <= limits.columns) return line
    horizontal = true
    return takeColumns(line, limits.columns)
  })
  return {
    code: shown.join('\n'),
    overflow: { horizontal, vertical: lines.length > limits.rows },
  }
}

export declare namespace excerpt {
  type Result = {
    code: string
    overflow: fade.Overflow
  }
}

/** Removes Twoslash query rows from a preview that does not resolve types. */
export function withoutTypes(code: string): string {
  return code
    .split('\n')
    .filter((line) => !/^\s*\/\/\s*\^\?\s*$/.test(line))
    .join('\n')
}

/** Adds edge fades to a standalone document for each clipped code axis. */
export function fade(html: string, overflow: fade.Overflow): string {
  const classes = [
    'body',
    ...(overflow.horizontal ? ['preview-overflow-x'] : []),
    ...(overflow.vertical ? ['preview-overflow-y'] : []),
  ]
  if (classes.length === 1) return html
  return html.replace('<div class="body">', `<div class="${classes.join(' ')}">`).replace(
    '</head>',
    `<style>
.preview-overflow-x,
.preview-overflow-y { position: relative; }
.preview-overflow-x::before,
.preview-overflow-y::after {
  content: '';
  pointer-events: none;
  position: absolute;
  z-index: 1;
}
.preview-overflow-x::before {
  background: linear-gradient(to right, transparent, var(--window-background));
  inset-block: 0;
  inset-inline-end: 0;
  width: 48px;
}
.preview-overflow-y::after {
  background: linear-gradient(to bottom, transparent, var(--window-background));
  block-size: 44px;
  inset-block-end: 0;
  inset-inline: 0;
}
</style>
</head>`,
  )
}

export declare namespace fade {
  type Overflow = {
    horizontal: boolean
    vertical: boolean
  }
}

/** Counts display columns, including two-column tabs and non-ASCII characters. */
function columnCount(value: string): number {
  let count = 0
  for (const character of value)
    count += character === '\t' ? 2 - (count % 2) : character.codePointAt(0)! > 127 ? 2 : 1
  return count
}

/** Returns the prefix that fits within the requested display columns. */
function takeColumns(value: string, limit: number): string {
  let count = 0
  let result = ''
  for (const character of value) {
    const next =
      count + (character === '\t' ? 2 - (count % 2) : character.codePointAt(0)! > 127 ? 2 : 1)
    if (next > limit) break
    count = next
    result += character
  }
  return result
}

/** Returns the first non-empty line, truncated for use as a preview title. */
export const summarize = Shared.summarize

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
export const read = Shared.read
