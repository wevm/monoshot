/** Standard social-card canvas dimensions and cache version. */
export const card = {
  height: 420,
  padding: 80,
  scale: 1.5,
  version: 5,
  width: 800,
} as const

/** Stored editor state and optional generated metadata. */
export type Link = {
  /** Generated description, absent from legacy records. */
  description?: string | undefined
  /** Encoded editor state. */
  state: string
  /** Generated title, absent from legacy records. */
  title?: string | undefined
}

/** Returns the first non-empty line, truncated for use as a preview title. */
export function summarize(code: string, fallback: string): string {
  const line = code.split('\n').find((entry) => entry.trim().length > 0)
  if (!line) return fallback
  const trimmed = line.trim()
  return trimmed.length > 72 ? `${trimmed.slice(0, 71)}…` : trimmed
}

/** Parses current and legacy shared-link records. */
export function read(kept: string): Link {
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
