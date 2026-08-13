/** Size, retention, and preview limits for shared links. */
export const limits = {
  columns: 72,
  rows: 10,
  size: 20_000,
  ttl: 60 * 60 * 24 * 90,
} as const

/** Fixed social-card canvas dimensions and cache version. */
export const card = {
  height: 420,
  padding: 80,
  scale: 1.5,
  version: 2,
  width: 800,
} as const

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
  const image = `${origin}/s/${id}/og.png?v=${card.version}`
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
