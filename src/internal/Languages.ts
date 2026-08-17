/**
 * The languages the type resolver reads, each canonical shiki id against the
 * dialect the language service compiles it as.
 *
 * Shared with every surface: a language missing here resolves no types, so the
 * CLI, the API, and the editor would otherwise each decide that separately.
 */
export const dialects = {
  javascript: 'js',
  jsx: 'jsx',
  tsx: 'tsx',
  typescript: 'ts',
} as const

/**
 * Every name a resolvable language answers to. The dialects double as shiki's
 * aliases for the same languages, so a caller holding an unresolved `lang`
 * tests the same set as one holding a canonical id.
 */
export const languages: ReadonlySet<string> = new Set([
  ...Object.keys(dialects),
  ...Object.values(dialects),
])
