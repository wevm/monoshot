/**
 * Loads themes ahead of use, nearest to `from` first, so switching never waits
 * on a chunk. Yields to idle between loads, so the sweep never competes with
 * the page, and stops as soon as the signal aborts.
 */
export async function themes<const name extends string>(
  options: themes.Options<name>,
): Promise<void> {
  const { from, list, load, signal } = options
  const { limit = list.length } = options
  const start = Math.max(
    0,
    list.findIndex((entry) => entry === from),
  )
  let warmed = 0
  for (const theme of outward(list, start)) {
    if (signal.aborted || warmed++ >= limit) return
    await idle()
    if (signal.aborted) return
    // One theme failing to load is no reason to abandon the rest.
    await load(theme).catch(() => undefined)
  }
}

export declare namespace themes {
  type Options<name extends string> = {
    /** Theme to warm outward from, usually the one on screen. */
    from: name
    /** Every theme that could be picked, in display order. */
    list: readonly name[]
    /** How many to warm, nearest first. Defaults to the whole list. */
    limit?: number | undefined
    /** Loads one theme. */
    load: (theme: name) => Promise<void>
    /** Stops the sweep. */
    signal: AbortSignal
  }
}

/** Walks a list from `start`, alternating outward, so neighbours come first. */
function* outward<value>(list: readonly value[], start: number): Generator<value> {
  const first = list[start]
  if (first === undefined) return
  yield first
  for (let step = 1; step <= list.length; step++) {
    const after = list[start + step]
    if (after !== undefined) yield after
    const before = start - step
    if (before >= 0) yield list[before] as value
  }
}

/** Resolves at the next idle moment, or on the next tick without one. */
function idle(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === 'function')
      requestIdleCallback(() => resolve(), {
        timeout: 500,
      })
    else setTimeout(resolve, 16)
  })
}
