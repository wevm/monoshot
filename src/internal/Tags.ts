/**
 * The tags a snippet can carry beside its code, each drawing a line of prose
 * of its own.
 *
 * Shared with every resolver: a tag the compiler was not told about stays an
 * ordinary comment in what is drawn.
 */
export const tags = ['annotate', 'error', 'log', 'warn'] as const
