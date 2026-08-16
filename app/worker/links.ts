import * as DocumentLayout from '../../src/internal/DocumentLayout.js'
import * as Tags from '../../src/internal/Tags.js'
import * as Shared from '../src/lib/shared.js'

/** Size and retention limits for shared links. */
export const limits = { size: 20_000, ttl: 60 * 60 * 24 * 90 } as const

/** Standard social-card canvas dimensions and cache version. */
export const card = Shared.card

/** Fixed social-card output dimensions in pixels. */
const output = { height: card.height * card.scale, width: card.width * card.scale } as const

/** Card-specific canvas bounds and increments in pixels. */
const canvas = {
  /** Narrowest canvas width. */
  narrowest: card.width,
  /** Canvas space around the code window. */
  padding: card.padding,
  /** Canvas width increment. */
  step: 40,
  /** Widest canvas width. */
  widest: 1600,
} as const

/**
 * Truncates code to what the widest canvas shows, then sizes a canvas to fit it.
 *
 * Width grows in fixed increments at the output ratio before scaling to the
 * output size, leaving a short snippet larger on the card than a long one.
 */
export function layout(code: string): layout.Result {
  const shown = excerpt(code)
  const measured = measure(codeLines(shown.code))
  let width = canvas.narrowest
  for (; width < canvas.widest; width += canvas.step)
    if (contentHeight(measured, width) <= room(width)) break
  return {
    code: shown.code,
    height: canvasHeight(width),
    overflow: { horizontal: false, vertical: shown.truncated },
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
    /** Clipped axes used to mark truncated source at the canvas edge. */
    overflow: fade.Overflow
    /** Canvas space around the code window in pixels. */
    padding: number
    /** Device scale factor that maps the canvas to the output size. */
    scale: number
    /** Canvas width in pixels. */
    width: number
  }
}

/** Truncates code to the rows available at the widest canvas. */
function excerpt(code: string): { code: string; truncated: boolean } {
  const source = codeLines(code)
  const measured = measure(source)
  if (contentHeight(measured, canvas.widest) <= room(canvas.widest))
    return { code, truncated: false }
  const available = columns(canvas.widest)
  const shown: string[] = []
  let remaining = room(canvas.widest)
  for (const [at, line] of source.entries()) {
    const measuredLine = measured[at]!
    const needed = lineHeight(measuredLine, available)
    if (needed > remaining) {
      const gap = measuredLine.gap ? DocumentLayout.metrics.annotation.gap : 0
      const rows = Math.floor((remaining - gap) / DocumentLayout.metrics.code.line)
      if (rows > 0) shown.push(takeColumns(line, rows * available))
      break
    }
    shown.push(line)
    remaining -= needed
  }
  return { code: `${shown.join('\n')}\n`, truncated: true }
}

/** Splits code into lines, ignoring a single trailing newline. */
function codeLines(code: string): string[] {
  return code.replace(/\n$/, '').split('\n')
}

/** A source line's width and preceding annotation gap. */
type Line = { columns: number; gap: boolean }

/** Measures each line once before searching canvas widths. */
function measure(source: readonly string[]): Line[] {
  let previousTagged = false
  return source.map((line) => {
    const tagged = Tags.tagged(line)
    const measured = { columns: columnCount(line), gap: tagged && !previousTagged }
    previousTagged = tagged
    return measured
  })
}

/** Canvas height at a canvas width, held to the output ratio. */
function canvasHeight(width: number): number {
  return (width * output.height) / output.width
}

/** Code columns available at a canvas width. */
function columns(width: number): number {
  const { advance, size } = DocumentLayout.metrics.code
  const { inset } = DocumentLayout.metrics.body
  return Math.max(1, Math.floor((width - canvas.padding * 2 - inset * 2) / (size * advance)))
}

/** Vertical pixels available to source and annotation rows. */
function room(width: number): number {
  const { padding } = DocumentLayout.metrics.body
  const window = padding.plain * 2 + DocumentLayout.metrics.source.padding * 2
  return canvasHeight(width) - canvas.padding * 2 - window
}

/** Vertical pixels that measured lines occupy at a canvas width. */
function contentHeight(measured: readonly Line[], width: number): number {
  const available = columns(width)
  return measured.reduce((height, line) => height + lineHeight(line, available), 0)
}

/** Vertical pixels that one measured line occupies. */
function lineHeight(line: Line, available: number): number {
  const annotation = line.gap ? DocumentLayout.metrics.annotation.gap : 0
  return span(line.columns, available) * DocumentLayout.metrics.code.line + annotation
}

/** Rows a line of the given display columns occupies at a column capacity. */
function span(count: number, available: number): number {
  return Math.max(1, Math.ceil(count / available))
}

const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' })
const zeroWidth = /^(?:\p{Control}|\p{Format}|\p{Mark})+$/u
const wide =
  /[\u1100-\u115f\u2329-\u232a\u2e80-\u303e\u3040-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6\u{1b000}-\u{1b2ff}\u{20000}-\u{3fffd}]|\p{Emoji_Presentation}|\p{Regional_Indicator}/u

/** Display columns a grapheme occupies at a column offset. */
function advance(character: string, at: number): number {
  const { tab } = DocumentLayout.metrics.code
  if (character === '\t') return tab - (at % tab)
  if (zeroWidth.test(character)) return 0
  return wide.test(character) || character.includes('\u20e3') ? 2 : 1
}

/** Counts display columns, including tabs and East Asian wide graphemes. */
function columnCount(value: string): number {
  let count = 0
  for (const { segment } of graphemes.segment(value)) count += advance(segment, count)
  return count
}

/** Returns the prefix that fits within the requested display columns. */
function takeColumns(value: string, limit: number): string {
  let count = 0
  let result = ''
  for (const { segment } of graphemes.segment(value)) {
    const next = count + advance(segment, count)
    if (next > limit) break
    count = next
    result += segment
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
