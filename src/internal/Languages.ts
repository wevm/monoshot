/**
 * Maps each supported Shiki language ID to its TypeScript compiler dialect.
 * The CLI, API, and editor all use this map to decide whether to resolve types.
 */
export const dialects = {
  javascript: 'js',
  jsx: 'jsx',
  tsx: 'tsx',
  typescript: 'ts',
} as const

/**
 * Canonical IDs and aliases for every language that supports type resolution.
 */
export const languages: ReadonlySet<string> = new Set([
  ...Object.keys(dialects),
  ...Object.values(dialects),
])
