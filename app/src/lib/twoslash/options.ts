/**
 * ESNext, numerically: the enums live in `typescript`, which belongs in the
 * worker's payload once rather than imported for a few constants.
 *
 * Shared with the build step that resolves the default snippet, so a
 * precomputed result and a resolved one are read the same way.
 */
export const compilerOptions = {
  // Without it a JavaScript document resolves types but is never checked, so
  // the editor marks nothing in half the languages it highlights.
  checkJs: true,
  lib: ['esnext', 'dom'],
  module: 99,
  // Twoslash compiles strict, which marks every untyped parameter: a missing
  // annotation rather than a mistake, in a snippet that left its context
  // behind.
  noImplicitAny: false,
  target: 99,
}

/** The dialect the language service reads a highlighted language as. */
export const dialects = { javascript: 'js', jsx: 'jsx', tsx: 'tsx', typescript: 'ts' } as const
